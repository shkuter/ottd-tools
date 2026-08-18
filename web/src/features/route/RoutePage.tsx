import { useMemo } from 'react';
import {
  activeCargoByLabel,
  activeCargos,
  cargosOfEconomy,
  economies,
  economyById,
  trainsMeta,
} from '../../dataset';
import { t, useLocale } from '../../i18n';
import { cargoName, cargoUnits, sortCargos } from '../../i18n/names';
import { money, num } from '../../components/format';
import { Money } from '../../components/Money';
import { CargoIcon } from '../../components/CargoIcon';
import { useRouteStore } from '../../state/routeStore';
import { useSettingsStore } from '../../state/settingsStore';
import { useConsistStore } from '../../state/consistStore';
import { transportedGoodsIncome } from '../../engine/income';
import { daysForDistance, mphToInternal, transitPeriodsFromDays } from '../../engine/units';
import { consistStats } from '../../engine/consist';
import {
  daysPerEconomyYear,
  effectiveDayLength,
  loadingTicks,
  stoppedCostDivisor,
} from '../../engine/settings';

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
    () => consistStats(consist.entries, cargo ?? null, calc.capacityIndex, trainsMeta, game, calc),
    [consist.entries, cargo, calc, game],
  );

  const consistDays =
    stats.balancingSpeedMph > 0
      ? daysForDistance(route.distanceTiles, mphToInternal(stats.balancingSpeedMph))
      : null;
  const days = route.manualDays ?? consistDays ?? 0;

  const payment =
    cargo?.initial_payment_by_economy[game.firs ? economy.id : 'VANILLA'] ?? 0;
  const spec = cargo
    ? { currentPayment: payment, transitPeriods: cargo.transit_periods }
    : null;

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

  const chart = useMemo(() => {
    if (!spec) return [];
    // диапазон охватывает начало и часть спада оплаты (p1 + p2/2 периодов по 2.5 дня)
    const decayDays = (spec.transitPeriods[0] + Math.min(spec.transitPeriods[1], 120) / 2) * 2.5;
    const maxDays = Math.max(days * 2.5, decayDays * 1.4, 50);
    const points: { days: number; income: number }[] = [];
    for (let d = 0; d <= maxDays; d += maxDays / 120) {
      points.push({
        days: d,
        income: transportedGoodsIncome(
          route.amount,
          route.distanceTiles,
          transitPeriodsFromDays(d),
          spec,
          game.cargoAgingRate,
          game.jgrpp ? game.paymentAlgorithm : 'modern',
        ),
      });
    }
    return points;
  }, [spec, route.amount, route.distanceTiles, days, game.cargoAgingRate]);

  const chartMax = Math.max(...chart.map((p) => p.income), 1);
  const chartW = 640;
  const chartH = 220;
  const path = chart
    .map(
      (p, i) =>
        `${i === 0 ? 'M' : 'L'}${((p.days / Math.max(chart.at(-1)?.days ?? 1, 1)) * chartW).toFixed(1)},${(chartH - (p.income / chartMax) * (chartH - 10)).toFixed(1)}`,
    )
    .join(' ');
  const markerX = chart.length
    ? (days / Math.max(chart.at(-1)?.days ?? 1, 1)) * chartW
    : 0;

  // прибыльность полного рейса того состава, что собран на вкладке Consist
  const profit = useMemo(() => {
    if (consist.entries.length === 0 || !spec) return null;
    // стоянки: погрузка и разгрузка по самому медленному вагону состава
    const loadingDays =
      (2 *
        Math.max(
          0,
          ...consist.entries
            .filter((e) => e.train.kind === 'wagon')
            .map((e) =>
              loadingTicks(
                e.train.capacities[calc.capacityIndex] ?? 0,
                e.train.loading_speed ?? 0,
                game,
              ),
            ),
        )) /
      74;
    const roundTripDays = days * 2 + loadingDays;
    // JGRPP: календарный год длиннее в dayLengthFactor раз
    const tripsPerYear =
      roundTripDays > 0
        ? (daysPerEconomyYear(game) * effectiveDayLength(game)) / roundTripDays
        : 0;
    const incomePerTrip = transportedGoodsIncome(
      stats.capacityForCargo,
      route.distanceTiles,
      transitPeriodsFromDays(days),
      spec,
      game.cargoAgingRate,
      game.jgrpp ? game.paymentAlgorithm : 'modern',
    );
    // на стоянке JGRPP может брать меньше: делим долю времени под погрузкой
    const stoppedShare = roundTripDays > 0 ? loadingDays / roundTripDays : 0;
    const runningPerYear =
      stats.runningCostTotal * (1 - stoppedShare + stoppedShare / stoppedCostDivisor(game));
    const profitPerYear = incomePerTrip * tripsPerYear - runningPerYear;
    return {
      roundTripDays,
      tripsPerYear,
      incomePerTrip,
      runningPerYear,
      profitPerYear,
      profitPerTile: stats.lengthTiles > 0 ? profitPerYear / stats.lengthTiles : 0,
      payback: profitPerYear > 0 ? stats.buyCostTotal / profitPerYear : null,
    };
  }, [consist.entries, spec, stats, days, route.distanceTiles, game, calc.capacityIndex]);

  return (
    <div className="page-route">
      <section className="route-controls">
        <h2>{t('route.title')}</h2>
        <label className="field">
          {t('route.economy')}
          <select value={economy.id} onChange={(e) => route.setEconomyId(e.target.value)}>
            {economies.map((eco) => (
              <option key={eco.id} value={eco.id}>
                {eco.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          {t('route.cargo')}
          <span className="field-with-icon">
            <CargoIcon icon={cargo?.icon ?? ''} />
            <select value={cargo?.label ?? ''} onChange={(e) => route.setCargoLabel(e.target.value)}>
              {economyCargos.map((c) => (
                <option key={c.label} value={c.label}>
                  {cargoName(c)}
                </option>
              ))}
            </select>
          </span>
        </label>
        <label className="field">
          {t('route.distance')}
          <input
            type="number"
            min={1}
            value={route.distanceTiles}
            onChange={(e) => route.setDistanceTiles(Number(e.target.value))}
          />
        </label>
        <label className="field">
          {t('route.amount')}
          <input
            type="number"
            min={1}
            value={route.amount}
            onChange={(e) => route.setAmount(Number(e.target.value))}
          />
        </label>
        <label className="field">
          {t('route.days')}
          <input
            type="number"
            min={0}
            step={0.5}
            value={route.manualDays ?? Number(days.toFixed(1))}
            onChange={(e) => route.setManualDays(Number(e.target.value))}
          />
        </label>
        {consistDays != null && (
          <button className="btn-link" onClick={() => route.setManualDays(null)}>
            {t('route.daysFromConsist')}: {num(consistDays, 1)} {t('combined.days')} (
            {stats.balancingSpeedMph} {t('units.mph')})
          </button>
        )}

        {cargo && (
          <dl className="stats">
            <dt>{t('route.payment')}</dt>
            <dd>{num(payment)}</dd>
            <dt>{t('route.transitPeriods')}</dt>
            <dd>
              {cargo.transit_periods[0]} / {cargo.transit_periods[1]}
            </dd>
            <dt>{t('route.income')}</dt>
            <dd className="big">{money(income)}</dd>
          </dl>
        )}
      </section>

      <section className="route-chart">
        <h3>{t('route.chart')}</h3>
        <svg viewBox={`0 0 ${chartW} ${chartH + 20}`} className="chart">
          <path d={path} fill="none" stroke="var(--accent)" strokeWidth={2} />
          <line
            x1={markerX}
            y1={0}
            x2={markerX}
            y2={chartH}
            stroke="var(--muted)"
            strokeDasharray="4 3"
          />
          <text x={Math.min(markerX + 6, chartW - 120)} y={14} className="chart-label">
            {num(days, 1)} {t('combined.days')} → {money(income)}
          </text>
          <text x={0} y={chartH + 16} className="chart-label">
            0
          </text>
          <text x={chartW - 60} y={chartH + 16} className="chart-label">
            {num(chart.at(-1)?.days ?? 0, 0)} {t('combined.days')}
          </text>
        </svg>
      </section>

      <section className="route-profit">
        <h3>{t('combined.title')}</h3>
        {profit == null ? (
          <p className="hint">{t('combined.needConsist')}</p>
        ) : (
          <>
            <p className="hint">
              {cargoName(cargo)} · {num(route.distanceTiles)} {t('consist.stats.tiles')} ·{' '}
              {stats.balancingSpeedMph} {t('units.mph')} · {num(stats.capacityForCargo)}{' '}
              {cargoUnits(cargo?.units)}
            </p>
            <dl className="stats stats-wide">
              <dt>{t('combined.roundTrip')}</dt>
              <dd>
                {num(profit.roundTripDays, 1)} {t('combined.days')}
              </dd>
              <dt>{t('combined.tripsPerYear')}</dt>
              <dd>{num(profit.tripsPerYear, 1)}</dd>
              <dt>{t('combined.incomePerTrip')}</dt>
              <dd>
                <Money value={profit.incomePerTrip} />
              </dd>
              <dt>{t('combined.runningCost')}</dt>
              <dd>
                <Money value={profit.runningPerYear} />
              </dd>
              <dt>{t('combined.profitPerYear')}</dt>
              <dd className={profit.profitPerYear >= 0 ? 'big profit' : 'big loss'}>
                <Money value={profit.profitPerYear} />
              </dd>
              <dt>{t('combined.profitPerTile')}</dt>
              <dd>
                <Money value={profit.profitPerTile} />
              </dd>
              <dt>{t('combined.payback')}</dt>
              <dd>{profit.payback ? `${num(profit.payback, 1)} ${t('combined.years')}` : '—'}</dd>
            </dl>
            <p className="hint">{t('combined.assumptions')}</p>
          </>
        )}
      </section>
    </div>
  );
}
