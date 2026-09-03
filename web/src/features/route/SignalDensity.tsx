import { useMemo } from 'react';
import { NumberInput, Paper, Table, Text, Title } from '@mantine/core';
import { t } from '../../i18n';
import { num, speedUnitLabel, speedValue, unitSuffix } from '../../components/format';
import { Money } from '../../components/Money';
import { SummaryRow as Row } from '../../components/SummaryRow';
import { Warning } from '../../components/Warning';
import { signalInputs, signalPlan } from '../../engine/signals';
import type { RouteWithFlowParams } from '../../engine/trip';
import { networkCounts, useRouteStore } from '../../state/routeStore';

/**
 * How many signals this line is worth, and what the extra ones cost.
 *
 * The block below the corridor, on the same counts as the upkeep panel: the useful spacing
 * comes from the braking distance of the consist the tab has built, so the answer is a
 * number of signal heads rather than a verdict on the signalling itself.
 */
export function SignalDensity({ route }: { route: RouteWithFlowParams | null }) {
  const network = useRouteStore((s) => s.network);
  const signals = useRouteStore((s) => s.signals);
  const setSignals = useRouteStore((s) => s.setSignals);

  const inputs = useMemo(
    () => (route ? signalInputs(route, networkCounts(network), signals.descentLevels) : null),
    [route, network, signals.descentLevels],
  );

  // settings come off the route, not off the store: the route already carries the game and
  // the assumptions the panel above was drawn with, and reading a second copy is how the two
  // would start disagreeing (corridorUpgrade.ts does the same)
  const result = useMemo(
    () => (inputs && route ? signalPlan(inputs, route) : null),
    [inputs, route],
  );

  /** Why there is nothing to show — the block asks for what it is missing, in that order. */
  const missing = (): string => {
    if (!route) return t('signals.needRoute');
    return t('signals.needPieces');
  };

  return (
    <Paper component="section" className="route-signals" p="sm">
      <Title order={3}>{t('signals.title')}</Title>
      <div className="network-inputs">
        <NumberInput
          className="field"
          label={t('signals.descent')}
          suffix={unitSuffix(t('units.heightLevels'))}
          min={0}
          allowDecimal={false}
          // empty rather than a zero nobody typed, as the upkeep block has it
          value={signals.descentLevels || ''}
          onChange={(v) => setSignals({ descentLevels: Math.max(0, Number(v) || 0) })}
        />
      </div>
      <Text className="hint">{t('signals.spacingRule')}</Text>
      {/* a descent only lengthens braking under the realistic acceleration model, so a number
          typed here does nothing at all under the original one — said out loud rather than
          left as a field with no effect */}
      {route?.game?.accelerationModel === 'original' && (
        <Text className="hint">{t('signals.descentInactive')}</Text>
      )}

      {result == null ? (
        <Text className="hint">{missing()}</Text>
      ) : (
        <>
          <Table className="summary-table stats-wide" withRowBorders={false}>
            <Table.Tbody>
              <Row label={t('signals.speed')}>
                {speedValue(result.speedInternal)} {speedUnitLabel()}
              </Row>
              <Row label={t('signals.brakingDistance')}>
                {result.realisticBraking
                  ? `${num(result.brakingTiles, 1)} ${t('units.tiles')}`
                  : t('signals.noBraking')}
              </Row>
              {/* both spacings in one unit: a spacing along a track is the same number of
                  pieces, and showing one in tiles and the other in pieces reads as two
                  different measures (CONTEXT.md, useful spacing) */}
              <Row label={t('signals.usefulSpacing')}>
                {num(result.usefulSpacing, 1)} {t('units.trackPieces')}
              </Row>
              <Row label={t('signals.currentSpacing')}>
                {result.currentSpacing == null
                  ? t('signals.noSignals')
                  : `${num(result.currentSpacing, 1)} ${t('units.trackPieces')}`}
              </Row>
              <Row label={t('signals.recommended')}>{num(result.recommendedSignals)}</Row>
              {/* two rows rather than "now → then" in one cell: the pair does not fit the
                  column and wraps, and a wrapped row stands half a line taller than its
                  neighbours */}
              <Row label={t('signals.upkeepNow')}>
                <Money value={result.yearlyNow} />
              </Row>
              <Row label={t('signals.upkeepRecommended')}>
                <Money value={result.yearlyRecommended} />
              </Row>
              <Table.Tr>
                <Table.Td>{t('signals.saving')}</Table.Td>
                <Table.Td className={`cell-num big ${result.yearlySaving > 0 ? 'profit' : ''}`}>
                  <Money value={result.yearlySaving} />
                </Table.Td>
              </Table.Tr>
            </Table.Tbody>
          </Table>
          {result.tooSparse && (
            <Warning>
              {t('signals.tooSparse', {
                // tooSparse cannot be true without a current spacing to compare against
                n: num(result.currentSpacing!, 1),
                useful: num(result.usefulSpacing, 1),
              })}
            </Warning>
          )}
          {!result.realisticBraking && <Text className="hint">{t('signals.originalModel')}</Text>}
          {!route?.game?.infrastructureMaintenance && (
            <Text className="hint">{t('network.disabled')}</Text>
          )}
        </>
      )}
    </Paper>
  );
}
