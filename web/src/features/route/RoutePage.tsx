import { useMemo } from 'react';
import { Button, NumberInput, Paper, Select, Switch, Table, Text, Title } from '@mantine/core';
import { LineChart } from '@mantine/charts';
import { activeCargos, activeEntries, economyIdForPayment, activeTrainsMeta } from '../../dataset';
import { t, useLocale } from '../../i18n';
import { cargoName, cargoUnits, sortCargos } from '../../i18n/names';
import { currencySymbol, money, num, percent, speed, unitSuffix, withUnit } from '../../components/format';
import { Money } from '../../components/Money';
import { CargoIcon } from '../../components/CargoIcon';
import { TableFrame } from '../../components/table/TableFrame';
import { useRouteStore } from '../../state/routeStore';
import { PrefillNote } from '../../components/PrefillNote';
import { routePrefillState } from '../savegame/applyBridge';
import { useSettingsStore } from '../../state/settingsStore';
import { useConsistStore } from '../../state/consistStore';
import { cargoPaymentRate, incomeCurve, transportedGoodsIncome } from '../../engine/income';
import { transitPeriodsFromDays } from '../../engine/units';
import { consistStats } from '../../engine/consist';
import { routeWithFlow } from '../../engine/trip';
import { useActiveCargo } from '../useActiveCargo';

export default function RoutePage() {
  const route = useRouteStore();
  const consist = useConsistStore();
  const { game, calc } = useSettingsStore();
  const locale = useLocale();

  const cargoList = useMemo(() => sortCargos(activeCargos(game), locale), [game, locale]);
  const cargo = useActiveCargo(cargoList, route.cargoLabel, route.setCargoLabel);

  /*
   * Only what the current game could actually buy. A consist survives a change of vehicle set
   * in localStorage, and pricing a vanilla wagon with Iron Horse's basecost shifts (or the
   * other way round) states money no game charges.
   */
  const entries = useMemo(() => activeEntries(consist.entries, game), [consist.entries, game]);

  const stats = useMemo(
    () => consistStats(entries, cargo ?? null, calc.capacityIndex, activeTrainsMeta(game), game, calc),
    [entries, cargo, calc, game],
  );

  const payment = cargo ? cargoPaymentRate(cargo, economyIdForPayment(game), game, calc) : 0;
  const spec = useMemo(
    () => (cargo ? { currentPayment: payment, transitPeriods: cargo.transit_periods } : null),
    [cargo, payment],
  );

  // Round-trip economics of the consist built on the Consist tab — the same model the
  // optimizer uses, so a consist carried over with "→" shows the same figures here. The
  // optimizer picks the loading branch by its goal; this tab has no goal, so the branch is
  // the user's to set, and with it the source output the waiting branch accumulates from.
  const routeTrip = useMemo(() => {
    if (entries.length === 0 || !cargo) return null;
    return routeWithFlow({
      entries,
      cargo,
      payment,
      distanceTiles: route.distanceTiles,
      meta: activeTrainsMeta(game),
      game,
      calc,
      loadedDaysOverride: route.manualDays,
      productionPerMonth: route.productionPerMonth,
      waitForFullLoad: route.waitForFullLoad,
    });
  }, [
    entries, cargo, payment, route.distanceTiles, route.manualDays,
    route.productionPerMonth, route.waitForFullLoad, game, calc,
  ]);
  const consistDays =
    routeTrip && routeTrip.economics.loadedSpeedInternal > 0 ? routeTrip.economics.daysLoaded : null;
  const days = route.manualDays ?? consistDays ?? 0;

  const income = spec
    ? transportedGoodsIncome(
        route.amount,
        route.distanceTiles,
        transitPeriodsFromDays(days),
        spec,
        game.cargoAgingRate,
        game.jgrpp ? game.paymentAlgorithm : 'modern',
      )
    : 0;

  const chart = useMemo(
    () =>
      spec
        ? incomeCurve(
            route.amount,
            route.distanceTiles,
            days,
            spec,
            game.cargoAgingRate,
            game.jgrpp ? game.paymentAlgorithm : 'modern',
          )
        : [],
    [spec, route.amount, route.distanceTiles, days, game.cargoAgingRate, game.jgrpp, game.paymentAlgorithm],
  );

  const chartMaxDays = chart.at(-1)?.days ?? 0;

  const profit = routeTrip
    ? {
        ...routeTrip.economics,
        profitPerTile:
          stats.lengthTiles > 0 ? routeTrip.economics.profitPerYear / stats.lengthTiles : 0,
      }
    : null;

  return (
    <>
      {/* the page is titled where every other tab titles itself; the panel below
          names its own part rather than standing in for the whole tab */}
      <Title order={2}>{t('route.title')}</Title>
      <div className="page-route">
        <Paper component="section" className="route-controls" p="sm">
          <PrefillNote origin={route.prefillOrigin} current={routePrefillState(game)} />
          <Select
            className="field"
            label={t('route.cargo')}
            searchable
            allowDeselect={false}
            leftSection={<CargoIcon icon={cargo?.icon ?? ''} />}
            value={cargo?.label ?? null}
            onChange={(v) => v && route.setCargoLabel(v)}
            data={cargoList.map((c) => ({ value: c.label, label: cargoName(c) }))}
          />
          <NumberInput
            className="field"
            label={t('route.distance')}
            suffix={unitSuffix(t('units.tiles'))}
            min={1}
            value={route.distanceTiles}
            onChange={(v) => route.setDistanceTiles(Number(v) || 1)}
          />
          <NumberInput
            className="field"
            label={t('route.amount')}
            suffix={cargo ? unitSuffix(cargoUnits(cargo.units)) : ''}
            min={1}
            value={route.amount}
            onChange={(v) => route.setAmount(Number(v) || 1)}
          />
          <NumberInput
            className="field"
            label={t('route.days')}
            suffix={unitSuffix(t('units.days'))}
            min={0}
            step={0.5}
            value={route.manualDays ?? Number(days.toFixed(1))}
            onChange={(v) => route.setManualDays(Number(v) || 0)}
          />
          <NumberInput
            className="field"
            label={t('route.production')}
            suffix={t('units.perMonth')}
            description={t('route.productionHint')}
            min={0}
            value={route.productionPerMonth}
            onChange={(v) => route.setProductionPerMonth(Math.max(0, Number(v) || 0))}
          />
          <Switch
            className="field"
            label={t('route.waitForFullLoad')}
            description={
              route.productionPerMonth > 0
                ? t('route.waitForFullLoadHint')
                : t('route.waitForFullLoadNeedsFlow')
            }
            checked={route.waitForFullLoad}
            onChange={(e) => route.setWaitForFullLoad(e.currentTarget.checked)}
          />
          {consistDays != null && (
            <Button variant="subtle" className="btn-link" onClick={() => route.setManualDays(null)}>
              {t('route.daysFromConsist')}: {num(consistDays, 1)} {t('units.days')} (
              {speed(stats.balancingSpeedInternal)})
            </Button>
          )}

          {cargo && (
            <Table className="summary-table" withRowBorders={false}>
              <Table.Tbody>
                <Table.Tr>
                  <Table.Td>{t('route.payment')}</Table.Td>
                  <Table.Td className="cell-num">{num(payment)}</Table.Td>
                </Table.Tr>
                <Table.Tr>
                  <Table.Td>{t('route.transitPeriods')}</Table.Td>
                  <Table.Td className="cell-num">
                    {cargo.transit_periods[0]}/{cargo.transit_periods[1]}
                  </Table.Td>
                </Table.Tr>
                <Table.Tr>
                  <Table.Td>{t('route.income')}</Table.Td>
                  <Table.Td className="cell-num big">
                    {money(income)}
                  </Table.Td>
                </Table.Tr>
              </Table.Tbody>
            </Table>
          )}
        </Paper>

        <section className="route-chart">
          <Title order={3}>{withUnit(t('route.chart'), currencySymbol())}</Title>
          {/* Drawn the way the game draws its own graphs (the production graph of an
              industry, the finances of a company): a dark sunken field, a solid grid on
              both axes, plain figures down the side with the unit named in the heading
              rather than at every tick, and one thick line in a colour of the palette.
              The dashed upright marks the trip currently entered. */}
          <LineChart
            h={240}
            data={chart}
            dataKey="days"
            withDots={false}
            curveType="linear"
            strokeWidth={3}
            gridAxis="xy"
            gridProps={{ strokeDasharray: '0' }}
            withLegend
            legendProps={{ verticalAlign: 'middle', align: 'right', layout: 'vertical' }}
            series={[{ name: 'income', color: 'yellow.5', label: t('route.income') }]}
            xAxisProps={{
              type: 'number',
              domain: [0, chartMaxDays],
              tickFormatter: (value: number) => num(value, 0),
            }}
            valueFormatter={(value) => money(value)}
            /* the reading that follows the pointer: the day it stands on is a
               fraction of the step between points, so it is rounded like every
               other figure rather than shown to fourteen decimals */
            tooltipProps={{
              labelFormatter: (label) => `${num(Number(label), 1)} ${t('units.days')}`,
            }}
            yAxisProps={{ width: 64, tickFormatter: (value: number) => num(value, 0) }}
            referenceLines={[{ x: days, color: 'gray.3', strokeDasharray: '4 3' }]}
          />
          {/* what the marked trip comes to, under the field rather than inside it:
              a label placed in a corner of the plot lands on whichever axis tick
              happens to be there, and which tick that is depends on the figures */}
          <Text className="chart-mark">
            {num(days, 1)} {t('units.days')} → {money(income)}
          </Text>
        </section>

        <Paper component="section" className="route-profit" p="sm">
          <Title order={3}>{t('combined.title')}</Title>
          {profit == null ? (
            <TableFrame rowCount={0} emptyMessage={t('combined.needConsist')} />
          ) : (
            <>
              <Text className="hint">
                {cargoName(cargo)} · {num(route.distanceTiles)} {t('units.tiles')} ·{' '}
                {speed(stats.balancingSpeedInternal)} · {num(stats.capacityForCargo)}{' '}
                {cargoUnits(cargo?.units)}
              </Text>
              <Table className="summary-table stats-wide" withRowBorders={false}>
                <Table.Tbody>
                  <Table.Tr>
                    <Table.Td>{t('combined.roundTrip')}</Table.Td>
                    <Table.Td className="cell-num">
                      {num(profit.roundTripDays, 1)} {t('units.days')}
                    </Table.Td>
                  </Table.Tr>
                  <Table.Tr>
                    <Table.Td>{t('combined.tripsPerYear')}</Table.Td>
                    <Table.Td className="cell-num">{num(profit.tripsPerYear, 1)}</Table.Td>
                  </Table.Tr>
                  {profit.waitDays > 0 && (
                    <Table.Tr>
                      <Table.Td>{t('combined.accumulationWait')}</Table.Td>
                      <Table.Td className="cell-num">
                        {num(profit.waitDays, 1)} {t('units.days')}
                      </Table.Td>
                    </Table.Tr>
                  )}
                  {routeTrip?.rating && (
                    <>
                      <Table.Tr>
                        <Table.Td>{t('combined.deliveredShare')}</Table.Td>
                        <Table.Td className="cell-num">
                          {percent(routeTrip.rating.deliveredShare)}
                        </Table.Td>
                      </Table.Tr>
                      <Table.Tr>
                        <Table.Td>{t('combined.cargoPerTrip')}</Table.Td>
                        <Table.Td className="cell-num">
                          {num(profit.cargoPerTrip)}/{num(profit.capacity)}{' '}
                          {cargoUnits(cargo?.units)}
                        </Table.Td>
                      </Table.Tr>
                    </>
                  )}
                  <Table.Tr>
                    <Table.Td>{t('combined.incomePerTrip')}</Table.Td>
                    <Table.Td className="cell-num">
                      <Money value={profit.incomePerTrip} />
                    </Table.Td>
                  </Table.Tr>
                  <Table.Tr>
                    <Table.Td>{t('combined.runningCost')}</Table.Td>
                    <Table.Td className="cell-num">
                      <Money value={profit.runningCostPerYear} />
                    </Table.Td>
                  </Table.Tr>
                  <Table.Tr>
                    <Table.Td>{t('combined.profitPerYear')}</Table.Td>
                    <Table.Td
                      className={`cell-num big ${profit.profitPerYear >= 0 ? 'profit' : 'loss'}`}
                    >
                      <Money value={profit.profitPerYear} />
                    </Table.Td>
                  </Table.Tr>
                  <Table.Tr>
                    <Table.Td>{t('combined.profitPerTile')}</Table.Td>
                    <Table.Td className="cell-num">
                      <Money value={profit.profitPerTile} />
                    </Table.Td>
                  </Table.Tr>
                  <Table.Tr>
                    <Table.Td>{t('combined.payback')}</Table.Td>
                    <Table.Td className="cell-num">
                      {profit.paybackYears ? `${num(profit.paybackYears, 1)} ${t('units.years')}` : '—'}
                    </Table.Td>
                  </Table.Tr>
                </Table.Tbody>
              </Table>
              <Text className="hint">{t('combined.assumptions')}</Text>
            </>
          )}
          </Paper>
      </div>
    </>
  );
}
