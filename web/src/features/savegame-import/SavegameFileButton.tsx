import { Button } from '@mantine/core';

/**
 * The one way into an import: a button that is a file input in a plate. Both places that
 * offer an import use this one — the settings screen and the corner of the window — and they
 * differ only in the caption and in the size of the plate.
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
  return (
    <Button
      component="label"
      variant="default"
      size={compact ? 'compact-md' : undefined}
      disabled={reading}
    >
      {label}
      <input
        type="file"
        accept=".sav"
        hidden
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          // cleared so that choosing the same file again still counts as a change
          event.currentTarget.value = '';
          if (file) onFile(file);
        }}
      />
    </Button>
  );
}
