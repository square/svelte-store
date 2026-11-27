import * as svelte from 'svelte';
import { VERSION } from 'svelte/compiler';
import { derived as nativeDerived } from 'svelte/store';
// Exercise the built package rather than Vite's transformation of its source.
import {
  asyncReadable,
  asyncWritable,
  persisted,
  readable,
  writable,
} from '../../lib/index.js';
import StoreConsumer from '../components/StoreConsumer.svelte';

const isSvelte5 = Number(VERSION.split('.')[0]) >= 5;
const delay = () => new Promise((resolve) => setTimeout(resolve, 500));
let failNext = false;
let starts = 0;
let stops = 0;
let destroy = [];
const showSubscriptions = () => {
  document.querySelector(
    '#subscriptions'
  ).textContent = `Subscriptions started: ${starts}; stopped: ${stops}`;
};
const render = (Component, target, props) => {
  if (isSvelte5) {
    const instance = svelte.mount(Component, { target, props });
    destroy.push(() => svelte.unmount(instance));
  } else {
    const instance = new Component({ target, props });
    destroy.push(() => instance.$destroy());
  }
};
const mount = async () => {
  const count = writable(1);
  let loads = 0;
  render(StoreConsumer, document.querySelector('#legacy'), {
    count,
    doubled: nativeDerived(count, (value) => value * 2),
    remote: asyncReadable(
      'initial',
      async () => {
        await delay();
        if (failNext) {
          failNext = false;
          document.querySelector('#failure').textContent = '';
          throw new Error('Unable to load');
        }
        return `Loaded ${++loads}`;
      },
      { reloadable: true, trackState: true }
    ),
    saved: asyncWritable(
      [],
      async () => 'saved',
      async () => {
        await delay();
        return 'canonical';
      },
      { trackState: true }
    ),
    preference: persisted('blue', 'component-preference'),
    lifecycle: readable('Subscription active', () => {
      starts += 1;
      showSubscriptions();
      return () => {
        stops += 1;
        showSubscriptions();
      };
    }),
  });
  if (isSvelte5) {
    const { default: RunesConsumer } = await import(
      '../components/RunesConsumer.svelte'
    );
    render(RunesConsumer, document.querySelector('#runes'), { count });
  }
};
document.querySelector('#version').textContent = `Svelte ${VERSION}`;
document.querySelector('#fail').onclick = () => {
  failNext = true;
  document.querySelector('#failure').textContent = 'Next reload will fail';
};
document.querySelector('#toggle').onclick = async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  if (destroy.length) {
    for (const unmount of destroy) await unmount();
    destroy = [];
    button.textContent = 'Mount components';
  } else {
    await mount();
    button.textContent = 'Unmount components';
  }
  button.disabled = false;
};
await mount();
