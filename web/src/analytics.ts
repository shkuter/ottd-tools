import { useEffect } from 'react';
import { useLocation } from 'react-router';

/**
 * Pageview counting through GoatCounter: cookie-free, so the site needs no consent banner,
 * and it stores no personal data.
 *
 * The script is loaded from here rather than from a tag in index.html because counting has to
 * be manual anyway (`no_onload`), for two reasons:
 *
 *  - the router swaps tabs without a page load, so only the first hit would ever be recorded;
 *  - paths must be reported without the deployment's base path, so the dashboard lists
 *    /income instead of /ottd-tools/income.
 *
 * Owning the tag keeps the two in step: hits raised before count.js arrives wait in a queue
 * instead of racing it. If the script never loads — blocked, offline, GoatCounter down — the
 * queue drains nowhere and nothing else in the app notices.
 */

// The site registered on goatcounter.com. Not a secret: it is visible in every request the
// page makes. Until the site exists there, counting is simply a no-op.
const ENDPOINT = 'https://ottd-tools.goatcounter.com/count';
const SCRIPT = 'https://gc.zgo.at/count.js';

let requested = false;
const queue: string[] = [];

function flush() {
  const count = window.goatcounter?.count;
  if (!count) return;
  while (queue.length) count({ path: queue.shift()!, title: document.title });
}

function load() {
  requested = true;
  // count.js reads its settings off this object and adds count() to it once it loads
  window.goatcounter = { no_onload: true };
  const tag = document.createElement('script');
  tag.async = true;
  tag.src = SCRIPT;
  tag.dataset.goatcounter = ENDPOINT;
  tag.addEventListener('load', flush, { once: true });
  // a blocked or failed script leaves the queue where it is; drop it so it cannot grow
  tag.addEventListener('error', () => void (queue.length = 0), { once: true });
  document.head.append(tag);
}

/** Records one pageview. Paths are router paths, i.e. without the base path. */
export function countPageview(path: string) {
  // dev runs would report against the live site; count.js ignores localhost anyway
  if (!import.meta.env.PROD) return;
  queue.push(path);
  if (!requested) load();
  else flush();
}

/** Counts a pageview whenever the router changes tabs. */
export function usePageviews() {
  const { pathname } = useLocation();
  useEffect(() => {
    // '/' only ever redirects to /optimizer; counting both would double every fresh visit
    if (pathname !== '/') countPageview(pathname);
  }, [pathname]);
}
