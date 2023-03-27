# Changelog #

## 1.0.15 (2023-2-27)

- *BREAKING CHANGE* fix: loadAll/reloadAll resolve with up-to-date store values
  - How to migrate:
    - Using loadAll/reloadAll with a single store (not an array) now resolves to a single value (not in an array). If you are indexing into the array, this must be changed to use the value directly.
    - When loadAll/reloadAll resolves it gives you the store values at that moment. Previously it would give you the values of the stores current load process at the time loadAll/reloadAll was called. This means updates made to stores while loadAll/reloadAll is still pending will now be reflected in the resolved values. If you wish to avoid this behavior for specific stores, you must now load them individually.
- feat: throw an error when testing mode enabled after store creation

## 1.0.14 (2023-2-10)

- fix: add additional property support for asyncClients to allow for better mocking/testing

## 1.0.13 (2023-1-6)

- fix: allow asyncClients to be seperately mocked
- use cookie-storage instead js-cookie

## 1.0.12 (2022-12-23)

- fix: reloading child with mutliple routes to ancestor now reloads ancestor once

## 1.0.11 (2022-11-08)

-fix: writable with single parent calls setter with array

## 1.0.10 (2022-11-07)

- *BREAKING CHANGE* feat: stores now take an options object instead of separate parameters for reloadable and initial
  - How to migrate: async stores that have been marked as reloadable, or have been given a non default initial value, must be changed to receive an options object as the last parameter with the following format: `{ reloadable: true, initial: someValue }`
- feat: add persisted stores (synchronized value with storage items or cookies)
- feat: add asyncClient stores (proxies async stores so their values can be interacted with before loading)
- feat: add logAsyncErrors configuration function (allows automatic logging of async load errors)
- feat: add track state feature for async stores. `trackState` can be provided as an option upon store creation. This will generate a second store that can be used for reactive conditional rendering based on the primary store's load state.
- fix: loading a store will ensure that there is a subscriber to that store for the duration of the load process. This ensures that the `start` function of the store, or of any parent stores, is still run if the store is loaded without any other active subscribers. It additionally ensures that derived stores receive value updates from any changes to parents.
- *BREAKING CHANGE* feat: `flagForReload` replaced by `reset` function. Reset puts the store in its initial state when reset is called, rather than upon next load of the store like flagForReload.
  - How to migrate: change usages of `flagForReload()` to `reset()`;
- feat: async stores support fetch aborts via abort controllers. Fetch requests in an async store's load function can be aborted using an abort controller to prevent the store's value from updating without resulting in a load rejection.
- feat: add `rebounce` function. `rebounce` wraps an async function to automatically abort any in-flight calls to that function when a new call is made. This can be used in a store's load function to prevent race condition bugs that can arise from multiple near-concurrent updates.

## <small>0.2.3 (2022-09-20)</small>

- fix: loading a readable/writable store will run start function

## <small>0.2.2 (2022-09-20)</small>

- fix: unsubscribing from async stores now correctly unsubscribes from parents
- chore: add type guards to output of loadable checks

## 0.2.0 (2022-07-09)

- *BREAKING CHANGE* feat: add load functionality to readable/writable stores
  - readable and writable stores now include a `load` function, the same as the other stores.
  - This load function resolves when the store is first `set`.
  - If the store is given an initial value that is not undefined, it will `load` immeadietly.
  - How this might break your app: derived / asyncDerived stores only `load` after every parent has loaded. If you derive from a readable or writable store, the derived store will now only load after the readable or writable store has loaded.
  - How to migrate: If you want a readable / writable store to load before it has been given a final value, initialize the store with a value of 'null' rather than undefined.

## <small>0.1.5 (2022-06-16)</small>

- feat: safeLoad function for catching load errors

## <small>0.1.3 (2022-05-08)</small>

- fix: remove non-functional isLoading property
- feat: add testing mode
- feat: asyncWritable mappingWriteFunction passed previous value of store
