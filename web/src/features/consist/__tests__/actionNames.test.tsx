/**
 * The add and remove buttons of the consist tab stand in a column dozens deep, one per vehicle.
 * Each is named after its vehicle, or a screen reader lists "Add to consist" fifty times over.
 *
 * @vitest-environment jsdom
 */
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import ConsistPage from '../ConsistPage';
import { useConsistStore } from '../../../state/consistStore';
import { useSettingsStore } from '../../../state/settingsStore';
import { useLocaleStore } from '../../../state/localeStore';

function draw() {
  return render(
    <MantineProvider>
      <MemoryRouter initialEntries={['/consist']}>
        <ConsistPage />
      </MemoryRouter>
    </MantineProvider>,
  );
}

beforeEach(() => {
  useSettingsStore.getState().reset();
  useLocaleStore.getState().setLocale('en');
  useConsistStore.getState().clear();
});

afterEach(cleanup);

describe('the buttons beside each vehicle', () => {
  it('name the vehicle of their own row', async () => {
    draw();
    const buttons = await screen.findAllByRole('button', { name: /^Add .+ to consist$/ });
    expect(buttons.length).toBeGreaterThan(1);
    for (const button of buttons) {
      const name = button.getAttribute('aria-label')!.replace(/^Add (.+) to consist$/, '$1');
      expect(button.closest('tr')!.textContent).toContain(name);
    }
  });

  it('name the vehicle a remove button takes out of the consist', async () => {
    const user = userEvent.setup();
    draw();
    const [add] = await screen.findAllByRole('button', { name: /^Add .+ to consist$/ });
    const name = add.getAttribute('aria-label')!.replace(/^Add (.+) to consist$/, '$1');

    await user.click(add);

    const panel = document.querySelector<HTMLElement>('.consist-side')!;
    expect(within(panel).getByRole('button', { name: `Remove ${name} from consist` })).toBeTruthy();
  });
});
