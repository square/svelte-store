import { type StorageOptions, type Persisted } from './types.js';
import type { Loadable } from '../async-stores/types.js';
declare type GetStorageItem = (key: string) => unknown;
declare type SetStorageItem = (key: string, value: unknown) => void;
declare type RemoveStorageItem = (key: string) => void;
declare type StorageFunctions = {
    getStorageItem: GetStorageItem;
    setStorageItem: SetStorageItem;
    removeStorageItem: RemoveStorageItem;
};
export declare const configureCustomStorageType: (type: string, storageFunctions: StorageFunctions) => void;
declare type ConsentChecker = (consentLevel: unknown) => boolean;
export declare const configurePersistedConsent: (consentChecker: ConsentChecker) => void;
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
export declare const persisted: <T>(initial: T | Loadable<T>, key: string | (() => Promise<string>), options?: StorageOptions) => Persisted<T>;
export {};
