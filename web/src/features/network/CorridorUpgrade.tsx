import { NumberInput, Paper, Select, Table, Text, Title } from '@mantine/core';
import { intlLocale, t, useLocale } from '../../i18n';
import { num, speedUnitLabel, speedValue, unitSuffix } from '../../components/format';
import { Money } from '../../components/Money';
import { STEP_FROM_EMPTY } from '../../components/numberField';
import { TrainSelect } from '../../components/PictureSelect';
import { SummaryRow as Row } from '../../components/SummaryRow';
import type { RouteWithFlowParams } from '../../engine/trip';
import { useRouteStore } from '../../state/routeStore';
import { useCorridor } from './figures';
import { NETWORK_ANCHORS } from './panels';

/**
 * Does converting this corridor to another track pay for itself?
 *
 * The block below the upkeep panel, sharing its counts: the wire is paid for by every train
 * on the corridor, so the answer is a number of trains — the load threshold — and not a
 * verdict on the engine.
 */
export function CorridorUpgrade({ route }: { route: RouteWithFlowParams | null }) {
  const corridor = useRouteStore((s) => s.corridor);
  const setCorridor = useRouteStore((s) => s.setCorridor);
  const locale = useLocale();

  // the same computation the summary above ranks, so the two cannot state different figures
  const { options, target, candidates, replacement, result } = useCorridor(route);

  /** Why there is nothing to show — the block asks for what it is missing, in that order. */
  const missing = (): string => {
    if (!route) return t('corridor.needRoute');
    if (!target) return t('corridor.needTarget');
    if (corridor.pieces <= 0) return t('corridor.needPieces');
    if (corridor.trains <= 0) return t('corridor.needTrains');
    return t('corridor.needEngine');
  };

  return (
    <Paper component="section" id={NETWORK_ANCHORS.corridor} p="sm">
      <Title order={3}>{t('corridor.title')}</Title>
      <div className="network-inputs">
        <Select
          className="field"
          label={t('corridor.target')}
          value={target?.label ?? null}
          onChange={(v) => setCorridor({ target: v ?? '' })}
          data={options.map((o) => ({ value: o.railtype.label, label: o.name }))}
        />
        <NumberInput
          className="field"
          label={t('corridor.pieces')}
          suffix={unitSuffix(t('units.trackPieces'))}
          min={0}
          allowDecimal={false}
          startValue={STEP_FROM_EMPTY}
          value={corridor.pieces || ''}
          onChange={(v) => setCorridor({ pieces: Math.max(0, Number(v) || 0) })}
        />
        <NumberInput
          className="field"
          label={t('corridor.trains')}
          min={1}
          allowDecimal={false}
          startValue={STEP_FROM_EMPTY}
          value={corridor.trains || ''}
          onChange={(v) => setCorridor({ trains: Math.max(0, Number(v) || 0) })}
        />
        {/* the engine is picked by its picture as much as by its name, the way the game's
            purchase list is read — so the sprite stands both in the list and in the field */}
        <TrainSelect
          className="field field-engine"
          label={t('corridor.replacement')}
          searchable
          value={replacement?.id ?? null}
          onChange={(v) => setCorridor({ engineId: v })}
          data={candidates
            .map((train) => ({ value: train.id, label: train.name }))
            .sort((a, b) => a.label.localeCompare(b.label, intlLocale(locale)))}
        />
      </div>
      <Text className="hint">{t('corridor.pieceRule')}</Text>
      {/* a hand-entered leg applies to both sides, so a faster engine buys no time here —
          said out loud rather than left to be read off two identical round trips */}
      {route?.loadedDaysOverride != null && (
        <Text className="hint">{t('corridor.manualDays')}</Text>
      )}

      {result == null ? (
        <Text className="hint">{missing()}</Text>
      ) : (
        <>
          <Table className="summary-table stats-wide" withRowBorders={false}>
            <Table.Tbody>
              <Row label={t('corridor.roundTrip')}>
                {num(result.before.economics.roundTripDays, 1)} →{' '}
                {num(result.after.economics.roundTripDays, 1)} {t('units.days')}
              </Row>
              <Row label={t('corridor.tripsPerYear')}>
                {num(result.before.economics.tripsPerYear, 1)} →{' '}
                {num(result.after.economics.tripsPerYear, 1)}
              </Row>
              <Row label={t('corridor.incomePerTrip')}>
                <Money value={result.before.economics.incomePerTrip} /> →{' '}
                <Money value={result.after.economics.incomePerTrip} />
              </Row>
              <Row label={t('corridor.runningCost')}>
                <Money value={result.before.economics.runningCostPerYear} /> →{' '}
                <Money value={result.after.economics.runningCostPerYear} />
              </Row>
              <Row label={t('corridor.gradeSpeed')}>
                {speedValue(result.before.gradeSpeedInternal)} →{' '}
                {speedValue(result.after.gradeSpeedInternal)} {speedUnitLabel()}
              </Row>
              <Row label={t('corridor.trainProfit')}>
                <Money value={result.before.economics.profitPerYear} /> →{' '}
                <Money value={result.after.economics.profitPerYear} />
              </Row>
              <Row label={t('corridor.maintenanceDelta')}>
                <Money value={result.maintenanceDelta} />
              </Row>
              <Table.Tr>
                <Table.Td>{t('corridor.yearlyDelta')}</Table.Td>
                <Table.Td
                  className={`cell-num big ${result.yearlyDelta >= 0 ? 'profit' : 'loss'}`}
                >
                  <Money value={result.yearlyDelta} />
                </Table.Td>
              </Table.Tr>
              <Row label={t('corridor.threshold')}>
                {result.threshold == null
                  ? t('corridor.neverPays')
                  : `${num(result.threshold)} (${
                      corridor.trains >= result.threshold
                        ? t('corridor.enoughTraffic')
                        : t('corridor.shortBy', { n: num(result.threshold - corridor.trains) })
                    })`}
              </Row>
              <Row label={t('corridor.capital')}>
                <Money value={result.capital} />
              </Row>
              <Row label={t('corridor.breakEven')}>
                {result.breakEvenYear == null ? '—' : num(result.breakEvenYear, 1)}
              </Row>
            </Table.Tbody>
          </Table>
          <Text className="hint">{t('corridor.assumptions')}</Text>
        </>
      )}
    </Paper>
  );
}
