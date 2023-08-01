import {
  get,
  type Updater,
  type Readable,
  writable,
  StartStopNotifier,
  readable,
  Writable,
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
  AsyncLoadable,
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
 * @param selfLoadFunction A function that takes in the loaded values of any parent stores and generates a Promise that resolves
 * to the final value of the store when the asynchronous behavior is complete.
 * @param writePersistFunction A function that takes in the new value of the store and uses it to perform async behavior.
 * Typically this would be to persist the change. If this value resolves to a value the store will be set to it.
 * @param options Modifiers for store behavior.
 * @returns A Loadable store whose value is set to the resolution of provided async behavior.
 * The loaded value of the store will be ready after awaiting the load function of this store.
 */
export const asyncWritable = <S extends Stores, T>(
  stores: S,
  selfLoadFunction: (values: StoresValues<S>) => Promise<T> | T,
  writePersistFunction?: (
    value: T,
    parentValues?: StoresValues<S>,
    oldValue?: T
  ) => Promise<void | T>,
  options: AsyncStoreOptions<T> = {}
): WritableLoadable<T> => {
  // eslint-disable-next-line prefer-const
  let thisStore: Writable<T>;

  flagStoreCreated();
  const { reloadable, initial, debug, rebounceDelay } = options;

  const debuggy = debug ? (...args) => console.log(debug, ...args) : undefined;

  const rebouncedSelfLoad = rebounce(selfLoadFunction, rebounceDelay);

  const loadState = writable<LoadState>(getLoadState('LOADING'));
  const setState = (state: State) => loadState.set(getLoadState(state));

  // flag marking whether store is ready for updates from subscriptions
  let ready = false;
  let changeReceived = false;

  // most recent call of mappingLoadFunction, including resulting side effects
  // (updating store value, tracking state, etc)
  let currentLoadPromise: Promise<T | Error>;
  let resolveCurrentLoad: (value: T | PromiseLike<T> | Error) => void;

  const setCurrentLoadPromise = () => {
    debuggy?.('setCurrentLoadPromise -> new load promise generated');
    currentLoadPromise = new Promise((resolve) => {
      resolveCurrentLoad = resolve;
    });
  };

  const getLoadedValueOrThrow = async (callback?: () => void) => {
    debuggy?.('getLoadedValue -> starting await current load');
    const result = await currentLoadPromise;
    debuggy?.('getLoadedValue -> got loaded result', result);
    callback?.();
    if (result instanceof Error) {
      throw result;
    }
    return currentLoadPromise as T;
  };

  let parentValues: StoresValues<S>;

  let mostRecentLoadTracker: Record<string, never>;
  const selfLoadThenSet = async () => {
    if (get(loadState).isSettled) {
      setCurrentLoadPromise();
      debuggy?.('setting RELOADING');
      setState('RELOADING');
    }

    const thisLoadTracker = {};
    mostRecentLoadTracker = thisLoadTracker;

    try {
      // parentValues
      const finalValue = (await rebouncedSelfLoad(parentValues)) as T;
      debuggy?.('setting value');
      thisStore.set(finalValue);

      if (!get(loadState).isWriting) {
        debuggy?.('setting LOADED');
        setState('LOADED');
      }
      resolveCurrentLoad(finalValue);
    } catch (error) {
      debuggy?.('caught error', error);
      if (error.name !== 'AbortError') {
        logError(error);
        setState('ERROR');
        debuggy?.('resolving current load with error', error);
        // Resolve with an Error rather than rejecting so that unhandled rejections
        // are not created by the stores internal processes. These errors are
        // converted back to promise rejections via the load or reload functions,
        // allowing for proper handling after that point.
        // If your stack trace takes you here, make sure your store's
        // selfLoadFunction rejects with an Error to preserve the full trace.
        resolveCurrentLoad(error instanceof Error ? error : new Error(error));
      } else if (thisLoadTracker === mostRecentLoadTracker) {
        // Normally when a load is aborted we want to leave the state as is.
        // However if the latest load is aborted we change back to LOADED
        // so that it does not get stuck LOADING/RELOADING.
        setState('LOADED');
        resolveCurrentLoad(get(thisStore));
      }
    }
  };

  let cleanupSubscriptions: () => void;

  // called when store receives its first subscriber
  const onFirstSubscription: StartStopNotifier<T> = () => {
    debuggy?.('onFirstSubscription');
    setCurrentLoadPromise();
    parentValues = getAll(stores);
    setState('LOADING');

    const initialLoad = async () => {
      debuggy?.('initial load called');
      try {
        parentValues = await loadAll(stores);
        debuggy?.('setting ready');
        ready = true;
        changeReceived = false;
        selfLoadThenSet();
      } catch (error) {
        ready = true;
        changeReceived = false;
        resolveCurrentLoad(error);
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
          selfLoadThenSet();
        }
      })
    );

    cleanupSubscriptions = () => {
      debuggy?.('cleaning up subscriptions');
      parentUnsubscribers.map((unsubscriber) => unsubscriber());
      ready = false;
      changeReceived = false;
    };

    // called on losing last subscriber
    return () => {
      debuggy?.('stopping store');
      cleanupSubscriptions();
    };
  };

  thisStore = writable(initial, onFirstSubscription);

  const setStoreValueThenWrite = async (
    updater: Updater<T>,
    persist?: boolean
  ) => {
    setState('WRITING');
    let oldValue: T;
    try {
      oldValue = await getLoadedValueOrThrow();
    } catch {
      oldValue = get(thisStore);
    }

    setCurrentLoadPromise();
    let newValue = updater(oldValue);
    thisStore.set(newValue);

    if (writePersistFunction && persist) {
      try {
        const writeResponse = (await writePersistFunction(
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
        resolveCurrentLoad(newValue);
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
    return getLoadedValueOrThrow(dummyUnsubscribe);
  };

  const reload = async (visitedMap?: VisitedMap) => {
    const dummyUnsubscribe = thisStore.subscribe(() => {
      /* no-op */
    });
    ready = false;
    changeReceived = false;
    if (get(loadState).isSettled) {
      debuggy?.('new load promise');
      setCurrentLoadPromise();
    }
    debuggy?.('setting RELOADING from reload');
    const wasErrored = get(loadState).isError;
    setState('RELOADING');

    const visitMap = visitedMap ?? new WeakMap();
    try {
      parentValues = await reloadAll(stores, visitMap);
      debuggy?.('parentValues', parentValues);
      ready = true;
      debuggy?.(changeReceived, reloadable, wasErrored);
      if (changeReceived || reloadable || wasErrored) {
        selfLoadThenSet();
      } else {
        resolveCurrentLoad(get(thisStore));
        setState('LOADED');
      }
    } catch (error) {
      debuggy?.('caught error during reload');
      setState('ERROR');
      resolveCurrentLoad(error);
    }
    return getLoadedValueOrThrow(dummyUnsubscribe);
  };

  const set = (newValue: T, persist = true) =>
    setStoreValueThenWrite(() => newValue, persist);
  const update = (updater: Updater<T>, persist = true) =>
    setStoreValueThenWrite(updater, persist);

  const abort = () => {
    rebouncedSelfLoad.abort();
  };

  const reset = getStoreTestingMode()
    ? () => {
        // cleanupSubscriptions?.();
        thisStore.set(initial);
        setState('LOADING');
        ready = false;
        changeReceived = false;
        // currentLoadPromise = undefined;
        // setCurrentLoadPromise();
        // rebouncedSelfLoad.abort();
      }
    : undefined;

  return {
    get store() {
      return this;
    },
    subscribe,
    load,
    reload,
    set,
    update,
    abort,
    state: { subscribe: loadState.subscribe },
    ...(reset && { reset }),
  };
};

/**
 * Generate a Loadable store that is considered 'loaded' after resolving asynchronous behavior.
 * This asynchronous behavior may be derived from the value of parent Loadable or non Loadable stores.
 * If so, this store will begin loading only after the parents have loaded.
 * @param stores Any readable or array of Readables whose value is used to generate the asynchronous behavior of this store.
 * Any changes to the value of these stores post-load will restart the asynchronous behavior of the store using the new values.
 * @param selfLoadFunction A function that takes in the values of the stores and generates a Promise that resolves
 * to the final value of the store when the asynchronous behavior is complete.
 * @param options Modifiers for store behavior.
 * @returns A Loadable store whose value is set to the resolution of provided async behavior.
 * The loaded value of the store will be ready after awaiting the load function of this store.
 */
export const asyncDerived = <S extends Stores, T>(
  stores: S,
  selfLoadFunction: (values: StoresValues<S>) => Promise<T>,
  options?: AsyncStoreOptions<T>
): AsyncLoadable<T> => {
  const { store, subscribe, load, reload, state, abort, reset } = asyncWritable(
    stores,
    selfLoadFunction,
    undefined,
    options
  );

  return {
    store,
    subscribe,
    load,
    reload,
    state,
    abort,
    ...(reset && { reset }),
  };
};

/**
 * Generates a Loadable store that will start asynchronous behavior when subscribed to,
 * and whose value will be equal to the resolution of that behavior when completed.
 * @param initial The initial value of the store before it has loaded or upon load failure.
 * @param selfLoadFunction A function that generates a Promise that resolves to the final value
 * of the store when the asynchronous behavior is complete.
 * @param options Modifiers for store behavior.
 * @returns  A Loadable store whose value is set to the resolution of provided async behavior.
 * The loaded value of the store will be ready after awaiting the load function of this store.
 */
export const asyncReadable = <T>(
  initial: T,
  selfLoadFunction: () => Promise<T>,
  options?: Omit<AsyncStoreOptions<T>, 'initial'>
): AsyncLoadable<T> => {
  return asyncDerived([], selfLoadFunction, { ...options, initial });
};
