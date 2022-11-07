import {
  derived as vanillaDerived,
  get,
  type Readable,
  type StartStopNotifier,
  type Subscriber,
  type Unsubscriber,
  type Updater,
  type Writable,
  writable as vanillaWritable,
} from 'svelte/store';
import { anyReloadable, loadAll, reloadAll } from '../utils';
import type { Loadable, Stores, StoresValues } from '../async-stores/types';

const loadDependencies = <S extends Stores, T>(
  thisStore: Readable<T>,
  loadFunction: (stores: S) => Promise<unknown>,
  stores: S
): (() => Promise<T>) => {
  return async () => {
    // Create a dummy subscription when we load the store.
    // This ensures that we will have at least one subscriber when
    // loading the store so that our start function will run.
    const dummyUnsubscribe = thisStore.subscribe(() => {
      /* no-op */
    });
    try {
      await loadFunction(stores);
    } catch (error) {
      dummyUnsubscribe();
      throw error;
    }
    dummyUnsubscribe();
    return get(thisStore);
  };
};

type DerivedMapper<S extends Stores, T> = (values: StoresValues<S>) => T;
type SubscribeMapper<S extends Stores, T> = (
  values: StoresValues<S>,
  set: (value: T) => void
) => Unsubscriber | void;

/**
 * A Derived store that is considered 'loaded' when all of its parents have loaded (and so on).
 * @param stores Any Readable or array of Readables used to generate the value of this store.
 * Any Loadable stores need to load before this store is considered loaded.
 * @param subscriberMapper A function that sets the value of the store.
 * @param initialValue Initial value
 * @returns A Loadable store that whose value is derived from the provided parent stores.
 * The loaded value of the store will be ready after awaiting the load function of this store.
 */
export function derived<S extends Stores, T>(
  stores: S,
  fn: SubscribeMapper<S, T>,
  initialValue?: T
): Loadable<T>;

/**
 * A Derived store that is considered 'loaded' when all of its parents have loaded (and so on).
 * @param stores Any Readable or array of Readables used to generate the value of this store.
 * Any Loadable stores need to load before this store is considered loaded.
 * @param mappingFunction A function that maps the values of the parent store to the value of this store.
 * @param initialValue Initial value
 * @returns A Loadable store that whose value is derived from the provided parent stores.
 * The loaded value of the store will be ready after awaiting the load function of this store.
 */
export function derived<S extends Stores, T>(
  stores: S,
  mappingFunction: DerivedMapper<S, T>,
  initialValue?: T
): Loadable<T>;

// eslint-disable-next-line func-style
export function derived<S extends Stores, T>(
  stores: S,
  fn: DerivedMapper<S, T> | SubscribeMapper<S, T>,
  initialValue?: T
): Loadable<T> {
  const thisStore = vanillaDerived(stores, fn as any, initialValue);
  const load = loadDependencies(thisStore, loadAll, stores);
  const reload = anyReloadable(stores)
    ? loadDependencies(thisStore, reloadAll, stores)
    : undefined;

  return {
    get store() {
      return this;
    },
    ...thisStore,
    load,
    ...(reload && { reload }),
  };
}

/**
 * Create a `Writable` store that allows both updating and reading by subscription.
 * @param {*=}value initial value
 * @param {StartStopNotifier=}start start and stop notifications for subscriptions
 */
export const writable = <T>(
  value?: T,
  start?: StartStopNotifier<T>
): Writable<T> & Loadable<T> => {
  let hasEverLoaded = false;

  let resolveLoadPromise: (value: T | PromiseLike<T>) => void;

  let loadPromise: Promise<T> = new Promise((resolve) => {
    resolveLoadPromise = (value: T | PromiseLike<T>) => {
      hasEverLoaded = true;
      resolve(value);
    };
  });

  const updateLoadPromise = (value: T) => {
    if (value === undefined && !hasEverLoaded) {
      // don't resolve until we get a defined value
      return;
    }
    resolveLoadPromise(value);
    loadPromise = Promise.resolve(value);
  };

  const startFunction: StartStopNotifier<T> = (set: Subscriber<T>) => {
    const customSet = (value: T) => {
      set(value);
      updateLoadPromise(value);
    };
    // intercept the `set` function being passed to the provided start function
    // instead provide our own `set` which also updates the load promise.
    return start(customSet);
  };

  const thisStore = vanillaWritable(value, start && startFunction);

  const load = async () => {
    // Create a dummy subscription when we load the store.
    // This ensures that we will have at least one subscriber when
    // loading the store so that our start function will run.
    const dummyUnsubscribe = thisStore.subscribe(() => {
      /* no-op */
    });
    let loadedValue: T;
    try {
      loadedValue = await loadPromise;
    } catch (error) {
      dummyUnsubscribe();
      throw error;
    }
    dummyUnsubscribe();
    return loadedValue;
  };

  if (value !== undefined) {
    // immeadietly load stores that are given an initial value
    updateLoadPromise(value);
  }

  const set = (value: T) => {
    thisStore.set(value);
    updateLoadPromise(value);
  };

  const update = (updater: Updater<T>) => {
    const newValue = updater(get(thisStore));
    thisStore.set(newValue);
    updateLoadPromise(newValue);
  };

  return {
    get store() {
      return this;
    },
    ...thisStore,
    set,
    update,
    load,
  };
};

/**
 * Creates a `Readable` store that allows reading by subscription.
 * @param value initial value
 * @param {StartStopNotifier}start start and stop notifications for subscriptions
 */
export const readable = <T>(
  value?: T,
  start?: StartStopNotifier<T>
): Loadable<T> => {
  const { subscribe, load } = writable(value, start);

  return {
    subscribe,
    load,
    get store() {
      return this;
    },
  };
};
