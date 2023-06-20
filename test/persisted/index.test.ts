import { get } from 'svelte/store';
import {
  readable,
  writable,
  StorageType,
  configurePersistedConsent,
  persisted,
  asyncReadable,
  configureCustomStorageType,
} from '../../src';
import {
  getLocalStorageItem,
  setLocalStorageItem,
  removeLocalStorageItem,
  getSessionStorageItem,
  setSessionStorageItem,
  removeSessionStorageItem,
  getCookie,
  setCookie,
  removeCookie,
} from '../../src/persisted/storage-utils';

describe('persisted', () => {
  describe.each([
    [
      'LOCAL_STORAGE' as StorageType,
      getLocalStorageItem,
      setLocalStorageItem,
      removeLocalStorageItem,
    ],
    [
      'SESSION_STORAGE' as StorageType,
      getSessionStorageItem,
      setSessionStorageItem,
      removeSessionStorageItem,
    ],
    ['COOKIE' as StorageType, getCookie, setCookie, removeCookie],
  ])(
    'storage type %s',
    (storageType, getStorage, setStorage, removeStorage) => {
      afterEach(() => {
        removeStorage('key');
      });

      describe('using initial values', () => {
        it('writes default to storage', async () => {
          const myStorage = persisted('default', 'key', { storageType });

          await myStorage.load();

          expect(getStorage('key')).toBe('default');
          expect(get(myStorage)).toBe('default');
          expect(myStorage.load()).resolves.toBe('default');
        });

        it('clears value from storage', async () => {
          const myStorage = persisted('default', 'key', { storageType });

          await myStorage.load();

          expect(getStorage('key')).toBe('default');
          expect(get(myStorage)).toBe('default');
          expect(myStorage.load()).resolves.toBe('default');

          await myStorage.clear();
          expect(getStorage('key')).toBeNull();
          expect(get(myStorage)).toBe(null);
        });

        it('uses stored value if present', async () => {
          setStorage('key', 'already set');
          const myStorage = persisted('default', 'key', { storageType });

          await myStorage.load();

          expect(getStorage('key')).toBe('already set');
          expect(get(myStorage)).toBe('already set');
          expect(myStorage.load()).resolves.toBe('already set');
        });

        it('updates stored value when set', async () => {
          setStorage('key', 'already set');
          const myStorage = persisted('default', 'key', { storageType });
          await myStorage.set('new value');

          expect(getStorage('key')).toBe('new value');
          expect(get(myStorage)).toBe('new value');
          expect(myStorage.load()).resolves.toBe('new value');
        });

        it('updates stored value when updated', async () => {
          setStorage('key', 'already set');
          const myStorage = persisted('default', 'key', { storageType });
          await myStorage.update((oldValue) => `${oldValue} + new value`);

          expect(getStorage('key')).toBe('already set + new value');
          expect(get(myStorage)).toBe('already set + new value');
          expect(myStorage.load()).resolves.toBe('already set + new value');
        });

        it('does not load until set', async () => {
          let isResolved = false;
          const myStorage = persisted(undefined, 'key', { storageType });
          const resolutionPromise = myStorage
            .load()
            .then(() => (isResolved = true));

          expect(get(myStorage)).toBe(undefined);
          expect(isResolved).toBe(false);
          expect(getStorage('key')).toBeFalsy();

          myStorage.set('new value');

          await resolutionPromise;
          expect(isResolved).toBe(true);
          expect(getStorage('key')).toBe('new value');
          expect(get(myStorage)).toBe('new value');
          expect(myStorage.load()).resolves.toBe('new value');
        });

        it('loads using null value', async () => {
          const myStorage = persisted(null, 'key', { storageType });

          await myStorage.load();
          expect(get(myStorage)).toBe(null);
          expect(getStorage('key')).toBe(null);

          await myStorage.set('new value');

          expect(getStorage('key')).toBe('new value');
          expect(get(myStorage)).toBe('new value');
          expect(myStorage.load()).resolves.toBe('new value');
        });

        it('reloads to default', async () => {
          setStorage('key', 'already set');
          const myStorage = persisted('default', 'key', {
            storageType,
            reloadable: true,
          });

          await myStorage.load();

          expect(getStorage('key')).toBe('already set');
          expect(get(myStorage)).toBe('already set');
          expect(myStorage.load()).resolves.toBe('already set');

          await myStorage.reload();

          expect(getStorage('key')).toBe('default');
          expect(get(myStorage)).toBe('default');
          expect(myStorage.load()).resolves.toBe('default');
        });

        it('handles = characters', async () => {
          setStorage('key', 'a=b');
          const myStorage = persisted('c=d', 'key', {
            storageType,
            reloadable: true,
          });

          let $storageA = await myStorage.load();

          expect($storageA).toBe('a=b');
          expect(getStorage('key')).toBe('a=b');

          $storageA = await myStorage.reload();

          expect($storageA).toBe('c=d');
          expect(getStorage('key')).toBe('c=d');
        });
      });

      describe('using Loadable initial', () => {
        it('writes default to storage', async () => {
          const myStorage = persisted(readable('default'), 'key', {
            storageType,
          });

          await myStorage.load();

          expect(getStorage('key')).toBe('default');
          expect(get(myStorage)).toBe('default');
          expect(myStorage.load()).resolves.toBe('default');
        });

        it('uses stored value if present', async () => {
          const mockLoad = jest.fn();

          setStorage('key', 'already set');

          const myStorage = persisted(
            asyncReadable(undefined, mockLoad),
            'key',
            {
              storageType,
            }
          );

          await myStorage.load();

          expect(getStorage('key')).toBe('already set');
          expect(get(myStorage)).toBe('already set');
          expect(myStorage.load()).resolves.toBe('already set');
          expect(mockLoad).not.toHaveBeenCalled();
        });

        it('does not load until default loads', async () => {
          let isResolved = false;
          const myDefault = writable();
          const myStorage = persisted(myDefault, 'key', { storageType });
          const resolutionPromise = myStorage
            .load()
            .then(() => (isResolved = true));

          expect(get(myStorage)).toBe(undefined);
          expect(isResolved).toBe(false);
          expect(getStorage('key')).toBeFalsy();

          myDefault.set('new value');

          await resolutionPromise;
          expect(isResolved).toBe(true);
          expect(getStorage('key')).toBe('new value');
          expect(get(myStorage)).toBe('new value');
          expect(myStorage.load()).resolves.toBe('new value');
        });

        it('reloads to default', async () => {
          setStorage('key', 'already set');
          const myStorage = persisted(readable('default'), 'key', {
            storageType,
            reloadable: true,
          });

          await myStorage.load();

          expect(getStorage('key')).toBe('already set');
          expect(get(myStorage)).toBe('already set');
          expect(myStorage.load()).resolves.toBe('already set');

          await myStorage.reload();

          expect(getStorage('key')).toBe('default');
          expect(get(myStorage)).toBe('default');
          expect(myStorage.load()).resolves.toBe('default');
        });

        it('reloads reloadable default', async () => {
          const mockLoad = jest
            .fn()
            .mockResolvedValueOnce('first value')
            .mockResolvedValueOnce('second value');

          const myStorage = persisted(
            asyncReadable(undefined, mockLoad, { reloadable: true }),
            'key',
            {
              storageType,
              reloadable: true,
            }
          );

          await myStorage.load();

          expect(getStorage('key')).toBe('first value');
          expect(get(myStorage)).toBe('first value');
          expect(myStorage.load()).resolves.toBe('first value');

          await myStorage.reload();

          expect(getStorage('key')).toBe('second value');
          expect(get(myStorage)).toBe('second value');
          expect(myStorage.load()).resolves.toBe('second value');
        });
      });

      describe('using async key', () => {
        it('writes default to storage', async () => {
          const myStorage = persisted('default', () => Promise.resolve('key'), {
            storageType,
          });

          await myStorage.load();

          expect(getStorage('key')).toBe('default');
          expect(get(myStorage)).toBe('default');
          expect(myStorage.load()).resolves.toBe('default');
        });

        it('uses stored value if present', async () => {
          setStorage('key', 'already set');
          const myStorage = persisted('default', () => Promise.resolve('key'), {
            storageType,
          });

          await myStorage.load();

          expect(getStorage('key')).toBe('already set');
          expect(get(myStorage)).toBe('already set');
          expect(myStorage.load()).resolves.toBe('already set');
        });

        it('updates stored value when set', async () => {
          setStorage('key', 'already set');
          const myStorage = persisted('default', () => Promise.resolve('key'), {
            storageType,
          });
          await myStorage.set('new value');

          expect(getStorage('key')).toBe('new value');
          expect(get(myStorage)).toBe('new value');
          expect(myStorage.load()).resolves.toBe('new value');
        });

        it('updates stored value when updated', async () => {
          setStorage('key', 'already set');
          const myStorage = persisted('default', () => Promise.resolve('key'), {
            storageType,
          });
          await myStorage.update((oldValue) => `${oldValue} + new value`);

          expect(getStorage('key')).toBe('already set + new value');
          expect(get(myStorage)).toBe('already set + new value');
          expect(myStorage.load()).resolves.toBe('already set + new value');
        });

        it('does not load until set', async () => {
          let isResolved = false;
          const myStorage = persisted(undefined, () => Promise.resolve('key'), {
            storageType,
          });
          const resolutionPromise = myStorage
            .load()
            .then(() => (isResolved = true));

          expect(get(myStorage)).toBe(undefined);
          expect(isResolved).toBe(false);
          expect(getStorage('key')).toBeFalsy();

          myStorage.set('new value');

          await resolutionPromise;
          expect(isResolved).toBe(true);
          expect(getStorage('key')).toBe('new value');
          expect(get(myStorage)).toBe('new value');
          expect(myStorage.load()).resolves.toBe('new value');
        });

        it('reloads to default', async () => {
          setStorage('key', 'already set');
          const myStorage = persisted('default', () => Promise.resolve('key'), {
            storageType,
            reloadable: true,
          });

          await myStorage.load();

          expect(getStorage('key')).toBe('already set');
          expect(get(myStorage)).toBe('already set');
          expect(myStorage.load()).resolves.toBe('already set');

          await myStorage.reload();

          expect(getStorage('key')).toBe('default');
          expect(get(myStorage)).toBe('default');
          expect(myStorage.load()).resolves.toBe('default');
        });
      });

      describe('consent configuration', () => {
        afterEach(() => {
          configurePersistedConsent(undefined);
        });

        it('persists data if consent check passes', async () => {
          configurePersistedConsent(
            (consentLevel) => consentLevel === 'CONSENT'
          );
          const myStorage = persisted('default', 'key', {
            storageType,
            consentLevel: 'CONSENT',
          });

          await myStorage.load();

          expect(getStorage('key')).toBe('default');
          expect(get(myStorage)).toBe('default');
          expect(myStorage.load()).resolves.toBe('default');

          await myStorage.set('updated');

          expect(getStorage('key')).toBe('updated');
          expect(get(myStorage)).toBe('updated');
          expect(myStorage.load()).resolves.toBe('updated');
        });

        it('does not persist data if consent check fails', async () => {
          configurePersistedConsent(
            (consentLevel) => consentLevel === 'CONSENT'
          );
          const myStorage = persisted('default', 'key', {
            storageType,
            consentLevel: 'NO_CONSENT',
          });

          await myStorage.load();

          expect(getStorage('key')).toBeNull();
          expect(get(myStorage)).toBe('default');
          expect(myStorage.load()).resolves.toBe('default');

          await myStorage.set('updated');

          expect(getStorage('key')).toBe(null);
          expect(get(myStorage)).toBe('updated');
          expect(myStorage.load()).resolves.toBe('updated');
        });

        it('does not persist data if no consent level given', async () => {
          configurePersistedConsent(
            (consentLevel) => consentLevel === 'CONSENT'
          );
          const myStorage = persisted('default', 'key', {
            storageType,
          });

          await myStorage.load();

          expect(getStorage('key')).toBeNull();
          expect(get(myStorage)).toBe('default');
          expect(myStorage.load()).resolves.toBe('default');

          await myStorage.set('updated');

          expect(getStorage('key')).toBe(null);
          expect(get(myStorage)).toBe('updated');
          expect(myStorage.load()).resolves.toBe('updated');
        });
      });
    }
  );
  describe('custom storage type', () => {
    it('allows use of custom storage type', async () => {
      const customStorage = {};

      configureCustomStorageType('CUSTOM', {
        getStorageItem: (key) => customStorage[key],
        setStorageItem: (key, value) => {
          customStorage[key] = value;
        },
        removeStorageItem: (key) => {
          delete customStorage[key];
        },
      });

      const customStore = persisted('default', 'customKey', {
        storageType: 'CUSTOM',
      });

      const result = await customStore.load();
      expect(result).toBe('default');
      expect(customStorage['customKey']).toBe('default');

      await customStore.set('updated');
      expect(customStorage['customKey']).toBe('updated');

      await customStore.clear();
      expect(customStorage['customKey']).toBeUndefined();
    });
  });
});
