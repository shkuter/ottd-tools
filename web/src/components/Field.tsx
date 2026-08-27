import { Input } from '@mantine/core';
import { useId } from 'react';
import { fieldWidth, type FieldWidth } from '../skin';

/**
 * One control of a filter row, in the shape the rows use: the label above the
 * control, the control under it, the width off the scale rather than off the
 * content.
 *
 * Mantine's own inputs already draw a label that way, so they need nothing from
 * here beyond the width. This is for a group of buttons standing under a heading
 * of its own, which is what used to leave a row standing at five different
 * heights at once.
 *
 * The child is a function so that group can name itself by the label: a
 * segmented control is a radiogroup, and a radiogroup has no element for a
 * label's `for` to point at — it takes `aria-labelledby` instead. A label
 * floating above an unrelated element would leave it unnamed.
 */
export function Field({
  label,
  description,
  width = 'normal',
  children,
}: {
  label: React.ReactNode;
  /** The line under the control — what it does, or why it is unavailable. */
  description?: React.ReactNode;
  width?: FieldWidth;
  children: (props: { labelId: string }) => React.ReactNode;
}) {
  const labelId = `${useId()}-label`;
  return (
    <Input.Wrapper
      className="field-cell"
      {...fieldWidth(width)}
      label={label}
      description={description}
      labelProps={{ id: labelId }}
    >
      {children({ labelId })}
    </Input.Wrapper>
  );
}
