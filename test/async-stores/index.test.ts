import {
  get,
  asyncDerived,
  asyncReadable,
  asyncWritable,
  logAsyncErrors,
  WritableLoadable,
  persisted,
  derived,
  readable,
  writable,
  isReloadable,
  rebounce,
  safeLoad,
} from '../../src';

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

    describe('abort/rebounce integration', () => {
      it('loads to rebounced value only', async () => {
        const load = (value: string) => {
          return new Promise<string>((resolve) =>
            setTimeout(() => resolve(value), 100)
          );
        };

        const rebouncedLoad = rebounce(load);
        const myParent = writable();
        const { store: myStore, state: myState } = asyncDerived(
          myParent,
          rebouncedLoad,
          {
            trackState: true,
          }
        );

        let setIncorrectly = false;
        myStore.subscribe((value) => {
          if (['a', 'b'].includes(value)) {
            setIncorrectly = true;
          }
        });

        let everErrored = false;
        myState.subscribe((state) => {
          if (state.isError) {
            everErrored = true;
          }
        });

        myParent.set('a');
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(get(myState).isLoading).toBe(true);
        myParent.set('b');
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(get(myState).isLoading).toBe(true);
        myParent.set('c');
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(get(myState).isLoading).toBe(true);

        const finalValue = await myStore.load();

        expect(everErrored).toBe(false);
        expect(setIncorrectly).toBe(false);
        expect(finalValue).toBe('c');
        expect(get(myStore)).toBe('c');
        expect(get(myState).isLoaded).toBe(true);
      });

      it('can be cleared correctly', async () => {
        const load = (value: string) => {
          return new Promise<string>((resolve) =>
            setTimeout(() => resolve(value), 100)
          );
        };

        const rebouncedLoad = rebounce(load);
        const myParent = writable();
        const { store: myStore, state: myState } = asyncDerived(
          myParent,
          rebouncedLoad,
          {
            trackState: true,
          }
        );

        myStore.subscribe(jest.fn());

        myParent.set('one');
        let loadValue = await myStore.load();
        expect(loadValue).toBe('one');

        myParent.set('two');
        await new Promise((resolve) => setTimeout(resolve, 50));
        rebouncedLoad.clear();
        loadValue = await myStore.load();

        expect(loadValue).toBe('one');
        expect(get(myStore)).toBe('one');
        expect(get(myState).isLoaded).toBe(true);
      });

      it('rejects load when rebounce reject', () => {
        const rebouncedReject = rebounce(
          () => Promise.reject(new Error('error')),
          100
        );
        const parent = writable();
        const rejectStore = asyncDerived(parent, () => rebouncedReject());

        parent.set('value');
        expect(() => rejectStore.load()).rejects.toStrictEqual(
          new Error('error')
        );
      });
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
      const mappingWriteFunction = jest.fn(() =>
        Promise.reject(new Error('any'))
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

      await myAsyncWritable.set('final').catch(() => Promise.resolve());
      expect(get(myAsyncWritable)).toBe('final');
      const loadedValue = await myAsyncWritable.load();
      expect(loadedValue).toBe('final');

      expect(mappingWriteFunction).toHaveBeenCalledTimes(1);
    });

    it('provides old value of store to mapping write function', async () => {
      const dataFetchFunction = jest.fn(() => Promise.reject(new Error('any')));
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
      const dataFetchFunction = jest.fn(() => Promise.reject(new Error('any')));
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
      const mappingWriteFunction = jest.fn(() =>
        Promise.reject(new Error('any'))
      );
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

    it('provides a single asyncReadable parent value if parent is not an array', async () => {
      const asyncReadableParent = asyncReadable(undefined, mockReload);
      const myAsyncWritable = asyncWritable(
        asyncReadableParent,
        (storeValue) => `derived from ${storeValue}`,
        (_, $asyncReadableParent) =>
          Promise.resolve(`${typeof $asyncReadableParent}`)
      );
      myAsyncWritable.subscribe(jest.fn);

      await myAsyncWritable.set('set value');
      expect(get(myAsyncWritable)).toBe('string');
    });

    it('provides an array as parent value if asyncReadable has a parents array', async () => {
      const asyncReadableParent = asyncReadable(undefined, mockReload);
      const myAsyncWritable = asyncWritable(
        [asyncReadableParent],
        (storeValue) => `derived from ${storeValue}`,
        (_, $asyncReadableParent) =>
          Promise.resolve(`is an array: ${Array.isArray($asyncReadableParent)}`)
      );
      myAsyncWritable.subscribe(jest.fn);

      await myAsyncWritable.set('set value');
      expect(get(myAsyncWritable)).toBe('is an array: true');
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

describe('trackState', () => {
  describe('provides `store` self reference', () => {
    it('asyncWritable', () => {
      const { store } = asyncWritable(null, jest.fn(), jest.fn(), {
        reloadable: true,
      });

      expect(
        Object.prototype.hasOwnProperty.call(store, 'subscribe')
      ).toBeTruthy();
      expect(Object.prototype.hasOwnProperty.call(store, 'load')).toBeTruthy();
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
      expect(Object.prototype.hasOwnProperty.call(store, 'load')).toBeTruthy();
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
      expect(Object.prototype.hasOwnProperty.call(store, 'load')).toBeTruthy();
      expect(
        Object.prototype.hasOwnProperty.call(store, 'reload')
      ).toBeTruthy();
    });

    it('derived', () => {
      const { store } = derived([], jest.fn());

      expect(
        Object.prototype.hasOwnProperty.call(store, 'subscribe')
      ).toBeTruthy();
      expect(Object.prototype.hasOwnProperty.call(store, 'load')).toBeTruthy();
    });

    it('writable', () => {
      const { store } = writable();

      expect(
        Object.prototype.hasOwnProperty.call(store, 'subscribe')
      ).toBeTruthy();
      expect(Object.prototype.hasOwnProperty.call(store, 'load')).toBeTruthy();
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
      expect(Object.prototype.hasOwnProperty.call(store, 'load')).toBeTruthy();
    });

    it('persisted', () => {
      const { store } = persisted(null, 'key');

      expect(
        Object.prototype.hasOwnProperty.call(store, 'subscribe')
      ).toBeTruthy();
      expect(Object.prototype.hasOwnProperty.call(store, 'load')).toBeTruthy();
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
      expect(get(myState).isLoading).toBe(true);

      await myStore.load();

      expect(get(myStore)).toBe('loaded value');
      expect(get(myState).isLoaded).toBe(true);
    });

    it('works with asyncDerived', async () => {
      const { store: myStore, state: myState } = asyncDerived(
        [],
        () => Promise.resolve('loaded value'),
        { initial: 'initial', trackState: true }
      );

      expect(get(myStore)).toBe('initial');
      expect(get(myState).isLoading).toBe(true);

      await myStore.load();

      expect(get(myStore)).toBe('loaded value');
      expect(get(myState).isLoaded).toBe(true);
    });

    it('works with asyncReadable', async () => {
      const { store: myStore, state: myState } = asyncReadable(
        'initial',
        () => Promise.resolve('loaded value'),
        { trackState: true }
      );

      expect(get(myStore)).toBe('initial');
      expect(get(myState).isLoading).toBe(true);

      await myStore.load();

      expect(get(myStore)).toBe('loaded value');
      expect(get(myState).isLoaded).toBe(true);
    });
  });

  describe('RELOADING state', () => {
    it('tracks reloading', async () => {
      const { store: myStore, state: myState } = asyncReadable(
        'initial',
        () => Promise.resolve('loaded value'),
        { reloadable: true, trackState: true }
      );

      expect(get(myState).isLoading).toBe(true);

      await myStore.load();

      expect(get(myState).isLoaded).toBe(true);

      const reloadPromise = myStore.reload();

      expect(get(myState).isReloading).toBe(true);

      await reloadPromise;

      expect(get(myState).isLoaded).toBe(true);
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

      expect(get(myState).isLoading).toBe(true);

      await myStore.load();

      expect(get(myStore)).toBe('derived from first load');
      expect(get(myState).isLoaded).toBe(true);

      const reloadPromise = myStore.reload();

      expect(get(myStore)).toBe('derived from first load');
      expect(get(myState).isReloading).toBe(true);

      await reloadPromise;

      expect(get(myStore)).toBe('derived from second load');
      expect(get(myState).isLoaded).toBe(true);
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

      expect(get(myState).isLoading).toBe(true);

      await myStore.load();

      expect(get(myStore)).toBe('derived from load');
      expect(get(myState).isLoaded).toBe(true);

      const reloadPromise = myStore.reload();

      expect(get(myStore)).toBe('derived from load');
      expect(get(myState).isReloading).toBe(true);

      await reloadPromise;

      expect(get(myStore)).toBe('derived from load');
      expect(get(myState).isLoaded).toBe(true);
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

      expect(get(myState).isLoading).toBe(true);

      await myStore.load();

      expect(get(myStore)).toBe('derived from initial');
      expect(get(myState).isLoaded).toBe(true);

      myParent.set('updated');
      await new Promise((resolve) => setTimeout(resolve));

      expect(get(myStore)).toBe('derived from initial');
      expect(get(myState).isReloading).toBe(true);

      await myStore.load();

      expect(get(myStore)).toBe('derived from updated');
      expect(get(myState).isLoaded).toBe(true);
    });

    it('tracks reloading with multiple parent updates', async () => {
      const grandParent = writable('initial');
      const parentA = derived(
        grandParent,
        ($grandParent) => `${$grandParent}A`
      );
      const parentB = derived(
        grandParent,
        ($grandParent) => `${$grandParent}B`
      );
      const { store: myStore, state: myState } = asyncDerived(
        [parentA, parentB],
        ([$parentA, $parentB]) => {
          return new Promise((resolve) => {
            setTimeout(() => {
              resolve(`${$parentA} ${$parentB}`);
            }, 100);
          });
        },
        { trackState: true }
      );

      expect(get(myState).isLoading).toBe(true);

      await myStore.load();

      expect(get(myStore)).toBe('initialA initialB');
      expect(get(myState).isLoaded).toBe(true);

      grandParent.set('updated');
      await new Promise((resolve) => setTimeout(resolve));

      expect(get(myStore)).toBe('initialA initialB');
      expect(get(myState).isReloading).toBe(true);

      await myStore.load();

      expect(get(myStore)).toBe('updatedA updatedB');
      expect(get(myState).isLoaded).toBe(true);
    });
  });

  describe('ERROR state', () => {
    it('tracks error of loadable', async () => {
      const { store: myStore, state: myState } = asyncReadable(
        'initial',
        () => Promise.reject(new Error('error')),
        { trackState: true }
      );
      expect(get(myState).isLoading).toBe(true);

      await safeLoad(myStore);

      expect(get(myState).isError).toBe(true);
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
      expect(get(myState).isLoading).toBe(true);

      await safeLoad(myStore);

      expect(get(myState).isLoaded).toBe(true);

      await myStore.reload().catch(jest.fn());

      expect(get(myState).isError).toBe(true);
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

      expect(get(myState).isLoading).toBe(true);

      await safeLoad(myStore);

      expect(get(myState).isLoaded).toBe(true);

      await myStore.reload().catch(jest.fn());

      expect(get(myState).isError).toBe(true);
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

      expect(get(myState).isLoading).toBe(true);

      await myStore.load();

      expect(get(myState).isLoaded).toBe(true);

      const setPromise = myStore.set('intermediate value');

      expect(get(myState).isWriting).toBe(true);

      await setPromise;

      expect(get(myState).isLoaded).toBe(true);
    });

    it('tracks writing error', async () => {
      const { store: myStore, state: myState } = asyncWritable(
        [],
        () => Promise.resolve('loaded value'),
        () => Promise.reject(new Error('rejection')),
        { trackState: true }
      );

      expect(get(myState).isLoading).toBe(true);

      await myStore.load();

      expect(get(myState).isLoaded).toBe(true);

      const setPromise = myStore.set('intermediate value');

      expect(get(myState).isWriting).toBe(true);

      await setPromise.catch(jest.fn());

      expect(get(myState).isError).toBe(true);
    });
  });
});
