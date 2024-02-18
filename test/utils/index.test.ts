import {
  asyncReadable,
  Loadable,
  loadAll,
  rebounce,
  reloadAll,
  safeLoad,
  enableStoreTestingMode,
} from '../../src';
import { delayValue } from '../helpers';

enableStoreTestingMode();

describe('loadAll / reloadAll utils', () => {
  const mockReload = vi.fn();
  const myLoadable = asyncReadable(undefined, () => Promise.resolve('loaded'));
  const myReloadable = asyncReadable(undefined, mockReload, {
    reloadable: true,
  });
  const badLoadable = {
    load: () => Promise.reject(new Error('E')),
    reload: () => Promise.reject(new Error('F')),
  } as unknown as Loadable<string>;

  beforeEach(() => {
    mockReload
      .mockResolvedValueOnce('first value')
      .mockResolvedValueOnce('second value')
      .mockResolvedValueOnce('third value');
  });

  afterEach(() => {
    mockReload.mockReset();
    myReloadable.reset();
  });

  describe('loadAll function', () => {
    it('loads single store', () => {
      expect(loadAll(myLoadable)).resolves.toStrictEqual('loaded');
    });

    it('resolves to values of all stores', () => {
      expect(loadAll([myLoadable, myReloadable])).resolves.toStrictEqual([
        'loaded',
        'first value',
      ]);
      expect(true).toBeTruthy();
    });

    it('handles rejection', () => {
      expect(loadAll([myLoadable, badLoadable])).rejects.toStrictEqual(
        new Error('E')
      );
    });
  });

  describe('reloadAll function', () => {
    it('reloads loads single store', async () => {
      await loadAll(myReloadable);
      expect(reloadAll(myReloadable)).resolves.toStrictEqual('second value');
    });

    it('reloads and resolves to values of all stores', async () => {
      await loadAll([myLoadable, myReloadable]);
      expect(reloadAll([myLoadable, myReloadable])).resolves.toStrictEqual([
        'loaded',
        'second value',
      ]);
    });

    it('handles rejection', () => {
      expect(reloadAll([myLoadable, badLoadable])).rejects.toStrictEqual(
        new Error('F')
      );
    });

    it('does not reload already visited store', () => {
      const visitedMap = new WeakMap();
      visitedMap.set(myReloadable, myReloadable.reload());
      expect(reloadAll(myReloadable, visitedMap)).resolves.toStrictEqual(
        'first value'
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

describe('rebounce', () => {
  const abortError = new DOMException(
    'The function was rebounced.',
    'AbortError'
  );
  const interval = vi.fn();

  beforeEach(() => {
    interval.mockReset();
    interval
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(80)
      .mockReturnValueOnce(60)
      .mockReturnValue(10);
  });

  const toUpperCase = (input: string) => input.toUpperCase();

  const asyncToUpperCase = (input: string) =>
    delayValue(input.toUpperCase(), interval());

  it('works with no timer or rejects', () => {
    const rebouncedToUpperCase = rebounce(asyncToUpperCase);

    expect(rebouncedToUpperCase('some')).rejects.toStrictEqual(abortError);
    expect(rebouncedToUpperCase('lowercase')).rejects.toStrictEqual(abortError);
    expect(rebouncedToUpperCase('strings')).resolves.toBe('STRINGS');
  });

  it('can be called after resolving', async () => {
    const rebouncedToUpperCase = rebounce(asyncToUpperCase);

    expect(rebouncedToUpperCase('some')).rejects.toStrictEqual(abortError);
    const result = await rebouncedToUpperCase('lowercase');
    expect(result).toBe('LOWERCASE');

    expect(rebouncedToUpperCase('strings')).resolves.toBe('STRINGS');
  });

  it('works with timer', () => {
    const getValue = vi
      .fn()
      .mockReturnValueOnce('one')
      .mockReturnValueOnce('two')
      .mockReturnValueOnce('more');
    const rebouncedGetValue = rebounce(getValue, 100);

    expect(rebouncedGetValue()).rejects.toStrictEqual(abortError);
    expect(rebouncedGetValue()).rejects.toStrictEqual(abortError);
    expect(rebouncedGetValue()).resolves.toStrictEqual('one');
  });

  it('passes through rejections', () => {
    const someError = new Error('some error');
    const rebouncedRejection = rebounce(
      (_: string) => Promise.reject(someError),
      100
    );

    expect(rebouncedRejection('some')).rejects.toStrictEqual(abortError);
    expect(rebouncedRejection('lowercase')).rejects.toStrictEqual(abortError);
    expect(rebouncedRejection('strings')).rejects.toStrictEqual(someError);
  });

  it('can be cleared', () => {
    const rebouncedToUpperCase = rebounce(toUpperCase, 100);

    expect(rebouncedToUpperCase('a string')).rejects.toStrictEqual(abortError);
    rebouncedToUpperCase.abort();
  });
});
