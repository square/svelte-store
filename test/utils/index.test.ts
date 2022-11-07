import { Readable } from 'svelte/store';
import {
  Loadable,
  readable,
  loadAll,
  rebounce,
  reloadAll,
  safeLoad,
} from '../../src';

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

describe('rebounce', () => {
  const abortError = new DOMException(
    'The function was rebounced.',
    'AbortError'
  );
  const interval = jest.fn();

  beforeEach(() => {
    interval.mockReset();
    interval
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(80)
      .mockReturnValueOnce(60)
      .mockReturnValue(10);
  });

  const toUpperCase = (input: string) => input.toUpperCase();

  const asyncToUpperCase = (input: string) => {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(input.toUpperCase());
      }, interval());
    });
  };

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
    const getValue = jest
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
    rebouncedToUpperCase.clear();
  });
});
