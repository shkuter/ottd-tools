import { useMemo } from 'react';
import { NumberInput, Paper, Select, Table, Text, Title } from '@mantine/core';
import { activeRailtype, activeTrains, availabilityContext, selectableRailtypes } from '../../dataset';
import { intlLocale, t, useLocale } from '../../i18n';
import { railtypeOptions } from '../../i18n/names';
import { num, speedUnitLabel, speedValue, unitSuffix } from '../../components/format';
import { Money } from '../../components/Money';
import { SummaryRow as Row } from '../../components/SummaryRow';
import { corridorUpgrade, replacementCandidates } from '../../engine/corridorUpgrade';
import type { RouteWithFlowParams } from '../../engine/trip';
import { useSoldIds } from '../savegame/soldIds';
import { networkCounts, useRouteStore } from '../../state/routeStore';
import { useSettingsStore } from '../../state/settingsStore';

/**
 * Does converting this corridor to another track pay for itself?
 *
 * The block below the upkeep panel, sharing its counts: the wire is paid for by every train
 * on the corridor, so the answer is a number of trains — the load threshold — and not a
 * verdict on the engine.
 */
export function CorridorUpgrade({ route }: { route: RouteWithFlowParams | null }) {
  const { game, calc } = useSettingsStore();
  const corridor = useRouteStore((s) => s.corridor);
  const setCorridor = useRouteStore((s) => s.setCorridor);
  const network = useRouteStore((s) => s.network);
  const locale = useLocale();

  const from = activeRailtype(game, calc.trackType);
  // named through railtypeOptions for the same reason the upkeep block does: a set may call
  // two tracks the same thing, and the list would then hold two identical entries. Not
  // memoised — the names are translated, and a memo would hold the language they were first
  // drawn in
  const options = railtypeOptions(selectableRailtypes(game)).filter(
    (option) => option.railtype.label !== from.label,
  );
  const target = options.find((o) => o.railtype.label === corridor.target)?.railtype ?? null;

  // the same buy menu every other list of vehicles reads, sold ids included: an imported game
  // has already answered which machines exist in it, and that answer beats the formula
  // (engine/availability.ts)
  const soldIds = useSoldIds(calc.priceYear, game);
  const buyMenu = useMemo(() => availabilityContext(game, soldIds), [game, soldIds]);
  const candidates = useMemo(
    () => (target ? replacementCandidates(activeTrains(game), target, game, calc, buyMenu) : []),
    [target, game, calc, buyMenu],
  );
  const replacement = candidates.find((train) => train.id === corridor.engineId) ?? null;

  const result = useMemo(() => {
    if (!route || !target) return null;
    return corridorUpgrade(route, {
      target,
      pieces: corridor.pieces,
      trains: corridor.trains,
      replacement,
      network: networkCounts(network),
    });
  }, [route, target, replacement, corridor.pieces, corridor.trains, network]);

  /** Why there is nothing to show — the block asks for what it is missing, in that order. */
  const missing = (): string => {
    if (!route) return t('corridor.needRoute');
    if (!target) return t('corridor.needTarget');
    if (corridor.pieces <= 0) return t('corridor.needPieces');
    if (corridor.trains <= 0) return t('corridor.needTrains');
    return t('corridor.needEngine');
  };

  return (
    <Paper component="section" className="route-corridor" p="sm">
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
          value={corridor.pieces || ''}
          onChange={(v) => setCorridor({ pieces: Math.max(0, Number(v) || 0) })}
        />
        <NumberInput
          className="field"
          label={t('corridor.trains')}
          min={1}
          allowDecimal={false}
          value={corridor.trains || ''}
          onChange={(v) => setCorridor({ trains: Math.max(0, Number(v) || 0) })}
        />
        <Select
          className="field"
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
