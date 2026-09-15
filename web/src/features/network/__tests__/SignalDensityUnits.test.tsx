/**
 * The units of the signal density panel agree with the figures beside them. The computation is
 * replaced by a fixed answer, because a braking distance of exactly one tile is not something a
 * real consist lands on by choice.
 *
 * @vitest-environment jsdom
 */
import { MantineProvider } from '@mantine/core';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../../i18n';
import { useLocaleStore } from '../../../state/localeStore';
import { EMPTY_SIGNALS, useRouteStore } from '../../../state/routeStore';
import type { SignalDensityResult } from '../../../engine/signals';
import type { RouteWithFlowParams } from '../../../engine/trip';
import { SignalDensity } from '../SignalDensity';

const ONE_TILE: SignalDensityResult = {
  speedInternal: 100,
  brakingTiles: 1,
  usefulSpacing: 4,
  currentSpacing: 6,
  recommendedSignals: 10,
  yearlyNow: 1000,
  yearlyRecommended: 800,
  yearlySaving: 200,
  tooSparse: false,
  realisticBraking: true,
};

// the answer the mocked computation gives; a test may swap it before drawing
let answer: SignalDensityResult = ONE_TILE;

vi.mock('../figures', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../figures')>()),
  useSignals: () => answer,
}));

function draw() {
  // the route only has to be there; the figures come from the mocked computation
  return render(
    <MantineProvider forceColorScheme="dark">
      <SignalDensity route={{} as RouteWithFlowParams} />
    </MantineProvider>,
  );
}

beforeEach(() => {
  answer = ONE_TILE;
  useLocaleStore.getState().setLocale('en');
  useRouteStore.setState({ signals: { ...EMPTY_SIGNALS, descentLevels: 1 } });
});

afterEach(cleanup);

describe('signal density units', () => {
  it('writes a braking distance of one tile in the singular', () => {
    draw();
    const row = screen.getByText(t('signals.brakingDistance')).closest('tr')!;
    expect(row.textContent).toContain('1 tile');
    expect(row.textContent).not.toContain('1 tiles');
  });

  it('writes a descent of one level in the singular', () => {
    draw();
    expect(screen.getByLabelText(t('signals.descent'))).toHaveProperty('value', '1 level');
  });

  it('agrees the pieces of a too sparse spacing with a whole and a fractional figure', () => {
    // 22 takes the "few" form in Russian and a fraction the "other" one; neither is "кусков"
    answer = { ...ONE_TILE, currentSpacing: 22, usefulSpacing: 6.4, tooSparse: true };
    useLocaleStore.getState().setLocale('ru');
    const { container } = draw();
    expect(container.textContent).toContain('через 22 куска там, где хватило бы 6,4 куска');
  });

  it('writes the pieces of a too sparse spacing in the singular and the plural', () => {
    answer = { ...ONE_TILE, currentSpacing: 2, usefulSpacing: 1, tooSparse: true };
    const { container } = draw();
    expect(container.textContent).toContain('stand 2 pieces apart where 1 piece would do');
  });
});
