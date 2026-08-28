/**
 * One-off upgrades of saved state that no single store can perform.
 *
 * A store's own `migrate` sees only its own key, and zustand hydrates stores in whatever
 * order their modules happen to be imported. That is enough for a value that stays where it
 * was, but not for one that moves between stores: whichever store woke up first would have
 * rewritten its key already, and the value would be gone before the other looked for it.
 *
 * So this runs once, from the entry point, before any store exists — reading and rewriting
 * the raw keys itself.
 */
/**
 * The keys are spelled out here rather than imported from the stores that own them: an
 * import of a store module is a hydration of that store, which is the very thing these
 * upgrades have to happen before. A wrong key would leave an upgrade doing nothing, so the
 * tests seed and read the real ones.
 */
const SETTINGS_KEY = 'ottd-tools-settings';
const OPTIMIZER_KEY = 'ottd-tools-optimizer';
const INDUSTRY_SUPPLY_KEY = 'ottd-tools-industry-supply';
/** Records which upgrades have run, so each one runs once and later ones still run. */
const UPGRADE_KEY = 'ottd-tools-upgrades';
/** Highest upgrade step defined below. */
const UPGRADE_VERSION = 1;
/**
 * Settings schema version, spelled out for the same reason as the keys. It is only used
 * when this module writes a settings key that did not exist; a test keeps it equal to the
 * store's own `SETTINGS_VERSION`.
 */
const SETTINGS_VERSION = 3;

type Persisted = { state?: Record<string, unknown>; version?: number };

function read(storage: Storage, key: string): Persisted | null {
  try {
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as Persisted) : null;
  } catch {
    // a key that is not ours, or not JSON at all: nothing to carry over
    return null;
  }
}

function write(storage: Storage, key: string, value: Persisted): void {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // a full or read-only storage: the upgrade is not worth failing the app for
  }
}

/**
 * "The line is electrified" was a flag of the optimizer tab, and a second one of the supply
 * tab. It says what the track is, so it became the track type — plain rail carries no wires,
 * electrified rail does. A saved flag on either tab therefore turns into the electrified
 * track, and only where the user had not already picked a track of their own.
 *
 * The flag is then cleared from both tab keys here rather than in their own migrations: a
 * migration runs when its store hydrates, which is before this if the store's module was
 * imported first, and the value would be gone before it could be carried anywhere.
 */
function carryElectrificationIntoTrackType(storage: Storage): void {
  const tabs = [OPTIMIZER_KEY, INDUSTRY_SUPPLY_KEY].map(
    (key) => [key, read(storage, key)] as const,
  );
  const electrified = tabs.some(([, saved]) => saved?.state?.allowElectric === true);

  if (electrified) {
    const settings = read(storage, SETTINGS_KEY);
    const calc = settings?.state?.calc as { trackType?: string } | undefined;
    // only a route still on plain rail: any other choice is the user's own and stands
    if (!calc || calc.trackType === undefined || calc.trackType === 'RAIL') {
      write(storage, SETTINGS_KEY, {
        // a settings key written from nothing still needs its version: without one every
        // `version < N` branch of the store's own migrate reads false and quietly does nothing
        version: SETTINGS_VERSION,
        ...settings,
        state: { ...settings?.state, calc: { ...calc, trackType: 'ELRL' } },
      });
    }
  }

  for (const [key, saved] of tabs) {
    if (saved?.state?.allowElectric === undefined) continue;
    const { allowElectric: _carried, ...state } = saved.state;
    write(storage, key, { ...saved, state });
  }
}

/**
 * Runs the upgrades that have not run yet, before any store reads its key.
 *
 * Steps are gated by version rather than by "has this ever run": a second step added later
 * has to reach the browsers that already ran the first one. Same ladder as the stores'
 * own `migrate`, and the same trap avoided — an early return on "done" would strand every
 * returning user one step short.
 */
export function runStateUpgrades(storage: Storage = localStorage): void {
  // storage the browser will not let us read comes back as null from `read`, which swallows
  // its own failures; the upgrade then finds nothing to carry and the stores start at their
  // defaults, which is the right answer for a browser with no storage to speak of
  const version = read(storage, UPGRADE_KEY)?.version ?? 0;
  if (version >= UPGRADE_VERSION) return;

  if (version < 1) carryElectrificationIntoTrackType(storage);

  write(storage, UPGRADE_KEY, { state: {}, version: UPGRADE_VERSION });
}
