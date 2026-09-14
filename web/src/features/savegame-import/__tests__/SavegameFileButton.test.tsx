/**
 * The import button is a button: the keyboard reaches it, Enter opens the file picker, and
 * while a file is being read there is nothing to choose.
 *
 * @vitest-environment jsdom
 */
import { MantineProvider } from '@mantine/core';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SavegameFileButton } from '../SavegameFileButton';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function draw(reading: boolean, onFile = vi.fn()) {
  const view = render(
    <MantineProvider>
      <button type="button">before</button>
      <SavegameFileButton label="Load savegame" reading={reading} onFile={onFile} />
    </MantineProvider>,
  );
  return { ...view, onFile };
}

describe('the savegame file button', () => {
  it('is reached with Tab and opens the picker on Enter', async () => {
    const user = userEvent.setup();
    const picker = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    draw(false);

    await user.tab();
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Load savegame' }));

    await user.keyboard('{Enter}');
    expect(picker).toHaveBeenCalledTimes(1);
  });

  it('hands over the same file chosen twice', async () => {
    const { onFile } = draw(false);
    const file = new File(['savegame'], 'londworth.sav');

    await userEvent.upload(screen.getByLabelText('Load savegame'), file);
    await userEvent.upload(screen.getByLabelText('Load savegame'), file);

    expect(onFile).toHaveBeenCalledTimes(2);
  });

  it('cannot be pressed while a file is being read', () => {
    draw(true);
    expect(screen.getByRole('button', { name: 'Load savegame' })).toHaveProperty('disabled', true);
  });
});
