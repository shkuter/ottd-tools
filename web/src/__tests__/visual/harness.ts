import { existsSync } from 'node:fs';
import { afterAll, beforeAll } from 'vitest';
import { fileURLToPath } from 'node:url';
import { preview, type PreviewServer } from 'vite';
import { chromium, type Browser, type Page } from 'playwright';
import { GAME_SNAPSHOT } from '../../features/savegame/__tests__/gameSnapshot';
import { SNAPSHOT_DB } from '../../savegame/snapshotStore';

/**
 * Serves the built bundle and opens it in a real browser.
 *
 * The built bundle, not the dev server: in dev every CSS module arrives as its
 * own <style> as the module is imported, in production as one file in import
 * order — and the cascade is half of what these checks are about. `make
 * check-visual` depends on `build`, so dist is fresh.
 *
 * The browser is Playwright's own Chromium, pinned by the version of the
 * playwright package: a browser's own defaults are among the things being
 * checked, so it matters which browser those defaults come from. It is not
 * downloaded by `npm install` — that takes `npx playwright install chromium`,
 * once — and CHROME_PATH points the checks at another build instead.
 */

const WEB_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const VIEWPORT = { width: 1440, height: 900 };

export interface Harness {
  /** Opens an app route; `ready` is a selector to wait for beyond the shell. */
  goto(path: string, ready?: string): Promise<Page>;
  close(): Promise<void>;
}

async function launch(): Promise<Browser> {
  const executablePath = process.env.CHROME_PATH;
  try {
    return await chromium.launch(executablePath ? { executablePath } : {});
  } catch (cause) {
    throw new Error(
      'check-visual needs a browser to look at the page with, and could not start one' +
        (executablePath ? ` at CHROME_PATH=${executablePath}` : '') +
        '. Run `npx playwright install chromium` in web/ (the package ships no browser of ' +
        'its own), or point CHROME_PATH at a Chromium build you already have.',
      { cause },
    );
  }
}

async function serve(): Promise<PreviewServer> {
  if (!existsSync(`${WEB_ROOT}dist/index.html`)) {
    throw new Error(
      'check-visual reads the built bundle and web/dist is not there. Run `make check-visual` ' +
        '(it builds first) or `make build`.',
    );
  }
  return preview({
    root: WEB_ROOT,
    configFile: `${WEB_ROOT}vite.config.ts`,
    preview: { host: '127.0.0.1', port: 0, strictPort: false, open: false },
  });
}

/**
 * Harness for one test file: opened before the tests, closed after them. Every
 * check file needs exactly this, so it is written here once rather than as the
 * same three lines at the top of each.
 */
export function harnessFixture(): () => Harness {
  let harness: Harness;
  beforeAll(async () => {
    harness = await openHarness();
  });
  afterAll(async () => {
    await harness?.close();
  });
  return () => harness;
}

async function openHarness(): Promise<Harness> {
  const server = await serve();
  const base = server.resolvedUrls?.local?.[0];
  if (!base) throw new Error('check-visual: the preview server reported no address to open');

  const browser = await launch();
  // a fixed viewport, or an assertion about horizontal scrolling would depend on
  // the window of whoever runs the checks; a fresh context, or persisted
  // settings would decide which tabs exist
  const context = await browser.newContext({ viewport: VIEWPORT, reducedMotion: 'reduce' });
  const page = await context.newPage();

  const goto = async (path: string, ready?: string) => {
    await page.goto(new URL(path.replace(/^\//, ''), base).href, { waitUntil: 'networkidle' });
    // the shell itself; a lazily loaded tab is waited for through `ready`
    await page.waitForSelector('.app-header');
    if (ready) await page.waitForSelector(ready);
    /* A measurement taken mid-transition reads a colour that is on its way
       somewhere else. reducedMotion alone is a hint the library is free to
       ignore, so the transitions are cut outright. */
    await page.addStyleTag({
      content: '*, *::before, *::after { transition: none !important; animation: none !important }',
    });
    return page;
  };

  /*
   * The game tab is only offered once a savegame has been imported, so the checks import
   * one. Written on the page rather than through an init script: the app reads the database
   * as it starts, and a write racing that read would sometimes lose. Opening the app once,
   * writing, then letting every later goto() reload is race-free — the record persists in
   * the context.
   */
  await goto('/optimizer');
  // the names of the database come from the store itself: this code runs inside the page,
  // where it cannot import them, so they are handed over as an argument instead of copied
  await page.evaluate(
    async ({ record, db: names }) => {
      await new Promise<void>((resolve, reject) => {
        const open = indexedDB.open(names.name, names.version);
        open.onupgradeneeded = () => {
          if (!open.result.objectStoreNames.contains(names.store)) {
            open.result.createObjectStore(names.store);
          }
        };
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction(names.store, 'readwrite');
          tx.objectStore(names.store).put(record, names.key);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
        open.onerror = () => reject(open.error);
      });
    },
    { record: GAME_SNAPSHOT, db: SNAPSHOT_DB },
  );

  return {
    goto,
    close: async () => {
      await context.close();
      await browser.close();
      await new Promise<void>((resolve, reject) =>
        server.httpServer.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}
