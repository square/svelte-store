import { type StartStopNotifier, type Unsubscriber, type Writable } from 'svelte/store';
import type { Loadable, Stores, StoresValues } from '../async-stores/types.js';
declare type DerivedMapper<S extends Stores, T> = (values: StoresValues<S>) => T;
declare type SubscribeMapper<S extends Stores, T> = (values: StoresValues<S>, set: (value: T) => void) => Unsubscriber | void;
/**
 * A Derived store that is considered 'loaded' when all of its parents have loaded (and so on).
 * @param stores Any Readable or array of Readables used to generate the value of this store.
 * Any Loadable stores need to load before this store is considered loaded.
 * @param subscriberMapper A function that sets the value of the store.
 * @param initialValue Initial value
 * @returns A Loadable store that whose value is derived from the provided parent stores.
 * The loaded value of the store will be ready after awaiting the load function of this store.
 */
export declare function derived<S extends Stores, T>(stores: S, fn: SubscribeMapper<S, T>, initialValue?: T): Loadable<T>;
/**
 * A Derived store that is considered 'loaded' when all of its parents have loaded (and so on).
 * @param stores Any Readable or array of Readables used to generate the value of this store.
 * Any Loadable stores need to load before this store is considered loaded.
 * @param mappingFunction A function that maps the values of the parent store to the value of this store.
 * @param initialValue Initial value
 * @returns A Loadable store that whose value is derived from the provided parent stores.
 * The loaded value of the store will be ready after awaiting the load function of this store.
 */
export declare function derived<S extends Stores, T>(stores: S, mappingFunction: DerivedMapper<S, T>, initialValue?: T): Loadable<T>;
/**
 * Create a `Writable` store that allows both updating and reading by subscription.
 * @param {*=}value initial value
 * @param {StartStopNotifier=}start start and stop notifications for subscriptions
 */
export declare const writable: <T>(value?: T, start?: StartStopNotifier<T>) => Writable<T> & Loadable<T>;
/**
 * Creates a `Readable` store that allows reading by subscription.
 * @param value initial value
 * @param {StartStopNotifier}start start and stop notifications for subscriptions
 */
export declare const readable: <T>(value?: T, start?: StartStopNotifier<T>) => Loadable<T>;
export {};
