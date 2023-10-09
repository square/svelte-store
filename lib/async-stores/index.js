var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { get, writable } from 'svelte/store';
import { anyReloadable, getStoresArray, reloadAll, loadAll, } from '../utils/index.js';
import { flagStoreCreated, getStoreTestingMode, logError } from '../config.js';
// STORES
const getLoadState = (stateString) => {
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
const getErrorLoadState = (error) => {
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
 * @param start Start stop notifier.
 * @returns A Loadable store whose value is set to the resolution of provided async behavior.
 * The loaded value of the store will be ready after awaiting the load function of this store.
 */
export const asyncWritable = (stores, mappingLoadFunction, mappingWriteFunction, options = {}, start = undefined) => {
    flagStoreCreated();
    const { reloadable, trackState, initial } = options;
    const loadState = trackState
        ? writable(getLoadState('LOADING'))
        : undefined;
    const setState = (state) => loadState === null || loadState === void 0 ? void 0 : loadState.set(getLoadState(state));
    const setErrorState = (error) => loadState === null || loadState === void 0 ? void 0 : loadState.set(getErrorLoadState(error));
    // stringified representation of parents' loaded values
    // used to track whether a change has occurred and the store reloaded
    let loadedValuesString;
    let latestLoadAndSet;
    // most recent call of mappingLoadFunction, including resulting side effects
    // (updating store value, tracking state, etc)
    let currentLoadPromise;
    const tryLoad = (values) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            return yield mappingLoadFunction(values);
        }
        catch (e) {
            if (e.name !== 'AbortError') {
                logError(e);
                setErrorState(e);
            }
            throw e;
        }
    });
    // eslint-disable-next-line prefer-const
    let loadDependenciesThenSet;
    const thisStore = writable(initial, (set, update) => {
        loadDependenciesThenSet(loadAll).catch(() => Promise.resolve());
        const parentUnsubscribers = getStoresArray(stores).map((store) => store.subscribe(() => {
            loadDependenciesThenSet(loadAll).catch(() => Promise.resolve());
        }));
        const callback = start && start(set, update);
        return () => {
            callback && callback();
            parentUnsubscribers.map((unsubscriber) => unsubscriber());
        };
    });
    loadDependenciesThenSet = (parentLoadFunction, forceReload = false) => __awaiter(void 0, void 0, void 0, function* () {
        const loadParentStores = parentLoadFunction(stores);
        try {
            yield loadParentStores;
        }
        catch (e) {
            currentLoadPromise = loadParentStores;
            setErrorState(e);
            return currentLoadPromise;
        }
        const storeValues = getStoresArray(stores).map((store) => get(store));
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
        const loadAndSet = () => __awaiter(void 0, void 0, void 0, function* () {
            var _a;
            latestLoadAndSet = loadAndSet;
            if ((_a = get(loadState)) === null || _a === void 0 ? void 0 : _a.isSettled) {
                setState('RELOADING');
            }
            try {
                const finalValue = yield tryLoad(loadInput);
                thisStore.set(finalValue);
                setState('LOADED');
                return finalValue;
            }
            catch (e) {
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
        });
        currentLoadPromise = loadAndSet();
        return currentLoadPromise;
    });
    const setStoreValueThenWrite = (updater, persist) => __awaiter(void 0, void 0, void 0, function* () {
        setState('WRITING');
        let oldValue;
        try {
            oldValue = yield loadDependenciesThenSet(loadAll);
        }
        catch (_b) {
            oldValue = get(thisStore);
        }
        const newValue = updater(oldValue);
        currentLoadPromise = currentLoadPromise
            .then(() => newValue)
            .catch(() => newValue);
        thisStore.set(newValue);
        if (mappingWriteFunction && persist) {
            try {
                const parentValues = yield loadAll(stores);
                const writeResponse = (yield mappingWriteFunction(newValue, parentValues, oldValue));
                if (writeResponse !== undefined) {
                    thisStore.set(writeResponse);
                    currentLoadPromise = currentLoadPromise.then(() => writeResponse);
                }
            }
            catch (e) {
                logError(e);
                setErrorState(e);
                throw e;
            }
        }
        setState('LOADED');
    });
    // required properties
    const subscribe = thisStore.subscribe;
    const set = (newValue, persist = true) => setStoreValueThenWrite(() => newValue, persist);
    const update = (updater, persist = true) => setStoreValueThenWrite(updater, persist);
    const load = () => loadDependenciesThenSet(loadAll);
    // // optional properties
    const hasReloadFunction = Boolean(reloadable || anyReloadable(stores));
    const reload = hasReloadFunction
        ? (visitedMap) => __awaiter(void 0, void 0, void 0, function* () {
            const visitMap = visitedMap !== null && visitedMap !== void 0 ? visitedMap : new WeakMap();
            const reloadAndTrackVisits = (stores) => reloadAll(stores, visitMap);
            setState('RELOADING');
            const result = yield loadDependenciesThenSet(reloadAndTrackVisits, reloadable);
            setState('LOADED');
            return result;
        })
        : undefined;
    const state = loadState
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
    return Object.assign(Object.assign(Object.assign({ get store() {
            return this;
        },
        subscribe,
        set,
        update,
        load }, (reload && { reload })), (state && { state })), (reset && { reset }));
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
export const asyncDerived = (stores, mappingLoadFunction, options) => {
    const { store, subscribe, load, reload, state, reset } = asyncWritable(stores, mappingLoadFunction, undefined, options);
    return Object.assign(Object.assign(Object.assign({ store,
        subscribe,
        load }, (reload && { reload })), (state && { state })), (reset && { reset }));
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
export const asyncReadable = (initial, loadFunction, options) => {
    return asyncDerived([], loadFunction, Object.assign(Object.assign({}, options), { initial }));
};
//# sourceMappingURL=index.js.map