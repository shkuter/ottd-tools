/**
 * A row of a settings-like panel: the label on the left with its hint under it, the control on
 * the right. The settings tab is built from these, and the interface-elements page shows one
 * of each — which is why they live here rather than inside the tab that uses them most.
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
  return (
    <div className={className}>
      <div className="setting-label">
        <span>{label}</span>
        {hint && <span className="hint setting-hint">{hint}</span>}
      </div>
      <div className="setting-control">{children}</div>
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
