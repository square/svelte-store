import { Loadable, StoresValues } from '../async-stores/types.js';
import { AsyncClient } from './types.js';
import { get } from 'svelte/store';

/**
 * Generates an AsyncClient from a Loadable store. The AsyncClient will have all
 * of the properties of the input store, plus a collection of asynchronous functions
 * for kicking off access of the store's value's properties before it has finished loading.
 * i.e. an asyncClient that loads to {foo: 'bar'} will have a `foo` function that
 * resolves to 'bar' when the store has loaded.
 * @param loadable Loadable to unpack into an asnycClient
 * @returns an asyncClient with the properties of the input store and asynchronous
 * accessors to the properties of the store's loaded value
 */
export const asyncClient = <S extends Loadable<unknown>>(
  loadable: S
): S & AsyncClient<StoresValues<S>> => {
  // Generate an empty function that will be proxied.
  // This lets us invoke the resulting asyncClient.
  // An anonymous function is used instead of the function prototype
  // so that testing environments can tell asyncClients apart.
  const emptyFunction = () => {
    /* no op*/
  };
  return new Proxy(emptyFunction, {
    get: (proxiedFunction, property) => {
      if (proxiedFunction[property]) {
        // this ensures that jest is able to identify the proxy
        // when setting up spies on its properties
        return proxiedFunction[property];
      }
      if (loadable[property]) {
        return loadable[property];
      }
      return async (...argumentsList: unknown[]) => {
        const storeValue = await loadable.load();
        const original = storeValue[property];
        if (typeof original === 'function') {
          return Reflect.apply(original, storeValue, argumentsList);
        } else {
          return original;
        }
      };
    },
    apply: async (_, __, argumentsList) => {
      const storeValue = await loadable.load();
      if (typeof storeValue === 'function') {
        return Reflect.apply(storeValue, storeValue, argumentsList);
      }
      return storeValue;
    },
    set: (proxiedFunction, property, value) => {
      return Reflect.set(loadable, property, value);
    },
    defineProperty(proxiedFunction, property, value) {
      return Reflect.defineProperty(loadable, property, value);
    },
    has: (proxiedFunction, property) => {
      if (property in proxiedFunction) {
        return true;
      }

      if (property in loadable) {
        return true;
      }

      const value = get(loadable);

      if (value && value instanceof Object) {
        // eslint-disable-next-line @typescript-eslint/ban-types
        return property in (value as object);
      }
      return false;
    },
  }) as unknown as S & AsyncClient<StoresValues<S>>;
};
