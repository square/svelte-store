# Square Svelte Store

Extension of svelte default stores for dead-simple handling of complex asynchronous behavior.

## What it does

Square Svelte Store builds upon Svelte's default store behavior to empower your app to reactively respond to asynchronous data. Familiar syntax lets you build out async stores as easily as the ones you are already using, with full compatibility between them. Behind-the-scenes smarts handle order of operations, lazy loading, and limiting network calls, allowing you to focus on the relationships between data.

*A preview...*

```javascript
// You can declare an asyncDerived store just like a derived store,
// but with an async function to set the store's value!
const searchResults = asyncDerived(
  [authToken, searchTerms],
  async ([$authToken, $searchTerms]) => {
    const rawResults = await search($authToken, $searchTerms);
    return formatResults(rawResults);
  }
);
```

## The Basics

Square Svelte Store is intended as a replacement for importing from `svelte/store`. It includes all of the features of `svelte/store` while also adding new stores and extending functionality for compatibility between them.

### Loadable

Stores exported by @square/svelte-store are a new type: `Loadable`. Loadable stores work the same as regular stores--you can derive from them, subscribe to them, and access their value reactively in a component by using the `$` accessor. But they also include extra functionality: a `load` function is available on every store. This function is asynchronous, and resolves to the value of the store after it has finished its async behavior. This lets you control the display of your app based on the status of async routines while also maintaining reactivity!

```javascript
{#await myLoadableStore.load()}
 <p>Currently loading...</p>
{:then}
 <p>Your loaded data is: {$myLoadableStore}</p>
{/await}
```

What's better is that any derived store loads all of its parents before loading itself, allowing you to `await`loading of the derived store to automatically wait for all required data dependencies. This means that *no matter how complex* the relationships between your async and synchronous data gets you will *always* be able to ensure that a given store has its final value simply by awaiting `.load()`!

### Reloadable

While hydrating your app with data, some endpoints you will only need to access once. Others you will need to access multiple times. By default async stores will only load once unless a store they derive from changes. However if you would like an async store to be able to load new data you can declare it to be `reloadable` during creation. If you do so, the store, and any stores that ultimately derive from it, will have access to a `reload` function. Calling the reload function of a Reloadable store will cause it fetch new data, and calling the reload function of any store that derives from a Reloadable store will cause that Reloadable store to reload. In this manner you can call reload on a store and it will reload any sources of data that should be refreshed without unnecessarily creating promises for data that should not be refreshed.

## The New Stores

### asyncReadable

An asyncReadable store provides easy asynchronous support to readable stores. Like a readable store, an asyncReadable store takes in an initial value and a function that is called when the store is first subscribed to. For an asyncReadable store this function is an async `loadFunction` which takes no arguments and returns the loaded value of the store. An optional third parameter can specify options for the store, in this case declaring it to be reloadable.

*asyncReadable stores are super simple! Let's see it in action...*

```javascript
const userInfo = asyncReadable(
  {},
  async () => {
    const response = await fetch('https://ourdomain.com/users/info');
    const userObject = await response.json();
    return userObject;
  },
  {reloadable: true}
);
```

Now we have a Loadable and reloadable userInfo store! As soon as our app renders a component that needs data from userInfo it will begin to load. We can `{#await userInfo.load()}` in our components that need userInfo. This will delay rendering until we have the data we need. Since we have declared the store to be reloadable we can call `userInfo.reload()` to pull new data (and reactively update our components once we have it).

### derived

Okay this isn't a new store, but it does have some new features! We declare a derived store the same as ever, but it now gives us access to a `load` function. This load function resolves after all parents have loaded and the derived store has calculated its final value.

*What does that mean for our app..?*

```javascript
const userSettings = derived(userInfo, ($userInfo) => $userInfo?.settings);
const darkMode = derived(userSettings, ($userSetting) => $userSettings?.darkMode);
```

Now we've got a darkMode store that tracks whether our user has selected darkMode for our app. When we use this store in a component we can call `darkMode.load()`. This awaits userSettings loading, which in turn awaits userInfo. In this way, we can load a derived store to automatically load the sources of its data and to wait for its final value. What's more, since darkMode derives from a reloadable source, we can call `darkMode.reload()` to get new userInfo if we encounter a situation where the user's darkMode setting may have changed.

This isn't very impressive with our simple example, but as we build out our app and encounter situations where derived values come fom multiple endpoints through several layers of derivations this becomes much more useful. Being able to call load and reload on just the data you need is much more convenient than tracking down all of the dependencies involved!

### asyncDerived

An asyncDerived store works just like a derived store, but with an asynchronous call to get the final value of the store!

*Let's jump right in...*

```javascript
const results = asyncDerived(
  [authToken, page],
  async ([$authToken, $page]) => {
    const requestBody = JSON.stringify({ authorization: $authToken });
    const response = await fetch(
      `https://ourdomain.com/list?page=${$page}`,
      requestBody
    );
    return response.json();
  }
);
```

Here we have a store that reflects a paginated set of results from an endpoint. Just like a regular derived store we include a function that maps the values of parent stores to the value of this store. Of course with an async store we use an async function. However, while regular derived stores will invoke that function whenever any of the parent values changes (including initialization) an asyncDerived store will only do so after all of the parents have finished loading. This means you don't need to worry about creating unnecessary or premature network calls.

After the stores have finished loading any new changes to the parent stores will create a new network request. In this example if we write to the page store when the user changes pages we will automatically make a new request that will update our results store. Just like with asyncReadable stores we can include a boolean to indicate that an asyncDerived store will be Reloadable.

### asyncWritable

Here's where things get a little more complicated. Just like the other async stores this store mirrors an existing store. Like a regular writable store this store will have `set` and `update` functions that lets you set the store's value. But why would we want to set the value of the store if the store's value comes from a network call? To answer this let's consider the following use case: in our app we have a list of favorite shortcuts for our user. They can rearrange these shortcuts in order to personalize their experience. When a user rearranges their shortcuts we could manually make a new network request to save their choice, then reload the async store that tracks the list of shortcuts. However that would mean that the user would not see the results of their customization until the network request completes. Instead we can use an asyncWritable store. When the user customizes their list of shortcuts we will optimistically update the corresponding store. This update kicks off a network request to save the user's customization to our backend. Finally, when the network request completes we update our store to reflect the canonical version of the user's list.

*So how do we accomplish this using an asyncWritable store..?*

```javascript
const shortcuts = asyncWritable(
  [],
  async () => {
    const response = await fetch('https://ourdomain.com/shortcuts');
    return response.json();
  },
  async (newShortcutsList) => {
    const postBody = JSON.stringify({ shortcuts: newShortcutsList });
    const response = await fetch('https://ourdomain.com/shortcuts', {
      method: 'POST',
      body: postBody,
    });
    return response.json();
  }
);
```

Our first two arguments work just like an asyncDerived store--we can pass any number of stores and we can use their values to set the value of the store once the parents have loaded. If we don't need to derive from any store we can pass `[]` as our first argument. For our third argument we optionally provide a write function that is invoked when we `set` or `update` the value of the store ourself. It takes in the new value of the store and then performs the work to persist that to the backend. If we invoke `shortcuts.set()` first the store updates to the value we pass to the function. Then it invokes the async function we provided during definition in order to persist the new data. Finally it sets the value of the store to what we return from the async function. If our endpoint does not return any useful data we can instead have our async function return void and skip this step.

One final feature is that we can include a second argument for our write function that will receive the values of parent stores.

*Let's look at what that looks like...*

```javascript
const shortcuts = asyncWritable(
  authToken,
  async ($authToken) => {
    const requestBody = JSON.stringify({ authorization: $authToken });
    const response = await fetch(
      'https://ourdomain.com/shortcuts',
      requestBody
    );
    return response.json();
  },
  async (newShortcutsList, $authToken) => {
    const postBody = JSON.stringify({
      authorization: $authToken,
      shortcuts: newShortcutsList,
    });
    const response = await fetch('https://ourdomain.com/shortcuts', {
      method: 'POST',
      body: postBody,
    });
    return response.json();
  }
);
```

In this example we derive from an authToken store and include it in both our GET and POST requests.

Some niche features of asyncWritable stores allow for more specific error handling of write functions. The write function we provide as the third argument can be written to accept a third argument that receives the value of the store before it was set. This allows for resetting the value of the store in the case of a write failure by catching the error and returning the old value. A similar feature is that both the `set` and `update` functions can take a second argument that indicates whether the async write functionality should be called during the set process.

### readable/writable

Similarly to derived stores, addtional load functionality is bundled with readable and writable stores. Both readable and writable stores include a `.load()` function that will resolve when the value of the store is first set. If an initial value is provided when creating the store, this means the store will load immeadietly. However, if a value is not provided (left `undefined`) then the store will only load after it is set to a value. This makes it easy to wait on user input, an event listener, etc. in your application.

*It's easy to wait for user input...*

```javascript
<script>
  const hasConsent = writable((set) => {
    const setConsent = () => set(true);
    addEventListener('CONSENT_EVENT', setConsent);

    return () => removeEventListener('CONSENT_EVENT', setConsent);  
  });
  const needsConsent = asyncDerived(
    (hasConsent),
    async ($hasConsent) => {
      // this won't run until hasConsent has loaded
      if (!$hasConsent) {
        return "no consent given"
      }
      const asyncMessage = await Promise.resolve('data fetched from server');
      return asyncMessage;
    }
  );
</script>

<button on:click={() => hasConsent.set(true)>I consent!</button>
<button on:click={() => hasConsent.set(false)>I don't consent!</button>

{#await needsConsent.load()}
  <p>I will only load after hasConsent has been populated</p>
  <p>{$needsConsent}</p>
{/await}
```

### persisted (BETA)

Sometimes data needs to persist outside the lifecycle of our app. By using persisted stores you can accomplish this while gaining all of the other benefits of Loadable stores. A persisted store synchronizes (stringifiable) store data with a sessionStorage item, localStorage item, or cookie. The persisted store loads to the value of the corresponding storage item, if found, otherwise it will load to the provided initial value and persist that value to storage. Any changes to the store will also be persisted!

*We can persist a user name across page loads...*

```javascript
<script>
  // if we don't specify what kind of storage, default to localStorage
  const userName = persisted('John Doe', 'USER_DATA');
</script>

// If we reload the page, this input will still have the same value!
<input bind:value={$userName}>
```

If data isn't already in storage, it may need to be fetched asynchronously. In this case we can pass a Loadable store to our persisted store in place of an initial value. Doing so will load the Loadable store if no storage item is found and then synchronize the persisted store and storage with the loaded value. We can also declare the persisted store to be reloadable, in which case a call to `.reload()` will attempt to reload the parent Loadable store and persist the new data to storage.

*Persisting remote data is simple...*

```javascript
const remoteSessionToken = asyncReadable(
  undefined, 
  async () => {
    const session = await generateSession();
    return session.token;
  },
  { reloadable: true, storageType: StorageType.SESSION_STORAGE },
);

const sessionToken = persisted(
  remoteSessionToken,
  'SESSION_TOKEN',
  {reloadable: true}
);
```

With this setup we can persist our remote data across a page session! The first page load of the session will load from the remote source, but successive page loads will use the persisted token in session storage. What's more is that because Loadable stores are lazily loaded, `remoteSessionToken` will only fetch remote data when its needed for `sessionToken` (provided there are no other subscribers to `remoteSessionToken`). If our session token ever expires we can force new data to be loaded by calling `sessionToken.reload()`!

If an external source updates the storage item of the persisted store the two values will go out of sync. In such a case we can call `.resync()` on the store in order to update the store the *parsed* value of the storage item.

We are also able to wipe stored data by calling `clear()` on the store. The storage item will be removed and the value of the store set to `null`.

#### persisted configuration / consent

Persisting data to storage or cookies is subject to privacy laws regarding consent in some jurisdictions. Instead of building two different data flows that depend on whether tracking consent has been given or not, you can instead configure your persisted stores to work in both cases. To do so you will need to call the `configurePersistedConsent` function and pass in a consent checker that will accept a `consent level` and return a boolean indicating whether your user has consented to that level of tracking. You can then provide a consent level when building your persisted stores that will be passed to to the checker before storing data.

*Supporting tracking consent is simple...*

```javascript
configurePersistedConsent(
  (consentLevel) =>  window.consentLevels.includes(consentLevel);
);

const hasDismissedTooltip = persisted(
  false, 
  'TOOLTIP_DISMISSED', 
  { 
    storageType: StorageType.COOKIE,
    consentLevel: 'TRACKING'
  }
);
```

Here we hypothesize a setup where a user's consentLevels are accessible through the window object. We would like to track the dismissal of a tooltip and ideally persist that across page loads. To do so we set up a `hasDismissedTooltip` store that can bet set like any other writable store. If the user has consented to the `TRACKING` consent level, then setting the store will also set a `TOOLTIP_DISMISSED` cookie. Otherwise no data will be persisted and the store will initialize to the default value `false` on each page load.

Note that if no consent level is provided, `undefined` will be passed to the consent checker. This can be handled to provide a default consent for your persisted stores when a consent level is not provided.

### state (BETA)

State stores are a kind of non-Loadable Readable store that can be generated alongside async stores in order to track their load state. This can be done by passing the `trackState` to the store options during creation. This is particular useful for reloadable or asyncDerived stores which might go into a state of pulling new data.

*State stores can be used to conditionally render our data...*

```javascript
<script>
  let searchInput;
  const searchTerms = writable();
  const {store: searchResults, state: searchState} = asyncDerived(
    searchTerms,
    async ($searchTerms) => {
      const response = await search($searchTerms);
      return response.results;
    },
    { trackState: true }
  )
</script>
  <input bind:value={searchInput}>
  <button on:click={() => searchTerms.set(searchInput)}>search</button>
  {#if $searchState === LoadState.LOADING}
    <SearchTips />
  {:else if $searchState === LoadState.LOADED}
    <SearchResults results={$searchResults} />
  {:else if $searchState === LoadState.RELOADING }
    <ActivityIcon />
    <SearchResults results={$searchResults} />
  {:else if $searchState === LoadState.ERROR }
    <SearchError />
  {/if}
<input >
```

We are able to easily track the current activity of our search flow using `trackState`. Our `searchState` will initialize to `LOADING`. When the `searchTerms` store is first set it will `load`, which will kick off `searchTerms` own loading process. After that completes searchState will update to `LOADED`. Any further changes to `searchTerms` will kick off a new load process, at which point `searchTerms` will update to `RELOADING`.

Note that trackState is (currently) only available on asyncStores -- asyncReadable, asyncWritable, and asyncDerived.

### asyncClient (BETA)

An asyncClient is a special kind of store that expands the functionality of another Loadable store. Creating an asyncClient allows you to start accessing the propeties of the object in your store before it has loaded. This is done by transforming all of the object's properties into asynchronous functions that will resolve when the store has loaded.

*Confusing in concept, but simple in practice...*

```javascript
const logger = asyncClient(readable(
  undefined,
  (set) => {
    addEventListener('LOGGING_READY', () => {
      set({
        logError: (error) => window.log('ERROR', error.message),
        logMessage: (message) => window.log('INFO', message),
      });
    })
  }
));

logger.logMessage('Logging ready');
```

In this example we assume a hypothetical flow where a `LOGGING_READY` event is fired upon an external library adding a generic logger to the window object. We create a readable store that loads when this event fires, and set up an object with two functions for logging either errors or non-error messages. If we did not use an asyncClient we would need to call logMessage like so:
`logger.load().then(($logger) => $logger.logMessage('Logging ready'))`
However, by turning the readable store into an asyncClient we can instead call `logger.logMessage` immeadietly and the message will be logged when the `LOGGING_READY` event fires.

Note that the asyncClient is still a store, and so can perform all of the store functionality of what it wraps. This means, for example, that you can make an asyncClient of a writable store and have access to the `set` and `update` functions.

Non-function properties of the object loaded by the asyncClient can also be accessed using an async function. I.e. if an asyncClient loads to `{foo: 'bar'}`, `myClient.foo()` will resolve to 'bar' when the asyncClient has loaded.
The property access for an asyncClient is performed dynamically, and that means that *any* property can attempt to be accessed. If the property can not be found when the asyncClient loads, this will resolve to `undefined`. It is recommended to use typescript to ensure that the accessed properties are members of the store's type.

If a store loads directly to a function, an asyncClient can be used to asynchronously invoke that function.

*We can call loaded functions easily...*

```javascript
const logMessage = asyncClient(readable(
  undefined,
  (set) => {
    addEventListener('LOGGING_READY', () => {
      set((message) => window.log('INFO', message));
    })
  }
));

logMessage('Logging ready')
```

Instead of defining a store that holds an object with function properties, we instead have the store hold a function directly. As before, `logMessage` will be called when the `LOGGING_READY` event fires and the store loads.

## Additional functions

### isLoadable and isReloadable

The isLoadable and isReloadable functions let you check if a store is Loadable or Reloadable at runtime.

### loadAll

The loadAll function can take in an array of stores and returns a promise that will resolve when any loadable stores provided finish loading. This is useful if you have a component that uses multiple stores and want to delay rendering until those stores have populated.

### safeLoad

The safeLoad function works similarly to loadAll, however any loading errors of the given stores will be caught, and a boolean returned representing whether loading all of the provided stores was performed successfully or not. This can be useful when you wish to handle possible loading errors, yet still want to render content upon failure.

```javascript
{#await safeLoad(myStore) then loadedSuccessfully}
  {#if !loadedSuccessfully}
    <ErrorBanner/>
  {/if}
  <ComponentContent/>
{/await}
```

### logAsyncErrors

Using safeLoad or `{#await}{:then}{:catch}` blocks in templates allows you to catch and handle errors that occur during our async stores loading. However this can lead to a visibility problem: if you always catch the errors you may not be aware that your users are experiencing them. To deal with this you can pass an error logger into the `logAsyncErrors` function before you set up your stores. Then any time one of our async stores experiences an error while loading it will automatically call your error logging function regardless of how you handle the error downstream.

## Putting it all Together

The usefulness of async stores becomes more obvious when dealing with complex relationships between different pieces of async data.

Let's consider an example scenario that will put our @square/svelte-stores to work.
We are developing a social media website that lets users share and view blogs. In a sidebar we have a list of shortcuts to the users favorite blogs with along with a blurb from their most recent post. We would like to test a feature with 5% of users where we also provide a few suggested blogs alongside their favorites. As the user views new blogs, their suggested list of blogs also updates based on their indicated interests. To support this we have a number of endpoints.

- A `personalization` endpoint provides a list of the user's favorite and suggested blogs.
- A `preview` endpoint lets us fetch a blurb for the most recent post of a given blog.
- A `favorites` endpoint lets us POST updates a user makes to their favorites.
- A `testing` endpoint lets us determine if the user should be included in the feature test.
- A `user` endpoint lets us gather user info, including a token for identifying the user when calling other endpoints.

We've got some challenges here. We need the user's ID before we take any other step. We need to query the testing endpoint before we will know whether to display suggestions alongside favorites. And whenever a users shortcuts update we'll need to update our preview blurbs to match.

Without async stores this could get messy! However by approaching this using stores all we need to worry about is one piece of data at a time, and the pieces we need to get it.

*[Let's look at an interactive implementation...](https://codesandbox.io/s/square-svelte-store-demo-tbvonh?file=/App.svelte)*

## Extras

If you are using eslint, `eslint-plugin-square-svelte-store` will enforce usage of square-svelte-store and can be used to autofix usages of `svelte/store`.

```javascript
// .eslintrc.js
module.exports = {
  plugins: ['square-svelte-store'],
  rules: {'square-svelte-store/use-square-svelte-stores': 'error'}
}
```

## Testing

Testing mode can be enabled using the `enableStoreTestingMode` function before running your tests. If testing mode is enabled async stores will include an additional function, `flagForReload`. This function can be called in between tests in order to force stores to reload the next time they are `load`ed. This is useful to test different load conditions for your app, such as endpoint failures.
