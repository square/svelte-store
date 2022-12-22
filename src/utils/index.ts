import { get, type Readable } from 'svelte/store';
import {
  VisitedMap,
  type Loadable,
  type Reloadable,
  type Stores,
  type StoresValues,
} from '../async-stores/types';

export const getStoresArray = (stores: Stores): Readable<unknown>[] => {
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
  stores: S,
  visitedMap?: VisitedMap
): Promise<StoresValues<S>> => {
  const visitMap = visitedMap ?? new WeakMap();

  const reloadPromises = getStoresArray(stores).map((store) => {
    if (Object.prototype.hasOwnProperty.call(store, 'reload')) {
      // only reload if store has not already been visited
      if (!visitMap.has(store)) {
        visitMap.set(store, (store as Loadable<unknown>).reload(visitMap));
      }
      return visitMap.get(store);
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

type FlatPromise<T> = T extends Promise<unknown> ? T : Promise<T>;

/**
 * Create a rebounced version of a provided function. The rebounced function resolves to the
 * returned value of the original function, or rejects with an AbortError is the rebounced
 * function is called again before resolution.
 * @param callback The function to be rebounced.
 * @param delay Adds millisecond delay upon rebounced function call before original function
 * is called. Successive calls within this period create rejection without calling original function.
 * @returns Rebounced version of proivded callback function.
 */
export const rebounce = <T, U>(
  callback: (...args: T[]) => U,
  delay = 0
): ((...args: T[]) => FlatPromise<U>) & {
  clear: () => void;
} => {
  let previousReject: (reason: Error) => void;
  let existingTimer: ReturnType<typeof setTimeout>;

  const rebounced = (...args: T[]): FlatPromise<U> => {
    previousReject?.(
      new DOMException('The function was rebounced.', 'AbortError')
    );
    let currentResolve: (value: U | PromiseLike<U>) => void;
    let currentReject: (reason: Error) => void;

    const currentPromise = new Promise((resolve, reject) => {
      currentResolve = resolve;
      currentReject = reject;
    }) as U extends Promise<unknown> ? U : Promise<U>;

    const resolveCallback = async () => {
      try {
        const result = await Promise.resolve(callback(...args));
        currentResolve(result);
      } catch (error) {
        currentReject(error);
      }
    };

    clearTimeout(existingTimer);
    existingTimer = setTimeout(resolveCallback, delay);

    previousReject = currentReject;

    return currentPromise;
  };

  const clear = () => {
    clearTimeout(existingTimer);
    previousReject?.(
      new DOMException('The function was rebounced.', 'AbortError')
    );
    existingTimer = undefined;
    previousReject = undefined;
  };

  rebounced.clear = clear;

  return rebounced;
};
