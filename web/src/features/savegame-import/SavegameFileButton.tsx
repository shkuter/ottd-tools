import { useRef } from 'react';
import { Button, FileButton } from '@mantine/core';

/**
 * The one way into an import: a button that opens the file picker. Both places that offer an
 * import use this one — the settings screen and the corner of the window — and they differ
 * only in the caption and in the size of the plate.
 *
 * A real button rather than a label wrapped round a file input: a label is not a stop on the
 * keyboard's way through the page, and a hidden input is not one either.
 */
export function SavegameFileButton({
  label,
  reading,
  compact = false,
  onFile,
}: {
  label: string;
  /** a file is being read: there is nothing to choose until it is done */
  reading: boolean;
  compact?: boolean;
  onFile: (file: File) => void;
}) {
  const reset = useRef<() => void>(null);
  return (
    <FileButton
      accept=".sav"
      disabled={reading}
      resetRef={reset}
      // the input carries the caption as well, so whatever hands it a file finds it by name
      inputProps={{ 'aria-label': label }}
      onChange={(file) => {
        // cleared so that choosing the same file again still counts as a change
        reset.current?.();
        if (file) onFile(file);
      }}
    >
      {(props) => (
        // FileButton keeps `disabled` to itself, so the plate is told separately
        <Button
          {...props}
          variant="default"
          size={compact ? 'compact-md' : undefined}
          disabled={reading}
        >
          {label}
        </Button>
      )}
    </FileButton>
  );
}
