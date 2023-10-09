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
import { isLoadable, reloadAll } from '../utils/index.js';
import { writable } from '../standard-stores/index.js';
import { getCookie, getLocalStorageItem, getSessionStorageItem, setCookie, setSessionStorageItem, setLocalStorageItem, removeSessionStorageItem, removeCookie, removeLocalStorageItem, } from './storage-utils.js';
const builtinStorageFunctions = {
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
const customStorageFunctions = {};
export const configureCustomStorageType = (type, storageFunctions) => {
    customStorageFunctions[type] = storageFunctions;
};
const getStorageFunctions = (type) => {
    const storageFunctions = Object.assign(Object.assign({}, builtinStorageFunctions), customStorageFunctions)[type];
    if (!storageFunctions) {
        throw new Error(`'${type}' is not a valid StorageType!`);
    }
    return storageFunctions;
};
let checkConsent;
export const configurePersistedConsent = (consentChecker) => {
    checkConsent = consentChecker;
};
/**
 * Creates a `Writable` store that synchronizes with a localStorage item,
 * sessionStorage item, or cookie. The store's value will initialize to the value of
 * the corresponding storage item if found, otherwise it will use the provided initial
 * value and persist that value in storage. Any changes to the value of this store will
 * be persisted in storage.
 * @param initial The value to initialize to when used when a corresponding storage
 * item is not found. If a Loadable store is provided the store will be loaded and its value
 * used in this case.
 * @param key The key of the storage item to synchronize.
 * @param options Modifiers for store behavior.
 */
export const persisted = (initial, key, options = {}) => {
    const { reloadable, storageType, consentLevel } = options;
    const { getStorageItem, setStorageItem, removeStorageItem } = getStorageFunctions(storageType || 'LOCAL_STORAGE');
    const getKey = () => {
        if (typeof key === 'function') {
            return key();
        }
        return Promise.resolve(key);
    };
    const setAndPersist = (value, set) => __awaiter(void 0, void 0, void 0, function* () {
        // check consent if checker provided
        if (!checkConsent || checkConsent(consentLevel)) {
            const storageKey = yield getKey();
            setStorageItem(storageKey, value);
        }
        set(value);
    });
    const synchronize = (set) => __awaiter(void 0, void 0, void 0, function* () {
        const storageKey = yield getKey();
        const stored = getStorageItem(storageKey);
        if (stored) {
            set(stored);
            return stored;
        }
        else if (initial !== undefined) {
            if (isLoadable(initial)) {
                const $initial = yield initial.load();
                yield setAndPersist($initial, set);
                return $initial;
            }
            else {
                yield setAndPersist(initial, set);
                return initial;
            }
        }
        else {
            set(undefined);
            return undefined;
        }
    });
    let initialSync;
    const thisStore = writable(undefined, (set) => {
        initialSync = synchronize(set);
    });
    const subscribe = thisStore.subscribe;
    const set = (value) => __awaiter(void 0, void 0, void 0, function* () {
        yield initialSync;
        return setAndPersist(value, thisStore.set);
    });
    const update = (updater) => __awaiter(void 0, void 0, void 0, function* () {
        yield (initialSync !== null && initialSync !== void 0 ? initialSync : synchronize(thisStore.set));
        const newValue = updater(get(thisStore));
        yield setAndPersist(newValue, thisStore.set);
    });
    const load = thisStore.load;
    const resync = () => __awaiter(void 0, void 0, void 0, function* () {
        yield initialSync;
        return synchronize(thisStore.set);
    });
    const clear = () => __awaiter(void 0, void 0, void 0, function* () {
        const storageKey = yield getKey();
        removeStorageItem(storageKey);
        thisStore.set(null);
    });
    const reload = reloadable
        ? () => __awaiter(void 0, void 0, void 0, function* () {
            let newValue;
            if (isLoadable(initial)) {
                [newValue] = yield reloadAll([initial]);
            }
            else {
                newValue = initial;
            }
            setAndPersist(newValue, thisStore.set);
            return newValue;
        })
        : undefined;
    return Object.assign({ get store() {
            return this;
        },
        subscribe,
        set,
        update,
        load,
        resync,
        clear }, (reload && { reload }));
};
//# sourceMappingURL=index.js.map