import { useMemo } from 'react';
import { cargoByLabel, cargosOfEconomy, economies, economyById, trainsMeta } from '../../dataset';
import { t } from '../../i18n';
import { money, num } from '../../components/format';
import { useRouteStore } from '../../state/routeStore';
import { useSettingsStore } from '../../state/settingsStore';
import { useConsistStore } from '../../state/consistStore';
import { transportedGoodsIncome } from '../../engine/income';
import { daysForDistance, mphToInternal, transitPeriodsFromDays } from '../../engine/units';
import { consistStats } from '../../engine/consist';

export default function RoutePage() {
  const route = useRouteStore();
  const consist = useConsistStore();
  const { game, calc } = useSettingsStore();

  const economy = economyById.get(route.economyId) ?? economies[0];
  const economyCargos = useMemo(() => cargosOfEconomy(economy), [economy]);
  const cargo = cargoByLabel.get(route.cargoLabel) ?? economyCargos[0];

  const stats = useMemo(
    () => consistStats(consist.entries, cargo ?? null, calc.capacityIndex, trainsMeta, game, calc),
    [consist.entries, cargo, calc, game],
  );

  const consistDays =
    stats.balancingSpeedMph > 0
      ? daysForDistance(route.distanceTiles, mphToInternal(stats.balancingSpeedMph))
      : null;
  const days = route.manualDays ?? consistDays ?? 0;

  const payment = cargo?.initial_payment_by_economy[economy.id] ?? 0;
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
          <select value={cargo?.label ?? ''} onChange={(e) => route.setCargoLabel(e.target.value)}>
            {economyCargos.map((c) => (
              <option key={c.label} value={c.label}>
                {c.name}
              </option>
            ))}
          </select>
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
            {stats.balancingSpeedMph} mph)
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
    </div>
  );
}
