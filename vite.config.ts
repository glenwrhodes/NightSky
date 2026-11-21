import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: { port: 5173 },
  build: {
    // The whole star catalogue (9,096 stars with motions, ~520 kB of JSON, ~220 kB gzipped) is
    // bundled on purpose so the app works offline with no loading step. Warn only above that.
    chunkSizeWarningLimit: 800,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
