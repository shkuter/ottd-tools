import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { List, Paper, Text, Title } from '@mantine/core';
import { activeEconomy, cargoByLabel, economyById, industryById } from '../../dataset';
import { t, useLocale } from '../../i18n';
import { cargoName, cargoUnits, industryName } from '../../i18n/names';
import { num } from '../../components/format';
import { CargoIcon } from '../../components/CargoIcon';
import { useFirsStore } from '../../state/firsStore';
import { useSettingsStore } from '../../state/settingsStore';
import { cargoPaymentRate } from '../../engine/income';
import { chainNodes } from './chains';
import { ChainTasks } from './ChainTasks';
import { GraphCanvas } from './graph/GraphCanvas';
import { buildGraph, type GraphNames } from './graph/buildGraph';
import { cachedLayout, layoutGraph } from './graph/layout';
import type { GraphNode, Layout } from './graph/model';
import { BridgeButton } from '../savegame/BridgeButton';
import { cargoToIncome, chainTaskToSupply } from '../savegame/bridge';
import { applyCargoIncomeBridge, applySupplyBridge } from '../savegame/applyBridge';
import { getSnapshotState, subscribeSnapshot } from '../../savegame/snapshotStore';
import { useNavigate } from 'react-router';

function NodeCard({ economyId, nodeId }: { economyId: string; nodeId: string }) {
  const { game, calc } = useSettingsStore();
  // a bridge carries the values and goes where they are used, as every other bridge does
  const navigate = useNavigate();
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
              {entry.ratio != null ? ` — ${entry.ratio}/8` : ''}{' '}
              {/* each input is a supply task in waiting: the same bridge the task list offers */}
              <BridgeButton
                action={t('firs.bridge.toSupply')}
                bridge={chainTaskToSupply(
                  { industryId: industry.id, cargoLabel: entry.label, distanceTiles: null, productionPerMonth: null },
                  game,
                )}
                onTake={(values) => {
                  applySupplyBridge(values, name);
                  void navigate('/supply');
                }}
              />
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
    const name = cargoName(cargo);
    return (
      <div className="node-card">
        <Title order={3}>
          <CargoIcon icon={cargo.icon} /> {name}{' '}
          <BridgeButton
            action={t('firs.bridge.toIncome')}
            bridge={cargoToIncome(cargo.label, game)}
            onTake={(values) => {
              applyCargoIncomeBridge(values, name);
              void navigate('/income');
            }}
          />
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
  const { selectedNode, setSelectedNode, setChainTargetId, showEconomy } = useFirsStore();
  const snapshot = useSyncExternalStore(subscribeSnapshot, getSnapshotState).record?.snapshot ?? null;
  const game = useSettingsStore((s) => s.game);
  const economy = activeEconomy(game);
  // the notes of the nodes are worded in the current language; the layout is not, and is
  // cached by the DOT, so a language switch redraws the cards and leaves the drawing alone
  const locale = useLocale();

  // t() and the name helpers read the locale outside React unless handed it; handed it,
  // the memo is keyed on what it actually depends on
  const names = useMemo<GraphNames>(
    () => ({
      industry: (industry) => industryName(industry, economy.id, locale),
      cargo: (cargo) => cargoName(cargo, locale),
      requires: (cargo) => t('firs.node.requires', { cargo }, locale),
      produces: (cargo) => t('firs.node.produces', { cargo }, locale),
      to: (industry) => t('firs.node.to', { industry }, locale),
    }),
    [economy.id, locale],
  );
  const graph = useMemo(() => buildGraph(economy, { industryById, cargoByLabel }, names), [economy, names]);

  // the layout is a function of the DOT alone, and the DOT is the same in every language:
  // a known one is picked up before the first paint (no blank canvas on a language switch,
  // and the view stays where it was); an unknown one is laid out
  const { dot } = graph;
  const [layout, setLayout] = useState<Layout | null>(() => cachedLayout(dot) ?? null);
  useEffect(() => {
    const cached = cachedLayout(dot);
    if (cached) {
      setLayout(cached);
      return;
    }
    let cancelled = false;
    setLayout(null);
    layoutGraph(dot).then((placed) => {
      if (!cancelled) setLayout(placed);
    });
    return () => {
      cancelled = true;
    };
  }, [dot]);

  // the pick belongs to the economy it was made in (see the store): the tab says which one
  // it shows, and the store drops a pick from another — on a switch, not on every visit, so
  // coming back from another tab finds the pick where it was left
  useEffect(() => showEconomy(economy.id), [economy.id, showEconomy]);

  const highlight = useMemo(
    () => (selectedNode ? chainNodes(economy, selectedNode) : null),
    [economy, selectedNode],
  );

  const select = (baseId: string | null) => {
    setSelectedNode(baseId);
    // an industry node is also the answer to "what do you want to run": picking it on
    // the graph is the shortest way to a chain, and the select stays for the rest
    if (baseId && industryById.has(baseId)) setChainTargetId(baseId);
  };

  // stable while the language and the economy are, so the canvas can memoise on them
  const nameOf = useCallback(
    (node: GraphNode) =>
      node.industry ? names.industry(node.industry) : node.cargo ? names.cargo(node.cargo) : node.baseId,
    [names],
  );
  const modeOf = useCallback(
    (node: GraphNode) => {
      const mode = node.industry?.economies[economy.id]?.accept_mode;
      return mode ? t(`firs.industry.mode.${mode}`, undefined, locale) : '';
    },
    [economy.id, locale],
  );

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
        <GraphCanvas
          graph={graph}
          layout={layout}
          economyId={economy.id}
          selected={selectedNode}
          highlight={highlight}
          onSelect={select}
          nameOf={nameOf}
          modeOf={modeOf}
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
