import { useEffect, useMemo, useState } from 'react';
import { Button, Select, Text } from '@mantine/core';
import { t } from '../../../i18n';
import { cargoByLabel } from '../../../dataset';
import { cargoColour } from './cargoColour';
import { GraphNodeCard } from './GraphNodeCard';
import { placeEdges, placeNodes } from './layout';
import { baseNodeId, isClone, type BuiltGraph, type GraphNode, type Layout, type PlacedEdge } from './model';
import { useZoomPan } from './useZoomPan';
import { fullPictureNodes } from './zoomPan';

const ARROW = 8;

export interface GraphCanvasProps {
  graph: BuiltGraph;
  /** Null while the layout engine is still at work. */
  layout: Layout | null;
  economyId: string;
  /** Industry id or cargo label picked on the graph. */
  selected: string | null;
  /** Base ids tied to the selection; null when nothing is picked and nothing is dimmed. */
  highlight: ReadonlySet<string> | null;
  onSelect: (baseId: string | null) => void;
  /** The name a node is searched by, in the current language. */
  nameOf: (node: GraphNode) => string;
  /** Under the industry name: its accept mode, already translated. */
  modeOf: (node: GraphNode) => string;
}

/**
 * The drawing: edges as one SVG, nodes as cards laid over it, both in one transformed
 * layer. Above it the toolbar — find a node, zoom, fit.
 */
export function GraphCanvas({
  graph,
  layout,
  economyId,
  selected,
  highlight,
  onSelect,
  nameOf,
  modeOf,
}: GraphCanvasProps) {
  const zoom = useZoomPan(layout);
  const [search, setSearch] = useState<string | null>(null);
  // a search names a node of this economy's graph; the same graph in another language
  // keeps it
  useEffect(() => setSearch(null), [economyId]);

  const placed = useMemo(() => (layout ? placeNodes(graph, layout) : []), [graph, layout]);
  const edges = useMemo(() => (layout ? placeEdges(graph, layout) : []), [graph, layout]);

  // one entry per industry or cargo, whatever the number of its clones
  const options = useMemo(
    () =>
      graph.nodes
        .filter((node) => !isClone(node.id))
        .map((node) => ({ value: node.baseId, label: nameOf(node) }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [graph, nameOf],
  );

  const { view, size } = zoom;
  const fullPictures = useMemo(() => fullPictureNodes(placed, view, size), [placed, view, size]);

  const colours = useMemo(
    () =>
      new Map(
        cargoLabelsOf(graph).map((label) => [label, cargoColour(cargoByLabel.get(label), economyId)] as const),
      ),
    [graph, economyId],
  );
  const colourOf = (label: string) => colours.get(label);

  // a drag that ends over a node is not a pick, any more than one that ends on the background
  const pick = (baseId: string | null) => {
    if (!zoom.consumeDrag()) onSelect(baseId);
  };

  const find = (baseId: string | null) => {
    setSearch(baseId);
    if (!baseId) return;
    const node = placed.find((n) => n.baseId === baseId && !isClone(n.id));
    if (!node) return;
    zoom.centre({ x: node.x + node.width / 2, y: node.y + node.height / 2 });
    onSelect(baseId);
  };

  return (
    <div className="graph-frame">
      <div className="graph-toolbar">
        <Select
          searchable
          clearable
          disabled={!layout}
          placeholder={t('firs.graph.search')}
          aria-label={t('firs.graph.search')}
          data={options}
          value={search}
          onChange={find}
        />
        <Button.Group>
          <Button disabled={!layout} onClick={zoom.zoomOut} aria-label={t('firs.graph.zoomOut')}>−</Button>
          <Button disabled={!layout} onClick={zoom.zoomIn} aria-label={t('firs.graph.zoomIn')}>+</Button>
          <Button disabled={!layout} onClick={zoom.actual}>{t('firs.graph.actual')}</Button>
          <Button disabled={!layout} onClick={zoom.fit}>{t('firs.graph.fit')}</Button>
        </Button.Group>
      </div>
      <div
        ref={zoom.ref}
        className="graph-canvas"
        data-dragging={zoom.dragging || undefined}
        {...zoom.handlers}
        onClick={() => pick(null)}
      >
        {!layout && (
          <div className="graph-loading">
            <Text className="hint">{t('firs.graph.loading')}</Text>
          </div>
        )}
        {layout && (
          <div
            className="graph-layer"
            style={{
              width: layout.width,
              height: layout.height,
              transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`,
            }}
          >
            <svg className="graph-edges" width={layout.width} height={layout.height}>
              {edges.map((edge, i) => (
                <Edge
                  key={i}
                  edge={edge}
                  colour={colourOf(edge.cargoLabel)}
                  dim={
                    highlight !== null &&
                    !(highlight.has(baseNodeId(edge.from)) && highlight.has(baseNodeId(edge.to)))
                  }
                />
              ))}
            </svg>
            {placed.map((node) => (
              <GraphNodeCard
                key={node.id}
                node={node}
                name={nameOf(node)}
                mode={node.kind === 'industry' ? modeOf(node) : ''}
                colour={node.kind === 'cargo' ? colourOf(node.baseId) : undefined}
                full={fullPictures?.has(node.id) ?? false}
                selected={selected === node.baseId}
                dim={highlight !== null && !highlight.has(node.baseId)}
                onSelect={pick}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** The cargos the graph paints, each once — a clone is the same cargo. */
function cargoLabelsOf(graph: BuiltGraph): string[] {
  return [...new Set(graph.nodes.filter((node) => node.kind === 'cargo').map((node) => node.baseId))];
}

function Edge({ edge, colour, dim }: { edge: PlacedEdge; colour: string | undefined; dim: boolean }) {
  const { x, y, angle } = edge.end;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const head = [
    [x, y],
    [x - ARROW * cos + (ARROW / 2) * sin, y - ARROW * sin - (ARROW / 2) * cos],
    [x - ARROW * cos - (ARROW / 2) * sin, y - ARROW * sin + (ARROW / 2) * cos],
  ]
    .map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`)
    .join(' ');
  return (
    <g
      className="graph-edge"
      data-dim={dim || undefined}
      style={colour ? ({ '--cargo-colour': colour } as React.CSSProperties) : undefined}
    >
      <path d={edge.path} />
      <polygon points={head} />
    </g>
  );
}
