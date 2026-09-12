import { useLayoutEffect, useRef } from 'react';
import { Modal, Text } from '@mantine/core';
import { t } from '../../i18n';
import { SavegameFileButton } from './SavegameFileButton';
import { SavegameImportResult } from './SavegameImportResult';
import { useSavegameImport } from './useSavegameImport';

/** What the header reads to keep room for the button; written here, used in skin.css. */
const WIDTH_PROPERTY = '--savegame-launcher-width';

/**
 * The import as every page offers it: a button pinned to the corner of the window, and the
 * differences shown over the page the player is on rather than on the settings screen.
 *
 * The window is open for as long as the import is not idle — a flag of its own beside the
 * phase would be a second thing to keep in step with it.
 */
export function SavegameImportLauncher() {
  const importing = useSavegameImport();
  const box = useRef<HTMLDivElement>(null);

  /*
   * The header keeps room on its right so that nothing of it — title, subtitle or tabs — ends
   * up under the button, and the room has to be as wide as the button really is: the caption
   * is one length in English and another in Russian. The button reports its width here; the
   * header reads it as a custom property. A spacer inside the header would not do: the header
   * wraps, and a spacer would wrap away with it.
   *
   * Measured before the browser paints, so the fallback in the stylesheet is only ever what a
   * browser without ResizeObserver falls back to, not what the first frame is laid out with.
   */
  useLayoutEffect(() => {
    const element = box.current;
    if (!element) return;
    const root = document.documentElement;
    // the fractional width, not offsetWidth: rounded down, the room is a pixel short
    const measure = () =>
      root.style.setProperty(WIDTH_PROPERTY, `${element.getBoundingClientRect().width}px`);
    measure();
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(element);
    return () => {
      observer?.disconnect();
      // the header would otherwise keep room for a button that is no longer there
      root.style.removeProperty(WIDTH_PROPERTY);
    };
  }, []);

  return (
    <>
      <div className="savegame-launcher" ref={box}>
        {/* the caption stays the same once a savegame has been imported: the file name is
            already on the game tab, and a second wording would be a second state to read */}
        <SavegameFileButton
          compact
          label={t('savegame.importButton')}
          reading={importing.state.phase === 'reading'}
          onFile={(file) => void importing.readFile(file)}
        />
      </div>

      {/* wide enough for the table of differences to stand without scrolling sideways —
          three columns of setting names — and never wider than the screen it is on */}
      <Modal
        opened={importing.state.phase !== 'idle'}
        onClose={importing.reset}
        size="min(1100px, 94vw)"
        title={t('savegame.title')}
        closeButtonProps={{ 'aria-label': t('savegame.closeWindow') }}
      >
        {importing.state.phase === 'reading' ? (
          <Text>{t('savegame.reading')}</Text>
        ) : (
          <SavegameImportResult
            state={importing.state}
            apply={importing.apply}
            reset={importing.reset}
            onClose={importing.reset}
          />
        )}
      </Modal>
    </>
  );
}
