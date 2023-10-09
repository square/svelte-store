var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
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
export const asyncClient = (loadable) => {
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
            return (...argumentsList) => __awaiter(void 0, void 0, void 0, function* () {
                const storeValue = yield loadable.load();
                const original = storeValue[property];
                if (typeof original === 'function') {
                    return Reflect.apply(original, storeValue, argumentsList);
                }
                else {
                    return original;
                }
            });
        },
        apply: (_, __, argumentsList) => __awaiter(void 0, void 0, void 0, function* () {
            const storeValue = yield loadable.load();
            if (typeof storeValue === 'function') {
                return Reflect.apply(storeValue, storeValue, argumentsList);
            }
            return storeValue;
        }),
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
                return property in value;
            }
            return false;
        },
    });
};
//# sourceMappingURL=index.js.map