import {
  get,
  type Updater,
  type Readable,
  writable,
  StartStopNotifier,
  readable,
} from 'svelte/store';
import type {
  AsyncStoreOptions,
  Loadable,
  LoadState,
  State,
  Stores,
  StoresValues,
  WritableLoadable,
  VisitedMap,
} from './types.js';
import {
  anyReloadable,
  getStoresArray,
  reloadAll,
  loadAll,
  rebounce,
} from '../utils/index.js';
import { flagStoreCreated, getStoreTestingMode, logError } from '../config.js';

// STORES

const getLoadState = (stateString: State): LoadState => {
  return {
    isLoading: stateString === 'LOADING',
    isReloading: stateString === 'RELOADING',
    isLoaded: stateString === 'LOADED',
    isWriting: stateString === 'WRITING',
    isError: stateString === 'ERROR',
    isPending: stateString === 'LOADING' || stateString === 'RELOADING',
    isSettled: stateString === 'LOADED' || stateString === 'ERROR',
  };
};

/**
 * Generate a Loadable store that is considered 'loaded' after resolving synchronous or asynchronous behavior.
 * This behavior may be derived from the value of parent Loadable or non Loadable stores.
 * If so, this store will begin loading only after the parents have loaded.
 * This store is also writable. It includes a `set` function that will immediately update the value of the store
 * and then execute provided asynchronous behavior to persist this change.
 * @param stores Any readable or array of Readables whose value is used to generate the asynchronous behavior of this store.
 * Any changes to the value of these stores post-load will restart the asynchronous behavior of the store using the new values.
 * @param mappingLoadFunction A function that takes in the values of the stores and generates a Promise that resolves
 * to the final value of the store when the asynchronous behavior is complete.
 * @param mappingWriteFunction A function that takes in the new value of the store and uses it to perform async behavior.
 * Typically this would be to persist the change. If this value resolves to a value the store will be set to it.
 * @param options Modifiers for store behavior.
 * @returns A Loadable store whose value is set to the resolution of provided async behavior.
 * The loaded value of the store will be ready after awaiting the load function of this store.
 */
export const asyncWritable = <S extends Stores, T>(
  stores: S,
  mappingLoadFunction: (values: StoresValues<S>) => Promise<T> | T,
  mappingWriteFunction?: (
    value: T,
    parentValues?: StoresValues<S>,
    oldValue?: T
  ) => Promise<void | T>,
  options: AsyncStoreOptions<T> = {}
): WritableLoadable<T> => {
  flagStoreCreated();
  const { reloadable, trackState, initial } = options;

  const rebouncedMappingLoad = rebounce(mappingLoadFunction);

  const loadState = writable<LoadState>(getLoadState('LOADING'));
  const setState = (state: State) => loadState.set(getLoadState(state));

  // flag marking whether store is ready for updates from subscriptions
  let ready = false;
  let changeReceived = false;

  // most recent call of mappingLoadFunction, including resulting side effects
  // (updating store value, tracking state, etc)
  let currentLoadPromise: Promise<T>;
  let resolveCurrentLoad: (value: T | PromiseLike<T>) => void;
  let rejectCurrentLoad: (reason: Error) => void;

  const setCurrentLoadPromise = () => {
    currentLoadPromise = new Promise((resolve, reject) => {
      resolveCurrentLoad = resolve;
      rejectCurrentLoad = reject;
    });
  };

  let parentValues: StoresValues<S>;

  const mappingLoadThenSet = async (setStoreValue) => {
    if (get(loadState).isSettled) {
      setCurrentLoadPromise();
      setState('RELOADING');
    }

    try {
      const finalValue = await rebouncedMappingLoad(parentValues);
      setStoreValue(finalValue);
      resolveCurrentLoad(finalValue);
      setState('LOADED');
    } catch (e) {
      if (e.name !== 'AbortError') {
        setState('ERROR');
        rejectCurrentLoad(e);
      }
    }
  };

  const onFirstSubscription: StartStopNotifier<T> = (setStoreValue) => {
    setCurrentLoadPromise();

    const initialLoad = async () => {
      try {
        parentValues = await loadAll(stores);
        ready = true;
        changeReceived = false;
        mappingLoadThenSet(setStoreValue);
      } catch (error) {
        rejectCurrentLoad(error);
      }
    };
    initialLoad();

    const parentUnsubscribers = getStoresArray(stores).map((store, i) =>
      store.subscribe((value) => {
        changeReceived = true;
        if (Array.isArray(stores)) {
          parentValues[i] = value;
        } else {
          parentValues = value as any;
        }
        if (ready) {
          mappingLoadThenSet(setStoreValue);
        }
      })
    );

    // called on losing last subscriber
    return () => {
      parentUnsubscribers.map((unsubscriber) => unsubscriber());
    };
  };

  const thisStore = writable(initial, onFirstSubscription);

  const subscribe = thisStore.subscribe;
  const load = async () => {
    const dummyUnsubscribe = thisStore.subscribe(() => {
      /* no-op */
    });
    try {
      const result = await currentLoadPromise;
      dummyUnsubscribe();
      return result;
    } catch (error) {
      dummyUnsubscribe();
      throw error;
    }
  };
  const reload = async (visitedMap?: VisitedMap) => {
    ready = false;
    changeReceived = false;
    setCurrentLoadPromise();
    setState('RELOADING');

    const visitMap = visitedMap ?? new WeakMap();
    await reloadAll(stores, visitMap);
    ready = true;
    if (changeReceived || reloadable) {
      mappingLoadThenSet(thisStore.set);
    } else {
      resolveCurrentLoad(get(thisStore));
    }
    return currentLoadPromise;
  };

  return {
    get store() {
      return this;
    },
    subscribe,
    load,
    reload,
    set: () => Promise.resolve(),
    update: () => Promise.resolve(),
  };
};
/**
 * Generate a Loadable store that is considered 'loaded' after resolving asynchronous behavior.
 * This asynchronous behavior may be derived from the value of parent Loadable or non Loadable stores.
 * If so, this store will begin loading only after the parents have loaded.
 * @param stores Any readable or array of Readables whose value is used to generate the asynchronous behavior of this store.
 * Any changes to the value of these stores post-load will restart the asynchronous behavior of the store using the new values.
 * @param mappingLoadFunction A function that takes in the values of the stores and generates a Promise that resolves
 * to the final value of the store when the asynchronous behavior is complete.
 * @param options Modifiers for store behavior.
 * @returns A Loadable store whose value is set to the resolution of provided async behavior.
 * The loaded value of the store will be ready after awaiting the load function of this store.
 */
export const asyncDerived = <S extends Stores, T>(
  stores: S,
  mappingLoadFunction: (values: StoresValues<S>) => Promise<T>,
  options?: AsyncStoreOptions<T>
): Loadable<T> => {
  const { store, subscribe, load, reload, state, reset } = asyncWritable(
    stores,
    mappingLoadFunction,
    undefined,
    options
  );

  return {
    store,
    subscribe,
    load,
    ...(reload && { reload }),
    ...(state && { state }),
    ...(reset && { reset }),
  };
};

/**
 * Generates a Loadable store that will start asynchronous behavior when subscribed to,
 * and whose value will be equal to the resolution of that behavior when completed.
 * @param initial The initial value of the store before it has loaded or upon load failure.
 * @param loadFunction A function that generates a Promise that resolves to the final value
 * of the store when the asynchronous behavior is complete.
 * @param options Modifiers for store behavior.
 * @returns  A Loadable store whose value is set to the resolution of provided async behavior.
 * The loaded value of the store will be ready after awaiting the load function of this store.
 */
export const asyncReadable = <T>(
  initial: T,
  loadFunction: () => Promise<T>,
  options?: Omit<AsyncStoreOptions<T>, 'initial'>
): Loadable<T> => {
  return asyncDerived([], loadFunction, { ...options, initial });
};
