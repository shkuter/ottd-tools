import { useMemo } from 'react';
import { Button, NumberInput, Paper, Switch, Table, Text, Title } from '@mantine/core';
import { LineChart } from '@mantine/charts';
import { NavLink } from 'react-router';
import { activeTrainsMeta } from '../../dataset';
import { t } from '../../i18n';
import { cargoName, cargoUnits } from '../../i18n/names';
import {
  countLabel, countSuffix, currencySymbol, money, num, percent, speed, unitSuffix, withUnit,
} from '../../components/format';
import { HowComputed } from '../../components/HowComputed';
import { Money } from '../../components/Money';
import { CargoSelect } from '../../components/PictureSelect';
import { TrackTypeField } from '../../components/TrackTypeField';
import { StrandedVehicles } from '../../components/StrandedVehicles';
import { TableFrame } from '../../components/table/TableFrame';
import { useRouteStore } from '../../state/routeStore';
import { PrefillNote } from '../../components/PrefillNote';
import { routePrefillState } from '../savegame/applyBridge';
import { useSettingsStore } from '../../state/settingsStore';
import { incomeCurve, transportedGoodsIncome } from '../../engine/income';
import { transitPeriodsFromDays } from '../../engine/units';
import { consistStats } from '../../engine/consist';
import { routeWithFlow } from '../../engine/trip';
import { useRouteParams } from './useRouteParams';

export default function RoutePage() {
  const route = useRouteStore();
  const { game, calc } = useSettingsStore();
  // the trip this tab states, assembled where the network tab reads it from too
  const { cargoList, cargo, entries, payment, routeParams } = useRouteParams();

  const stats = useMemo(
    () => consistStats(entries, cargo ?? null, calc.capacityIndex, activeTrainsMeta(game), game, calc),
    [entries, cargo, calc, game],
  );

  const spec = useMemo(
    () => (cargo ? { currentPayment: payment, transitPeriods: cargo.transit_periods } : null),
    [cargo, payment],
  );

  const routeTrip = useMemo(
    () => (routeParams ? routeWithFlow(routeParams) : null),
    [routeParams],
  );
  const consistDays =
    routeTrip && routeTrip.economics.loadedSpeedInternal > 0 ? routeTrip.economics.daysLoaded : null;
  const days = route.manualDays ?? consistDays ?? 0;
  // the figure the days field shows, and the one its unit agrees with
  const fieldDays = route.manualDays ?? Number(days.toFixed(1));
  // Where the time in the field comes from, said at the field: a figure typed by hand and one
  // worked out from the consist look the same, and only one of them follows the consist.
  const daysSource =
    route.manualDays != null
      ? t('route.daysManual')
      : consistDays != null
        ? t('route.daysAuto', { speed: speed(stats.balancingSpeedInternal) })
        : t('route.daysNoConsist');

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
      {/* the track can be changed right here, and the consist is the one the builder holds:
          a vehicle stranded by that change turns this tab's figures into a thousand-day trip
          rather than a plain zero, so it is named before they are read */}
      <StrandedVehicles entries={entries} game={game} calc={calc} />
      <div className="page-route">
        <Paper component="section" className="route-controls" p="sm">
          <PrefillNote origin={route.prefillOrigin} current={routePrefillState(game)} />
          <CargoSelect
            className="field"
            cargos={cargoList}
            label={t('route.cargo')}
            searchable
            allowDeselect={false}
            value={cargo?.label ?? null}
            onChange={(v) => v && route.setCargoLabel(v)}
            data={cargoList.map((c) => ({ value: c.label, label: cargoName(c) }))}
          />
          <TrackTypeField className="field" />
          <NumberInput
            className="field"
            label={t('route.distance')}
            suffix={countSuffix('count.tiles', route.distanceTiles)}
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
            suffix={countSuffix('count.days', fieldDays)}
            min={0}
            step={0.5}
            description={daysSource}
            value={fieldDays}
            onChange={(v) => route.setManualDays(Number(v) || 0)}
          />
          {/* the way back to the consist's own time, right under the field it resets and only
              while there is a typed time to reset: offered beside a computed time it would
              undo nothing */}
          {route.manualDays != null && consistDays != null && (
            <Button variant="subtle" className="btn-link" onClick={() => route.setManualDays(null)}>
              {t('route.daysFromConsist')}: {countLabel('count.days', consistDays, 1)} (
              {speed(stats.balancingSpeedInternal)})
            </Button>
          )}
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
          <Title order={3}>{t('route.chart')}</Title>
          {/* Drawn the way the game draws its own graphs (the production graph of an
              industry, the finances of a company): a dark sunken field, a solid grid on
              both axes, plain figures down the side with the unit named once in the caption
              of each axis rather than at every tick, and one thick line in a colour of the
              palette. There is no legend: the line is one, and what it shows is named by the
              heading and by the caption of the value axis. The dashed upright marks the trip
              currently entered. */}
          <LineChart
            h={240}
            data={chart}
            dataKey="days"
            withDots={false}
            curveType="linear"
            strokeWidth={3}
            gridAxis="xy"
            gridProps={{ strokeDasharray: '0' }}
            xAxisLabel={withUnit(t('route.days'), t('units.days'))}
            yAxisLabel={withUnit(t('route.income'), currencySymbol())}
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
              labelFormatter: (label) => countLabel('count.days', Number(label), 1),
            }}
            /* wide enough for the figures and the turned caption beside them, which would
               otherwise stand on the tick labels */
            yAxisProps={{ width: 80, tickFormatter: (value: number) => num(value, 0) }}
            referenceLines={[{ x: days, color: 'gray.3', strokeDasharray: '4 3' }]}
          />
          {/* what the marked trip comes to, under the field rather than inside it:
              a label placed in a corner of the plot lands on whichever axis tick
              happens to be there, and which tick that is depends on the figures */}
          <Text className="chart-mark">
            {countLabel('count.days', days, 1)} → {money(income)}
          </Text>
        </section>

        <Paper component="section" className="route-profit" p="sm">
          <Title order={3}>{t('combined.title')}</Title>
          {profit == null ? (
            <TableFrame
              rowCount={0}
              emptyMessage={
                // with no cargo in the set there is nothing a consist would fix, so no link
                entries.length === 0 ? (
                  <>
                    {t('combined.needConsist')}{' '}
                    <NavLink to="/consist">{t('nav.consist')}</NavLink>
                  </>
                ) : (
                  t('combined.noCargo')
                )
              }
            />
          ) : (
            <>
              <Text className="hint">
                {cargoName(cargo)} · {countLabel('count.tiles', route.distanceTiles)} ·{' '}
                {speed(stats.balancingSpeedInternal)} · {num(stats.capacityForCargo)}{' '}
                {cargoUnits(cargo?.units)}
              </Text>
              <Table className="summary-table stats-wide" withRowBorders={false}>
                <Table.Tbody>
                  <Table.Tr>
                    <Table.Td>{t('combined.roundTrip')}</Table.Td>
                    <Table.Td className="cell-num">
                      {countLabel('count.days', profit.roundTripDays, 1)}
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
                        {countLabel('count.days', profit.waitDays, 1)}
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
                      {profit.paybackYears ? countLabel('count.years', profit.paybackYears, 1) : '—'}
                    </Table.Td>
                  </Table.Tr>
                </Table.Tbody>
              </Table>
            </>
          )}
          {/* the model of the trip, folded at the end of the panel rather than standing between
              the fields and the answer; the route's own notes stay where they are */}
          <HowComputed id="route">
            <Text className="hint">{t('combined.assumptions')}</Text>
          </HowComputed>
        </Paper>

        {/* the panels that price the network itself moved to their own tab; someone who
            looked for them under the profitability panel is told where they went */}
        <Paper component="section" className="route-network-note" p="sm">
          <Text>
            {t('route.networkNote')} <NavLink to="/network">{t('nav.network')}</NavLink>
          </Text>
        </Paper>
      </div>
    </>
  );
}
