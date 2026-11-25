import { get, type Readable, type Unsubscriber } from 'svelte/store';
import { CookieStorage } from 'cookie-storage';
import {
  configureCustomStorageType,
  configurePersistedConsent,
  persisted,
  readable,
  type StorageType,
} from '../../src';

describe('persisted storage failures', () => {
  let unsubscribe: Unsubscriber;
  const cookieStorage = new CookieStorage();

  const keepSubscribed = (store: Readable<unknown>) => {
    unsubscribe = store.subscribe(() => {
      /* no-op */
    });
  };

  afterEach(() => {
    unsubscribe?.();
    unsubscribe = undefined;
    vi.restoreAllMocks();
    configurePersistedConsent(undefined);
    window.localStorage.clear();
    window.sessionStorage.clear();
    cookieStorage.removeItem('preference');
  });

  describe.each([
    ['LOCAL_STORAGE' as StorageType, 'localStorage' as const],
    ['SESSION_STORAGE' as StorageType, 'sessionStorage' as const],
  ])('%s', (storageType, property) => {
    it('loads the initial value when access to storage is denied', async () => {
      vi.spyOn(window, property, 'get').mockImplementation(() => {
        throw new DOMException('Storage access denied', 'SecurityError');
      });
      const store = persisted('light', 'preference', { storageType });
      keepSubscribed(store);

      await expect(store.load()).resolves.toBe('light');
      await store.set('dark');
      await store.update((value) => `${value}-updated`);

      expect(get(store)).toBe('dark-updated');
      await store.clear();
      expect(get(store)).toBeNull();
    });

    it('loads a Loadable initial value after a failed read and can resync later', async () => {
      const read = vi
        .spyOn(Storage.prototype, 'getItem')
        .mockImplementation(() => {
          throw new DOMException('Storage read denied', 'SecurityError');
        });
      const store = persisted(
        readable('light'),
        () => Promise.resolve('preference'),
        {
          storageType,
        }
      );
      keepSubscribed(store);

      await expect(store.load()).resolves.toBe('light');
      expect(get(store)).toBe('light');

      read.mockRestore();
      window[property].setItem('preference', JSON.stringify('dark'));
      await expect(store.resync()).resolves.toBe('dark');
      expect(get(store)).toBe('dark');

      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new DOMException('Storage read denied', 'SecurityError');
      });
      await expect(store.resync()).resolves.toBe('light');
      expect(get(store)).toBe('light');
    });

    it.each(['SecurityError', 'QuotaExceededError'])(
      'loads the default when its first write fails with %s',
      async (name) => {
        const write = vi
          .spyOn(Storage.prototype, 'setItem')
          .mockImplementation(() => {
            throw new DOMException('Cannot persist preference', name);
          });
        const store = persisted('light', 'preference', { storageType });
        keepSubscribed(store);

        await expect(store.load()).resolves.toBe('light');
        expect(get(store)).toBe('light');
        await store.set('dark');
        await store.update((value) => `${value}-updated`);
        expect(get(store)).toBe('dark-updated');
        expect(window[property].getItem('preference')).toBeNull();

        write.mockRestore();
        await store.update((value) => `${value}-persisted`);
        expect(window[property].getItem('preference')).toBe(
          JSON.stringify('dark-updated-persisted')
        );
      }
    );

    it.each([
      ['load', 'value'],
      ['load', 'Loadable'],
      ['resync', 'value'],
      ['resync', 'Loadable'],
    ])(
      'preserves saved data when %s cannot read and uses a %s default',
      async (operation, initialType) => {
        const storage = window[property];
        const saved = JSON.stringify('saved-preference');
        storage.setItem('preference', saved);
        const initial =
          initialType === 'Loadable' ? readable('light') : 'light';
        const store = persisted(initial, 'preference', { storageType });
        if (operation === 'resync') {
          keepSubscribed(store);
          await store.load();
        }
        const read = vi
          .spyOn(Storage.prototype, 'getItem')
          .mockImplementation(() => {
            throw new DOMException('Storage read denied', 'SecurityError');
          });
        const write = vi.spyOn(Storage.prototype, 'setItem');
        if (operation === 'load') {
          keepSubscribed(store);
        }

        await expect(store[operation]()).resolves.toBe('light');
        expect(get(store)).toBe('light');
        expect(write).not.toHaveBeenCalled();

        read.mockRestore();
        expect(storage.getItem('preference')).toBe(saved);
        await expect(store.resync()).resolves.toBe('saved-preference');
        expect(get(store)).toBe('saved-preference');
      }
    );

    it('loads a Loadable default when its first write fails', async () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('Storage full', 'QuotaExceededError');
      });
      const store = persisted(readable('light'), 'preference', { storageType });
      keepSubscribed(store);

      await expect(store.load()).resolves.toBe('light');
      await store.set('dark');
      expect(get(store)).toBe('dark');
    });

    it.each(['SecurityError', 'QuotaExceededError'])(
      'keeps manual changes in memory when writes fail with %s',
      async (name) => {
        const store = persisted('light', 'preference', {
          storageType,
          reloadable: true,
        });
        keepSubscribed(store);
        await store.load();
        const write = vi
          .spyOn(Storage.prototype, 'setItem')
          .mockImplementation(() => {
            throw new DOMException('Cannot persist preference', name);
          });

        await store.set('dark');
        expect(get(store)).toBe('dark');
        await store.update((value) => `${value}-updated`);
        expect(get(store)).toBe('dark-updated');
        expect(window[property].getItem('preference')).toBe(
          JSON.stringify('light')
        );

        await expect(store.reload()).resolves.toBe('light');
        expect(get(store)).toBe('light');
        write.mockRestore();
        await store.set('recovered');
        expect(window[property].getItem('preference')).toBe(
          JSON.stringify('recovered')
        );
      }
    );

    it('clears memory when removal fails and allows later persistence', async () => {
      const store = persisted('light', 'preference', { storageType });
      keepSubscribed(store);
      await store.load();
      const remove = vi
        .spyOn(Storage.prototype, 'removeItem')
        .mockImplementation(() => {
          throw new DOMException('Storage removal denied', 'SecurityError');
        });

      await store.clear();
      expect(get(store)).toBeNull();
      expect(window[property].getItem('preference')).toBe(
        JSON.stringify('light')
      );

      remove.mockRestore();
      await store.set('dark');
      await store.clear();
      expect(get(store)).toBeNull();
      expect(window[property].getItem('preference')).toBeNull();
    });

    it('does not attempt writes without consent, even after a read failure', async () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new DOMException('Storage read denied', 'SecurityError');
      });
      const write = vi.spyOn(Storage.prototype, 'setItem');
      const consent = vi.fn(() => false);
      configurePersistedConsent(consent);
      const store = persisted('light', 'preference', {
        storageType,
        consentLevel: 'preferences',
      });
      keepSubscribed(store);

      await expect(store.load()).resolves.toBe('light');
      await store.set('dark');
      await store.update((value) => `${value}-updated`);

      expect(get(store)).toBe('dark-updated');
      expect(consent).toHaveBeenCalledWith('preferences');
      expect(write).not.toHaveBeenCalled();
    });
  });

  it.each(['LOCAL_STORAGE', 'SESSION_STORAGE', 'COOKIE'] as StorageType[])(
    'uses the initial value in memory for malformed JSON in %s',
    async (storageType) => {
      if (storageType === 'COOKIE') {
        cookieStorage.setItem('preference', 'invalid-json');
      } else {
        const storage =
          storageType === 'LOCAL_STORAGE'
            ? window.localStorage
            : window.sessionStorage;
        storage.setItem('preference', 'invalid-json');
      }
      const store = persisted('light', 'preference', { storageType });
      keepSubscribed(store);

      await expect(store.load()).resolves.toBe('light');
      expect(get(store)).toBe('light');
      const raw =
        storageType === 'COOKIE'
          ? cookieStorage.getItem('preference')
          : (storageType === 'LOCAL_STORAGE'
              ? window.localStorage
              : window.sessionStorage
            ).getItem('preference');
      expect(raw).toBe('invalid-json');
      await store.set('dark');
      await expect(store.resync()).resolves.toBe('dark');
      expect(get(store)).toBe('dark');
    }
  );

  it('treats custom storage operations as best-effort too', async () => {
    const fail = vi.fn(() => {
      throw new Error('Storage unavailable');
    });
    configureCustomStorageType('UNAVAILABLE', {
      getStorageItem: fail,
      setStorageItem: fail,
      removeStorageItem: fail,
    });
    const store = persisted('light', 'preference', {
      storageType: 'UNAVAILABLE',
    });
    keepSubscribed(store);

    await expect(store.load()).resolves.toBe('light');
    await store.set('dark');
    await store.update((value) => `${value}-updated`);
    expect(get(store)).toBe('dark-updated');
    await store.clear();
    expect(get(store)).toBeNull();
  });

  it('still rejects invalid storage types', () => {
    expect(() =>
      persisted('light', 'preference', { storageType: 'UNKNOWN' })
    ).toThrow('not a valid StorageType');
  });

  it('does not swallow key, consent, updater, or loader errors', async () => {
    const key = vi.fn(() => Promise.resolve('preference'));
    const initial = readable('light');
    const store = persisted(initial, key);
    keepSubscribed(store);
    await store.load();
    const error = new Error('Application failure');

    key.mockRejectedValue(error);
    await expect(store.set('dark')).rejects.toBe(error);
    await expect(store.update(() => 'dark')).rejects.toBe(error);
    await expect(store.clear()).rejects.toBe(error);
    await expect(store.resync()).rejects.toBe(error);
    key.mockResolvedValue('preference');

    configurePersistedConsent(() => {
      throw error;
    });
    await expect(store.set('dark')).rejects.toBe(error);
    configurePersistedConsent(undefined);
    await expect(
      store.update(() => {
        throw error;
      })
    ).rejects.toBe(error);

    window.localStorage.removeItem('preference');
    vi.spyOn(initial, 'load').mockRejectedValue(error);
    await expect(store.resync()).rejects.toBe(error);
    expect(get(store)).toBe('light');
  });
});
