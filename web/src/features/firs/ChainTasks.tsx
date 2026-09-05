import { useMemo } from 'react';
import { Group, NumberInput, Paper, Select, Table, Text, Title } from '@mantine/core';
import { TableFrame } from '../../components/table/TableFrame';
import { activeIndustries, cargoByLabel, industriesMeta, industryById } from '../../dataset';
import { t, useLocale } from '../../i18n';
import { cargoName, industryName, sortIndustries } from '../../i18n/names';
import { num } from '../../components/format';
import { supplyRule } from '../../engine/supply';
import { fieldWidth } from '../../skin';
import { useFirsStore } from '../../state/firsStore';
import { BridgeButton } from '../savegame/BridgeButton';
import { chainTaskToSupply } from '../savegame/bridge';
import { applySupplyBridge } from '../savegame/applyBridge';
import { useNavigate } from 'react-router';
import { useSettingsStore } from '../../state/settingsStore';
import type { Economy } from '../../types';
import type { GameSettings } from '../../engine/settings';
import type { Snapshot } from '../../savegame/snapshot';
import { carriesTheChain } from './dependencies';
import { chainTasks, linkKey, scaleCargo } from './tasks';
import {
  FALLBACK_OUTPUT_PER_MONTH,
  defaultOutputPerMonth,
  orderTasks,
  tasksInGame,
  type GameTask,
} from './gameChain';

/**
 * The chain mode of the tab: pick the industry you want to run, and read off what has to be
 * hauled where before it will.
 */
export function ChainTasks({ economy, snapshot }: { economy: Economy; snapshot: Snapshot | null }) {
  const { chainTargetId, setChainTargetId, targetOutputPerMonth, setTargetOutputPerMonth } =
    useFirsStore();
  const game = useSettingsStore((s) => s.game);
  const locale = useLocale();

  const options = useMemo(
    () =>
      sortIndustries(activeIndustries(game), locale).map((industry) => ({
        value: industry.id,
        label: industryName(industry),
      })),
    [game, locale],
  );

  const target = chainTargetId === null ? null : (industryById.get(chainTargetId) ?? null);
  const scaled = target !== null && carriesTheChain(target);
  // the field names the very cargo the volumes are worked out in, from the same function
  const cargoOfScale = scaleCargo(economy, target);
  const output =
    targetOutputPerMonth ??
    (chainTargetId === null
      ? FALLBACK_OUTPUT_PER_MONTH
      : defaultOutputPerMonth(chainTargetId, cargoOfScale, snapshot));
  const tasks = useMemo(() => {
    if (!chainTargetId) return [];
    const { tasks: built } = chainTasks({
      economy,
      targetId: chainTargetId,
      targetOutputPerMonth: output,
      game,
      windowTicks: industriesMeta.supply_window_ticks,
    });
    return orderTasks(tasksInGame(built, snapshot));
  }, [chainTargetId, economy, game, output, snapshot]);

  return (
    <Paper component="section" className="firs-chain" p="sm">
      <Title order={3}>{t('firs.chain.title')}</Title>
      <Text className="hint">{t('firs.chain.intro')}</Text>
      <Group className="filters" align="flex-end" gap="xs">
        <Select
          label={t('firs.chain.target')}
          description={t('firs.chain.targetHint')}
          data={options}
          value={chainTargetId || null}
          onChange={setChainTargetId}
          searchable
          clearable
          {...fieldWidth('wide')}
        />
        {/* the field is shown only where it changes something: an industry running on a
            supply pool is sized by its own thresholds, and one whose rule is not modelled is
            not sized at all — a field that moved no number would be a lie about the figures */}
        {scaled ? (
          <NumberInput
            label={t('firs.chain.output', {
              cargo: cargoName(cargoOfScale === null ? undefined : cargoByLabel.get(cargoOfScale)),
            })}
            description={t('firs.chain.outputHint')}
            value={output}
            onChange={(value) =>
              setTargetOutputPerMonth(typeof value === 'number' && value > 0 ? value : null)
            }
            min={1}
            {...fieldWidth('narrow')}
          />
        ) : (
          target && <Text className="hint">{t(`firs.chain.scale.${supplyRule(target)}`)}</Text>
        )}
      </Group>

      {/* the order is the answer here, so the list is not sortable: sorting it by anything
          else would throw away what the mode worked out */}
      <TableFrame rowCount={tasks.length} emptyMessage={t('firs.chain.empty')} pinEdges>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>{t('firs.chain.cargo')}</Table.Th>
            <Table.Th>{t('firs.chain.from')}</Table.Th>
            <Table.Th>{t('firs.chain.to')}</Table.Th>
            <Table.Th>{t('firs.chain.volume')}</Table.Th>
            <Table.Th>{t('firs.chain.leg')}</Table.Th>
            <Table.Th>{t('firs.chain.state')}</Table.Th>
            <Table.Th aria-label={t('firs.chain.bridge')} />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {tasks.map((task) => (
            <TaskRow key={linkKey(task)} task={task} game={game} />
          ))}
        </Table.Tbody>
      </TableFrame>

      {tasks.length > 0 && (
        <div className="firs-chain-notes">
          <Text className="hint">{t('firs.chain.noteSplit')}</Text>
          {/* the pool counts every input into one total (produce_primary.pynml), so a
              threshold is not a per-cargo figure — the note says so in the player's terms */}
          {tasks.some((task) => task.volume.kind === 'pool') && (
            <Text className="hint">{t('firs.chain.notePool')}</Text>
          )}
          <Text className="hint">
            {snapshot ? t('firs.chain.noteSupplied') : t('firs.chain.noteNoGame')}
          </Text>
          {snapshot && <Text className="hint">{t('firs.chain.noteDistance')}</Text>}
        </div>
      )}
    </Paper>
  );
}

function TaskRow({ task, game }: { task: GameTask; game: GameSettings }) {
  const navigate = useNavigate();
  const bridge = chainTaskToSupply(
    {
      cargoLabel: task.cargoLabel,
      industryId: task.consumer.id,
      distanceTiles: task.source?.tiles ?? null,
      productionPerMonth: task.source?.outputPerMonth ?? null,
    },
    game,
  );
  return (
    <Table.Tr data-state={task.state ?? 'unknown'}>
      <Table.Td>{cargoName(cargoByLabel.get(task.cargoLabel)) || task.cargoLabel}</Table.Td>
      <Table.Td>{sourceLabel(task)}</Table.Td>
      <Table.Td>{industryName(task.consumer)}</Table.Td>
      <Table.Td>{volumeLabel(task)}</Table.Td>
      <Table.Td>{legLabel(task)}</Table.Td>
      <Table.Td>{stateLabel(task)}</Table.Td>
      <Table.Td>
        <BridgeButton
          action={t('firs.chain.bridge')}
          bridge={bridge}
          onTake={(values) => {
            applySupplyBridge(values, industryName(task.consumer));
            void navigate('/supply');
          }}
        />
      </Table.Td>
    </Table.Tr>
  );
}

/** The industry to haul from: a plot of the game where there is one, the set's types otherwise. */
function sourceLabel(task: GameTask): string {
  if (task.producers.length === 0) return t('firs.chain.noProducer');
  const names = task.producers.map((industry) => industryName(industry));
  // with a game imported, no source found means the map has none of these industries — which
  // is the answer the player came for, not a blank
  if (!task.source) {
    if (task.state === null) return names.join(', ');
    // industries of the kind stand on the map, but the save stated no size to measure by
    return task.sourcesOnMap > 0
      ? t('firs.chain.sourceUnmeasured', { names: names.join(', ') })
      : t('firs.chain.sourceAbsent', { names: names.join(', ') });
  }
  const name = industryName(industryById.get(task.source.catalogueId));
  return task.source.candidates > 1
    ? t('firs.chain.nearestOf', { name, count: task.source.candidates })
    : name;
}

function volumeLabel(task: GameTask): string {
  if (task.volume.kind === 'delivery') {
    return t('firs.chain.perWindow', { amount: num(Math.ceil(task.volume.perWindow)) });
  }
  if (task.volume.kind === 'pool') {
    const levels = task.volume.levels
      .map((level, i) =>
        t('firs.chain.poolLevel', {
          level: i + 1,
          threshold: num(level.threshold),
          percent: num(level.production_percent),
        }),
      )
      .join(' · ');
    // the thresholds are one count over every input of the industry, so a figure read as
    // "bring this much of this cargo" would multiply by the number of inputs
    return `${levels} · ${t('firs.chain.poolShared')}`;
  }
  if (task.volume.kind === 'unscaled') return t('firs.chain.unscaled');
  return t('firs.chain.unknownRule');
}

function legLabel(task: GameTask): string {
  if (!task.source) return '—';
  // the number carries the unit the way every other list prints it; the key only says which
  // side of town the haul is on, so no key has to decline a Russian noun after a number
  const tiles = `${num(task.source.tiles)} ${t('units.tiles')}`;
  // a leg whose towns are unknown says only its length: there is no side of town to name
  return task.source.legClass === 'unknown-town'
    ? tiles
    : `${tiles}, ${t(`firs.chain.leg.${task.source.legClass}`)}`;
}

function stateLabel(task: GameTask): string {
  return task.state === null ? '—' : t(`firs.chain.state.${task.state}`);
}
