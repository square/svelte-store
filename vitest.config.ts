import { defineConfig } from 'vitest/config';
import { compile, VERSION } from 'svelte/compiler';

export default defineConfig({
  // Compile fixtures with the installed Svelte version, including older majors.
  plugins: [
    {
      name: 'svelte-test-fixtures',
      transform(source, filename) {
        if (!filename.endsWith('.svelte')) return;
        return compile(source, {
          filename,
          generate: Number(VERSION.split('.')[0]) >= 5 ? 'client' : 'dom',
        }).js;
      },
    },
  ],
  resolve: { conditions: ['browser'] },
  test: {
    globals: true,
    include: ['./test/**/*.test.ts'],
    environment: 'jsdom',
  },
});
