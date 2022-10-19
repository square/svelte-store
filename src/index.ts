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
import {
  getCookie,
  getLocalStorageItem,
  getSessionStorageItem,
  setCookie,
  setSessionStorageItem,
  setLocalStorageItem,
  removeSessionStorageItem,
  removeCookie,
  removeLocalStorageItem,
} from './storage-utils';

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

export enum LoadState {
  LOADING = 'LOADING',
  LOADED = 'LOADED',
  RELOADING = 'RELOADING',
  ERROR = 'ERROR',
  WRITING = 'WRITING',
}
export interface Loadable<T> extends Readable<T> {
  load(): Promise<T>;
  reload?(): Promise<T>;
  state?: Readable<LoadState>;
  flagForReload?(): void;
  store: Loadable<T>;
}

export interface Reloadable<T> extends Loadable<T> {
  reload(): Promise<T>;
}

export interface AsyncWritable<T> extends Writable<T> {
  set(value: T, persist?: boolean): Promise<void>;
  update(updater: Updater<T>): Promise<void>;
  store: AsyncWritable<T>;
}

export type WritableLoadable<T> = Loadable<T> & AsyncWritable<T>;

export interface AsyncStoreOptions<T> {
  reloadable?: true;
  trackState?: true;
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
  object ? Object.prototype.hasOwnProperty.call(object, 'load') : false;

export const isReloadable = <T>(object: unknown): object is Reloadable<T> =>
  object ? Object.prototype.hasOwnProperty.call(object, 'reload') : false;

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

type ErrorLogger = (e: Error) => void;
let logError: ErrorLogger;

export const logAsyncErrors = (logger: ErrorLogger): void => {
  logError = logger;
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
  const { reloadable, trackState, initial } = options;

  const loadState = trackState ? vanillaWritable(LoadState.LOADING) : undefined;

  let loadedValuesString: string;
  let currentLoadPromise: Promise<T>;
  let forceReload = false;

  const tryLoad = async (values: StoresValues<S>) => {
    try {
      return await mappingLoadFunction(values);
    } catch (e) {
      if (logError) {
        logError(e);
      }
      loadState?.set(LoadState.ERROR);
      throw e;
    }
  };

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
      loadState?.set(LoadState.ERROR);
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
        if (get(loadState) === LoadState.RELOADING) {
          loadState?.set(LoadState.LOADED);
        }
        return currentLoadPromise;
      }
      loadedValuesString = newValuesString;
    }

    if (forceReload) {
      thisStore.set(initial);
      forceReload = false;
    }

    // convert storeValues to single store value if expected by mapping function
    const loadInput = Array.isArray(stores) ? storeValues : storeValues[0];

    const loadAndSet = async () => {
      if (
        get(loadState) === LoadState.LOADED ||
        get(loadState) === LoadState.ERROR
      ) {
        loadState?.set(LoadState.RELOADING);
      }
      const finalValue = await tryLoad(loadInput);
      thisStore.set(finalValue);
      loadState?.set(LoadState.LOADED);
      return finalValue;
    };

    currentLoadPromise = loadAndSet();
    return currentLoadPromise;
  };

  const setStoreValueThenWrite = async (
    updater: Updater<T>,
    persist?: boolean
  ) => {
    loadState?.set(LoadState.WRITING);
    let oldValue: T;
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
      try {
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
      } catch (e) {
        if (logError) {
          logError(e);
        }
        loadState?.set(LoadState.ERROR);
        throw e;
      }
    }
    loadState?.set(LoadState.LOADED);
  };

  // required properties
  const subscribe = thisStore.subscribe;
  const set = (newValue: T, persist = true) =>
    setStoreValueThenWrite(() => newValue, persist);
  const update = (updater: Updater<T>, persist = true) =>
    setStoreValueThenWrite(updater, persist);
  const load = () => loadDependenciesThenSet(loadAll);

  // // optional properties
  const hasReloadFunction = Boolean(reloadable || anyReloadable(stores));
  const reload = hasReloadFunction
    ? () => {
        loadState?.set(LoadState.RELOADING);
        return loadDependenciesThenSet(reloadAll, reloadable);
      }
    : undefined;

  const state = loadState ? { subscribe: loadState.subscribe } : undefined;
  const flagForReload = testingMode ? () => (forceReload = true) : undefined;

  return {
    get store() {
      return this;
    },
    subscribe,
    set,
    update,
    load,
    ...(reload && { reload }),
    ...(state && { state }),
    ...(flagForReload && { flagForReload }),
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
  const { store, subscribe, load, reload, state, flagForReload } =
    asyncWritable(stores, mappingLoadFunction, undefined, options);

  return {
    store,
    subscribe,
    load,
    ...(reload && { reload }),
    ...(state && { state }),
    ...(flagForReload && { flagForReload }),
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

// PERSISTED

export enum StorageType {
  LOCAL_STORAGE = 'LOCAL_STORAGE',
  SESSION_STORAGE = 'SESSION_STORAGE',
  COOKIE = 'COOKIE',
}

export type StorageOptions = {
  reloadable?: true;
  storageType?: StorageType;
  consentLevel?: unknown;
};

interface Syncable<T> {
  resync: () => Promise<T>;
  clear: () => Promise<void>;
  store: Syncable<T>;
}

export type Persisted<T> = Syncable<T> & WritableLoadable<T>;

type GetStorageItem = (key: string, consentLevel?: unknown) => string | null;
type SetStorageItem = (
  key: string,
  value: string,
  consentLevel?: unknown
) => void;
type RemoveStorageItem = (key: string) => void;

const getStorageFunctions = (
  type: StorageType
): {
  getStorageItem: GetStorageItem;
  setStorageItem: SetStorageItem;
  removeStorageItem: RemoveStorageItem;
} => {
  return {
    [StorageType.LOCAL_STORAGE]: {
      getStorageItem: getLocalStorageItem,
      setStorageItem: setLocalStorageItem,
      removeStorageItem: removeLocalStorageItem,
    },
    [StorageType.SESSION_STORAGE]: {
      getStorageItem: getSessionStorageItem,
      setStorageItem: setSessionStorageItem,
      removeStorageItem: removeSessionStorageItem,
    },
    [StorageType.COOKIE]: {
      getStorageItem: getCookie,
      setStorageItem: setCookie,
      removeStorageItem: removeCookie,
    },
  }[type];
};

type ConsentChecker = (consentLevel: unknown) => boolean;

let checkConsent: ConsentChecker;

export const configurePersistedConsent = (
  consentChecker: ConsentChecker
): void => {
  checkConsent = consentChecker;
};

/**
 * Creates a `Writable` store that synchronizes with a localStorage item,
 * sessionStorage item, or cookie. The store's value will initialize to the value of
 * the corresponding storage item if found, otherwise it will use the provided initial
 * value and persist that value in storage. Any changes to the value of this store will
 * be persisted in storage.
 * @param initial The value to initialize to when used when a corresponding storage
 * item is not found. If a Loadable store is provided the store will be loaded and its value
 * used in this case.
 * @param key The key of the storage item to synchronize.
 * @param options Modifiers for store behavior.
 */
export const persisted = <T>(
  initial: T | Loadable<T>,
  key: string | (() => Promise<string>),
  options: StorageOptions = {}
): Persisted<T> => {
  const { reloadable, storageType, consentLevel } = options;

  const { getStorageItem, setStorageItem, removeStorageItem } =
    getStorageFunctions(storageType || StorageType.LOCAL_STORAGE);

  const getKey = () => {
    if (typeof key === 'function') {
      return key();
    }
    return Promise.resolve(key);
  };

  const setAndPersist = async (value: T, set: Subscriber<T>) => {
    // check consent if checker provided
    if (!checkConsent || checkConsent(consentLevel)) {
      const storageKey = await getKey();
      setStorageItem(storageKey, JSON.stringify(value), consentLevel);
    }
    set(value);
  };

  const synchronize = async (set: Subscriber<T>): Promise<T> => {
    const storageKey = await getKey();
    const storageItem = getStorageItem(storageKey);

    if (storageItem) {
      const stored = JSON.parse(storageItem);
      set(stored);

      return stored;
    } else if (initial !== undefined) {
      if (isLoadable(initial)) {
        const $initial = await initial.load();
        await setAndPersist($initial, set);

        return $initial;
      } else {
        await setAndPersist(initial, set);

        return initial;
      }
    } else {
      set(undefined);
      return undefined;
    }
  };

  let initialSync: Promise<T>;

  const thisStore = writable<T>(undefined, (set) => {
    initialSync = synchronize(set);
  });

  const subscribe = thisStore.subscribe;

  const set = async (value: T) => {
    await initialSync;
    return setAndPersist(value, thisStore.set);
  };

  const update = async (updater: Updater<T>) => {
    await (initialSync ?? synchronize(thisStore.set));
    const newValue = updater(get(thisStore));
    await setAndPersist(newValue, thisStore.set);
  };

  const load = thisStore.load;

  const resync = async (): Promise<T> => {
    await initialSync;
    return synchronize(thisStore.set);
  };

  const clear = async () => {
    const storageKey = await getKey();
    removeStorageItem(storageKey);
    thisStore.set(null);
  };

  const reload = reloadable
    ? async () => {
        let newValue: T;

        if (isLoadable(initial)) {
          [newValue] = await reloadAll([initial]);
        } else {
          newValue = initial;
        }

        setAndPersist(newValue, thisStore.set);
        return newValue;
      }
    : undefined;

  return {
    get store() {
      return this;
    },
    subscribe,
    set,
    update,
    load,
    resync,
    clear,
    ...(reload && { reload }),
  };
};

// ASYNC CLIENT

type AsyncClient<T> = T extends (...args: infer TArgs) => infer TReturn
  ? (...args: TArgs) => Promise<TReturn>
  : {
      [k in keyof T]: T[k] extends (...args: infer KArgs) => infer KReturn // callable property?
        ? (...args: KArgs) => Promise<KReturn> // make the function async
        : () => Promise<T[k]>; // return the property in a Promise
    };

/**
 * Generates an AsyncClient from a Loadable store. The AsyncClient will have all
 * of the properties of the input store, plus a collection of asynchronous functions
 * for kicking off access of the store's value's properties before it has finished loading.
 * i.e. an asyncClient that loads to {foo: 'bar'} will have a `foo` function that
 * resolves to 'bar' when the store has loaded.
 * @param loadable Loadable to unpack into an asnycClient
 * @returns an asyncClient with the properties of the input store and asynchronous
 * accessors to the properties of the store's loaded value
 */
export const asyncClient = <S extends Loadable<unknown>>(
  loadable: S
): S & AsyncClient<StoresValues<S>> => {
  return new Proxy(Function.prototype, {
    get: (functionProto, property) => {
      if (functionProto[property]) {
        // this ensures that jest is able to identify the proxy
        // when setting up spies on its properties
        return functionProto[property];
      }
      if (loadable[property]) {
        return loadable[property];
      }
      return async (...argumentsList: unknown[]) => {
        const storeValue = await loadable.load();
        const original = storeValue[property];
        if (typeof original === 'function') {
          return Reflect.apply(original, storeValue, argumentsList);
        } else {
          return original;
        }
      };
    },
    apply: async (_, __, argumentsList) => {
      const storeValue = await loadable.load();
      if (typeof storeValue === 'function') {
        return Reflect.apply(storeValue, storeValue, argumentsList);
      }
      return storeValue;
    },
  }) as unknown as S & AsyncClient<StoresValues<S>>;
};
