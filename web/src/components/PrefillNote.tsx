import { t } from '../i18n';
import { prefillMatches, type PrefillOrigin } from '../state/prefill';

/**
 * "These figures came from your game." Shown while the tab still holds exactly what a bridge
 * wrote, and gone the moment any of it is edited — the comparison is the whole mechanism, so
 * nothing has to be told when the user starts typing.
 *
 * Which sentence to use follows the origin itself: a tab reached from two kinds of card
 * cannot know which one sent the values it is holding.
 */
export function PrefillNote<V extends object>({
  origin,
  current,
}: {
  origin: PrefillOrigin<V> | null;
  /** The tab's values in the same shape the bridge recorded. */
  current: V;
}) {
  if (!prefillMatches(origin, current)) return null;
  const key = origin.source === 'industry' ? 'prefill.fromIndustry' : 'prefill.fromRoute';
  return <p className="hint prefill-note">{t(key, { label: origin.label })}</p>;
}
