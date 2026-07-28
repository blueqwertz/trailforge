import { defineConfig } from 'vitest/config';

// Contract-Tests gegen die echten Dienste. Bewusst nicht Teil der CI, damit die
// freiwillig betriebenen Server (brouter.de, photon.komoot.io) nicht bei jedem
// Push Last bekommen.
export default defineConfig({
  test: {
    globals: true,
    include: ['test/**/*.live.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
