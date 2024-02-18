import { get } from 'svelte/store';
import {
  StoresArray,
  VisitedMap,
  type Loadable,
  type Reloadable,
  type Stores,
  type StoresValues,
} from '../async-stores/types.js';

export const getStoresArray = (stores: Stores): StoresArray => {
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

export const getAll = <S extends Stores>(stores: S): StoresValues<S> => {
  const valuesArray = getStoresArray(stores).map((store) =>
    get(store)
  ) as unknown as StoresValues<S>;
  return Array.isArray(stores) ? valuesArray : valuesArray[0];
};

/**
 * Load a number of Stores. Loading a store will first await loadAll of any parents.
 * @param stores Any Readable or array of Readables to await loading of.
 * @returns Promise that resolves to an array of the loaded values of the input stores.
 * Non Loadables will resolve immediately.
 */
export const loadAll = async <S extends Stores>(
  stores: S
): Promise<StoresValues<S>> => {
  const loadPromises = getStoresArray(stores).map((store) => {
    if (Object.prototype.hasOwnProperty.call(store, 'load')) {
      return (store as Loadable<unknown>).load();
    } else {
      return get(store);
    }
  });

  await Promise.all(loadPromises);

  return getAll(stores);
};

/**
 * Reload a number of stores. Reloading a store will first await reloadAll of any parents.
 * If a store has no ancestors that are flagged as reloadable, reloading is equivalent to loading.
 * @param stores Any Readable or array of Readables to await reloading of.
 * Reloading a store will first await reloadAll of any parents.
 * @returns Promise that resolves to an array of the loaded values of the input stores.
 * Non Loadables will resolve immediately.
 */
export const reloadAll = async <S extends Stores>(
  stores: S,
  visitedMap?: VisitedMap
): Promise<StoresValues<S>> => {
  const visitMap = visitedMap ?? new WeakMap();

  const reloadPromises = getStoresArray(stores).map((store) => {
    if (Object.prototype.hasOwnProperty.call(store, 'reload')) {
      // only reload if store has not already been visited
      if (!visitMap.has(store)) {
        visitMap.set(
          store,
          (store as unknown as Reloadable<unknown>).reload(visitMap)
        );
      }
      return visitMap.get(store);
    } else if (Object.prototype.hasOwnProperty.call(store, 'load')) {
      return (store as Loadable<unknown>).load();
    } else {
      return get(store);
    }
  });

  await Promise.all(reloadPromises);

  return getAll(stores);
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
  abort: () => void;
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

  const abort = () => {
    clearTimeout(existingTimer);
    previousReject?.(
      new DOMException('The function was rebounced.', 'AbortError')
    );
    existingTimer = undefined;
    previousReject = undefined;
  };

  rebounced.abort = abort;

  return rebounced;
};
