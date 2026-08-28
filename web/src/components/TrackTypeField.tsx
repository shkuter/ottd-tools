import { useEffect } from 'react';
import { Select } from '@mantine/core';
import { fieldWidth } from '../skin';
import { t } from '../i18n';
import { railtypeOptions } from '../i18n/names';
import { activeRailtype, selectableRailtypes } from '../dataset';
import { useSettingsStore } from '../state/settingsStore';

/**
 * The track the route is built with, as the tabs offer it — one choice for the whole
 * calculator, repeated wherever a search runs so it can be changed where it is being used.
 * Which types are on offer follows the active set, and a set that names two of them alike
 * has them told apart (`railtypeOptions`).
 */
export function TrackTypeField({
  width = 'narrow',
  className,
  withLabel = true,
}: {
  width?: 'narrow' | 'wide';
  /** Set by tabs that size their fields with a class of their own instead. */
  className?: string;
  /** Off where the surrounding row already carries the label, as the settings rows do. */
  withLabel?: boolean;
}) {
  const game = useSettingsStore((s) => s.game);
  const trackType = useSettingsStore((s) => s.calc.trackType);
  const setCalc = useSettingsStore((s) => s.setCalc);
  const options = railtypeOptions(selectableRailtypes(game)).map((option) => ({
    value: option.railtype.label,
    label: option.name,
  }));
  // The list has to show the track the calculation is actually using, so the fallback is
  // the engine's own (`activeRailtype`) and not a second rule of this component's.
  const selected = activeRailtype(game, trackType);
  const offered = options.some((o) => o.value === selected.label)
    ? selected.label
    : options[0]?.value;
  // A track of the active set that the set hides is a dead choice: nothing will ever offer
  // it again, so the stored value is moved on. A track of *another* set is a different
  // case — the user picked it for a game they may switch back to, so it is only read as
  // plain rail (`activeRailtype`) and left where it is.
  useEffect(() => {
    if (selected.hidden && offered && offered !== trackType) setCalc('trackType', offered);
  }, [selected.hidden, offered, trackType, setCalc]);

  return (
    <Select
      {...(className ? { className } : fieldWidth(width))}
      label={withLabel ? t('settings.trackType') : undefined}
      aria-label={withLabel ? undefined : t('settings.trackType')}
      allowDeselect={false}
      value={offered}
      onChange={(value) => value && setCalc('trackType', value)}
      data={options}
    />
  );
}
