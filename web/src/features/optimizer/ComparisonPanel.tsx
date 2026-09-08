/**
 * The comparison panel: a figure per row, an engine per column. The numbers arrive ready from
 * `comparison.ts`; what happens here is formatting and labelling — in the dictionary's own
 * words, so a figure reads the same as it does in the answer above.
 */
import { Button, Table, Text, Title } from '@mantine/core';
import { TableFrame } from '../../components/table/TableFrame';
import type { Cargo } from '../../types';
import { Money } from '../../components/Money';
import { TrainImage } from '../../components/TrainImage';
import { t } from '../../i18n';
import { cargoUnits } from '../../i18n/names';
import {
  currencySymbol,
  engineLabel,
  num,
  percent,
  speedUnitLabel,
  speedValue,
  withUnit,
} from '../../components/format';
import type { ComparisonColumn, ComparisonMetric, MetricKind } from './comparison';
import { INSUFFICIENCY_STRINGS } from './insufficiency';

/** A row's label: the unit is appended wherever the number does not read without it. */
function metricLabel(metric: ComparisonMetric, cargo: Cargo | null): string {
  const label = t(metric.key);
  switch (metric.kind) {
    case 'force':
      return withUnit(label, t('units.kN'));
    case 'speed':
      return withUnit(label, speedUnitLabel());
    case 'cargo':
      return cargo ? withUnit(label, cargoUnits(cargo.units)) : label;
    case 'tiles':
      return withUnit(label, t('units.tiles'));
    case 'days':
      return withUnit(label, t('units.days'));
    case 'years':
      return withUnit(label, t('units.years'));
    case 'moneyPerUnit':
      // Money per unit of cargo: the label names both halves, or ", tonnes" would read as if
      // the cell held tonnes.
      return cargo ? withUnit(label, `${currencySymbol()}/${cargoUnits(cargo.units)}`) : label;
    default:
      return label;
  }
}

function metricValue(kind: MetricKind, value: number) {
  switch (kind) {
    case 'force':
      return num(value / 1000, 1);
    case 'speed':
      return speedValue(value);
    case 'tiles':
      return num(value, 2);
    case 'days':
      return num(value, 1);
    case 'years':
      return num(value, 1);
    case 'share':
      return percent(value);
    // Supply reads exactly as it does in the answer's own column: a production bonus in
    // percent at a pool industry, the interval against the window at a conversion one.
    case 'supplyBonus':
      return `${num(value)}%`;
    case 'supplyRatio':
      return num(value, 2);
    case 'money':
    case 'moneyPerUnit':
      return <Money value={value} />;
    default:
      return num(value);
  }
}

/** What a column without a row says: the goal refused every variant, or there were none. */
function noAnswer(column: ComparisonColumn): string {
  if (column.refused.length === 0) return t('compare.noAnswer');
  const conditions = column.refused.map((why) => t(INSUFFICIENCY_STRINGS[why]));
  return t('compare.noneSufficient', { conditions: conditions.join('; ') });
}

export function ComparisonPanel({
  columns,
  metrics,
  wagonName,
  cargo,
  onClose,
}: {
  columns: readonly ComparisonColumn[];
  metrics: readonly ComparisonMetric[];
  wagonName: string;
  cargo: Cargo | null;
  onClose: () => void;
}) {
  return (
    <section className="compare-panel">
      <div className="compare-head">
        <Title order={3}>{t('compare.title')}</Title>
        <Text component="p" inherit className="hint">
          {t('compare.sharedWagon', { wagon: wagonName })}
        </Text>
        <Button size="compact-sm" variant="default" onClick={onClose}>
          {t('compare.close')}
        </Button>
      </div>
      {/* `pinStart`, not `pinEdges`: the column a row is recognised by is the figure's name on
          the left, while the last column here is an engine's numbers — pinning that one would
          park it over its neighbour's. Empty means no columns; the rows are always there. */}
      <TableFrame pinStart rowCount={columns.length} emptyMessage={t('compare.nothing')}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>{t('compare.metric')}</Table.Th>
            {columns.map((c) => (
              <Table.Th key={`${c.engine.id}-${c.engineCount}`}>
                <TrainImage trainId={c.engine.id} />
                {engineLabel(c)}
              </Table.Th>
            ))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {columns.some((c) => c.row === null) && (
            <Table.Tr>
              <Table.Td>{t('compare.answer')}</Table.Td>
              {columns.map((c) => (
                <Table.Td key={`${c.engine.id}-${c.engineCount}`}>
                  {c.row ? t('compare.answerOk') : noAnswer(c)}
                </Table.Td>
              ))}
            </Table.Tr>
          )}
          {metrics.map((metric) => (
            <Table.Tr key={metric.id}>
              <Table.Td>{metricLabel(metric, cargo)}</Table.Td>
              {metric.values.map((value, i) => (
                <Table.Td
                  key={`${columns[i]!.engine.id}-${columns[i]!.engineCount}`}
                  className={`cell-num${metric.best[i] ? ' compare-best' : ''}`}
                >
                  {value === null ? '—' : metricValue(metric.kind, value)}
                </Table.Td>
              ))}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </TableFrame>
    </section>
  );
}
