import { AsyncWritable, Loadable, Reloadable } from '../async-stores/types.js';

export type StorageType = 'LOCAL_STORAGE' | 'SESSION_STORAGE' | 'COOKIE';

export type StorageOptions = {
  reloadable?: true;
  storageType?: StorageType | string;
  consentLevel?: unknown;
};

interface Syncable<T> {
  resync: () => Promise<T>;
  clear: () => Promise<void>;
  store: Syncable<T>;
}

export type Persisted<T> = Syncable<T> &
  Loadable<T> &
  Reloadable<T> &
  AsyncWritable<T>;
