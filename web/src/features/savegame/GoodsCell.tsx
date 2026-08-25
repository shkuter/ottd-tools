/**
 * A cell holding one line per cargo. A station with four cargoes waiting would otherwise run
 * its row far wider than the column, so the entries stack instead of sitting side by side.
 *
 * The rows of two such cells line up under each other as long as both walk the same list,
 * which is what lets the rating column stay unlabelled beside the waiting one.
 */
export function GoodsCell<T extends { slot: number }>({
  entries,
  children,
}: {
  entries: readonly T[];
  children: (entry: T) => React.ReactNode;
}) {
  if (entries.length === 0) return <>—</>;
  return (
    <span className="goods-list">
      {entries.map((entry) => (
        <span key={entry.slot} className="goods-entry">
          {children(entry)}
        </span>
      ))}
    </span>
  );
}
