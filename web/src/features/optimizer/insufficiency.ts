/**
 * How the search's own reasons for refusing rows are named to the player. Shared by the two
 * places that say it: the empty state of the answer, and a comparison column left without one.
 */
import type { Insufficiency } from '../../engine/optimize';

export const INSUFFICIENCY_STRINGS: Record<Insufficiency, string> = {
  grade: 'opt.enoughGrade',
  backlog: 'opt.enoughBacklog',
  window: 'opt.enoughWindow',
};
