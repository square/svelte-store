<script>
  export let count;
  export let doubled;
  export let remote;
  export let saved;
  export let preference;
  export let lifecycle;
  const remoteState = remote.state;
  const writeState = saved.state;
  let pending = remote.load();
</script>

<h1>Store compatibility</h1>
<label>Count <input type="number" bind:value={$count} /></label>
<button on:click={() => $count += 1}>Increment</button>
<p data-testid="count">Count: {$count}</p>
<p data-testid="doubled">Doubled: {$doubled}</p>
<p data-testid="lifecycle">{$lifecycle}</p>

<button on:click={() => pending = remote.reload()}>Reload</button>
<p data-testid="load-state">
  {$remoteState.isLoading ? 'Loading' : $remoteState.isReloading ? 'Reloading' : $remoteState.isError ? 'Error' : 'Loaded'}
</p>
{#await pending}
  <p data-testid="result">Waiting for data</p>
{:then}
  <p data-testid="result">{$remote}</p>
{:catch error}
  <p role="alert">{error.message}</p>
{/await}

<button on:click={() => saved.set('optimistic')}>Save</button>
<p data-testid="saved">{$saved}</p>
<p data-testid="write-state">{$writeState.isWriting ? 'Writing' : 'Settled'}</p>

<label>Preference <input bind:value={$preference} /></label>
<button on:click={() => preference.clear()}>Clear preference</button>
