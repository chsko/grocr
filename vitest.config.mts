import { defineConfig } from 'vitest/config';

// Vitest runs the Convex backend tests (convex-test). The app's tests run in Jest (jest-expo).
export default defineConfig({
  test: {
    environment: 'edge-runtime',
    include: ['convex/**/*.test.ts', 'scripts/**/*.test.mjs'],
    server: { deps: { inline: ['convex-test'] } },
  },
});
