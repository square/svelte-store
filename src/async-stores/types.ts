import { Readable, Updater, Writable } from 'svelte/store';

export type State = 'LOADING' | 'LOADED' | 'RELOADING' | 'ERROR' | 'WRITING';

export type LoadState = {
  isLoading: boolean;
  isReloading: boolean;
  isLoaded: boolean;
  isWriting: boolean;
  isError: boolean;
  isPending: boolean; // LOADING or RELOADING
  isSettled: boolean; // LOADED or ERROR
};

export type VisitedMap = WeakMap<Readable<unknown>, Promise<unknown>>;

export interface Loadable<T> extends Readable<T> {
  load(): Promise<T>;
  reset?(): void;
  store: Loadable<T>;
}

export interface Reloadable<T> {
  reload(visitedMap?: VisitedMap): Promise<T>;
}

export interface AsyncLoadable<T> extends Loadable<T> {
  reload(visitedMap?: VisitedMap): Promise<T>;
  abort(): void;
  state: Readable<LoadState>;
  store: AsyncLoadable<T>;
}

export interface AsyncWritable<T> extends Writable<T> {
  set(value: T, persist?: boolean): Promise<void>;
  update(updater: Updater<T>): Promise<void>;
  store: AsyncWritable<T>;
}

export type WritableLoadable<T> = AsyncLoadable<T> & AsyncWritable<T>;

export interface AsyncStoreOptions<T> {
  reloadable?: true;
  trackState?: true;
  initial?: T;
  rebounceDelay?: number;
}
export declare type StoresArray =
  | [Readable<unknown>, ...Array<Readable<unknown>>]
  | Array<Readable<unknown>>;
/* These types come from Svelte but are not exported, so copying them here */
/* One or more `Readable`s. */
export declare type Stores = Readable<unknown> | StoresArray;

export declare type ValuesArray<T> = {
  [K in keyof T]: T[K] extends Readable<infer U> ? U : never;
};

/** One or more values from `Readable` stores. */
export declare type StoresValues<T> = T extends Readable<infer U>
  ? U
  : ValuesArray<T>;
