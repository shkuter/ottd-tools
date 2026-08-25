import { CargoIcon } from '../../components/CargoIcon';
import { t } from '../../i18n';
import { cargoName } from '../../i18n/names';
import type { Cargo } from '../../types';

/**
 * A cargo the way the rest of the calculator shows one: its icon, then its name. The snapshot
 * stores cargo as a label, so a label the active economy does not have is named as unknown and
 * carries no icon — there is no picture for a cargo the data knows nothing about.
 */
export function CargoLabel({ cargo, after }: { cargo: Cargo | undefined; after?: string }) {
  return (
    <span className="cargo-label">
      {/* one element, so nothing can wrap between the picture and the word it names */}
      <span className="cargo-name">
        <CargoIcon icon={cargo?.icon ?? ''} />
        {cargo ? cargoName(cargo) : t('game.unknownCargo')}
      </span>
      {after !== undefined && <span> {after}</span>}
    </span>
  );
}
