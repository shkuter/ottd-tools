import { useMemo, useState } from 'react';
import { useOptimizerStore } from '../../state/optimizerStore';
import { useSettingsStore } from '../../state/settingsStore';
import { useNavigate } from 'react-router';
import { cargoByLabel, cargos, economies, trains, trainsMeta } from '../../dataset';
import { t } from '../../i18n';
import { num } from '../../components/format';
import { Money } from '../../components/Money';
import { optimizeConsists } from '../../engine/optimize';
import { useConsistStore } from '../../state/consistStore';
import { useRouteStore } from '../../state/routeStore';
import { TrainImage } from '../consist/ConsistPage';

export default function OptimizerPage() {
  const {
    year, cargoLabel, distanceTiles: distance, stationTiles, allowElectric,
    setYear, setCargoLabel, setDistanceTiles: setDistance, setStationTiles, setAllowElectric,
  } = useOptimizerStore();
  const [engineFilter, setEngineFilter] = useState('');
  const { game, calc } = useSettingsStore();
  const navigate = useNavigate();
  const consistStore = useConsistStore();
  const routeStore = useRouteStore();

  const cargo = cargoByLabel.get(cargoLabel) ?? null;
  // экономика, где груз существует (первая подходящая)
  const economyId = cargo
    ? (economies.find((e) => cargo.initial_payment_by_economy[e.id] != null)?.id ?? null)
    : null;

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
        allowElectric,
        game,
        calc,
      },
      trainsMeta,
      50,
    );
  }, [cargo, economyId, year, distance, stationTiles, allowElectric, game, calc]);

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
    navigate('/combined');
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
          <select value={cargoLabel} onChange={(e) => setCargoLabel(e.target.value)}>
            {cargos.filter((c) => c.is_freight).map((c) => (
              <option key={c.label} value={c.label}>{c.name}</option>
            ))}
          </select>
        </label>
        <label>
          {t('opt.distance')}
          <input type="number" min={10} value={distance} onChange={(e) => setDistance(Number(e.target.value))} />
        </label>
        <label>
          {t('opt.stationTiles')}
          <input type="number" min={1} max={16} value={stationTiles} onChange={(e) => setStationTiles(Number(e.target.value))} />
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={allowElectric}
            onChange={(e) => setAllowElectric(e.target.checked)}
          />
          {t('opt.allowElectric')}
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
          {cargo.name} · {economies.find((e) => e.id === economyId)?.name} ·{' '}
          {t('route.payment')}: {num(cargo.initial_payment_by_economy[economyId])} ·{' '}
          {t('opt.assumption')}
        </p>
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
              <th>{t('combined.roundTrip')}</th>
              <th>{t('opt.trips')}</th>
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
                  <span className="dim"> ({r.engine.power_hp * r.engineCount} hp)</span>
                </td>
                <td><TrainImage trainId={r.wagon.id} /></td>
                <td>{r.wagonCount}× {r.wagon.name}</td>
                <td>{num(r.capacity)} {cargo?.units}</td>
                <td>{r.loadedSpeedMph} / {r.emptySpeedMph} mph</td>
                <td>{r.gradeSpeedMph} mph</td>
                <td>{num(r.roundTripDays, 1)} {t('combined.days')}</td>
                <td>{num(r.tripsPerYear, 1)}</td>
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
