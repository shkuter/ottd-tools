import type { CSSProperties } from 'react';
import { badgeTextColour } from './cargoColour';
import { nodeElementId, type PlacedNode } from './model';
import { INDUSTRY_NAME_LINES } from './sizes';

/**
 * One node on the canvas: an industry card — picture, name, accept mode, notes — or a
 * cargo badge in the cargo's colour. Sized by the layout, so the box is exactly what the
 * engine was told; the text inside is cut to fit rather than allowed to grow it.
 */
export function GraphNodeCard({
  node,
  name,
  mode,
  colour,
  full,
  selected,
  focused,
  dim,
  onSelect,
}: {
  node: PlacedNode;
  name: string;
  /** Under an industry name: its accept mode, already translated; empty on a badge. */
  mode: string;
  /** The cargo colour of a badge; undefined on an industry card. */
  colour: string | undefined;
  /** Show the full-size picture (the node is in view at a zoom above 1:1). */
  full: boolean;
  selected: boolean;
  /** Under the keyboard cursor; the canvas names it through aria-activedescendant. */
  focused: boolean;
  dim: boolean;
  onSelect: (baseId: string) => void;
}) {
  const style: CSSProperties & Record<`--${string}`, string | number> = {
    left: node.x,
    top: node.y,
    width: node.width,
    height: node.height,
    '--graph-name-lines': node.kind === 'industry' ? INDUSTRY_NAME_LINES : 1,
  };
  if (colour) {
    style['--cargo-colour'] = colour;
    style['--cargo-text'] = badgeTextColour(colour);
  }
  return (
    <div
      id={nodeElementId(node.id)}
      className={`graph-node graph-node--${node.kind}`}
      style={style}
      data-selected={selected || undefined}
      data-focused={focused || undefined}
      data-dim={dim || undefined}
      title={[name, ...node.notes].join('\n')}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(node.baseId);
      }}
    >
      {node.industry && (
        <img
          src={`${import.meta.env.BASE_URL}${full ? node.industry.image : node.industry.image_small}`}
          alt=""
          draggable={false}
        />
      )}
      <div className="graph-node__name">{name}</div>
      {mode && <div className="graph-node__note hint">{mode}</div>}
      {node.notes.map((note, i) => (
        <div key={i} className="graph-node__note">
          {note}
        </div>
      ))}
    </div>
  );
}
