import { get } from 'svelte/store';
import {
  asyncReadable,
  Loadable,
  derived,
  readable,
  writable,
} from '../../src';

describe('synchronous derived', () => {
  const nonAsyncParent = writable('writable');
  const asyncReadableParent = asyncReadable(undefined, () =>
    Promise.resolve('loadable')
  );
  let reloadableGrandparent: Loadable<string>;
  let derivedParent: Loadable<string>;
  let mockReload = vi.fn();

  beforeEach(() => {
    mockReload = vi
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
      myDerived.subscribe(vi.fn());

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
      myDerived.subscribe(vi.fn());

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
      const mockStop = vi.fn();
      const myWritable = writable(undefined, (set) => {
        set('initial');
        return mockStop;
      });
      const unsubscribe = myWritable.subscribe(vi.fn());

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
      const mockUnsubscribe = vi.fn();
      const myReadable = readable(undefined, (set) => {
        set('initial');
        return mockUnsubscribe;
      });
      const unsubscribe = myReadable.subscribe(vi.fn());

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
      const stop = vi.fn();

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
      expect(stop).toHaveBeenCalledTimes(2);
    });
  });
});
