import { Switch, Tooltip } from '@mantine/core';
import { GuiIcon, type GuiIconName } from './GuiIcon';

/**
 * A switch whose label is an icon of the game rather than a line of text.
 *
 * Two of the filters read as sentences — "electrified line (include OHLE
 * engines)", "subsidised cargo" — and a label that long stands two or three
 * times wider than the switch it names, which is what made the row ragged. The
 * game states the same two things with pictures, so the label is that picture
 * and the words move into the tooltip.
 *
 * The name goes in twice, which is the point of having this in one place: once
 * where the pointer finds it and once where a screen reader does, and never one
 * without the other.
 */
export function IconSwitch({
  icon,
  name,
  checked,
  onChange,
}: {
  icon: GuiIconName;
  /** What the switch turns on, in words — the tooltip and the accessible name. */
  name: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <Tooltip label={name}>
      <Switch
        aria-label={name}
        label={<GuiIcon name={icon} />}
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
    </Tooltip>
  );
}
