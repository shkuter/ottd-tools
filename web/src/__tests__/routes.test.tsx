/**
 * An address no tab answers to. The shell renders around whatever the router
 * matched, so an unmatched path used to leave a header and a footer with
 * nothing between them — indistinguishable from a page that failed to load.
 *
 * @vitest-environment jsdom
 */
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import App from '../App';
import { TABS } from '../tabs';
import { t } from '../i18n';

afterEach(cleanup);

describe('an unknown address', () => {
  it('lands on the first tab instead of an empty page', async () => {
    render(
      <MantineProvider>
        <MemoryRouter initialEntries={['/nowhere']}>
          <App />
        </MemoryRouter>
      </MantineProvider>,
    );

    // which tab is first, and what it is called, are both the shell's to say
    await waitFor(() => expect(screen.getByRole('heading', { level: 2 })).toBeTruthy());
    expect(screen.getByRole('heading', { level: 2 }).textContent).toContain(t(TABS[0].label));
  });
});
