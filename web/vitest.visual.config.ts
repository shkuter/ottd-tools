import { defineConfig } from 'vitest/config'

/**
 * The rendered-page checks: they build nothing and render nothing themselves, they
 * open the production bundle in a real browser and ask what it looks like.
 *
 * Kept out of the ordinary run (see `test.exclude` in vite.config.ts) because that
 * one has to work with Node alone — `npm ci` on the Pages runner installs no
 * browser, and `npx vitest run` there must not try to launch one.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.visual.test.ts'],
    // src/test/setup.ts stubs `window` and `localStorage` for the Node run; here the
    // page has the real ones and the stubs would only get in the way.
    setupFiles: [],
    // starting Chrome and serving a fresh bundle does not fit in the 5s default
    testTimeout: 180_000,
    hookTimeout: 120_000,
    // one browser at a time: the checks measure a live layout, and several pages
    // competing for the machine make the measurements drift
    fileParallelism: false,
  },
})
