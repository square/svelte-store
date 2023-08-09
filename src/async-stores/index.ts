import { get, type Updater, type Readable, writable } from 'svelte/store';
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
} from '../utils/index.js';
import { flagStoreCreated, getStoreTestingMode, logError } from '../config.js';

// STORES

const getLoadState = (stateString: Exclude<State, 'ERROR'>): LoadState => {
  return {
    isLoading: stateString === 'LOADING',
    isReloading: stateString === 'RELOADING',
    isLoaded: stateString === 'LOADED',
    isWriting: stateString === 'WRITING',
    isPending: stateString === 'LOADING' || stateString === 'RELOADING',
    isSettled: stateString === 'LOADED',
    isError: false,
    error: null,
  };
};

const getErrorLoadState = (error: unknown): LoadState => {
  return {
    isLoading: false,
    isReloading: false,
    isLoaded: false,
    isWriting: false,
    isError: true,
    isPending: false,
    isSettled: true,
    error,
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

  const loadState = trackState
    ? writable<LoadState>(getLoadState('LOADING'))
    : undefined;

  const setState = (state: Exclude<State, 'ERROR'>) =>
    loadState?.set(getLoadState(state));

  const setErrorState = (error: any) =>
    loadState?.set(getErrorLoadState(error));

  // stringified representation of parents' loaded values
  // used to track whether a change has occurred and the store reloaded
  let loadedValuesString: string;

  let latestLoadAndSet: () => Promise<T>;

  // most recent call of mappingLoadFunction, including resulting side effects
  // (updating store value, tracking state, etc)
  let currentLoadPromise: Promise<T>;

  const tryLoad = async (values: StoresValues<S>) => {
    try {
      return await mappingLoadFunction(values);
    } catch (e) {
      if (e.name !== 'AbortError') {
        logError(e);
        setErrorState(e);
      }
      throw e;
    }
  };

  // eslint-disable-next-line prefer-const
  let loadDependenciesThenSet: (
    parentLoadFunction: (stores: S) => Promise<StoresValues<S>>,
    forceReload?: boolean
  ) => Promise<T>;

  const thisStore = writable(initial, () => {
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
    forceReload = false
  ) => {
    const loadParentStores = parentLoadFunction(stores);

    try {
      await loadParentStores;
    } catch (e) {
      currentLoadPromise = loadParentStores as Promise<T>;
      setErrorState(e);
      return currentLoadPromise;
    }

    const storeValues = getStoresArray(stores).map((store) =>
      get(store)
    ) as StoresValues<S>;

    if (!forceReload) {
      const newValuesString = JSON.stringify(storeValues);
      if (newValuesString === loadedValuesString) {
        // no change, don't generate new promise
        return currentLoadPromise;
      }
      loadedValuesString = newValuesString;
    }

    // convert storeValues to single store value if expected by mapping function
    const loadInput = Array.isArray(stores) ? storeValues : storeValues[0];

    const loadAndSet = async () => {
      latestLoadAndSet = loadAndSet;
      if (get(loadState)?.isSettled) {
        setState('RELOADING');
      }
      try {
        const finalValue = await tryLoad(loadInput);
        thisStore.set(finalValue);
        setState('LOADED');
        return finalValue;
      } catch (e) {
        // if a load is aborted, resolve to the current value of the store
        if (e.name === 'AbortError') {
          // Normally when a load is aborted we want to leave the state as is.
          // However if the latest load is aborted we change back to LOADED
          // so that it does not get stuck LOADING/RELOADIN'.
          if (loadAndSet === latestLoadAndSet) {
            setState('LOADED');
          }
          return get(thisStore);
        }
        throw e;
      }
    };

    currentLoadPromise = loadAndSet();
    return currentLoadPromise;
  };

  const setStoreValueThenWrite = async (
    updater: Updater<T>,
    persist?: boolean
  ) => {
    setState('WRITING');
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
        logError(e);
        setErrorState(e);
        throw e;
      }
    }
    setState('LOADED');
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
    ? async (visitedMap?: VisitedMap) => {
        const visitMap = visitedMap ?? new WeakMap();
        const reloadAndTrackVisits = (stores: S) => reloadAll(stores, visitMap);
        setState('RELOADING');
        const result = await loadDependenciesThenSet(
          reloadAndTrackVisits,
          reloadable
        );
        setState('LOADED');
        return result;
      }
    : undefined;

  const state: Readable<LoadState> = loadState
    ? { subscribe: loadState.subscribe }
    : undefined;
  const reset = getStoreTestingMode()
    ? () => {
        thisStore.set(initial);
        setState('LOADING');
        loadedValuesString = undefined;
        currentLoadPromise = undefined;
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
    ...(reload && { reload }),
    ...(state && { state }),
    ...(reset && { reset }),
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
