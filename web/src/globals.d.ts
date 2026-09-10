/** App version from package.json, inlined by the `define` block in vite.config.ts. */
declare const __APP_VERSION__: string;

/** Release date of that version, read from CHANGELOG.md by the same `define` block. */
declare const __APP_DATE__: string;

/** count.js from GoatCounter, loaded on demand by src/analytics.ts. */
interface Window {
  goatcounter?: {
    /** Set before the script loads: it counts nothing on its own, analytics.ts does it. */
    no_onload?: boolean;
    count?: (vars: { path: string; title?: string; referrer?: string; event?: boolean }) => void;
  };
}
