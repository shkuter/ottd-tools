import { readFileSync } from 'node:fs'
import { configDefaults, defineConfig } from 'vitest/config'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Single source of truth for the app version: package.json, bumped by scripts/release.sh.
// Inlined at build time as __APP_VERSION__ (declared in src/globals.d.ts).
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

// The release date, inlined next to the version as __APP_DATE__. scripts/release.sh writes
// both in the same commit — the version into package.json, the dated section into
// CHANGELOG.md — so the changelog already holds the date and nothing has to record it twice.
// It deliberately does not come from the data pipeline: a date stamped at generation time
// rewrites meta.json on every `make data`, and a dirty tree blocks the release.
const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8')
const heading = `## [${pkg.version}] - `
const released = changelog.split('\n').find((line) => line.startsWith(heading))
if (!released) {
  throw new Error(`vite.config: CHANGELOG.md has no dated section for ${pkg.version}`)
}
const releaseDate = released.slice(heading.length).trim()

// GitHub Pages serves the site from a project subpath, and it is static: a direct hit on
// /ottd-tools/income has no file behind it. Pages answers unknown paths with 404.html, so
// shipping a copy of index.html under that name hands the URL to the router instead.
function spaFallback(): Plugin {
  return {
    name: 'spa-404-fallback',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const index = bundle['index.html']
      if (index?.type !== 'asset') {
        this.error('spa-404-fallback: index.html is missing from the bundle')
      }
      this.emitFile({ type: 'asset', fileName: '404.html', source: index.source })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  // The site lives under github.io/ottd-tools/; kept on the dev server too, so local runs
  // hit the same paths production does.
  base: '/ottd-tools/',
  plugins: [react(), spaFallback()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_DATE__: JSON.stringify(releaseDate),
  },
  test: {
    setupFiles: ['src/test/setup.ts'],
    // The rendered-page checks need a browser and a built bundle, which the Pages
    // runner has neither of — they run from vitest.visual.config.ts instead, so this
    // command stays the Node-only one it is in `make test` and in pages.yml. The
    // defaults are spread back in: replacing `exclude` drops node_modules with it.
    exclude: [...configDefaults.exclude, '**/*.visual.test.ts'],
  },
})
