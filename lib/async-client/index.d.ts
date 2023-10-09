import { Loadable, StoresValues } from '../async-stores/types.js';
import { AsyncClient } from './types.js';
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
export declare const asyncClient: <S extends Loadable<unknown>>(loadable: S) => S & AsyncClient<StoresValues<S>>;
