import { useId, type ReactNode } from 'react';
import { Collapse, UnstyledButton } from '@mantine/core';
import { t } from '../i18n';
import { useUiStore, type HowComputedId } from '../state/uiStore';

/**
 * "How it's computed": the assumptions and counting rules behind an answer, folded under it.
 *
 * They used to stand between the fields and the result, so the answer was read after a
 * paragraph of caveats. What reports the *state* of the calculation — a missing input, a field
 * that currently does nothing, upkeep switched off — stays where it is; only the explanation of
 * the model folds away.
 *
 * Folded by default, and remembered per block across reloads (`uiStore`). The heading is a real
 * button, so Tab reaches it and Enter or Space opens it, and it tells assistive technology
 * whether the block is open. Mantine's Collapse keeps the folded text mounted and hides it with
 * React's Activity (`display: none` on its nodes), so nothing inside can take the focus while
 * it is folded — no `inert` is needed on top of that.
 */
export function HowComputed({ id, children }: { id: HowComputedId; children: ReactNode }) {
  const open = useUiStore((state) => state.howComputedOpen[id] ?? false);
  const setOpen = useUiStore((state) => state.setHowComputedOpen);
  const contentId = useId();

  return (
    <div className="how-computed">
      <UnstyledButton
        className="how-computed-toggle"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen(id, !open)}
      >
        {t('howComputed.title')}
      </UnstyledButton>
      <Collapse id={contentId} expanded={open}>
        <div className="how-computed-body">{children}</div>
      </Collapse>
    </div>
  );
}
