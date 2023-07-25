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
  getAll,
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
  const { reloadable, initial, debug } = options;

  const debuggy = debug ? console.log : undefined;

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
      debuggy?.('setting RELOADING');
      setState('RELOADING');
    }

    try {
      const finalValue = await rebouncedMappingLoad(parentValues);
      debuggy?.('setting value');
      setStoreValue(finalValue);
      if (!get(loadState).isWriting) {
        debuggy?.('setting LOADED');
        setState('LOADED');
      }
      resolveCurrentLoad(finalValue);
    } catch (e) {
      if (e.name !== 'AbortError') {
        logError(e);
        setState('ERROR');
        rejectCurrentLoad(e);
      }
    }
  };

  const onFirstSubscription: StartStopNotifier<T> = (setStoreValue) => {
    setCurrentLoadPromise();
    parentValues = getAll(stores);

    const initialLoad = async () => {
      debuggy?.('initial load called');
      try {
        parentValues = await loadAll(stores);
        debuggy?.('setting ready');
        ready = true;
        changeReceived = false;
        mappingLoadThenSet(setStoreValue);
      } catch (error) {
        console.log('wtf is happening', error);
        rejectCurrentLoad(error);
      }
    };
    initialLoad();

    const parentUnsubscribers = getStoresArray(stores).map((store, i) =>
      store.subscribe((value) => {
        debuggy?.('received value', value);
        changeReceived = true;
        if (Array.isArray(stores)) {
          parentValues[i] = value;
        } else {
          parentValues = value as StoresValues<S>;
        }
        if (ready) {
          debuggy?.('proceeding because ready');
          mappingLoadThenSet(setStoreValue);
        }
      })
    );

    // called on losing last subscriber
    return () => {
      parentUnsubscribers.map((unsubscriber) => unsubscriber());
      ready = false;
    };
  };

  const thisStore = writable(initial, onFirstSubscription);

  const setStoreValueThenWrite = async (
    updater: Updater<T>,
    persist?: boolean
  ) => {
    setState('WRITING');
    let oldValue: T;
    try {
      oldValue = await currentLoadPromise;
    } catch {
      oldValue = get(thisStore);
    }

    setCurrentLoadPromise();
    let newValue = updater(oldValue);
    thisStore.set(newValue);

    if (mappingWriteFunction && persist) {
      try {
        const writeResponse = (await mappingWriteFunction(
          newValue,
          parentValues,
          oldValue
        )) as T;

        if (writeResponse !== undefined) {
          thisStore.set(writeResponse);
          newValue = writeResponse;
        }
      } catch (error) {
        logError(error);
        debuggy?.('setting ERROR');
        setState('ERROR');
        rejectCurrentLoad(error);
        throw error;
      }
    }
    setState('LOADED');
    resolveCurrentLoad(newValue);
  };

  // required properties
  const subscribe = thisStore.subscribe;
  const load = () => {
    const dummyUnsubscribe = thisStore.subscribe(() => {
      /* no-op */
    });
    currentLoadPromise
      .catch(() => {
        /* no-op */
      })
      .finally(dummyUnsubscribe);
    return currentLoadPromise;
  };
  const reload = async (visitedMap?: VisitedMap) => {
    ready = false;
    changeReceived = false;
    setCurrentLoadPromise();
    debuggy?.('setting RELOADING from reload');
    setState('RELOADING');

    const visitMap = visitedMap ?? new WeakMap();
    try {
      await reloadAll(stores, visitMap);
      ready = true;
      if (changeReceived || reloadable) {
        mappingLoadThenSet(thisStore.set);
      } else {
        resolveCurrentLoad(get(thisStore));
        setState('LOADED');
      }
    } catch (error) {
      debuggy?.('caught error during reload');
      setState('ERROR');
      rejectCurrentLoad(error);
    }
    return currentLoadPromise;
  };
  const set = (newValue: T, persist = true) =>
    setStoreValueThenWrite(() => newValue, persist);
  const update = (updater: Updater<T>, persist = true) =>
    setStoreValueThenWrite(updater, persist);

  return {
    get store() {
      return this;
    },
    subscribe,
    load,
    reload,
    set,
    update,
    state: { subscribe: loadState.subscribe },
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
