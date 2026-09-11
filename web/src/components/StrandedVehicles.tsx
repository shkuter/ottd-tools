import { Warning } from './Warning';
import { t } from '../i18n';
import { railtypeName, trainName } from '../i18n/names';
import { activeRailtype, activeRailtypes } from '../dataset';
import { canRunOn } from '../engine/tracktypes';
import type { ConsistEntry } from '../types';
import type { CalcSettings, GameSettings } from '../engine/settings';

/**
 * Names the vehicles a consist keeps that the chosen track cannot carry.
 *
 * The catalogue has already stopped offering them, but a consist is the user's own and is
 * not taken apart behind their back. What is left behind is a summary of zeroes — no power,
 * no tractive effort — and figures computed from them: a trip that takes a thousand days, or
 * none at all. Those are what the game would give, so they are explained rather than left
 * looking like a broken calculation.
 *
 * It lives here rather than on one page because both tabs that price a consist show the same
 * one, from the same store, on the same track — and the change that lets the track be picked
 * on either of them is the change that makes the zeroes reachable from either.
 */
export function StrandedVehicles({
  entries,
  game,
  calc,
}: {
  entries: readonly ConsistEntry[];
  game: GameSettings;
  calc: CalcSettings;
}) {
  const track = activeRailtype(game, calc.trackType);
  const railtypes = activeRailtypes(game);
  const stranded = entries
    .filter(({ count, train }) => count > 0 && !canRunOn(train, track, railtypes))
    .map(({ train }) => trainName(train));

  if (!stranded.length) return null;
  return (
    <Warning>
      {t('consist.strandedOnTrack', {
        vehicles: stranded.join(', '),
        track: railtypeName(track),
      })}
    </Warning>
  );
}
