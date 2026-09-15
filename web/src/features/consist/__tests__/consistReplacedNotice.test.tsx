/**
 * The notification that offers a replaced consist back: one undo at a time, gone on its own
 * after a while, and a button that restores exactly what the replacement overwrote.
 *
 * @vitest-environment jsdom
 */
import { MantineProvider } from '@mantine/core';
import { Notifications, notifications } from '@mantine/notifications';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { trains } from '../../../dataset';
import { t } from '../../../i18n';
import { useConsistStore } from '../../../state/consistStore';
import { useLocaleStore } from '../../../state/localeStore';
import { useRouteStore } from '../../../state/routeStore';
import { useSettingsStore } from '../../../state/settingsStore';
import {
  CONSIST_REPLACED_AUTO_CLOSE,
  replaceConsistWithUndo,
} from '../../../components/consistReplacedNotice';

const [first, second, third] = trains.filter((t) => t.kind === 'engine');

function draw() {
  return render(
    <MantineProvider>
      {/* no transition: a hidden notification leaves the DOM at once */}
      <Notifications transitionDuration={0} />
    </MantineProvider>,
  );
}

/** Replaces the consist with one vehicle and a distance, the way the real actions do. */
function replaceWith(train: (typeof trains)[number], distanceTiles: number) {
  act(() =>
    replaceConsistWithUndo(() => {
      useConsistStore.getState().setEntries([{ train, count: 1 }]);
      useRouteStore.getState().setDistanceTiles(distanceTiles);
    }, 'Consist replaced'),
  );
}

const restoreButtons = () =>
  screen.queryAllByRole('button', { name: t('notify.restoreConsist') });

beforeEach(() => {
  useLocaleStore.getState().setLocale('en');
  // the vehicles here are of the Iron Horse set: with it switched off the builder would show
  // none of them, and there would be nothing to offer back
  useSettingsStore.getState().reset();
  useSettingsStore.getState().setGame('trainSet', 'iron_horse');
  useConsistStore.setState({ entries: [{ train: first, count: 1 }] });
  useRouteStore.setState({ distanceTiles: 10 });
});

afterEach(() => {
  act(() => notifications.clean());
  cleanup();
  vi.useRealTimers();
});

describe('the consist replaced notification', () => {
  it('offers the previous consist back, and goes once it is taken', async () => {
    draw();
    replaceWith(second, 20);

    const [button] = await waitFor(() => {
      const found = restoreButtons();
      expect(found).toHaveLength(1);
      return found;
    });
    await userEvent.click(button);

    expect(useConsistStore.getState().entries).toEqual([{ train: first, count: 1 }]);
    expect(useRouteStore.getState().distanceTiles).toBe(10);
    await waitFor(() => expect(restoreButtons()).toHaveLength(0));
  });

  it('keeps one undo: after a second replacement its button returns the consist before it', async () => {
    draw();
    replaceWith(second, 20);
    await waitFor(() => expect(restoreButtons()).toHaveLength(1));
    replaceWith(third, 30);

    // Mantine ignores a show whose id is on screen, so the first one has to be taken away
    await waitFor(() => expect(restoreButtons()).toHaveLength(1));
    await userEvent.click(restoreButtons()[0]);

    expect(useConsistStore.getState().entries).toEqual([{ train: second, count: 1 }]);
    expect(useRouteStore.getState().distanceTiles).toBe(20);
  });

  it('takes an earlier undo away when a replacement over an empty builder follows it', async () => {
    // cleared, then filled again from nothing: the first undo would put back the cleared
    // consist and wipe the one just carried in, so it must not be on offer any more
    draw();
    act(() => replaceConsistWithUndo(() => useConsistStore.getState().clear(), 'Consist cleared'));
    await waitFor(() => expect(restoreButtons()).toHaveLength(1));

    replaceWith(second, 20);

    await waitFor(() => expect(restoreButtons()).toHaveLength(0));
    expect(useConsistStore.getState().entries).toEqual([{ train: second, count: 1 }]);
  });

  it('goes away on its own after about ten seconds', async () => {
    vi.useFakeTimers();
    draw();
    replaceWith(second, 20);
    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(restoreButtons()).toHaveLength(1);

    await act(() => vi.advanceTimersByTimeAsync(CONSIST_REPLACED_AUTO_CLOSE));

    expect(restoreButtons()).toHaveLength(0);
  });

  it('is not shown when the builder was empty', async () => {
    useConsistStore.setState({ entries: [] });
    draw();
    replaceWith(second, 20);
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
    expect(restoreButtons()).toHaveLength(0);
  });
});
