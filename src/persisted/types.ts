import { WritableLoadable } from '../async-stores/types';

export type StorageType = 'LOCAL_STORAGE' | 'SESSION_STORAGE' | 'COOKIE';

export type StorageOptions = {
  reloadable?: true;
  storageType?: StorageType;
  consentLevel?: unknown;
};

interface Syncable<T> {
  resync: () => Promise<T>;
  clear: () => Promise<void>;
  store: Syncable<T>;
}

export type Persisted<T> = Syncable<T> & WritableLoadable<T>;
