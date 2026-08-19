import { useMemo } from 'react';
import { Button, NumberInput, Paper, Select, Table, Text, Title } from '@mantine/core';
import { LineChart } from '@mantine/charts';
import {
  activeCargoByLabel,
  activeCargos,
  cargosOfEconomy,
  economies,
  economyById,
  economyIdForCargo,
  activeTrainsMeta,
} from '../../dataset';
import { t, useLocale } from '../../i18n';
import { cargoName, cargoUnits, sortCargos } from '../../i18n/names';
import { money, num } from '../../components/format';
import { Money } from '../../components/Money';
import { CargoIcon } from '../../components/CargoIcon';
import { useRouteStore } from '../../state/routeStore';
import { useSettingsStore } from '../../state/settingsStore';
import { useConsistStore } from '../../state/consistStore';
import { cargoPaymentRate, incomeCurve, transportedGoodsIncome } from '../../engine/income';
import { transitPeriodsFromDays } from '../../engine/units';
import { consistStats } from '../../engine/consist';
import { tripEconomics } from '../../engine/trip';

export default function RoutePage() {
  const route = useRouteStore();
  const consist = useConsistStore();
  const { game, calc } = useSettingsStore();
  const locale = useLocale();

  const economy = economyById.get(route.economyId) ?? economies[0];
  const economyCargos = useMemo(
    () => sortCargos(game.firs ? cargosOfEconomy(economy) : activeCargos(game), locale),
    [economy, game, locale],
  );
  const cargo = activeCargoByLabel(game).get(route.cargoLabel) ?? economyCargos[0];

  const stats = useMemo(
    () => consistStats(consist.entries, cargo ?? null, calc.capacityIndex, activeTrainsMeta(game), game, calc),
    [consist.entries, cargo, calc, game],
  );

  const paymentEconomyId = cargo ? economyIdForCargo(game, cargo, economy.id) : null;
  const payment = cargo ? cargoPaymentRate(cargo, paymentEconomyId, game, calc) : 0;
  const spec = useMemo(
    () => (cargo ? { currentPayment: payment, transitPeriods: cargo.transit_periods } : null),
    [cargo, payment],
  );

  // Round-trip economics of the consist built on the Consist tab — the same model the
  // optimizer uses, so a consist carried over with "→" shows the same figures here.
  const trip = useMemo(
    () =>
      consist.entries.length > 0 && cargo
        ? tripEconomics({
            entries: consist.entries,
            cargo,
            payment,
            distanceTiles: route.distanceTiles,
            meta: activeTrainsMeta(game),
            game,
            calc,
            loadedDaysOverride: route.manualDays,
          })
        : null,
    [consist.entries, cargo, payment, route.distanceTiles, route.manualDays, game, calc],
  );
  const consistDays = trip && trip.loadedSpeedInternal > 0 ? trip.daysLoaded : null;
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

  const profit = trip
    ? {
        ...trip,
        profitPerTile: stats.lengthTiles > 0 ? trip.profitPerYear / stats.lengthTiles : 0,
      }
    : null;

  return (
    <div className="page-route">
      <Paper component="section" className="route-controls" p="sm">
        <Title order={2}>{t('route.title')}</Title>
        <Select
          className="field"
          label={t('route.economy')}
          allowDeselect={false}
          value={economy.id}
          onChange={(v) => v && route.setEconomyId(v)}
          data={economies.map((eco) => ({ value: eco.id, label: eco.name }))}
        />
        <Select
          className="field"
          label={t('route.cargo')}
          searchable
          allowDeselect={false}
          leftSection={<CargoIcon icon={cargo?.icon ?? ''} />}
          value={cargo?.label ?? null}
          onChange={(v) => v && route.setCargoLabel(v)}
          data={economyCargos.map((c) => ({ value: c.label, label: cargoName(c) }))}
        />
        <NumberInput
          className="field"
          label={t('route.distance')}
          min={1}
          value={route.distanceTiles}
          onChange={(v) => route.setDistanceTiles(Number(v) || 1)}
        />
        <NumberInput
          className="field"
          label={t('route.amount')}
          min={1}
          value={route.amount}
          onChange={(v) => route.setAmount(Number(v) || 1)}
        />
        <NumberInput
          className="field"
          label={t('route.days')}
          min={0}
          step={0.5}
          value={route.manualDays ?? Number(days.toFixed(1))}
          onChange={(v) => route.setManualDays(Number(v) || 0)}
        />
        {consistDays != null && (
          <Button variant="subtle" className="btn-link" onClick={() => route.setManualDays(null)}>
            {t('route.daysFromConsist')}: {num(consistDays, 1)} {t('combined.days')} (
            {stats.balancingSpeedMph} {t('units.mph')})
          </Button>
        )}

        {cargo && (
          <Table className="summary-table" withRowBorders={false}>
            <Table.Tbody>
              <Table.Tr>
                <Table.Td>{t('route.payment')}</Table.Td>
                <Table.Td align="right">{num(payment)}</Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td>{t('route.transitPeriods')}</Table.Td>
                <Table.Td align="right">
                  {cargo.transit_periods[0]} / {cargo.transit_periods[1]}
                </Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td>{t('route.income')}</Table.Td>
                <Table.Td align="right" className="big">
                  {money(income)}
                </Table.Td>
              </Table.Tr>
            </Table.Tbody>
          </Table>
        )}
      </Paper>

      <section className="route-chart">
        <Title order={3}>{t('route.chart')}</Title>
        {/* the same points as before, drawn by the chart component instead of a
            hand-built path; the dashed line marks the trip currently entered */}
        <LineChart
          h={240}
          data={chart}
          dataKey="days"
          withDots={false}
          curveType="linear"
          series={[{ name: 'income', color: 'ottdBlue.6', label: t('route.income') }]}
          xAxisProps={{
            type: 'number',
            domain: [0, chartMaxDays],
            tickFormatter: (value: number) => num(value, 0),
          }}
          valueFormatter={(value) => money(value)}
          yAxisProps={{ width: 96 }}
          referenceLines={[
            {
              x: days,
              color: 'gray.3',
              strokeDasharray: '4 3',
              label: `${num(days, 1)} ${t('combined.days')} → ${money(income)}`,
              labelPosition: 'insideTopRight',
            },
          ]}
        />
      </section>

      <Paper component="section" className="route-profit" p="sm">
        <Title order={3}>{t('combined.title')}</Title>
        {profit == null ? (
          <Text className="hint">{t('combined.needConsist')}</Text>
        ) : (
          <>
            <Text className="hint">
              {cargoName(cargo)} · {num(route.distanceTiles)} {t('consist.stats.tiles')} ·{' '}
              {stats.balancingSpeedMph} {t('units.mph')} · {num(stats.capacityForCargo)}{' '}
              {cargoUnits(cargo?.units)}
            </Text>
            <Table className="summary-table stats-wide" withRowBorders={false}>
              <Table.Tbody>
                <Table.Tr>
                  <Table.Td>{t('combined.roundTrip')}</Table.Td>
                  <Table.Td align="right">
                    {num(profit.roundTripDays, 1)} {t('combined.days')}
                  </Table.Td>
                </Table.Tr>
                <Table.Tr>
                  <Table.Td>{t('combined.tripsPerYear')}</Table.Td>
                  <Table.Td align="right">{num(profit.tripsPerYear, 1)}</Table.Td>
                </Table.Tr>
                <Table.Tr>
                  <Table.Td>{t('combined.incomePerTrip')}</Table.Td>
                  <Table.Td align="right">
                    <Money value={profit.incomePerTrip} />
                  </Table.Td>
                </Table.Tr>
                <Table.Tr>
                  <Table.Td>{t('combined.runningCost')}</Table.Td>
                  <Table.Td align="right">
                    <Money value={profit.runningCostPerYear} />
                  </Table.Td>
                </Table.Tr>
                <Table.Tr>
                  <Table.Td>{t('combined.profitPerYear')}</Table.Td>
                  <Table.Td align="right" className={profit.profitPerYear >= 0 ? 'big profit' : 'big loss'}>
                    <Money value={profit.profitPerYear} />
                  </Table.Td>
                </Table.Tr>
                <Table.Tr>
                  <Table.Td>{t('combined.profitPerTile')}</Table.Td>
                  <Table.Td align="right">
                    <Money value={profit.profitPerTile} />
                  </Table.Td>
                </Table.Tr>
                <Table.Tr>
                  <Table.Td>{t('combined.payback')}</Table.Td>
                  <Table.Td align="right">
                    {profit.paybackYears ? `${num(profit.paybackYears, 1)} ${t('combined.years')}` : '—'}
                  </Table.Td>
                </Table.Tr>
              </Table.Tbody>
            </Table>
            <Text className="hint">{t('combined.assumptions')}</Text>
          </>
        )}
      </Paper>
    </div>
  );
}
