import { WritableLoadable } from '../async-stores/types.js';
export declare type StorageType = 'LOCAL_STORAGE' | 'SESSION_STORAGE' | 'COOKIE';
export declare type StorageOptions = {
    reloadable?: true;
    storageType?: StorageType | string;
    consentLevel?: unknown;
};
interface Syncable<T> {
    resync: () => Promise<T>;
    clear: () => Promise<void>;
    store: Syncable<T>;
}
export declare type Persisted<T> = Syncable<T> & WritableLoadable<T>;
export {};
