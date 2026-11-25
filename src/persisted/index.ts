import { get, type Updater, type Subscriber } from 'svelte/store';
import { StorageType, type StorageOptions, type Persisted } from './types.js';
import type { Loadable } from '../async-stores/types.js';
import { isLoadable, reloadAll } from '../utils/index.js';
import { writable } from '../standard-stores/index.js';
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
} from './storage-utils.js';

type GetStorageItem = (key: string) => unknown;
type SetStorageItem = (key: string, value: unknown) => void;
type RemoveStorageItem = (key: string) => void;

type StorageFunctions = {
  getStorageItem: GetStorageItem;
  setStorageItem: SetStorageItem;
  removeStorageItem: RemoveStorageItem;
};

const builtinStorageFunctions: Record<string, StorageFunctions> = {
  LOCAL_STORAGE: {
    getStorageItem: getLocalStorageItem,
    setStorageItem: setLocalStorageItem,
    removeStorageItem: removeLocalStorageItem,
  },
  SESSION_STORAGE: {
    getStorageItem: getSessionStorageItem,
    setStorageItem: setSessionStorageItem,
    removeStorageItem: removeSessionStorageItem,
  },
  COOKIE: {
    getStorageItem: getCookie,
    setStorageItem: setCookie,
    removeStorageItem: removeCookie,
  },
};

const customStorageFunctions: Record<string, StorageFunctions> = {};

export const configureCustomStorageType = (
  type: string,
  storageFunctions: StorageFunctions
): void => {
  customStorageFunctions[type] = storageFunctions;
};

const getStorageFunctions = (type: StorageType | string): StorageFunctions => {
  const storageFunctions = {
    ...builtinStorageFunctions,
    ...customStorageFunctions,
  }[type];
  if (!storageFunctions) {
    throw new Error(`'${type}' is not a valid StorageType!`);
  }
  return storageFunctions;
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
 * be persisted in storage. Storage is best-effort: unreadable values use the initial
 * value, and failed writes or removals do not prevent in-memory updates.
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
    getStorageFunctions(storageType || 'LOCAL_STORAGE');

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
      try {
        setStorageItem(storageKey, value);
      } catch {
        // Keep the store usable even if persistence is unavailable.
      }
    }
    set(value);
  };

  const synchronize = async (set: Subscriber<T>): Promise<T> => {
    const storageKey = await getKey();
    let stored: unknown;
    let readFailed = false;
    try {
      stored = getStorageItem(storageKey);
    } catch {
      // Preserve potentially valid saved data when the read cannot complete.
      readFailed = true;
    }

    if (stored) {
      set(stored as T);
      return stored as T;
    } else if (initial !== undefined) {
      const initialValue = isLoadable(initial) ? await initial.load() : initial;
      if (readFailed) {
        set(initialValue);
      } else {
        await setAndPersist(initialValue, set);
      }
      return initialValue;
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
    try {
      removeStorageItem(storageKey);
    } catch {
      // Clearing memory must still work when storage cannot be removed.
    }
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
