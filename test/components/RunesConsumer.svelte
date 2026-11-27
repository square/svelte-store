<script>
  let { count } = $props();
  const doubled = $derived($count * 2);
</script>

<h2>Runes</h2>
<label>Runes count <input type="number" bind:value={$count} /></label>
<button onclick={() => $count += 1}>Increment with runes</button>
<p data-testid="runes-doubled">Runes doubled: {doubled}</p>
