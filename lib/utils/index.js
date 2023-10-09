var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { get } from 'svelte/store';
export const getStoresArray = (stores) => {
    return Array.isArray(stores) ? stores : [stores];
};
export const isLoadable = (object) => object ? Object.prototype.hasOwnProperty.call(object, 'load') : false;
export const isReloadable = (object) => object ? Object.prototype.hasOwnProperty.call(object, 'reload') : false;
export const anyLoadable = (stores) => getStoresArray(stores).some(isLoadable);
export const anyReloadable = (stores) => getStoresArray(stores).some(isReloadable);
export const getAll = (stores) => {
    const valuesArray = getStoresArray(stores).map((store) => get(store));
    return Array.isArray(stores) ? valuesArray : valuesArray[0];
};
/**
 * Load a number of Stores. Loading a store will first await loadAll of any parents.
 * @param stores Any Readable or array of Readables to await loading of.
 * @returns Promise that resolves to an array of the loaded values of the input stores.
 * Non Loadables will resolve immediately.
 */
export const loadAll = (stores) => __awaiter(void 0, void 0, void 0, function* () {
    const loadPromises = getStoresArray(stores).map((store) => {
        if (Object.prototype.hasOwnProperty.call(store, 'load')) {
            return store.load();
        }
        else {
            return get(store);
        }
    });
    yield Promise.all(loadPromises);
    return getAll(stores);
});
/**
 * Reload a number of stores. Reloading a store will first await reloadAll of any parents.
 * If a store has no ancestors that are flagged as reloadable, reloading is equivalent to loading.
 * @param stores Any Readable or array of Readables to await reloading of.
 * Reloading a store will first await reloadAll of any parents.
 * @returns Promise that resolves to an array of the loaded values of the input stores.
 * Non Loadables will resolve immediately.
 */
export const reloadAll = (stores, visitedMap) => __awaiter(void 0, void 0, void 0, function* () {
    const visitMap = visitedMap !== null && visitedMap !== void 0 ? visitedMap : new WeakMap();
    const reloadPromises = getStoresArray(stores).map((store) => {
        if (Object.prototype.hasOwnProperty.call(store, 'reload')) {
            // only reload if store has not already been visited
            if (!visitMap.has(store)) {
                visitMap.set(store, store.reload(visitMap));
            }
            return visitMap.get(store);
        }
        else if (Object.prototype.hasOwnProperty.call(store, 'load')) {
            return store.load();
        }
        else {
            return get(store);
        }
    });
    yield Promise.all(reloadPromises);
    return getAll(stores);
});
/**
 * Load a number of stores, and catch any errors.
 * @param stores Any Readable or array of Readables to await loading of.
 * @returns boolean representing whether the given stores loaded without errors, or not.
 */
export const safeLoad = (stores) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield loadAll(stores);
        return true;
    }
    catch (_a) {
        return false;
    }
});
/**
 * Create a rebounced version of a provided function. The rebounced function resolves to the
 * returned value of the original function, or rejects with an AbortError is the rebounced
 * function is called again before resolution.
 * @param callback The function to be rebounced.
 * @param delay Adds millisecond delay upon rebounced function call before original function
 * is called. Successive calls within this period create rejection without calling original function.
 * @returns Rebounced version of proivded callback function.
 */
export const rebounce = (callback, delay = 0) => {
    let previousReject;
    let existingTimer;
    const rebounced = (...args) => {
        previousReject === null || previousReject === void 0 ? void 0 : previousReject(new DOMException('The function was rebounced.', 'AbortError'));
        let currentResolve;
        let currentReject;
        const currentPromise = new Promise((resolve, reject) => {
            currentResolve = resolve;
            currentReject = reject;
        });
        const resolveCallback = () => __awaiter(void 0, void 0, void 0, function* () {
            try {
                const result = yield Promise.resolve(callback(...args));
                currentResolve(result);
            }
            catch (error) {
                currentReject(error);
            }
        });
        clearTimeout(existingTimer);
        existingTimer = setTimeout(resolveCallback, delay);
        previousReject = currentReject;
        return currentPromise;
    };
    const clear = () => {
        clearTimeout(existingTimer);
        previousReject === null || previousReject === void 0 ? void 0 : previousReject(new DOMException('The function was rebounced.', 'AbortError'));
        existingTimer = undefined;
        previousReject = undefined;
    };
    rebounced.clear = clear;
    return rebounced;
};
//# sourceMappingURL=index.js.map