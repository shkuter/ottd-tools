import { t } from '../i18n';
import { prefillMatches, type PrefillOrigin, type PrefillSource } from '../state/prefill';

const SENTENCE: Record<PrefillSource, string> = {
  route: 'prefill.fromRoute',
  industry: 'prefill.fromIndustry',
  company: 'prefill.fromCompany',
  chain: 'prefill.fromChain',
  graph: 'prefill.fromGraph',
};

/**
 * "These figures came from your game." Shown while the tab still holds exactly what a bridge
 * wrote, and gone the moment any of it is edited — the comparison is the whole mechanism, so
 * nothing has to be told when the user starts typing.
 *
 * Which sentence to use follows the origin itself: a tab reached from several kinds of card
 * cannot know which one sent the values it is holding. A tab whose halves are filled by
 * different cards keeps a note — and an origin — per half, so each sits beside its own fields.
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
  return <p className="hint prefill-note">{t(SENTENCE[origin.source], { label: origin.label })}</p>;
}
