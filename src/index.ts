import {
  derived as vanillaDerived,
  get,
  Readable,
  StartStopNotifier,
  Subscriber,
  Unsubscriber,
  Updater,
  Writable,
  writable as vanillaWritable,
} from 'svelte/store';

export { get } from 'svelte/store';
export type {
  Readable,
  Unsubscriber,
  Updater,
  StartStopNotifier,
  Subscriber,
  Writable,
} from 'svelte/store';

// TESTING MODE

let testingMode = false;

export const getStoreTestingMode = (): boolean => testingMode;

export const enableStoreTestingMode = (): void => {
  testingMode = true;
};

// TYPES

export interface Loadable<T> extends Readable<T> {
  load(): Promise<T>;
  reload?(): Promise<T>;
  flagForReload?(): void;
}

export interface Reloadable<T> extends Loadable<T> {
  reload(): Promise<T>;
}

export interface AsyncWritable<T> extends Writable<T> {
  set(value: T, persist?: boolean): Promise<void>;
  update(updater: Updater<T>): Promise<void>;
}

export interface WritableLoadable<T> extends AsyncWritable<T>, Loadable<T> {}

export interface AsyncStoreOptions<T> {
  reloadable?: true;
  initial?: T;
}

/* These types come from Svelte but are not exported, so copying them here */
/* One or more `Readable`s. */
export declare type Stores =
  | Readable<unknown>
  | [Readable<unknown>, ...Array<Readable<unknown>>]
  | Array<Readable<unknown>>;
/** One or more values from `Readable` stores. */
export declare type StoresValues<T> = T extends Readable<infer U>
  ? U
  : {
      [K in keyof T]: T[K] extends Readable<infer U> ? U : never;
    };

// INTERNAL FUNCTIONS

const getStoresArray = (stores: Stores): Readable<unknown>[] => {
  return Array.isArray(stores) ? stores : [stores];
};

export const isLoadable = <T>(object: unknown): object is Loadable<T> =>
  Object.prototype.hasOwnProperty.call(object, 'load');

export const isReloadable = <T>(object: unknown): object is Reloadable<T> =>
  Object.prototype.hasOwnProperty.call(object, 'reload');

export const anyLoadable = (stores: Stores): boolean =>
  getStoresArray(stores).some(isLoadable);

export const anyReloadable = (stores: Stores): boolean =>
  getStoresArray(stores).some(isReloadable);

const loadDependencies = <S extends Stores, T>(
  thisStore: Readable<T>,
  loadFunction: (stores: S) => Promise<unknown>,
  stores: S
): (() => Promise<T>) => {
  return async () => {
    await loadFunction(stores);
    return get(thisStore);
  };
};

/**
 * Load a number of Stores. Loading a store will first await loadAll of any parents.
 * @param stores Any Readable or array of Readables to await loading of.
 * @returns Promise that resolves to an array of the loaded values of the input stores.
 * Non Loadables will resolve immediately.
 */
export const loadAll = <S extends Stores>(
  stores: S
): Promise<StoresValues<S>> => {
  const loadPromises = getStoresArray(stores).map((store) => {
    if (Object.prototype.hasOwnProperty.call(store, 'load')) {
      return (store as Loadable<unknown>).load();
    } else {
      return get(store);
    }
  });

  return Promise.all(loadPromises) as Promise<StoresValues<S>>;
};

/**
 * Reload a number of stores. Reloading a store will first await reloadAll of any parents.
 * If a store has no ancestors that are flagged as reloadable, reloading is equivalent to loading.
 * @param stores Any Readable or array of Readables to await reloading of.
 * Reloading a store will first await reloadAll of any parents.
 * @returns Promise that resolves to an array of the loaded values of the input stores.
 * Non Loadables will resolve immediately.
 */
export const reloadAll = <S extends Stores>(
  stores: S
): Promise<StoresValues<S>> => {
  const reloadPromises = getStoresArray(stores).map((store) => {
    if (Object.prototype.hasOwnProperty.call(store, 'reload')) {
      return (store as Loadable<unknown>).reload();
    } else if (Object.prototype.hasOwnProperty.call(store, 'load')) {
      return (store as Loadable<unknown>).load();
    } else {
      return get(store);
    }
  });

  return Promise.all(reloadPromises) as Promise<StoresValues<S>>;
};

/**
 * Load a number of stores, and catch any errors.
 * @param stores Any Readable or array of Readables to await loading of.
 * @returns boolean representing whether the given stores loaded without errors, or not.
 */
export const safeLoad = async <S extends Stores>(
  stores: S
): Promise<boolean> => {
  try {
    await loadAll(stores);
    return true;
  } catch {
    return false;
  }
};

// STORES

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
 * @param reloadable A flag that indicates whether this store should restart its asynchronous behavior whenever `reload`
 * is invoked on this store or any of its children.
 * @param initial The initial value of the store before it is loaded or on load failure. Otherwise undefined.
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
  const { reloadable, initial } = options;

  let loadedValuesString: string;
  let currentLoadPromise: Promise<T>;
  let forceReload = false;

  // eslint-disable-next-line prefer-const
  let loadDependenciesThenSet: (
    parentLoadFunction: (stores: S) => Promise<StoresValues<S>>,
    alwaysReload?: boolean
  ) => Promise<T>;

  const thisStore = vanillaWritable(initial, () => {
    loadDependenciesThenSet(loadAll).catch(() => Promise.resolve());
    const parentUnsubscribers = getStoresArray(stores).map((store) =>
      store.subscribe(() => {
        loadDependenciesThenSet(loadAll).catch(() => Promise.resolve());
      })
    );
    return () => {
      parentUnsubscribers.map((unsubscriber) => unsubscriber());
    };
  });

  loadDependenciesThenSet = async (
    parentLoadFunction: (stores: S) => Promise<StoresValues<S>>,
    alwaysReload = false
  ) => {
    const loadParentStores = parentLoadFunction(stores);

    try {
      await loadParentStores;
    } catch {
      currentLoadPromise = loadParentStores as Promise<T>;
      return currentLoadPromise;
    }

    const storeValues = getStoresArray(stores).map((store) =>
      get(store)
    ) as StoresValues<S>;

    // ignore force reload when initially subscribing to store
    if (forceReload && loadedValuesString === undefined) {
      forceReload = false;
    }

    if (!alwaysReload) {
      const newValuesString = JSON.stringify(storeValues);
      if (newValuesString === loadedValuesString && !forceReload) {
        // no change, don't generate new promise
        return currentLoadPromise;
      }
      loadedValuesString = newValuesString;
    }

    if (forceReload) {
      thisStore.set(initial);
      forceReload = false;
    }

    // if mappingLoadFunction takes in single store rather than array, give it first value
    currentLoadPromise = Promise.resolve(
      mappingLoadFunction(Array.isArray(stores) ? storeValues : storeValues[0])
    ).then((finalValue) => {
      thisStore.set(finalValue);
      return finalValue;
    });

    return currentLoadPromise;
  };

  const setStoreValueThenWrite = async (
    updater: Updater<T>,
    persist?: boolean
  ) => {
    let oldValue;
    try {
      oldValue = await loadDependenciesThenSet(loadAll);
    } catch {
      oldValue = get(thisStore);
    }
    const newValue = updater(oldValue);
    currentLoadPromise = currentLoadPromise
      .then(() => newValue)
      .catch(() => newValue);
    thisStore.set(newValue);

    if (mappingWriteFunction && persist) {
      const parentValues = await loadAll(stores);

      const writeResponse = (await mappingWriteFunction(
        newValue,
        parentValues,
        oldValue
      )) as T;

      if (writeResponse !== undefined) {
        thisStore.set(writeResponse);
        currentLoadPromise = currentLoadPromise.then(() => writeResponse);
      }
    }
  };

  const set = (newValue: T, persist = true) =>
    setStoreValueThenWrite(() => newValue, persist);
  const update = (updater: Updater<T>, persist = true) =>
    setStoreValueThenWrite(updater, persist);

  const hasReloadFunction = Boolean(reloadable || anyReloadable(stores));

  return {
    subscribe: thisStore.subscribe,
    set,
    update,
    load: () => loadDependenciesThenSet(loadAll),
    ...(hasReloadFunction && {
      reload: () => loadDependenciesThenSet(reloadAll, reloadable),
    }),
    ...(testingMode && {
      flagForReload: () => {
        forceReload = true;
      },
    }),
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
 * @param reloadable A flag that indicates whether this store should restart its asynchronous behavior whenever `reload`
 * is invoked on this store or any of its children.
 * @param initial The initial value of the store before it is loaded or on load failure. Otherwise undefined.
 * @returns A Loadable store whose value is set to the resolution of provided async behavior.
 * The loaded value of the store will be ready after awaiting the load function of this store.
 */
export const asyncDerived = <S extends Stores, T>(
  stores: S,
  mappingLoadFunction: (values: StoresValues<S>) => Promise<T>,
  options?: AsyncStoreOptions<T>
): Loadable<T> => {
  const thisStore = asyncWritable(
    stores,
    mappingLoadFunction,
    undefined,
    options
  );
  return {
    subscribe: thisStore.subscribe,
    load: thisStore.load,
    ...(thisStore.reload && { reload: thisStore.reload }),
    ...(thisStore.flagForReload && { flagForReload: thisStore.flagForReload }),
  };
};

/**
 * Generates a Loadable store that will start asynchronous behavior when subscribed to,
 * and whose value will be equal to the resolution of that behavior when completed.
 * @param initial The initial value of the store before it has loaded or upon load failure.
 * @param loadFunction A function that generates a Promise that resolves to the final value
 * of the store when the asynchronous behavior is complete.
 * @param reloadable A flag that indicates whether this store should restart its asynchronous behavior whenever `reload`
 * is invoked on this store or any of its children.
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
  return {
    subscribe: thisStore.subscribe,
    load: loadDependencies(thisStore, loadAll, stores),
    ...(anyReloadable(stores) && {
      reload: loadDependencies(thisStore, reloadAll, stores),
    }),
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
  let resolveLoadPromise: (value: T | PromiseLike<T>) => void;
  let loadPromise: Promise<T> = new Promise((resolve) => {
    resolveLoadPromise = resolve;
  });

  let dummyUnsubscribe: Unsubscriber;

  const resolve = (value: T) => {
    resolveLoadPromise(value);
    loadPromise = Promise.resolve(value);
    if (dummyUnsubscribe) {
      // cleanup our dummy subscription from loading
      dummyUnsubscribe();
      dummyUnsubscribe = undefined;
    }
  };

  const startAndLoad: StartStopNotifier<T> = (vanillaSet: Subscriber<T>) => {
    const customSet = (value: T) => {
      vanillaSet(value);
      resolve(value);
    };
    return start(customSet);
  };

  const thisStore = vanillaWritable(value, start && startAndLoad);

  const load = () => {
    if (!dummyUnsubscribe) {
      // Create a dummy subscription when we load the store.
      // This ensures that we will have at least one subscriber when
      // loading the store so that our start function will run.
      dummyUnsubscribe = thisStore.subscribe(() => {
        /* no-op */
      });
    }
    return loadPromise;
  };

  if (value !== undefined) {
    resolve(value);
  }

  return {
    ...thisStore,
    set: (value: T) => {
      thisStore.set(value);
      resolve(value);
    },
    update: (updater: Updater<T>) => {
      const newValue = updater(get(thisStore));
      thisStore.set(newValue);
      resolve(newValue);
    },
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
  const thisStore = writable(value, start);
  return {
    subscribe: thisStore.subscribe,
    load: thisStore.load,
  };
};
