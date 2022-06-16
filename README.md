# Square Svelte Store

Extension of svelte default stores for dead-simple handling of complex asynchronous behavior.

## What it does

Square Svelte Store builds upon Svelte's default store behavior to empower your app to reactively respond to asynchronous data. Familiar syntax lets you build out async stores as easily as the ones you are already using, with full compatibility between them. Behind-the-scenes smarts handle order of operations, lazy loading, and limiting network calls, allowing you to focus on the relationships between data.

*A preview...*

```javascript
// You can declare an asyncDerived store just like a derived store,
// but with an async function to set the store's value!
const  searchResults = asyncDerived(
  [authToken, searchTerms],
  async ([$authToken, $searchTerms]) => {
    const rawResults = await search($authToken, $searchTerms);
    return formatResults(rawResults);
  }
);
```

## The Basics

Square Svelte Store is intended as a replacement for importing from `svelte/store`. It includes all of the features of `svelte/store` while also extending the functionality of some stores and adding some new ones.

### Loadable

The new async stores are a new type: `Loadable`. Loadable stores work the same as regular stores--you can derive from them, subscribe to them, and access their value reactively in a component by using the `$` accessor. But they also include extra functionality: a `load` function is available on every loadable store. This function is asynchronous, and resolves to the value of the store after it has finished its async behavior. This lets you control the display of your app based on the status of async routines while also maintaining reactivity!

```javascript
{#await myLoadableStore.load()}
 <p>Currently loading...</p>
{:then}
 <p>Your loaded data is: {$myLoadableStore}</p>
{/await}
```

What's better is that any store that derives from a Loadable store will *also* be Loadable, and awaiting the derived store will automatically await for any asynchronous parents to finish loading. This means that *no matter how complex* the relationships between your async and synchronous data gets you will *always* be able to ensure that a given store has its final value simply by awaiting `.load()`!

### Reloadable

While hydrating your app with data, some endpoints you will only need to access once. Others you will need to access multiple times. By default async stores will only load once unless a store they derive from changes. However if you would like an async store to be able to load new data you can declare it to be `Reloadable` during creation. If you do so, the store, and any stores that ultimately derive from it, will have access to a `reload` function. Calling the reload function of a Reloadable store will cause it fetch new data, and calling the reload function of any store that derives from a Reloadable store will cause that Reloadable store to reload. In this manner you can call reload on a store and it will reload any sources of data that should be refreshed without unnecessarily creating promises for data that should not be refreshed.

## The New Stores

### asyncReadable

An asyncReadable store is a Loadable store that provides easy asynchronous support to readable stores. Like a readable store, an asyncReadable store takes in an initial value and a function that is called when the store is first subscribed to. For an asyncReadable store this function is an async `loadFunction` which takes no arguments and returns the loaded value of the store. An optional third parameter can specify if the store is Reloadable or not (false by default).

*asyncReadable stores are super simple! Let's see it in action...*

```javascript
const userInfo = asyncReadable(
  {},
  async () => {
    const response = await fetch('https://ourdomain.com/users/info');
    const userObject = await response.json();
    return userObject;
  },
  true
);
```

Now we have a Loadable and Reloadable userInfo store! As soon as our app renders a component that needs data from userInfo it will begin to load. We can `{#await userInfo.load()}` in our components that need userInfo. This will delay rendering until we have the data we need. Since we have provided `true` as a third argument we can call `userInfo.reload()` to pull new data and reactively update once we have it.

## derived

Okay this isn't a new store, but it does have some new features! We declare a derived store the same as ever, but if we derive from any Loadable store the derived store will also be Loadable, and the same for Reloadable.

*What does that mean for our app..?*

```javascript
const userSettings = derived(userInfo, ($userInfo) => $userInfo?.settings);
const darkMode = derived(userSettings, ($userSetting) => $userSettings?.darkMode);
```

Now we've got a darkMode store that tracks whether our user has selected darkMode for our app. When we use this store in a component we can use `darkMode.load()` to await userInfo to finish loading, and we can call `darkMode.reload()` to get new userInfo if we encounter a situation where the user's darkMode setting may have changed. This isn't very impressive with our simple example, but as we build out our app and encounter situations where derived values come fom multiple endpoints through several layers of derivations this becomes much more useful.  Being able to call load and reload on just the data you need is much more convenient than tracking down all of the dependencies involved!

## asyncDerived

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

Here we have a store that reflects a paginated set of results from an endpoint. Just like a regular derived store we include a function that maps the values of parent stores to the value of this store. Of course with an async store we use an async function. However, while regular derived stores will invoke that function whenever any of the parent values changes (including initialization) an asyncDerived store will only do so after all of the parents have finished loading. This means you don't need to worry about creating unnecessary or premature network calls. After the stores have finished loading any new changes to the parent stores will create a new network request. In this example if we write to the page store when the user changes pages we will automatically make a new request that will update our results store. Just like with asyncReadable stores we can include a boolean to indicate that an asyncDerived store will be Reloadable.

## asyncWritable

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

For example...

```
try {
  await myAsyncStore.set('set state');
} catch {
  await myAsyncStore.set('laoded state');
}
```

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
  rules: {'square-svelte-store/use-square-svelte-store': 'error'}
}
```

## Testing

Testing mode can be enabled using the `enableStoreTestingMode` function before running your tests. If testing mode is enabled async stores will include an additional function, `flagForReload`. This function can be called in between tests in order to force stores to reload the next time they are `load`ed. This is useful to test different load conditions for your app, such as endpoint failures.
