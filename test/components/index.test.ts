import * as svelte from 'svelte';
import { VERSION } from 'svelte/compiler';
import {
  derived as nativeDerived,
  writable as nativeWritable,
} from 'svelte/store';
import {
  asyncReadable,
  asyncWritable,
  derived,
  persisted,
  readable,
  writable,
} from '../../src';
import StoreConsumer from './StoreConsumer.svelte';

const isSvelte5 = Number(VERSION.split('.')[0]) >= 5;
const deferred = <T>() => {
  let resolve: (value: T) => void;
  let reject: (reason: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

// Use each major's public component API, without compatibility mode.
let target: HTMLDivElement;
let destroy: () => void | Promise<void>;
const render = (Component, props) => {
  if (isSvelte5) {
    const instance = svelte.mount(Component, { target, props });
    destroy = () => svelte.unmount(instance);
  } else {
    const instance = new Component({ target, props });
    destroy = () => instance.$destroy();
  }
};
const text = (id: string) =>
  target.querySelector(`[data-testid="${id}"]`)?.textContent.trim();
const click = async (label: string) => {
  const button = [...target.querySelectorAll('button')].find(
    (node) => node.textContent === label
  );
  expect(button).toBeDefined();
  button.click();
  await svelte.tick();
};
const fill = async (index: number, value: string) => {
  const input = target.querySelectorAll('input')[index];
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await svelte.tick();
};
const createProps = () => {
  const count = writable(1);
  return {
    count,
    doubled: nativeDerived(count, (value) => value * 2),
    remote: asyncReadable('initial', async () => 'loaded', {
      reloadable: true,
      trackState: true,
    }),
    saved: asyncWritable(
      [],
      async () => 'saved',
      async () => 'canonical',
      { trackState: true }
    ),
    preference: persisted('blue', 'component-preference'),
    lifecycle: readable('subscribed'),
  };
};

beforeEach(() => {
  localStorage.clear();
  target = document.createElement('div');
  document.body.append(target);
});
afterEach(async () => {
  await destroy?.();
  destroy = undefined;
  target.remove();
  localStorage.clear();
});

it('supports store auto-subscriptions, assignments and two-way input bindings', async () => {
  const props = createProps();
  render(StoreConsumer, props);
  await svelte.tick();
  expect(text('count')).toBe('Count: 1');
  expect(text('doubled')).toBe('Doubled: 2');
  await click('Increment');
  expect(await props.count.load()).toBe(2);
  expect(text('doubled')).toBe('Doubled: 4');
  await fill(0, '7');
  expect(await props.count.load()).toBe(7);
  expect(text('doubled')).toBe('Doubled: 14');
  props.count.set(9);
  await svelte.tick();
  expect(target.querySelector('input').value).toBe('9');
  expect(text('doubled')).toBe('Doubled: 18');
});

it('derives from native stores and releases subscriptions when unmounted', async () => {
  const stop = vi.fn();
  const start = vi.fn(() => stop);
  const count = nativeWritable(3);
  render(StoreConsumer, {
    ...createProps(),
    count,
    doubled: derived(count, (value) => value * 2),
    lifecycle: readable('subscribed', start),
  });
  await svelte.tick();
  expect(text('doubled')).toBe('Doubled: 6');
  count.set(4);
  await svelte.tick();
  expect(text('doubled')).toBe('Doubled: 8');
  expect(start).toHaveBeenCalledTimes(1);
  expect(stop).not.toHaveBeenCalled();
  await destroy();
  destroy = undefined;
  expect(stop).toHaveBeenCalledTimes(1);
});

it('renders loading, reload, error and recovery through an await block', async () => {
  const first = deferred<string>();
  const second = deferred<string>();
  const failed = deferred<string>();
  const loader = vi
    .fn()
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise)
    .mockReturnValueOnce(failed.promise)
    .mockResolvedValue('recovered');
  const remote = asyncReadable('initial', loader, {
    reloadable: true,
    trackState: true,
  });
  render(StoreConsumer, { ...createProps(), remote });
  await svelte.tick();
  expect(text('result')).toBe('Waiting for data');
  expect(text('load-state')).toBe('Loading');
  first.resolve('first');
  await remote.load();
  await svelte.tick();
  expect(text('result')).toBe('first');
  expect(text('load-state')).toBe('Loaded');
  await click('Reload');
  expect(text('load-state')).toBe('Reloading');
  second.resolve('second');
  await vi.waitFor(() => expect(text('result')).toBe('second'));
  await click('Reload');
  failed.reject(new Error('Unable to load'));
  await vi.waitFor(() =>
    expect(target.querySelector('[role="alert"]')?.textContent).toBe(
      'Unable to load'
    )
  );
  expect(text('load-state')).toBe('Error');
  await click('Reload');
  await vi.waitFor(() => expect(text('result')).toBe('recovered'));
  expect(text('load-state')).toBe('Loaded');
});

it('renders optimistic writes followed by the canonical value', async () => {
  const write = deferred<string>();
  const saved = asyncWritable(
    [],
    async () => 'saved',
    () => write.promise,
    { trackState: true }
  );
  render(StoreConsumer, { ...createProps(), saved });
  await saved.load();
  await svelte.tick();
  await click('Save');
  await vi.waitFor(() => expect(text('saved')).toBe('optimistic'));
  expect(text('write-state')).toBe('Writing');
  write.resolve('canonical');
  await vi.waitFor(() => expect(text('saved')).toBe('canonical'));
  expect(text('write-state')).toBe('Settled');
});

it('persists input bindings across remounts and clears saved data', async () => {
  render(StoreConsumer, createProps());
  await vi.waitFor(() =>
    expect(target.querySelectorAll('input')[1].value).toBe('blue')
  );
  await fill(1, 'green');
  await vi.waitFor(() =>
    expect(localStorage.getItem('component-preference')).toBe('"green"')
  );
  await destroy();
  render(StoreConsumer, createProps());
  await vi.waitFor(() =>
    expect(target.querySelectorAll('input')[1].value).toBe('green')
  );
  await click('Clear preference');
  await vi.waitFor(() =>
    expect(localStorage.getItem('component-preference')).toBeNull()
  );
  expect(target.querySelectorAll('input')[1].value).toBe('');
});

it.skipIf(!isSvelte5)(
  'combines store bindings with Svelte 5 runes',
  async () => {
    const { default: RunesConsumer } = await import('./RunesConsumer.svelte');
    const count = writable(2);
    render(RunesConsumer, { count });
    await svelte.tick();
    expect(text('runes-doubled')).toBe('Runes doubled: 4');
    await click('Increment with runes');
    expect(await count.load()).toBe(3);
    expect(text('runes-doubled')).toBe('Runes doubled: 6');
    await fill(0, '8');
    expect(await count.load()).toBe(8);
    expect(text('runes-doubled')).toBe('Runes doubled: 16');
  }
);
