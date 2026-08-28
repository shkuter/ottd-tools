/**
 * Runs the state upgrades as a side effect of being imported.
 *
 * The upgrades have to happen before any store reads its key, and a call in the entry
 * point's body is too late for that: ES modules evaluate every import first, so a store
 * imported anywhere down the tree hydrates — and rewrites its key — before the entry point's
 * own statements run. Importing this module first is the one ordering the language
 * guarantees.
 *
 * Nothing is exported on purpose: an import of this module is the whole point, and something
 * to import from it would invite callers that do not want the side effect.
 */
import { runStateUpgrades } from './upgrade';

runStateUpgrades();
