import { useMemo, useState } from 'react';
import { useOptimizerStore } from '../../state/optimizerStore';
import { useSettingsStore } from '../../state/settingsStore';
import { useNavigate } from 'react-router';
import { activeCargos, activeTrains, activeTrainsMeta, economies, economyIdForCargo } from '../../dataset';
import { intlLocale, t, useLocale } from '../../i18n';
import { cargoName, cargoUnits, sortCargos } from '../../i18n/names';
import { num } from '../../components/format';
import { Money } from '../../components/Money';
import { optimizeConsists } from '../../engine/optimize';
import { cargoPaymentRate } from '../../engine/income';
import type { StationRating } from '../../engine/rating';
import { introRandomisationActive, type IntroAvailability } from '../../engine/availability';
import { doubtfulGroups } from './doubtful';
import { useConsistStore } from '../../state/consistStore';
import { useRouteStore } from '../../state/routeStore';
import { CargoIcon } from '../../components/CargoIcon';
import { TrainImage } from '../../components/TrainImage';

/** Tooltip listing what the estimated station rating is made of. */
function ratingBreakdown(r: StationRating): string {
  const signed = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(Math.round(v))}`;
  return [
    `${t('opt.ratingSpeed')}: ${signed(r.parts.speed)}`,
    `${t('opt.ratingWait')}: ${signed(r.parts.waitTime)}`,
    `${t('opt.ratingCargo')}: ${signed(r.parts.waitingCargo)}`,
    `${t('opt.ratingAge')}: ${signed(r.parts.age)}`,
    `${t('opt.ratingTotal')}: ${Math.round(r.rating)} / 255`,
  ].join('\n');
}

/** «Май 1960» на языке интерфейса. */
function monthYear(year: number, month: number): string {
  return new Intl.DateTimeFormat(intlLocale(), {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

/**
 * Отметка у машины, которой в выбранном году может ещё не быть в списке покупки:
 * дата появления в игре точнее года и вдобавок рандомизируется (engine/availability.ts).
 */
function IntroNote({ intro }: { intro: IntroAvailability }) {
  if (intro.certain) return null;
  return (
    <sup className="intro-warn" title={introTitle(intro)}>
      ?
    </sup>
  );
}

/** Ранняя и поздняя даты появления машины — подсказка для «?» и для чекбоксов. */
function introTitle(intro: IntroAvailability): string {
  const lines = [`${t('opt.introFrom')}: ${monthYear(intro.year, intro.month)}`];
  if (intro.randomised) {
    lines.push(`${t('opt.introLatest')}: ${monthYear(intro.latestYear, intro.latestMonth)}`);
  }
  return lines.join('\n');
}

export default function OptimizerPage() {
  const {
    year, cargoLabel, distanceTiles: distance, stationTiles, productionPerMonth, allowElectric,
    excludedIds, setYear, setCargoLabel, setDistanceTiles: setDistance, setStationTiles,
    setProductionPerMonth, setAllowElectric, toggleExcluded, clearExcluded,
  } = useOptimizerStore();
  const [engineFilter, setEngineFilter] = useState('');
  const [subsidised, setSubsidised] = useState(false);
  const { game, calc } = useSettingsStore();
  const locale = useLocale();
  const navigate = useNavigate();
  const consistStore = useConsistStore();
  const routeStore = useRouteStore();

  const trains = useMemo(() => activeTrains(game), [game]);
  // в селекте только грузы; если сохранённый груз не из активного набора — берём первый
  const cargoList = useMemo(
    () => sortCargos(activeCargos(game), locale),
    [game, locale],
  );
  const cargo = useMemo(
    () => cargoList.find((c) => c.label === cargoLabel) ?? cargoList[0] ?? null,
    [cargoLabel, cargoList],
  );
  const economyId = cargo ? economyIdForCargo(game, cargo) : null;

  const results = useMemo(() => {
    if (!cargo || !economyId) return [];
    return optimizeConsists(
      trains,
      {
        year,
        distanceTiles: distance,
        cargo,
        economyId,
        maxLengthTiles: stationTiles,
        productionPerMonth,
        allowElectric,
        subsidised,
        excludedIds,
        game,
        calc,
      },
      activeTrainsMeta(game),
      50,
    );
  }, [trains, cargo, economyId, year, distance, stationTiles, productionPerMonth, allowElectric, subsidised, excludedIds, game, calc]);

  // машины, которые в выбранном году могут ещё не появиться, — их можно выключить
  const collator = useMemo(() => new Intl.Collator(intlLocale(locale)), [locale]);
  const doubtful = useMemo(
    () => doubtfulGroups(results, trains, excludedIds, year, game, calc.capacityIndex, collator),
    [results, trains, excludedIds, year, game, calc.capacityIndex, collator],
  );

  const shown = engineFilter
    ? results.filter((r) => r.engine.name.toLowerCase().includes(engineFilter.toLowerCase()))
    : results;

  function applyToConsist(index: number) {
    const r = shown[index];
    consistStore.clear();
    consistStore.add(r.engine.id);
    if (r.engineCount > 1) consistStore.setCount(r.engine.id, r.engineCount);
    consistStore.add(r.wagon.id);
    consistStore.setCount(r.wagon.id, r.wagonCount);
    consistStore.setCargoLabel(cargoLabel);
    routeStore.setCargoLabel(cargoLabel);
    if (economyId) routeStore.setEconomyId(economyId);
    routeStore.setDistanceTiles(distance);
    navigate('/income');
  }

  return (
    <div className="page-optimizer">
      <h2>{t('opt.title')}</h2>
      <div className="filters">
        <label>
          {t('consist.filter.year')}
          <input type="number" min={1860} max={2050} value={year} onChange={(e) => setYear(Number(e.target.value))} />
        </label>
        <label>
          {t('route.cargo')}
          <span className="field-with-icon">
            <CargoIcon icon={cargo?.icon ?? ''} />
            <select value={cargo?.label ?? ''} onChange={(e) => setCargoLabel(e.target.value)}>
              {cargoList.map((c) => (
                <option key={c.label} value={c.label}>{cargoName(c)}</option>
              ))}
            </select>
          </span>
        </label>
        <label>
          {t('opt.distance')}
          <input type="number" min={10} value={distance} onChange={(e) => setDistance(Number(e.target.value))} />
        </label>
        <label>
          {t('opt.stationTiles')}
          <input type="number" min={1} max={16} value={stationTiles} onChange={(e) => setStationTiles(Number(e.target.value))} />
        </label>
        <label title={t('opt.productionHint')}>
          {t('opt.production')}
          <input
            type="number"
            min={0}
            step={10}
            value={productionPerMonth}
            onChange={(e) => setProductionPerMonth(Math.max(0, Number(e.target.value)))}
          />
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            switch=""
            checked={allowElectric}
            onChange={(e) => setAllowElectric(e.target.checked)}
          />
          {t('opt.allowElectric')}
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            switch=""
            checked={subsidised}
            onChange={(e) => setSubsidised(e.target.checked)}
          />
          {t('opt.subsidised')}
        </label>
        <input
          type="search"
          placeholder={t('opt.engineFilter')}
          value={engineFilter}
          onChange={(e) => setEngineFilter(e.target.value)}
        />
      </div>
      {cargo && economyId && (
        <p className="hint">
          {cargoName(cargo)} · {economies.find((e) => e.id === economyId)?.name ?? t('settings.vanilla')} ·{' '}
          {t('route.payment')}: {num(cargoPaymentRate(cargo, economyId, game, calc))} ·{' '}
          {productionPerMonth > 0 ? t('opt.assumptionProduction') : t('opt.assumption')}
        </p>
      )}
      {doubtful.length > 0 && (
        <>
          <p className="hint">
            <span className="intro-warn">?</span>{' '}
            {introRandomisationActive(game) ? t('opt.introLegend') : t('opt.introLegendExact')}
          </p>
          <div className="intro-toggles">
            <span className="hint">{t('opt.introInclude')}</span>
            {doubtful.map(({ ids, train, intro, capacity, ambiguous }) => (
              <label key={ids[0]} className="checkbox" title={introTitle(intro)}>
                <input
                  type="checkbox"
                  checked={!ids.every((id) => excludedIds.includes(id))}
                  onChange={() => toggleExcluded(ids)}
                />
                {ambiguous
                  ? `${train.name} (${num(capacity)} ${cargoUnits(cargo?.units)})`
                  : train.name}
              </label>
            ))}
            {excludedIds.length > 0 && (
              <button type="button" className="intro-reset" onClick={clearExcluded}>
                {t('opt.introReset')}
              </button>
            )}
          </div>
        </>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th colSpan={2}>{t('opt.engine')}</th>
              <th colSpan={2}>{t('opt.wagons')}</th>
              <th>{t('table.capacity')}</th>
              <th>{t('opt.speedLoadedEmpty')}</th>
              <th>{t('opt.gradeSpeed')}</th>
              <th>{t('opt.dwell')}</th>
              <th>{t('combined.roundTrip')}</th>
              <th>{t('opt.trips')}</th>
              <th>{t('opt.trains')}</th>
              <th title={t('opt.intervalHint')}>{t('opt.interval')}</th>
              <th title={t('opt.ratingHint')}>{t('opt.rating')}</th>
              <th className="cell-money">{t('opt.incomeTrip')}</th>
              <th className="cell-money">{t('table.running')}</th>
              <th className="cell-money">{t('table.cost')}</th>
              <th className="cell-money">{t('opt.profitYear')}</th>
              <th>{t('opt.payback')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={`${r.engine.id}-${r.engineCount}-${r.wagon.id}`}>
                <td>{i + 1}</td>
                <td><TrainImage trainId={r.engine.id} /></td>
                <td>
                  {r.engineCount > 1 ? `${r.engineCount}× ` : ''}{r.engine.name}
                  <IntroNote intro={r.engineIntro} />
                  <span className="dim"> ({r.engine.power_hp * r.engineCount} {t('units.hp')})</span>
                </td>
                <td><TrainImage trainId={r.wagon.id} /></td>
                <td>{r.wagonCount}× {r.wagon.name}<IntroNote intro={r.wagonIntro} /></td>
                <td>
                  {num(r.cargoPerTrip)} {cargoUnits(cargo?.units)}
                  {r.cargoPerTrip < r.capacity - 0.5 && (
                    <span className="dim"> / {num(r.capacity)}</span>
                  )}
                </td>
                <td>{r.loadedSpeedMph} / {r.emptySpeedMph} {t('units.mph')}</td>
                <td>{r.gradeSpeedMph} {t('units.mph')}</td>
                <td>{num(r.loadingDays, 1)} {t('combined.days')}</td>
                <td>{num(r.roundTripDays, 1)} {t('combined.days')}</td>
                <td>{num(r.tripsPerYear, 1)}</td>
                <td>{r.trainsNeeded}</td>
                <td>{num(r.pickupIntervalDays, 1)} {t('combined.days')}</td>
                <td title={r.stationRating ? ratingBreakdown(r.stationRating) : undefined}>
                  {r.stationRating ? `${Math.round(r.stationRating.deliveredShare * 100)}%` : '—'}
                </td>
                <td className="cell-money"><Money value={r.incomePerTrip} /></td>
                <td className="cell-money"><Money value={r.runningCostPerYear} /></td>
                <td className="cell-money"><Money value={r.buyCostTotal} /></td>
                <td className={"cell-money " + (r.profitPerYear >= 0 ? "profit" : "money-neg")}><strong><Money value={r.profitPerYear} /></strong></td>
                <td>{r.paybackYears ? `${num(r.paybackYears, 1)} ${t('combined.years')}` : '—'}</td>
                <td>
                  <button className="btn-add" onClick={() => applyToConsist(i)} title={t('opt.apply')}>
                    →
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
