/* eslint-disable prefer-promise-reject-errors */
import { tick } from 'svelte';
import {
  asyncClient,
  asyncDerived,
  asyncReadable,
  asyncWritable,
  configurePersistedConsent,
  derived,
  get,
  isReloadable,
  Loadable,
  loadAll,
  LoadState,
  logAsyncErrors,
  persisted,
  Readable,
  readable,
  reloadAll,
  safeLoad,
  StorageType,
  writable,
  WritableLoadable,
} from '../src/index';
import {
  getCookie,
  getLocalStorageItem,
  getSessionStorageItem,
  removeCookie,
  removeLocalStorageItem,
  removeSessionStorageItem,
  setCookie,
  setLocalStorageItem,
  setSessionStorageItem,
} from '../src/storage-utils';

describe('loadAll / reloadAll utils', () => {
  const myNonAsync = readable('A');
  const myLoadable = { load: () => Promise.resolve('B') } as Loadable<string> &
    Readable<string>;
  const myReloadable = {
    load: () => Promise.resolve('C'),
    reload: () => Promise.resolve('D'),
  } as Loadable<string>;
  const badLoadable = {
    load: () => Promise.reject(new Error('E')),
    reload: () => Promise.reject(new Error('F')),
  } as Loadable<string>;

  describe('loadAll function', () => {
    it('loads single store', () => {
      expect(loadAll(myLoadable)).resolves.toStrictEqual(['B']);
    });

    it('resolves to values of all stores', () => {
      expect(
        loadAll([myNonAsync, myLoadable, myReloadable])
      ).resolves.toStrictEqual(['A', 'B', 'C']);
    });

    it('handles rejection', () => {
      expect(loadAll([myLoadable, badLoadable])).rejects.toStrictEqual(
        new Error('E')
      );
    });
  });

  describe('reloadAll function', () => {
    it('reloads loads single store', () => {
      expect(reloadAll(myReloadable)).resolves.toStrictEqual(['D']);
    });

    it('reloads and resolves to values of all stores', () => {
      expect(
        reloadAll([myNonAsync, myLoadable, myReloadable])
      ).resolves.toStrictEqual(['A', 'B', 'D']);
    });

    it('handles rejection', () => {
      expect(reloadAll([myLoadable, badLoadable])).rejects.toStrictEqual(
        new Error('F')
      );
    });
  });

  describe('safeLoad function', () => {
    it('resolves to true with good store', () => {
      expect(safeLoad(myLoadable)).resolves.toBe(true);
    });

    it('resolves to false with bad store', () => {
      expect(safeLoad(badLoadable)).resolves.toBe(false);
    });
  });
});

describe('asyncWritable', () => {
  const writableParent = writable('writable');
  let mockReload = jest.fn();

  beforeEach(() => {
    mockReload = jest
      .fn()
      .mockReturnValue('default')
      .mockResolvedValueOnce('first value')
      .mockResolvedValueOnce('second value')
      .mockResolvedValueOnce('third value');
  });

  afterEach(() => {
    writableParent.set('writable');
    mockReload.mockReset();
  });

  describe('no parents / asyncReadable', () => {
    it('loads expected value', async () => {
      const myAsyncReadable = asyncReadable(undefined, () =>
        Promise.resolve('expected')
      );
      myAsyncReadable.subscribe(jest.fn);

      expect(myAsyncReadable.load()).resolves.toBe('expected');
      await myAsyncReadable.load();
      expect(get(myAsyncReadable)).toBe('expected');
    });

    it('loads initial value when rejected', async () => {
      const myAsyncReadable = asyncReadable('initial', () =>
        Promise.reject(new Error('error'))
      );
      const isInitial = derived(
        myAsyncReadable,
        ($myAsyncReadable) => $myAsyncReadable === 'initial'
      );
      expect(get(isInitial)).toBe(true);

      expect(myAsyncReadable.load()).rejects.toStrictEqual(new Error('error'));
      await myAsyncReadable.load().catch(() => Promise.resolve());
      expect(get(myAsyncReadable)).toBe('initial');
      expect(get(isInitial)).toBe(true);
    });

    it('does not reload if not reloadable', () => {
      const myAsyncDerived = asyncReadable(undefined, mockReload);
      myAsyncDerived.subscribe(jest.fn);

      expect(myAsyncDerived.load()).resolves.toBe('first value');
      expect(isReloadable(myAsyncDerived)).toBeFalsy();
    });

    it('does reload if reloadable', async () => {
      const myAsyncDerived = asyncReadable(undefined, mockReload, {
        reloadable: true,
      });
      myAsyncDerived.subscribe(jest.fn);

      expect(myAsyncDerived.load()).resolves.toBe('first value');
      await myAsyncDerived.load();
      await myAsyncDerived.reload();
      expect(get(myAsyncDerived)).toBe('second value');
      expect(myAsyncDerived.load()).resolves.toBe('second value');
    });
  });

  describe('one parent asyncDerived', () => {
    it('loads expected value', async () => {
      const myAsyncDerived = asyncDerived(writableParent, (storeValue) =>
        Promise.resolve(`derived from ${storeValue}`)
      );
      myAsyncDerived.subscribe(jest.fn);

      expect(myAsyncDerived.load()).resolves.toBe('derived from writable');
      await myAsyncDerived.load();
      expect(get(myAsyncDerived)).toBe('derived from writable');
    });

    it('loads initial value when rejected', async () => {
      const myAsyncDerived = asyncDerived(
        writableParent,
        () => Promise.reject(new Error('error')),
        { initial: 'initial' }
      );
      myAsyncDerived.subscribe(jest.fn);

      expect(myAsyncDerived.load()).rejects.toStrictEqual(new Error('error'));
      await myAsyncDerived.load().catch(() => Promise.resolve());
      expect(get(myAsyncDerived)).toBe('initial');
    });

    it('does not reload if not reloadable', () => {
      const myAsyncDerived = asyncDerived(writableParent, mockReload);
      myAsyncDerived.subscribe(jest.fn);

      expect(myAsyncDerived.load()).resolves.toBe('first value');
      expect(isReloadable(myAsyncDerived)).toBeFalsy();
    });

    it('does reload if reloadable', async () => {
      const myAsyncDerived = asyncDerived(writableParent, mockReload, {
        reloadable: true,
      });
      myAsyncDerived.subscribe(jest.fn);

      expect(myAsyncDerived.load()).resolves.toBe('first value');
      await myAsyncDerived.load();
      await myAsyncDerived.reload();
      expect(get(myAsyncDerived)).toBe('second value');
      expect(myAsyncDerived.load()).resolves.toBe('second value');
    });

    it('does reload if parent updates', async () => {
      const myAsyncDerived = asyncDerived(writableParent, mockReload);
      myAsyncDerived.subscribe(jest.fn);

      await myAsyncDerived.load();
      expect(get(myAsyncDerived)).toBe('first value');
      writableParent.set('updated');
      await myAsyncDerived.load();
      expect(get(myAsyncDerived)).toBe('second value');
    });

    it('loads asyncReadable parent', () => {
      const asyncReadableParent = asyncReadable(undefined, mockReload);
      const myAsyncDerived = asyncDerived(asyncReadableParent, (storeValue) =>
        Promise.resolve(`derived from ${storeValue}`)
      );
      myAsyncDerived.subscribe(jest.fn);

      expect(myAsyncDerived.load()).resolves.toBe('derived from first value');
      expect(isReloadable(myAsyncDerived)).toBeFalsy();
    });

    it('reloads reloadable parent', async () => {
      const asyncReadableParent = asyncReadable(undefined, mockReload, {
        reloadable: true,
      });
      const myAsyncDerived = asyncDerived(asyncReadableParent, (storeValue) =>
        Promise.resolve(`derived from ${storeValue}`)
      );
      myAsyncDerived.subscribe(jest.fn);

      await myAsyncDerived.load();
      expect(get(myAsyncDerived)).toBe('derived from first value');
      await myAsyncDerived.reload();
      expect(get(myAsyncDerived)).toBe('derived from second value');
      expect(myAsyncDerived.load()).resolves.toBe('derived from second value');
    });

    it('rejects load when parent load fails', () => {
      const asyncReadableParent = asyncReadable(undefined, () =>
        Promise.reject(new Error('error'))
      );
      const myAsyncDerived = asyncDerived(asyncReadableParent, (storeValue) =>
        Promise.resolve(`derived from ${storeValue}`)
      );
      myAsyncDerived.subscribe(jest.fn);

      expect(myAsyncDerived.load()).rejects.toStrictEqual(new Error('error'));
    });

    it('correcly unsubscribes from parents', async () => {
      const writableParent = writable('initial');
      const firstDerivedLoad = jest.fn(($parent) =>
        Promise.resolve(`${$parent} first`)
      );
      const firstDerived = asyncDerived(writableParent, firstDerivedLoad);
      const secondDerivedLoad = jest.fn(($parent) =>
        Promise.resolve(`${$parent} second`)
      );
      const secondDerived = asyncDerived(writableParent, secondDerivedLoad);

      let firstValue;
      const firstUnsubscribe = firstDerived.subscribe(
        (value) => (firstValue = value)
      );
      let secondValue;
      secondDerived.subscribe((value) => (secondValue = value));

      // this sucks but I can't figure out a better way to wait for the
      // subscribe callbacks to get called without generating a new subscription
      await new Promise((resolve) => setTimeout(resolve));

      expect(firstValue).toBe('initial first');
      expect(secondValue).toBe('initial second');
      expect(firstDerivedLoad).toHaveBeenCalledTimes(1);
      expect(secondDerivedLoad).toHaveBeenCalledTimes(1);

      firstUnsubscribe();
      writableParent.set('updated');

      await new Promise((resolve) => setTimeout(resolve));

      expect(firstValue).toBe('initial first');
      expect(secondValue).toBe('updated second');
      expect(firstDerivedLoad).toHaveBeenCalledTimes(1);
      expect(secondDerivedLoad).toHaveBeenCalledTimes(2);
    });
  });

  describe('multiple parents asyncDerived', () => {
    it('correctly derives from every kind of parent', async () => {
      const asyncReadableParent = asyncReadable(undefined, () =>
        Promise.resolve('loadable')
      );
      const reloadableParent = asyncReadable(undefined, mockReload, {
        reloadable: true,
      });
      const myAsyncDerived = asyncDerived(
        [writableParent, asyncReadableParent, reloadableParent],
        ([$writableParent, $loadableParent, $reloadableParent]) =>
          Promise.resolve(
            `derived from ${$writableParent}, ${$loadableParent}, ${$reloadableParent}`
          )
      );
      myAsyncDerived.subscribe(jest.fn);

      await myAsyncDerived.load();
      expect(get(myAsyncDerived)).toBe(
        'derived from writable, loadable, first value'
      );
      writableParent.set('new value');
      await myAsyncDerived.load();
      expect(get(myAsyncDerived)).toBe(
        'derived from new value, loadable, first value'
      );
      await myAsyncDerived.reload();
      expect(get(myAsyncDerived)).toBe(
        'derived from new value, loadable, second value'
      );
    });

    it('deterministically sets final value when receiving updates while loading', async () => {
      const delayedParent = asyncReadable(
        undefined,
        () => new Promise((resolve) => setTimeout(resolve, 1000))
      );
      const myDerived = asyncDerived(
        [writableParent, delayedParent],
        ([$writableParent, $delayedParent]) =>
          mockReload().then((response) => `${$writableParent}: ${response}`)
      );
      myDerived.subscribe(jest.fn);
      writableParent.set('A');
      writableParent.set('B');
      writableParent.set('C');
      writableParent.set('D');
      writableParent.set('E');
      writableParent.set('F');
      writableParent.set('G');
      writableParent.set('H');
      writableParent.set('I');
      writableParent.set('J');
      writableParent.set('K');
      writableParent.set('L');
      await myDerived.load();
      expect(get(myDerived)).toBe('L: first value');
    });
  });

  describe('no parents asyncWritable', () => {
    it('sets given value when given void write function', async () => {
      const mappingWriteFunction = jest.fn(() => Promise.resolve());
      const myAsyncWritable = asyncWritable(
        [],
        () => Promise.resolve('initial'),
        mappingWriteFunction
      );
      myAsyncWritable.subscribe(jest.fn);

      expect(myAsyncWritable.load()).resolves.toBe('initial');
      await myAsyncWritable.load();
      expect(get(myAsyncWritable)).toBe('initial');

      await myAsyncWritable.set('final');
      expect(get(myAsyncWritable)).toBe('final');
      const loadedValue = await myAsyncWritable.load();
      expect(loadedValue).toBe('final');

      expect(mappingWriteFunction).toHaveBeenCalledTimes(1);
    });

    it('sets final value when given type returning write function', async () => {
      const mappingWriteFunction = jest.fn((value) =>
        Promise.resolve(`resolved from ${value}`)
      );
      const myAsyncWritable = asyncWritable(
        [],
        () => Promise.resolve('initial'),
        mappingWriteFunction
      );
      myAsyncWritable.subscribe(jest.fn);

      expect(myAsyncWritable.load()).resolves.toBe('initial');
      await myAsyncWritable.load();
      expect(get(myAsyncWritable)).toBe('initial');

      await myAsyncWritable.set('intermediate');
      expect(get(myAsyncWritable)).toBe('resolved from intermediate');
      const loadedValue = await myAsyncWritable.load();
      expect(loadedValue).toBe('resolved from intermediate');

      expect(mappingWriteFunction).toHaveBeenCalledTimes(1);
    });

    it('sets value when reloadable', async () => {
      const mappingLoadFunction = jest.fn(() => Promise.resolve('load'));
      const mappingWriteFunction = jest.fn(() => Promise.resolve('write'));
      const myAsyncWritable = asyncWritable(
        [],
        mappingLoadFunction,
        mappingWriteFunction,
        { reloadable: true }
      );
      myAsyncWritable.subscribe(jest.fn);

      expect(myAsyncWritable.load()).resolves.toBe('load');
      await myAsyncWritable.load();
      expect(get(myAsyncWritable)).toBe('load');

      await myAsyncWritable.set('set');
      expect(get(myAsyncWritable)).toBe('write');

      expect(mappingWriteFunction).toHaveBeenCalledTimes(1);
      expect(mappingLoadFunction).toHaveBeenCalledTimes(1);
    });

    it('still sets value when rejected', async () => {
      const mappingWriteFunction = jest.fn(() => Promise.reject());
      const myAsyncWritable = asyncWritable(
        [],
        () => Promise.resolve('initial'),
        mappingWriteFunction
      );
      myAsyncWritable.subscribe(jest.fn);

      expect(myAsyncWritable.load()).resolves.toBe('initial');
      await myAsyncWritable.load();
      expect(get(myAsyncWritable)).toBe('initial');

      await myAsyncWritable.set('final').catch(() => Promise.resolve());
      expect(get(myAsyncWritable)).toBe('final');
      const loadedValue = await myAsyncWritable.load();
      expect(loadedValue).toBe('final');

      expect(mappingWriteFunction).toHaveBeenCalledTimes(1);
    });

    it('provides old value of store to mapping write function', async () => {
      const dataFetchFunction = jest.fn(() => Promise.reject());
      const myAsyncWritable = asyncWritable(
        [],
        () => Promise.resolve('initial'),
        async (newValue, parentValues, oldValue) => {
          try {
            return await dataFetchFunction();
          } catch {
            return oldValue;
          }
        }
      );
      myAsyncWritable.subscribe(jest.fn);

      expect(myAsyncWritable.load()).resolves.toBe('initial');
      await myAsyncWritable.load();
      expect(get(myAsyncWritable)).toBe('initial');

      await myAsyncWritable.set('final').catch(() => Promise.resolve());
      expect(get(myAsyncWritable)).toBe('initial');
      const loadedValue = await myAsyncWritable.load();
      expect(loadedValue).toBe('initial');

      expect(dataFetchFunction).toHaveBeenCalledTimes(1);
    });

    it('allows writing without invoking mappingWriteFunction', async () => {
      const dataFetchFunction = jest.fn(() => Promise.reject());
      const myAsyncWritable = asyncWritable(
        [],
        () => Promise.resolve('initial'),
        dataFetchFunction
      );
      myAsyncWritable.subscribe(jest.fn);

      expect(myAsyncWritable.load()).resolves.toBe('initial');
      await myAsyncWritable.load();
      expect(get(myAsyncWritable)).toBe('initial');

      try {
        await myAsyncWritable.set('final');
      } catch {
        // no idea why this needs to be caught
        await myAsyncWritable.set('error', false);
      }
      expect(get(myAsyncWritable)).toBe('error');

      expect(dataFetchFunction).toHaveBeenCalledTimes(1);
    });

    it('updates to expected value', async () => {
      const mappingWriteFunction = jest.fn(() => Promise.resolve());
      const myAsyncWritable = asyncWritable(
        [],
        () => Promise.resolve('initial'),
        mappingWriteFunction
      );
      myAsyncWritable.subscribe(jest.fn);

      await myAsyncWritable.update((value) => `updated from ${value}`);
      expect(get(myAsyncWritable)).toBe('updated from initial');
      const loadedValue = await myAsyncWritable.load();
      expect(loadedValue).toBe('updated from initial');

      expect(mappingWriteFunction).toHaveBeenCalledTimes(1);
    });
  });

  describe('asyncWritable with parents', () => {
    it('loads expected value', async () => {
      const mappingWriteFunction = jest.fn(() => Promise.resolve());
      const myAsyncWritable = asyncWritable(
        writableParent,
        (storeValue) => Promise.resolve(`derived from ${storeValue}`),
        mappingWriteFunction
      );
      myAsyncWritable.subscribe(jest.fn);

      expect(myAsyncWritable.load()).resolves.toBe('derived from writable');
      await myAsyncWritable.load();
      expect(get(myAsyncWritable)).toBe('derived from writable');

      await myAsyncWritable.set('final');
      expect(get(myAsyncWritable)).toBe('final');

      expect(mappingWriteFunction).toHaveBeenCalledTimes(1);
    });

    it('still sets value when rejected', async () => {
      const mappingWriteFunction = jest.fn(() => Promise.reject());
      const myAsyncWritable = asyncWritable(
        writableParent,
        () => Promise.reject(new Error('error')),
        mappingWriteFunction,
        { initial: 'initial' }
      );
      myAsyncWritable.subscribe(jest.fn);

      expect(myAsyncWritable.load()).rejects.toStrictEqual(new Error('error'));
      await myAsyncWritable.load().catch(() => Promise.resolve());
      expect(get(myAsyncWritable)).toBe('initial');

      await myAsyncWritable.set('final').catch(() => Promise.resolve());
      expect(get(myAsyncWritable)).toBe('final');

      expect(mappingWriteFunction).toHaveBeenCalledTimes(1);
    });

    it('does not reload if not reloadable', () => {
      const myAsyncWritable = asyncWritable(writableParent, mockReload, () =>
        Promise.resolve()
      );
      myAsyncWritable.subscribe(jest.fn);

      expect(myAsyncWritable.load()).resolves.toBe('first value');
      expect(isReloadable(myAsyncWritable)).toBeFalsy();
    });

    it('does reload if reloadable', async () => {
      const myAsyncWritable = asyncWritable(
        writableParent,
        mockReload,
        () => Promise.resolve(),
        { reloadable: true }
      );
      myAsyncWritable.subscribe(jest.fn);

      expect(myAsyncWritable.load()).resolves.toBe('first value');
      await myAsyncWritable.load();
      await myAsyncWritable.reload();
      expect(get(myAsyncWritable)).toBe('second value');
      expect(myAsyncWritable.load()).resolves.toBe('second value');
    });

    it('does reload if parent updates', async () => {
      const myAsyncWritable = asyncWritable(writableParent, mockReload, () =>
        Promise.resolve()
      );
      myAsyncWritable.subscribe(jest.fn);

      await myAsyncWritable.load();
      expect(get(myAsyncWritable)).toBe('first value');
      writableParent.set('updated');
      await myAsyncWritable.load();
      expect(get(myAsyncWritable)).toBe('second value');
    });

    it('loads asyncReadable parent', () => {
      const asyncReadableParent = asyncReadable(undefined, mockReload);
      const myAsyncWritable = asyncWritable(
        asyncReadableParent,
        (storeValue) => `derived from ${storeValue}`,
        () => Promise.resolve()
      );
      myAsyncWritable.subscribe(jest.fn);

      expect(myAsyncWritable.load()).resolves.toBe('derived from first value');
      expect(isReloadable(myAsyncWritable)).toBeFalsy();
    });

    it('can access asyncReadable parent loaded value while writing', async () => {
      const asyncReadableParent = asyncReadable(undefined, mockReload);
      const myAsyncWritable = asyncWritable(
        asyncReadableParent,
        (storeValue) => `derived from ${storeValue}`,
        (value, $asyncReadableParent) =>
          Promise.resolve(
            `constructed from ${value} and ${$asyncReadableParent}`
          )
      );
      myAsyncWritable.subscribe(jest.fn);

      await myAsyncWritable.set('set value');
      expect(get(myAsyncWritable)).toBe(
        'constructed from set value and first value'
      );
    });

    it('reloads reloadable parent', async () => {
      const asyncReadableParent = asyncReadable(undefined, mockReload, {
        reloadable: true,
      });
      const myAsyncWritable: WritableLoadable<string> = asyncWritable(
        asyncReadableParent,
        (storeValue) => `derived from ${storeValue}`,
        () => Promise.resolve(),
        { reloadable: true }
      );
      myAsyncWritable.subscribe(jest.fn);

      await myAsyncWritable.load();
      expect(get(myAsyncWritable)).toBe('derived from first value');
      await myAsyncWritable.reload();
      expect(get(myAsyncWritable)).toBe('derived from second value');
      expect(myAsyncWritable.load()).resolves.toBe('derived from second value');

      await myAsyncWritable.set('set value');
      expect(get(myAsyncWritable)).toBe('set value');
    });

    it('rejects load when parent load fails', () => {
      const asyncReadableParent = asyncReadable(undefined, () =>
        Promise.reject(new Error('error'))
      );
      const myAsyncWritable = asyncWritable(
        asyncReadableParent,
        (storeValue) => Promise.resolve(`derived from ${storeValue}`),
        () => Promise.resolve()
      );
      myAsyncWritable.subscribe(jest.fn);

      expect(myAsyncWritable.load()).rejects.toStrictEqual(new Error('error'));
    });
  });

  describe('error logging', () => {
    afterEach(() => {
      logAsyncErrors(undefined);
    });

    it('does not call error logger when no error', async () => {
      const errorLogger = jest.fn();
      logAsyncErrors(errorLogger);

      const myReadable = asyncReadable(undefined, () =>
        Promise.resolve('value')
      );
      await myReadable.load();

      expect(errorLogger).not.toHaveBeenCalled();
    });

    it('does call error logger when async error', async () => {
      const errorLogger = jest.fn();
      logAsyncErrors(errorLogger);

      const myReadable = asyncReadable(undefined, () =>
        Promise.reject(new Error('error'))
      );

      // perform multiple loads and make sure logger only called once
      await safeLoad(myReadable);
      await safeLoad(myReadable);
      await safeLoad(myReadable);

      expect(errorLogger).toHaveBeenCalledWith(new Error('error'));
      expect(errorLogger).toHaveBeenCalledTimes(1);
    });
  });
});

describe('synchronous derived', () => {
  const nonAsyncParent = writable('writable');
  const asyncReadableParent = asyncReadable(undefined, () =>
    Promise.resolve('loadable')
  );
  let reloadableGrandparent: Loadable<string>;
  let derivedParent: Loadable<string>;
  let mockReload = jest.fn();

  beforeEach(() => {
    mockReload = jest
      .fn()
      .mockReturnValue('default')
      .mockResolvedValueOnce('first value')
      .mockResolvedValueOnce('second value')
      .mockResolvedValueOnce('third value');
    reloadableGrandparent = asyncReadable(undefined, mockReload, {
      reloadable: true,
    });
    derivedParent = derived(reloadableGrandparent, ($reloadableGrandparent) =>
      $reloadableGrandparent?.toUpperCase()
    );
  });

  afterEach(() => {
    nonAsyncParent.set('writable');
    mockReload.mockReset();
  });

  describe('derived', () => {
    it('gets derived values after loading and reloading', async () => {
      const myDerived = derived(
        [nonAsyncParent, asyncReadableParent, derivedParent],
        ([$nonAsyncParent, $loadableParent, $derivedParent]) =>
          `derived from ${$nonAsyncParent}, ${$loadableParent}, ${$derivedParent}`
      );
      myDerived.subscribe(jest.fn);

      expect(myDerived.load()).resolves.toBe(
        'derived from writable, loadable, FIRST VALUE'
      );
      await myDerived.load();
      expect(get(myDerived)).toBe(
        'derived from writable, loadable, FIRST VALUE'
      );
      await myDerived.reload();
      expect(get(myDerived)).toBe(
        'derived from writable, loadable, SECOND VALUE'
      );
    });

    it('deterministically sets final value when received many updates', () => {
      const myDerived = derived(
        nonAsyncParent,
        ($nonAsyncParent) => $nonAsyncParent
      );
      myDerived.subscribe(jest.fn);

      nonAsyncParent.set('A');
      nonAsyncParent.set('B');
      nonAsyncParent.set('C');
      nonAsyncParent.set('D');
      nonAsyncParent.set('E');
      nonAsyncParent.set('F');
      nonAsyncParent.set('G');
      nonAsyncParent.set('H');
      nonAsyncParent.set('I');
      nonAsyncParent.set('J');
      nonAsyncParent.set('K');
      nonAsyncParent.set('L');
      expect(get(myDerived)).toBe('L');
    });

    it('subscribes when loading', async () => {
      const myWritable = writable('initial');
      const myDerived = derived(
        myWritable,
        ($myWritable) => `derived from ${$myWritable}`
      );

      let $myDerived = await myDerived.load();

      expect($myDerived).toBe('derived from initial');

      myWritable.set('updated');

      $myDerived = await myDerived.load();

      expect($myDerived).toBe('derived from updated');
    });
  });
});

describe('readable/writable stores', () => {
  describe('writable', () => {
    it('only loads after being set', async () => {
      let isResolved = false;
      const myWritable = writable();
      const resolutionPromise = myWritable
        .load()
        .then(() => (isResolved = true));

      expect(get(myWritable)).toBe(undefined);
      expect(isResolved).toBe(false);

      myWritable.set('value');

      await resolutionPromise;
      expect(isResolved).toBe(true);
      expect(get(myWritable)).toBe('value');
    });

    it('loads immeadietly when provided initial value', async () => {
      const myWritable = writable('initial');

      const initial = await myWritable.load();
      expect(initial).toBe('initial');
      expect(get(myWritable)).toBe('initial');

      myWritable.set('updated');

      const updated = await myWritable.load();
      expect(updated).toBe('updated');
      expect(get(myWritable)).toBe('updated');
    });

    it('loads to updated value', () => {
      const myWritable = writable('foo');
      myWritable.update((value) => `${value}bar`);

      expect(get(myWritable)).toBe('foobar');
      expect(myWritable.load()).resolves.toBe('foobar');
    });

    it('loads from start function', async () => {
      const myWritable = writable(undefined, (set) => {
        setTimeout(() => set('value'), 50);
      });

      expect(get(myWritable)).toBe(undefined);
      const loaded = await myWritable.load();
      expect(loaded).toBe('value');
      expect(get(myWritable)).toBe('value');
    });

    it('fires unsubscribe callback when unsubscribed', () => {
      const mockStop = jest.fn();
      const myWritable = writable(undefined, (set) => {
        set('initial');
        return mockStop;
      });
      const unsubscribe = myWritable.subscribe(jest.fn());

      expect(mockStop).not.toHaveBeenCalled();
      unsubscribe();
      expect(mockStop).toHaveBeenCalled();
    });
  });

  describe('readable', () => {
    it('loads immeadietly when provided initial value', async () => {
      const myReadable = readable('initial');

      const initial = await myReadable.load();
      expect(initial).toBe('initial');
      expect(get(myReadable)).toBe('initial');
    });

    it('loads from start function', async () => {
      const myReadable = readable(undefined, (set) => {
        setTimeout(() => set('value'), 50);
      });

      expect(get(myReadable)).toBe(undefined);
      const loaded = await myReadable.load();
      expect(loaded).toBe('value');
      expect(get(myReadable)).toBe('value');
    });

    it('fires unsubscribe callback when unsubscribed', () => {
      const mockUnsubscribe = jest.fn();
      const myReadable = readable(undefined, (set) => {
        set('initial');
        return mockUnsubscribe;
      });
      const unsubscribe = myReadable.subscribe(jest.fn());

      expect(mockUnsubscribe).not.toHaveBeenCalled();
      unsubscribe();
      expect(mockUnsubscribe).toHaveBeenCalled();
    });

    it('will load from start function correctly without subscription', async () => {
      const myReadable = readable(undefined, (set) => {
        setTimeout(() => {
          set('value');
        }, 50);
      });

      const $myReadable = await myReadable.load();
      expect($myReadable).toBe('value');
    });

    it('runs stop callback after loading with no subscriptions', async () => {
      const stop = jest.fn();

      const myReadable = readable(undefined, (set) => {
        setTimeout(() => {
          set('value');
        }, 50);
        return stop;
      });

      const load = myReadable.load();
      expect(stop).not.toHaveBeenCalled();
      const value = await load;
      expect(value).toBe('value');
      expect(stop).toHaveBeenCalledTimes(1);

      await myReadable.load();
      await new Promise((resolve) => setTimeout(resolve));
      expect(stop).toHaveBeenCalledTimes(2);
    });
  });

  describe('persisted', () => {
    describe.each([
      [
        StorageType.LOCAL_STORAGE,
        getLocalStorageItem,
        setLocalStorageItem,
        removeLocalStorageItem,
      ],
      [
        StorageType.SESSION_STORAGE,
        getSessionStorageItem,
        setSessionStorageItem,
        removeSessionStorageItem,
      ],
      [StorageType.COOKIE, getCookie, setCookie, removeCookie],
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

            expect(JSON.parse(getStorage('key'))).toBe('default');
            expect(get(myStorage)).toBe('default');
            expect(myStorage.load()).resolves.toBe('default');
          });

          it('uses stored value if present', async () => {
            setStorage('key', JSON.stringify('already set'));
            const myStorage = persisted('default', 'key', { storageType });

            await myStorage.load();

            expect(JSON.parse(getStorage('key'))).toBe('already set');
            expect(get(myStorage)).toBe('already set');
            expect(myStorage.load()).resolves.toBe('already set');
          });

          it('updates stored value when set', async () => {
            setStorage('key', JSON.stringify('already set'));
            const myStorage = persisted('default', 'key', { storageType });
            await myStorage.set('new value');

            expect(JSON.parse(getStorage('key'))).toBe('new value');
            expect(get(myStorage)).toBe('new value');
            expect(myStorage.load()).resolves.toBe('new value');
          });

          it('updates stored value when updated', async () => {
            setStorage('key', JSON.stringify('already set'));
            const myStorage = persisted('default', 'key', { storageType });
            await myStorage.update((oldValue) => `${oldValue} + new value`);

            expect(JSON.parse(getStorage('key'))).toBe(
              'already set + new value'
            );
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
            expect(JSON.parse(getStorage('key'))).toBe('new value');
            expect(get(myStorage)).toBe('new value');
            expect(myStorage.load()).resolves.toBe('new value');
          });

          it('loads using null value', async () => {
            const myStorage = persisted(null, 'key', { storageType });

            await myStorage.load();
            expect(get(myStorage)).toBe(null);
            expect(JSON.parse(getStorage('key'))).toBe(null);

            await myStorage.set('new value');

            expect(JSON.parse(getStorage('key'))).toBe('new value');
            expect(get(myStorage)).toBe('new value');
            expect(myStorage.load()).resolves.toBe('new value');
          });

          it('reloads to default', async () => {
            setStorage('key', JSON.stringify('already set'));
            const myStorage = persisted('default', 'key', {
              storageType,
              reloadable: true,
            });

            await myStorage.load();

            expect(JSON.parse(getStorage('key'))).toBe('already set');
            expect(get(myStorage)).toBe('already set');
            expect(myStorage.load()).resolves.toBe('already set');

            await myStorage.reload();

            expect(JSON.parse(getStorage('key'))).toBe('default');
            expect(get(myStorage)).toBe('default');
            expect(myStorage.load()).resolves.toBe('default');
          });
        });

        describe('using Loadable initial', () => {
          it('writes default to storage', async () => {
            const myStorage = persisted(readable('default'), 'key', {
              storageType,
            });

            await myStorage.load();

            expect(JSON.parse(getStorage('key'))).toBe('default');
            expect(get(myStorage)).toBe('default');
            expect(myStorage.load()).resolves.toBe('default');
          });

          it('uses stored value if present', async () => {
            const mockLoad = jest.fn();

            setStorage('key', JSON.stringify('already set'));

            const myStorage = persisted(
              asyncReadable(undefined, mockLoad),
              'key',
              {
                storageType,
              }
            );

            await myStorage.load();

            expect(JSON.parse(getStorage('key'))).toBe('already set');
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
            expect(JSON.parse(getStorage('key'))).toBe('new value');
            expect(get(myStorage)).toBe('new value');
            expect(myStorage.load()).resolves.toBe('new value');
          });

          it('reloads to default', async () => {
            setStorage('key', JSON.stringify('already set'));
            const myStorage = persisted(readable('default'), 'key', {
              storageType,
              reloadable: true,
            });

            await myStorage.load();

            expect(JSON.parse(getStorage('key'))).toBe('already set');
            expect(get(myStorage)).toBe('already set');
            expect(myStorage.load()).resolves.toBe('already set');

            await myStorage.reload();

            expect(JSON.parse(getStorage('key'))).toBe('default');
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

            expect(JSON.parse(getStorage('key'))).toBe('first value');
            expect(get(myStorage)).toBe('first value');
            expect(myStorage.load()).resolves.toBe('first value');

            await myStorage.reload();

            expect(JSON.parse(getStorage('key'))).toBe('second value');
            expect(get(myStorage)).toBe('second value');
            expect(myStorage.load()).resolves.toBe('second value');
          });
        });

        describe('using async key', () => {
          it('writes default to storage', async () => {
            const myStorage = persisted(
              'default',
              () => Promise.resolve('key'),
              {
                storageType,
              }
            );

            await myStorage.load();

            expect(JSON.parse(getStorage('key'))).toBe('default');
            expect(get(myStorage)).toBe('default');
            expect(myStorage.load()).resolves.toBe('default');
          });

          it('uses stored value if present', async () => {
            setStorage('key', JSON.stringify('already set'));
            const myStorage = persisted(
              'default',
              () => Promise.resolve('key'),
              {
                storageType,
              }
            );

            await myStorage.load();

            expect(JSON.parse(getStorage('key'))).toBe('already set');
            expect(get(myStorage)).toBe('already set');
            expect(myStorage.load()).resolves.toBe('already set');
          });

          it('updates stored value when set', async () => {
            setStorage('key', JSON.stringify('already set'));
            const myStorage = persisted(
              'default',
              () => Promise.resolve('key'),
              {
                storageType,
              }
            );
            await myStorage.set('new value');

            expect(JSON.parse(getStorage('key'))).toBe('new value');
            expect(get(myStorage)).toBe('new value');
            expect(myStorage.load()).resolves.toBe('new value');
          });

          it('updates stored value when updated', async () => {
            setStorage('key', JSON.stringify('already set'));
            const myStorage = persisted(
              'default',
              () => Promise.resolve('key'),
              {
                storageType,
              }
            );
            await myStorage.update((oldValue) => `${oldValue} + new value`);

            expect(JSON.parse(getStorage('key'))).toBe(
              'already set + new value'
            );
            expect(get(myStorage)).toBe('already set + new value');
            expect(myStorage.load()).resolves.toBe('already set + new value');
          });

          it('does not load until set', async () => {
            let isResolved = false;
            const myStorage = persisted(
              undefined,
              () => Promise.resolve('key'),
              {
                storageType,
              }
            );
            const resolutionPromise = myStorage
              .load()
              .then(() => (isResolved = true));

            expect(get(myStorage)).toBe(undefined);
            expect(isResolved).toBe(false);
            expect(getStorage('key')).toBeFalsy();

            myStorage.set('new value');

            await resolutionPromise;
            expect(isResolved).toBe(true);
            expect(JSON.parse(getStorage('key'))).toBe('new value');
            expect(get(myStorage)).toBe('new value');
            expect(myStorage.load()).resolves.toBe('new value');
          });

          it('reloads to default', async () => {
            setStorage('key', JSON.stringify('already set'));
            const myStorage = persisted(
              'default',
              () => Promise.resolve('key'),
              {
                storageType,
                reloadable: true,
              }
            );

            await myStorage.load();

            expect(JSON.parse(getStorage('key'))).toBe('already set');
            expect(get(myStorage)).toBe('already set');
            expect(myStorage.load()).resolves.toBe('already set');

            await myStorage.reload();

            expect(JSON.parse(getStorage('key'))).toBe('default');
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

            expect(JSON.parse(getStorage('key'))).toBe('default');
            expect(get(myStorage)).toBe('default');
            expect(myStorage.load()).resolves.toBe('default');

            await myStorage.set('updated');

            expect(JSON.parse(getStorage('key'))).toBe('updated');
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
  });

  describe('asyncClient', () => {
    it('allows access of store value functions', async () => {
      const myClient = asyncClient(
        readable({ add1: (num: number) => num + 1 })
      );
      const result = await myClient.add1(1);
      expect(result).toBe(2);
    });

    it('allows access of store value functions before loading', async () => {
      const myClient = asyncClient(
        writable<{ add1: (num: number) => number }>()
      );
      const resultPromise = myClient.add1(1);
      myClient.set({ add1: (num: number) => num + 1 });
      const result = await resultPromise;
      expect(result).toBe(2);
    });

    it('allows access of non-function store value properties', async () => {
      const myClient = asyncClient(writable<{ foo: string }>());
      const resultPromise = myClient.foo();
      myClient.set({ foo: 'bar' });
      const result = await resultPromise;
      expect(result).toBe('bar');
    });

    it('allows invocation of function stores', async () => {
      const myClient = asyncClient(writable<(input: string) => string>());
      const resultPromise = myClient('input');
      myClient.set((input: string) => `${input} + output`);
      const result = await resultPromise;
      expect(result).toBe('input + output');
    });
  });

  describe('trackState', () => {
    describe('provides `store` self reference', () => {
      it('asyncWritable', () => {
        const { store } = asyncWritable(null, jest.fn(), jest.fn(), {
          reloadable: true,
        });

        expect(
          Object.prototype.hasOwnProperty.call(store, 'subscribe')
        ).toBeTruthy();
        expect(
          Object.prototype.hasOwnProperty.call(store, 'load')
        ).toBeTruthy();
        expect(
          Object.prototype.hasOwnProperty.call(store, 'reload')
        ).toBeTruthy();
        expect(Object.prototype.hasOwnProperty.call(store, 'set')).toBeTruthy();
        expect(
          Object.prototype.hasOwnProperty.call(store, 'update')
        ).toBeTruthy();
      });

      it('asyncDerived', () => {
        const { store } = asyncDerived([], jest.fn(), {
          reloadable: true,
        });

        expect(
          Object.prototype.hasOwnProperty.call(store, 'subscribe')
        ).toBeTruthy();
        expect(
          Object.prototype.hasOwnProperty.call(store, 'load')
        ).toBeTruthy();
        expect(
          Object.prototype.hasOwnProperty.call(store, 'reload')
        ).toBeTruthy();
      });

      it('asyncReadable', () => {
        const { store } = asyncReadable([], jest.fn(), {
          reloadable: true,
        });

        expect(
          Object.prototype.hasOwnProperty.call(store, 'subscribe')
        ).toBeTruthy();
        expect(
          Object.prototype.hasOwnProperty.call(store, 'load')
        ).toBeTruthy();
        expect(
          Object.prototype.hasOwnProperty.call(store, 'reload')
        ).toBeTruthy();
      });

      it('derived', () => {
        const { store } = derived([], jest.fn());

        expect(
          Object.prototype.hasOwnProperty.call(store, 'subscribe')
        ).toBeTruthy();
        expect(
          Object.prototype.hasOwnProperty.call(store, 'load')
        ).toBeTruthy();
      });

      it('writable', () => {
        const { store } = writable();

        expect(
          Object.prototype.hasOwnProperty.call(store, 'subscribe')
        ).toBeTruthy();
        expect(
          Object.prototype.hasOwnProperty.call(store, 'load')
        ).toBeTruthy();
        expect(Object.prototype.hasOwnProperty.call(store, 'set')).toBeTruthy();
        expect(
          Object.prototype.hasOwnProperty.call(store, 'update')
        ).toBeTruthy();
      });

      it('readable', () => {
        const { store } = readable();

        expect(
          Object.prototype.hasOwnProperty.call(store, 'subscribe')
        ).toBeTruthy();
        expect(
          Object.prototype.hasOwnProperty.call(store, 'load')
        ).toBeTruthy();
      });

      it('persisted', () => {
        const { store } = persisted(null, 'key');

        expect(
          Object.prototype.hasOwnProperty.call(store, 'subscribe')
        ).toBeTruthy();
        expect(
          Object.prototype.hasOwnProperty.call(store, 'load')
        ).toBeTruthy();
        expect(Object.prototype.hasOwnProperty.call(store, 'set')).toBeTruthy();
        expect(
          Object.prototype.hasOwnProperty.call(store, 'update')
        ).toBeTruthy();
      });
    });

    describe('adds state store when trackState enabled', () => {
      it('works with asyncWritable', async () => {
        const { store: myStore, state: myState } = asyncWritable(
          [],
          () => Promise.resolve('loaded value'),
          undefined,
          { initial: 'initial', trackState: true }
        );

        expect(get(myStore)).toBe('initial');
        expect(get(myState)).toBe(LoadState.LOADING);

        await myStore.load();

        expect(get(myStore)).toBe('loaded value');
        expect(get(myState)).toBe(LoadState.LOADED);
      });

      it('works with asyncDerived', async () => {
        const { store: myStore, state: myState } = asyncDerived(
          [],
          () => Promise.resolve('loaded value'),
          { initial: 'initial', trackState: true }
        );

        expect(get(myStore)).toBe('initial');
        expect(get(myState)).toBe(LoadState.LOADING);

        await myStore.load();

        expect(get(myStore)).toBe('loaded value');
        expect(get(myState)).toBe(LoadState.LOADED);
      });

      it('works with asyncReadable', async () => {
        const { store: myStore, state: myState } = asyncReadable(
          'initial',
          () => Promise.resolve('loaded value'),
          { trackState: true }
        );

        expect(get(myStore)).toBe('initial');
        expect(get(myState)).toBe(LoadState.LOADING);

        await myStore.load();

        expect(get(myStore)).toBe('loaded value');
        expect(get(myState)).toBe(LoadState.LOADED);
      });
    });

    describe('RELOADING state', () => {
      it('tracks reloading', async () => {
        const { store: myStore, state: myState } = asyncReadable(
          'initial',
          () => Promise.resolve('loaded value'),
          { reloadable: true, trackState: true }
        );

        expect(get(myState)).toBe(LoadState.LOADING);

        await myStore.load();

        expect(get(myState)).toBe(LoadState.LOADED);

        const reloadPromise = myStore.reload();

        expect(get(myState)).toBe(LoadState.RELOADING);

        await reloadPromise;

        expect(get(myState)).toBe(LoadState.LOADED);
      });

      it('tracks reloading of reloadable parent', async () => {
        const parentLoad = jest
          .fn()
          .mockResolvedValueOnce('first load')
          .mockResolvedValueOnce('second load');
        const myParent = asyncReadable('initial', parentLoad, {
          reloadable: true,
        });
        const { store: myStore, state: myState } = asyncDerived(
          myParent,
          ($myParent) => Promise.resolve(`derived from ${$myParent}`),
          { trackState: true }
        );

        expect(get(myState)).toBe(LoadState.LOADING);

        await myStore.load();

        expect(get(myStore)).toBe('derived from first load');
        expect(get(myState)).toBe(LoadState.LOADED);

        const reloadPromise = myStore.reload();

        expect(get(myStore)).toBe('derived from first load');
        expect(get(myState)).toBe(LoadState.RELOADING);

        await reloadPromise;

        expect(get(myStore)).toBe('derived from second load');
        expect(get(myState)).toBe(LoadState.LOADED);
      });

      it('tracks reloading of reloadable parent when no change', async () => {
        const parentLoad = jest.fn().mockResolvedValue('load');
        const myParent = asyncReadable('initial', parentLoad, {
          reloadable: true,
        });
        const { store: myStore, state: myState } = asyncDerived(
          myParent,
          ($myParent) => Promise.resolve(`derived from ${$myParent}`),
          { trackState: true }
        );

        expect(get(myState)).toBe(LoadState.LOADING);

        await myStore.load();

        expect(get(myStore)).toBe('derived from load');
        expect(get(myState)).toBe(LoadState.LOADED);

        const reloadPromise = myStore.reload();

        expect(get(myStore)).toBe('derived from load');
        expect(get(myState)).toBe(LoadState.RELOADING);

        await reloadPromise;

        expect(get(myStore)).toBe('derived from load');
        expect(get(myState)).toBe(LoadState.LOADED);
      });

      it('tracks automatic reloading when parent change', async () => {
        const myParent = writable('initial');
        const { store: myStore, state: myState } = asyncDerived(
          myParent,
          ($myParent) =>
            new Promise((resolve) =>
              setTimeout(() => resolve(`derived from ${$myParent}`), 50)
            ),
          { trackState: true }
        );

        myStore.subscribe(jest.fn());

        expect(get(myState)).toBe(LoadState.LOADING);

        await myStore.load();

        expect(get(myStore)).toBe('derived from initial');
        expect(get(myState)).toBe(LoadState.LOADED);

        myParent.set('updated');
        await new Promise((resolve) => setTimeout(resolve));

        expect(get(myStore)).toBe('derived from initial');
        expect(get(myState)).toBe(LoadState.RELOADING);

        await myStore.load();

        expect(get(myStore)).toBe('derived from updated');
        expect(get(myState)).toBe(LoadState.LOADED);
      });
    });

    describe('ERROR state', () => {
      it('tracks error of loadable', async () => {
        const { store: myStore, state: myState } = asyncReadable(
          'initial',
          () => Promise.reject('error'),
          { trackState: true }
        );
        expect(get(myState)).toBe(LoadState.LOADING);

        await safeLoad(myStore);

        expect(get(myState)).toBe(LoadState.ERROR);
      });

      it('tracks error during reload', async () => {
        const load = jest
          .fn()
          .mockResolvedValueOnce('success')
          .mockRejectedValueOnce('failure');
        const { store: myStore, state: myState } = asyncReadable(
          'initial',
          load,
          { trackState: true, reloadable: true }
        );
        expect(get(myState)).toBe(LoadState.LOADING);

        await safeLoad(myStore);

        expect(get(myState)).toBe(LoadState.LOADED);

        await myStore.reload().catch(jest.fn());

        expect(get(myState)).toBe(LoadState.ERROR);
      });

      it('tracks error during parent load', async () => {
        const parentLoad = jest
          .fn()
          .mockResolvedValueOnce('success')
          .mockRejectedValueOnce('failure');
        const myParent = asyncReadable('initial', parentLoad, {
          reloadable: true,
        });
        const { store: myStore, state: myState } = asyncDerived(
          myParent,
          ($myParent) => Promise.resolve(`derived from ${$myParent}`),
          { trackState: true }
        );

        expect(get(myState)).toBe(LoadState.LOADING);

        await safeLoad(myStore);

        expect(get(myState)).toBe(LoadState.LOADED);

        await myStore.reload().catch(jest.fn());

        expect(get(myState)).toBe(LoadState.ERROR);
      });
    });

    describe('WRITING state', () => {
      it('tracks writing', async () => {
        const { store: myStore, state: myState } = asyncWritable(
          [],
          () => Promise.resolve('loaded value'),
          () => Promise.resolve('final value'),
          { trackState: true }
        );

        expect(get(myState)).toBe(LoadState.LOADING);

        await myStore.load();

        expect(get(myState)).toBe(LoadState.LOADED);

        const setPromise = myStore.set('intermediate value');

        expect(get(myState)).toBe(LoadState.WRITING);

        await setPromise;

        expect(get(myState)).toBe(LoadState.LOADED);
      });

      it('tracks writing error', async () => {
        const { store: myStore, state: myState } = asyncWritable(
          [],
          () => Promise.resolve('loaded value'),
          () => Promise.reject('rejection'),
          { trackState: true }
        );

        expect(get(myState)).toBe(LoadState.LOADING);

        await myStore.load();

        expect(get(myState)).toBe(LoadState.LOADED);

        const setPromise = myStore.set('intermediate value');

        expect(get(myState)).toBe(LoadState.WRITING);

        await setPromise.catch(jest.fn());

        expect(get(myState)).toBe(LoadState.ERROR);
      });
    });
  });
});
/* eslint-enable prefer-promise-reject-errors */
