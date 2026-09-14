import { useId, useLayoutEffect, useRef } from 'react';

/** What in a row's control area is a control to be named. */
const CONTROLS =
  'input:not([type="hidden"]), button, textarea, [role="switch"], [role="radiogroup"]';

/** Parts of a control that are not stops of their own — the stepper arrows of a number field. */
const CONTROL_PARTS = '[aria-hidden="true"], [tabindex="-1"]';

/**
 * Whether the row's own caption has to name this control. A switch or a checkbox always: in a
 * row it is captioned with its state ("on", "off"), which names nothing. A button is named by
 * its lettering when it has any. Anything else only when nothing names it yet.
 */
function takesRowName(control: HTMLElement): boolean {
  if (control.matches(CONTROL_PARTS) || control.hasAttribute('aria-labelledby')) return false;
  if (control.getAttribute('aria-label')?.trim()) return false;
  if (control instanceof HTMLInputElement && control.type === 'checkbox') return true;
  if (control instanceof HTMLButtonElement) return !control.textContent?.trim();
  const labels = control instanceof HTMLInputElement ? control.labels : null;
  return !labels || [...labels].every((label) => !label.textContent?.trim());
}

/**
 * A row of a settings-like panel: the label on the left with its hint under it, the control on
 * the right. The settings tab is built from these, and the interface-elements page shows one
 * of each — which is why they live here rather than inside the tab that uses them most.
 *
 * The caption on the left is what names the control on the right. Rows hold selects, number
 * fields and switches alike, so the row ties them together itself rather than trusting every
 * caller to pass ids down: one call site forgetting would leave its control silently nameless.
 */
export function SettingRow({
  label,
  hint,
  className = 'setting-row',
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const labelId = useId();
  const hintId = useId();
  const controls = useRef<HTMLDivElement>(null);

  // on every render: the control inside can change with the setting it shows, and the hint can
  // come and go with it — a description left pointing at a hint that is gone describes nothing
  useLayoutEffect(() => {
    for (const control of controls.current?.querySelectorAll<HTMLElement>(CONTROLS) ?? []) {
      const named = control.getAttribute('aria-labelledby') === labelId;
      if (!named && !takesRowName(control)) continue;
      control.setAttribute('aria-labelledby', labelId);
      if (hint) control.setAttribute('aria-describedby', hintId);
      else control.removeAttribute('aria-describedby');
    }
  });

  return (
    <div className={className}>
      <div className="setting-label">
        <span id={labelId}>{label}</span>
        {hint && (
          <span id={hintId} className="hint setting-hint">
            {hint}
          </span>
        )}
      </div>
      <div className="setting-control" ref={controls}>
        {children}
      </div>
    </div>
  );
}

/**
 * A parameter of the set above it — the FIRS economy, a Base Costs multiplier, the Iron Horse
 * capacity index — shown as part of that set rather than as a setting of its own rank.
 */
export function NestedSettingRow(props: Omit<Parameters<typeof SettingRow>[0], 'className'>) {
  return <SettingRow {...props} className="setting-row setting-row--nested" />;
}
