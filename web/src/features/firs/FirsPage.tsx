import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { List, Paper, Text, Title } from '@mantine/core';
import { activeEconomy, cargoByLabel, economyById, industryById } from '../../dataset';
import { t, useLocale } from '../../i18n';
import { cargoName, cargoUnits, industryName, localiseDot } from '../../i18n/names';
import { num } from '../../components/format';
import { CargoIcon } from '../../components/CargoIcon';
import { useFirsStore } from '../../state/firsStore';
import { useSettingsStore } from '../../state/settingsStore';
import { cargoPaymentRate } from '../../engine/income';
import { chainNodes } from './chains';
import { ChainTasks } from './ChainTasks';
import { getSnapshotState, subscribeSnapshot } from '../../savegame/snapshotStore';

function NodeCard({ economyId, nodeId }: { economyId: string; nodeId: string }) {
  const { game, calc } = useSettingsStore();
  const industry = industryById.get(nodeId);
  const cargo = cargoByLabel.get(nodeId);
  if (industry) {
    const eco = industry.economies[economyId];
    if (!eco) return null;
    const name = industryName(industry, economyId);
    return (
      <div className="node-card">
        <Title order={3}>{name}</Title>
        <Text className="hint">
          {industry.type.replace('Industry', '')} · {t(`firs.industry.mode.${eco.accept_mode}`)}
        </Text>
        <Title order={4}>{t('firs.industry.accepts')}</Title>
        <List>
          {eco.accepts.map((entry) => (
            <List.Item key={entry.label}>
              <CargoName label={entry.label} />
              {entry.ratio != null ? ` — ${entry.ratio}/8` : ''}
            </List.Item>
          ))}
        </List>
        <Title order={4}>{t('firs.industry.produces')}</Title>
        <List>
          {eco.produces.map((entry) => (
            <List.Item key={entry.label}>
              <CargoName label={entry.label} />
              {entry.value != null ? ` — ${entry.value}` : ''}
            </List.Item>
          ))}
        </List>
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
        <Title order={3}>
          <CargoIcon icon={cargo.icon} /> {cargoName(cargo)}
        </Title>
        <Text className="hint">
          {cargo.classes.join(', ')} · {cargoUnits(cargo.units)}
        </Text>
        <Text>
          {t('firs.cargo.payment')}: {num(cargoPaymentRate(cargo, economyId, game, calc))} ·{' '}
          {t('route.transitPeriods')}: {cargo.transit_periods[0]}/{cargo.transit_periods[1]}
        </Text>
        <Title order={4}>{t('firs.cargo.producedBy')}</Title>
        <List>
          {producers.map((id) => (
            <List.Item key={id}>{industryName(industryById.get(id)) || id}</List.Item>
          ))}
        </List>
        <Title order={4}>{t('firs.cargo.acceptedBy')}</Title>
        <List>
          {consumers.map((id) => (
            <List.Item key={id}>{industryName(industryById.get(id)) || id}</List.Item>
          ))}
        </List>
      </div>
    );
  }
  return null;
}

function CargoName({ label }: { label: string }) {
  const cargo = cargoByLabel.get(label);
  return <span>{cargo ? cargoName(cargo) : label}</span>;
}

export default function FirsPage() {
  const { selectedNode, setSelectedNode, setChainTargetId } = useFirsStore();
  const snapshot = useSyncExternalStore(subscribeSnapshot, getSnapshotState).record?.snapshot ?? null;
  const game = useSettingsStore((s) => s.game);
  const economy = activeEconomy(game);
  // node labels are baked into the rendered SVG, so it has to be redrawn on switch
  const locale = useLocale();
  const [svg, setSvg] = useState<string>('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    // graphviz-wasm (~1 МБ) грузим лениво только на этой вкладке
    import('@hpcc-js/wasm-graphviz').then(async ({ Graphviz }) => {
      const graphviz = await Graphviz.load();
      if (!cancelled) setSvg(graphviz.dot(localiseDot(economy.graph.dot)));
    });
    return () => {
      cancelled = true;
    };
  }, [economy, locale]);

  // The selected node belongs to the economy it was clicked in: kept across a switch, it
  // would leave chainNodes() tracing a chain no node of the new graph is part of, dimming
  // the whole picture. The reset used to ride on the store's own setEconomyId; the setting
  // knows nothing of the graph, so the tab does it.
  useEffect(() => {
    setSelectedNode(null);
    setChainTargetId(null);
  }, [economy, setSelectedNode, setChainTargetId]);

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
          // an industry node is also the answer to "what do you want to run": picking it on
          // the graph is the shortest way to a chain, and the select stays for the rest
          if (industryById.has(title)) setChainTargetId(title);
          return;
        }
      }
      setSelectedNode(null);
    };
    container.addEventListener('click', handler);
    return () => container.removeEventListener('click', handler);
  }, [setChainTargetId, setSelectedNode, svg]);

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
        <Title order={2}>{t('firs.title')}</Title>
        {/* the graph belongs to the economy the game runs, which is a setting now — the tab
            shows which one it is instead of offering a second place to choose it */}
        <Text className="hint">
          {t('firs.economy')}: <b>{economy.name}</b> ({t('firs.economyHint')}) ·{' '}
          {economy.industry_ids.length} {t('firs.industries')} · {economy.cargo_labels.length}{' '}
          {t('firs.cargos')} · {t('firs.hint')}
        </Text>
      </section>
      <div className="firs-layout">
        <div
          ref={containerRef}
          className="graph-container"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        {selectedNode && (
          <Paper component="aside" className="firs-side" p="sm">
            <NodeCard economyId={economy.id} nodeId={selectedNode} />
          </Paper>
        )}
      </div>
      <ChainTasks economy={economy} snapshot={snapshot} />
    </div>
  );
}
