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
