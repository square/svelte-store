# Browser compatibility checks

Run `yarn install --frozen-lockfile` and `yarn test:browser`, then open the URL printed by Vite. The page consumes the built `lib/` files and compiles its components with the installed Svelte version. It uses local simulated requests; no account or service access is needed.

1. Confirm the displayed Svelte version, `Count: 1`, `Doubled: 2`, and `Loaded 1` after the initial loading state.
2. Click **Increment** and edit **Count**. Both count displays and the doubled values must update. With Svelte 5, also edit **Runes count** and click **Increment with runes**; the legacy component must stay in sync.
3. Click **Reload**. Confirm `Reloading` and `Waiting for data`, followed by `Loaded 2`.
4. Click **Fail next load**, then **Reload**. Confirm `Error` and `Unable to load`. Reload again and confirm recovery to `Loaded` with fresh data.
5. Click **Save**. Confirm `optimistic` and `Writing`, followed by `canonical` and `Settled`.
6. Change **Preference**, reload the page, and confirm the value persists. Click **Clear preference** and confirm the input clears; after a page reload it returns to `blue`.
7. Click **Unmount components**. The component content must disappear and the subscription start/stop counts must match. Mount again and confirm one new subscription, working controls, and the saved preference.
8. Check the browser console for unexpected errors.

The automated component tests cover these interactions under Svelte 3, 4 and 5. The runes fixture is only loaded on Svelte 5. To repeat the browser checks for another major locally, run `yarn use-svelte 3.59.2` (or `4.2.20`, `5.0.0`), then restart `yarn test:browser`. Restore the default afterwards with `rm node_modules/svelte && yarn install --frozen-lockfile --check-files`.
