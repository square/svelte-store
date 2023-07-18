import {
  get,
  type Updater,
  type Readable,
  writable,
  StartStopNotifier,
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

  const loadState = trackState
    ? writable<LoadState>(getLoadState('LOADING'))
    : undefined;
  const setState = (state: State) => loadState?.set(getLoadState(state));

  // flag marking whether store is ready for updates from subscriptions
  let ready = false;

  // most recent call of mappingLoadFunction, including resulting side effects
  // (updating store value, tracking state, etc)
  let currentLoadPromise: Promise<T>;

  let latestLoadAndSet: () => Promise<T>;

  const tryLoadValue = async (values: StoresValues<S>) => {
    try {
      return await mappingLoadFunction(values);
    } catch (e) {
      if (e.name !== 'AbortError') {
        logError(e);
        setState('ERROR');
      }
      throw e;
    }
  };

  const loadThenSet = async (set) => {};

  const onFirstSubscribtion: StartStopNotifier<T> = async (set) => {
    (async () => {
      const values = await loadAll(stores);
      ready = true;
      tryLoadValue(values);
    })();
    const values = await loadAll();
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
