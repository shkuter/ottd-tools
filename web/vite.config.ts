import { readFileSync } from 'node:fs'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Single source of truth for the app version: package.json, bumped by scripts/release.sh.
// Inlined at build time as __APP_VERSION__ (declared in src/globals.d.ts).
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  test: {
    setupFiles: ['src/test/setup.ts'],
  },
})
