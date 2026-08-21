import { readFileSync } from 'node:fs'
import { defineConfig } from 'vitest/config'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Single source of truth for the app version: package.json, bumped by scripts/release.sh.
// Inlined at build time as __APP_VERSION__ (declared in src/globals.d.ts).
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

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
  },
  test: {
    setupFiles: ['src/test/setup.ts'],
  },
})
