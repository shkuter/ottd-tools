import { useMemo } from 'react';
import { cargoByLabel, economyById, trainsMeta } from '../../dataset';
import { t } from '../../i18n';
import { num } from '../../components/format';
import { Money } from '../../components/Money';
import { useConsistStore } from '../../state/consistStore';
import { useRouteStore } from '../../state/routeStore';
import { useSettingsStore } from '../../state/settingsStore';
import { consistStats } from '../../engine/consist';
import { transportedGoodsIncome } from '../../engine/income';
import { daysForDistance, mphToInternal, transitPeriodsFromDays } from '../../engine/units';
import { effectiveDayLength } from '../../engine/settings';

export default function CombinedPage() {
  const consist = useConsistStore();
  const { game, calc } = useSettingsStore();
  const route = useRouteStore();

  const economy = economyById.get(route.economyId);
  const cargo = cargoByLabel.get(route.cargoLabel) ?? null;

  const stats = useMemo(
    () => consistStats(consist.entries, cargo, calc.capacityIndex, trainsMeta, game, calc),
    [consist.entries, cargo, calc, game],
  );

  if (consist.entries.length === 0) {
    return (
      <div className="page-combined">
        <h2>{t('combined.title')}</h2>
        <p className="hint">{t('combined.needConsist')}</p>
      </div>
    );
  }

  const speedInternal = mphToInternal(stats.balancingSpeedMph);
  const oneWayDays = daysForDistance(route.distanceTiles, speedInternal);
  const roundTripDays = oneWayDays * 2;
  // JGRPP: календарный год длиннее в dayLengthFactor раз
  const tripsPerYear = roundTripDays > 0 ? (365 * effectiveDayLength(game)) / roundTripDays : 0;

  const payment = cargo && economy ? (cargo.initial_payment_by_economy[economy.id] ?? 0) : 0;
  const incomePerTrip =
    cargo && payment
      ? transportedGoodsIncome(
          stats.capacityForCargo,
          route.distanceTiles,
          transitPeriodsFromDays(oneWayDays),
          { currentPayment: payment, transitPeriods: cargo.transit_periods },
          game.cargoAgingRate,
        )
      : 0;

  const profitPerYear = incomePerTrip * tripsPerYear - stats.runningCostTotal;
  const profitPerTile = stats.lengthTiles > 0 ? profitPerYear / stats.lengthTiles : 0;
  const payback = profitPerYear > 0 ? stats.buyCostTotal / profitPerYear : null;

  return (
    <div className="page-combined">
      <h2>{t('combined.title')}</h2>
      <p className="hint">
        {cargo?.name} · {economy?.name} · {num(route.distanceTiles)} {t('consist.stats.tiles')} ·{' '}
        {stats.balancingSpeedMph} mph · {num(stats.capacityForCargo)} {cargo?.units}
      </p>
      <dl className="stats stats-wide">
        <dt>{t('combined.roundTrip')}</dt>
        <dd>
          {num(roundTripDays, 1)} {t('combined.days')}
        </dd>
        <dt>{t('combined.tripsPerYear')}</dt>
        <dd>{num(tripsPerYear, 1)}</dd>
        <dt>{t('combined.incomePerTrip')}</dt>
        <dd><Money value={incomePerTrip} /></dd>
        <dt>{t('combined.runningCost')}</dt>
        <dd><Money value={stats.runningCostTotal} /></dd>
        <dt>{t('combined.profitPerYear')}</dt>
        <dd className={profitPerYear >= 0 ? 'big profit' : 'big loss'}><Money value={profitPerYear} /></dd>
        <dt>{t('combined.profitPerTile')}</dt>
        <dd><Money value={profitPerTile} /></dd>
        <dt>{t('combined.payback')}</dt>
        <dd>
          {payback ? `${num(payback, 1)} ${t('combined.years')}` : '—'}
        </dd>
      </dl>
      <p className="hint">{t('combined.assumptions')}</p>
    </div>
  );
}
