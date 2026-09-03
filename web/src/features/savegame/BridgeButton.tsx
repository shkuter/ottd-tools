import { ActionIcon } from '@mantine/core';
import { t } from '../../i18n';
import type { Bridge } from './bridge';

/**
 * The arrow that carries a card of the game tab over to a calculating tab. Written once
 * because every bridge has to behave the same wherever it hangs: a route row, a company.
 *
 * A bridge that cannot be taken stays in place and says what stops it. It is marked disabled
 * rather than made disabled: a truly disabled button drops out of the tab order, and the
 * reason would then be reachable by mouse alone.
 *
 * It takes the whole bridge rather than its two halves so that `onTake` is handed values that
 * exist — the refusal and the values are one decision, and splitting them would leave every
 * caller asserting that a bridge it is holding is the one it may take.
 */
export function BridgeButton<V>({
  action,
  bridge,
  onTake,
}: {
  /** What taking it does, already translated — it names the receiving tab. */
  action: string;
  bridge: Bridge<V>;
  onTake: (values: V) => void;
}) {
  const name = bridge.blocker ? `${action} — ${t(`game.blocker.${bridge.blocker}`)}` : action;
  return (
    <ActionIcon
      className="btn-add"
      data-disabled={bridge.blocker !== undefined || undefined}
      aria-disabled={bridge.blocker !== undefined || undefined}
      title={name}
      aria-label={name}
      onClick={(event) => {
        // a row underneath may open on click; taking a bridge is not opening a row
        event.stopPropagation();
        if (bridge.values === undefined) return;
        onTake(bridge.values);
      }}
    >
      →
    </ActionIcon>
  );
}
