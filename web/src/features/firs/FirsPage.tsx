import { useEffect, useMemo, useRef, useState } from 'react';
import {
  cargoByLabel,
  economies,
  economyById,
  industryById,
} from '../../dataset';
import { t } from '../../i18n';
import { num } from '../../components/format';
import { CargoIcon } from '../consist/ConsistPage';
import { useFirsStore } from '../../state/firsStore';
import type { Economy } from '../../types';

/** Достижимые узлы графа в обе стороны от выбранного. */
function chainNodes(economy: Economy, start: string): Set<string> {
  const forward = new Map<string, string[]>();
  const backward = new Map<string, string[]>();
  for (const edge of economy.graph.edges) {
    forward.set(edge.from, [...(forward.get(edge.from) ?? []), edge.to]);
    backward.set(edge.to, [...(backward.get(edge.to) ?? []), edge.from]);
  }
  const result = new Set<string>([start]);
  for (const adjacency of [forward, backward]) {
    const queue = [start];
    while (queue.length) {
      const node = queue.pop()!;
      for (const next of adjacency.get(node) ?? []) {
        if (!result.has(next)) {
          result.add(next);
          queue.push(next);
        }
      }
    }
  }
  return result;
}

function NodeCard({ economyId, nodeId }: { economyId: string; nodeId: string }) {
  const industry = industryById.get(nodeId);
  const cargo = cargoByLabel.get(nodeId);
  if (industry) {
    const eco = industry.economies[economyId];
    if (!eco) return null;
    const name = industry.name_by_economy?.[economyId] ?? industry.name;
    return (
      <div className="node-card">
        <h3>{name}</h3>
        <p className="hint">
          {industry.type.replace('Industry', '')} · {t(`firs.industry.mode.${eco.accept_mode}`)}
        </p>
        <h4>{t('firs.industry.accepts')}</h4>
        <ul>
          {eco.accepts.map((entry) => (
            <li key={entry.label}>
              <CargoName label={entry.label} />
              {entry.ratio != null ? ` — ${entry.ratio}/8` : ''}
            </li>
          ))}
        </ul>
        <h4>{t('firs.industry.produces')}</h4>
        <ul>
          {eco.produces.map((entry) => (
            <li key={entry.label}>
              <CargoName label={entry.label} />
              {entry.value != null ? ` — ${entry.value}` : ''}
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (cargo) {
    const economy = economyById.get(economyId)!;
    const producers = economy.graph.edges
      .filter((e) => e.kind === 'produces' && e.to === cargo.label)
      .map((e) => e.from);
    const consumers = economy.graph.edges
      .filter((e) => e.kind === 'accepts' && e.from === cargo.label)
      .map((e) => e.to);
    return (
      <div className="node-card">
        <h3>
          <CargoIcon icon={cargo.icon} /> {cargo.name}
        </h3>
        <p className="hint">
          {cargo.classes.join(', ')} · {cargo.units}
        </p>
        <p>
          {t('firs.cargo.payment')}: {num(cargo.initial_payment_by_economy[economyId] ?? 0)} ·{' '}
          {t('route.transitPeriods')}: {cargo.transit_periods[0]}/{cargo.transit_periods[1]}
        </p>
        <h4>{t('firs.cargo.producedBy')}</h4>
        <ul>
          {producers.map((id) => (
            <li key={id}>{industryById.get(id)?.name ?? id}</li>
          ))}
        </ul>
        <h4>{t('firs.cargo.acceptedBy')}</h4>
        <ul>
          {consumers.map((id) => (
            <li key={id}>{industryById.get(id)?.name ?? id}</li>
          ))}
        </ul>
      </div>
    );
  }
  return null;
}

function CargoName({ label }: { label: string }) {
  const cargo = cargoByLabel.get(label);
  return <span>{cargo?.name ?? label}</span>;
}

export default function FirsPage() {
  const { economyId, selectedNode, setEconomyId, setSelectedNode } = useFirsStore();
  const economy = economyById.get(economyId) ?? economies[0];
  const [svg, setSvg] = useState<string>('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    // graphviz-wasm (~1 МБ) грузим лениво только на этой вкладке
    import('@hpcc-js/wasm-graphviz').then(async ({ Graphviz }) => {
      const graphviz = await Graphviz.load();
      if (!cancelled) setSvg(graphviz.dot(economy.graph.dot));
    });
    return () => {
      cancelled = true;
    };
  }, [economy]);

  const highlight = useMemo(
    () => (selectedNode ? chainNodes(economy, selectedNode) : null),
    [economy, selectedNode],
  );

  // клики по узлам SVG (graphviz кладёт id узла в <title>)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handler = (event: Event) => {
      const target = event.target as Element;
      const nodeGroup = target.closest('g.node');
      if (nodeGroup) {
        const title = nodeGroup.querySelector('title')?.textContent;
        if (title) {
          setSelectedNode(title);
          return;
        }
      }
      setSelectedNode(null);
    };
    container.addEventListener('click', handler);
    return () => container.removeEventListener('click', handler);
  }, [setSelectedNode, svg]);

  // подсветка цепочки: приглушаем узлы/рёбра вне достижимого множества
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const nodes = container.querySelectorAll<SVGGElement>('g.node');
    const edges = container.querySelectorAll<SVGGElement>('g.edge');
    nodes.forEach((node) => {
      const id = node.querySelector('title')?.textContent ?? '';
      node.style.opacity = !highlight || highlight.has(id) ? '1' : '0.15';
    });
    edges.forEach((edge) => {
      const title = edge.querySelector('title')?.textContent ?? '';
      const [from, to] = title.split('->').map((s) => s.trim());
      const visible = !highlight || (highlight.has(from) && highlight.has(to));
      edge.style.opacity = visible ? '1' : '0.1';
    });
  }, [highlight, svg]);

  return (
    <div className="page-firs">
      <section className="firs-controls">
        <h2>{t('firs.title')}</h2>
        <div className="economy-tabs">
          {economies.map((eco) => (
            <button
              key={eco.id}
              className={eco.id === economy.id ? 'tab active' : 'tab'}
              onClick={() => setEconomyId(eco.id)}
            >
              {eco.name}
            </button>
          ))}
        </div>
        <p className="hint">
          {economy.industry_ids.length} {t('firs.industries')} · {economy.cargo_labels.length}{' '}
          {t('firs.cargos')} · {t('firs.hint')}
        </p>
      </section>
      <div className="firs-layout">
        <div
          ref={containerRef}
          className="graph-container"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        {selectedNode && (
          <aside className="firs-side">
            <NodeCard economyId={economy.id} nodeId={selectedNode} />
          </aside>
        )}
      </div>
    </div>
  );
}
