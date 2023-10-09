import { StoresArray, VisitedMap, type Loadable, type Reloadable, type Stores, type StoresValues } from '../async-stores/types.js';
export declare const getStoresArray: (stores: Stores) => StoresArray;
export declare const isLoadable: <T>(object: unknown) => object is Loadable<T>;
export declare const isReloadable: <T>(object: unknown) => object is Reloadable<T>;
export declare const anyLoadable: (stores: Stores) => boolean;
export declare const anyReloadable: (stores: Stores) => boolean;
export declare const getAll: <S extends Stores>(stores: S) => StoresValues<S>;
/**
 * Load a number of Stores. Loading a store will first await loadAll of any parents.
 * @param stores Any Readable or array of Readables to await loading of.
 * @returns Promise that resolves to an array of the loaded values of the input stores.
 * Non Loadables will resolve immediately.
 */
export declare const loadAll: <S extends Stores>(stores: S) => Promise<StoresValues<S>>;
/**
 * Reload a number of stores. Reloading a store will first await reloadAll of any parents.
 * If a store has no ancestors that are flagged as reloadable, reloading is equivalent to loading.
 * @param stores Any Readable or array of Readables to await reloading of.
 * Reloading a store will first await reloadAll of any parents.
 * @returns Promise that resolves to an array of the loaded values of the input stores.
 * Non Loadables will resolve immediately.
 */
export declare const reloadAll: <S extends Stores>(stores: S, visitedMap?: VisitedMap) => Promise<StoresValues<S>>;
/**
 * Load a number of stores, and catch any errors.
 * @param stores Any Readable or array of Readables to await loading of.
 * @returns boolean representing whether the given stores loaded without errors, or not.
 */
export declare const safeLoad: <S extends Stores>(stores: S) => Promise<boolean>;
declare type FlatPromise<T> = T extends Promise<unknown> ? T : Promise<T>;
/**
 * Create a rebounced version of a provided function. The rebounced function resolves to the
 * returned value of the original function, or rejects with an AbortError is the rebounced
 * function is called again before resolution.
 * @param callback The function to be rebounced.
 * @param delay Adds millisecond delay upon rebounced function call before original function
 * is called. Successive calls within this period create rejection without calling original function.
 * @returns Rebounced version of proivded callback function.
 */
export declare const rebounce: <T, U>(callback: (...args: T[]) => U, delay?: number) => ((...args: T[]) => FlatPromise<U>) & {
    clear: () => void;
};
export {};
