/**
 * The rendered consist and the string one are the same sentence: a table sorts by the string
 * and shows the markup, so a reader comparing the two columns must not see two spellings.
 *
 * @vitest-environment jsdom
 */
import { MantineProvider } from '@mantine/core';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ConsistLine } from '../ConsistLine';
import { consistText } from '../labels';
import { trains } from '../../../dataset';

afterEach(cleanup);

const engine = trains.find((train) => train.name.startsWith('0-8-0'))!;
const wagon = trains.find((train) => train.kind === 'wagon')!;

const show = (consist: { catalogueId: string | null; count: number }[]) => {
  render(
    <MantineProvider>
      <span data-testid="host">
        <ConsistLine consist={consist} />
      </span>
    </MantineProvider>,
  );
  return screen.getByTestId('host').textContent;
};

describe('ConsistLine', () => {
  it('reads exactly like the string form', () => {
    const consist = [
      { catalogueId: engine.id, count: 1 },
      { catalogueId: wagon.id, count: 11 },
    ];
    expect(show(consist)).toBe(consistText(consist));
  });

  it('names an empty consist the way the string form names it', () => {
    expect(show([])).toBe(consistText([]));
  });

  it('keeps a vehicle of an unknown set in its place', () => {
    const consist = [
      { catalogueId: null, count: 2 },
      { catalogueId: engine.id, count: 1 },
    ];
    expect(show(consist)).toBe(consistText(consist));
  });
});
