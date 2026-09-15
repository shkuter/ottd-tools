/**
 * A number field writes the decimal separator of the interface language and switches with it,
 * without a reload. Whatever separator is typed, the value handed on is the same number.
 *
 * @vitest-environment jsdom
 */
import { NumberInput } from '@mantine/core';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SkinProvider } from '../SkinProvider';
import { useLocaleStore } from '../state/localeStore';

/** A field holding its own value, reporting every change the way a page would store it. */
function Field({ initial, changes }: { initial: number | string; changes: (number | string)[] }) {
  const [value, setValue] = useState<number | string>(initial);
  return (
    <NumberInput
      label="time"
      value={value}
      onChange={(next) => {
        changes.push(next);
        setValue(next);
      }}
    />
  );
}

function draw(initial: number | string, changes: (number | string)[] = []) {
  render(
    <SkinProvider>
      <Field initial={initial} changes={changes} />
    </SkinProvider>,
  );
  return screen.getByLabelText('time') as HTMLInputElement;
}

beforeEach(() => {
  useLocaleStore.setState({ locale: 'ru' });
});

afterEach(cleanup);

describe('the decimal separator of a number field', () => {
  it('follows the language, and switches with it', () => {
    const field = draw(43.2);
    expect(field.value).toBe('43,2');

    act(() => useLocaleStore.getState().setLocale('en'));
    expect(field.value).toBe('43.2');
  });

  it.each(['43.2', '43,2'])('reads %s typed in Russian as the same number', async (typed) => {
    const changes: (number | string)[] = [];
    const field = draw('', changes);
    await userEvent.type(field, typed);
    expect(changes.at(-1)).toBe(43.2);
    expect(field.value).toBe('43,2');
  });
});
