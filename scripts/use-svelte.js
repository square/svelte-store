// Points node_modules/svelte at a locked svelte-<version> alias from package.json.
import { existsSync, readFileSync, rmSync, symlinkSync } from 'node:fs';

const version = process.argv[2];
if (existsSync(`node_modules/svelte-${version}`)) {
  rmSync('node_modules/svelte', { recursive: true, force: true });
  symlinkSync(`svelte-${version}`, 'node_modules/svelte');
}

const installed = JSON.parse(
  readFileSync('node_modules/svelte/package.json', 'utf8')
).version;
if (installed !== version) {
  console.error(`Expected Svelte ${version}, found ${installed}`);
  process.exit(1);
}
