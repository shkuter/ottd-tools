import { UnstyledButton } from '@mantine/core';
import { useNavigate } from 'react-router';
import { t } from '../../i18n';
import { cargoName } from '../../i18n/names';
import type { Cargo } from '../../types';
import type { OptimizerPrefill } from '../../state/optimizerStore';
import { CargoLabel } from './CargoLabel';
import { applyOptimizerBridge } from './applyBridge';

/**
 * A cargo that leads to the search for a train for it. Written once because a cargo has to
 * read and behave the same wherever it is listed — the routes of a game and the industries
 * of one are two lists of the same thing.
 *
 * Plain text where there is nothing to search for: a cargo outside the active set has no
 * payment rate, and following it would land the optimizer on some other cargo entirely.
 */
export function CargoBridgeLink({
  cargo,
  after,
  values,
  source,
  label,
}: {
  /** Undefined for a cargo the active set does not have — then this is not a link. */
  cargo: Cargo | undefined;
  /** Figure shown after the name, where the list states one. */
  after?: string;
  /** What the bridge carries, or undefined when it cannot be taken. */
  values: Partial<OptimizerPrefill> | undefined;
  source: 'route' | 'industry';
  /** What the note on the receiving tab will call this source. */
  label: string;
}) {
  const navigate = useNavigate();
  const line = <CargoLabel cargo={cargo} after={after} />;
  if (cargo === undefined || values === undefined) return line;
  return (
    <UnstyledButton
      className="btn-link cargo-bridge"
      title={t('game.toOptimizerCargo')}
      // the visible text is the cargo itself, so the action goes into the accessible name
      aria-label={`${cargoName(cargo)} — ${t('game.toOptimizerCargo')}`}
      onClick={(event) => {
        // the row underneath opens on click; following a cargo is not opening a row
        event.stopPropagation();
        applyOptimizerBridge(values, { source, label });
        void navigate('/optimizer');
      }}
    >
      {line}
    </UnstyledButton>
  );
}
