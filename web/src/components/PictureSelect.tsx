import type { ReactNode } from 'react';
import { Select, type ComboboxItem, type ComboboxLikeRenderOptionInput, type SelectProps } from '@mantine/core';
import type { Cargo } from '../types';
import { CargoIcon } from './CargoIcon';
import { TrainImage } from './TrainImage';

/**
 * A dropdown whose options carry a picture, the way the game's own icon items do
 * (DropDownListIconItem, dropdown_common_type.h — the cargo filter of the purchase window is
 * one, build_vehicle_gui.cpp).
 *
 * There are two of them, one per kind of thing the calculator picks, and each is a component
 * rather than a renderer to pass around: the picture belongs in the list *and* in the closed
 * field, and a list that had one without the other would show the choice differently from the
 * way it was made. For the same reason the picture props are written after the spread — a
 * caller passing its own `leftSection` would otherwise silently lose the picture.
 */

/**
 * The option itself: the picture in a cell of its own so the names all start at the same
 * vertical however wide the pictures are, as they do in the sprite column of a list.
 */
function optionWithPicture(picture: (value: string) => ReactNode, cellModifier?: string) {
  return ({ option }: ComboboxLikeRenderOptionInput<ComboboxItem>) => (
    <span className="option-row">
      <span className={cellModifier ? `option-cell ${cellModifier}` : 'option-cell'}>
        {picture(option.value)}
      </span>
      {option.label}
    </span>
  );
}

/** No cell width for cargo: every icon of the dataset is 10x10. */
const cargoOption = (icons: Map<string, string>) =>
  optionWithPicture((label) => <CargoIcon icon={icons.get(label) ?? ''} />);

/** Vehicles are of every length, so their cell is the sprite column's width. */
const trainOption = optionWithPicture(
  (id) => <TrainImage trainId={id} />,
  'option-cell--sprite',
);

/**
 * Picks a cargo. Keyed by the cargo's label, which is what the dataset calls it and what the
 * lists put in `value`.
 */
export function CargoSelect({
  cargos,
  value,
  ...props
}: { cargos: readonly Pick<Cargo, 'label' | 'icon'>[] } & SelectProps) {
  const icons = new Map(cargos.map((cargo) => [cargo.label, cargo.icon]));
  return (
    <Select
      {...props}
      value={value}
      leftSection={<CargoIcon icon={(value && icons.get(value)) || ''} />}
      renderOption={cargoOption(icons)}
    />
  );
}

/**
 * Picks a vehicle. Keyed by the vehicle's id, which is also how its sprite is filed, so the
 * picture needs nothing else.
 *
 * The left section is there whether or not a vehicle is picked: a section that came and went
 * would move the text of the field sideways the moment something was chosen. Its width comes
 * from `.train-select` in skin-mantine.css — beside the rule it has to beat, which gives every
 * other field a 20px section.
 */
export function TrainSelect({ className, value, ...props }: SelectProps) {
  return (
    <Select
      {...props}
      value={value}
      className={className ? `train-select ${className}` : 'train-select'}
      leftSection={value ? <TrainImage trainId={value} /> : <span />}
      renderOption={trainOption}
    />
  );
}
