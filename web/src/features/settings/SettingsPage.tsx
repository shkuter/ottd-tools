import { trainsMeta } from '../../dataset';
import { t } from '../../i18n';
import { CURRENCIES, useSettingsStore, type CurrencyCode } from '../../state/settingsStore';
import { useConsistStore } from '../../state/consistStore';
import { useRouteStore } from '../../state/routeStore';
import { useOptimizerStore } from '../../state/optimizerStore';
import { useFirsStore } from '../../state/firsStore';

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="setting-row">
      <div className="setting-label">
        <span>{label}</span>
        {hint && <span className="hint setting-hint">{hint}</span>}
      </div>
      <div className="setting-control">{children}</div>
    </div>
  );
}

export default function SettingsPage() {
  const { currency, game, calc, setCurrency, setGame, setCalc, reset } = useSettingsStore();

  function resetAll() {
    reset();
    useConsistStore.getState().clear();
    // сбрасываем и остальные сохранённые состояния
    ['ottd-tools-route', 'ottd-tools-optimizer', 'ottd-tools-firs', 'ottd-tools-consist'].forEach(
      (key) => localStorage.removeItem(key),
    );
    useRouteStore.persist?.clearStorage?.();
    useOptimizerStore.persist?.clearStorage?.();
    useFirsStore.persist?.clearStorage?.();
    location.reload();
  }

  return (
    <div className="page-settings">
      <h2>{t('settings.title')}</h2>
      <p className="hint">{t('settings.intro')}</p>

      <section className="settings-group">
        <h3>
          {t('settings.jgrpp')}
          <label className="checkbox group-toggle">
            <input
              type="checkbox"
              checked={game.jgrpp}
              onChange={(e) => setGame('jgrpp', e.target.checked)}
            />
            {game.jgrpp ? t('settings.on') : t('settings.off')}
          </label>
        </h3>
        <p className="hint">{t('settings.jgrppHint')}</p>
        {game.jgrpp && (
          <>
            <Row label={t('settings.dayLength')} hint={t('settings.dayLengthHint')}>
              <input
                type="number"
                min={1}
                max={125}
                value={game.dayLengthFactor}
                onChange={(e) => setGame('dayLengthFactor', Math.max(1, Number(e.target.value)))}
              />
            </Row>
            <Row label={t('settings.costsWhenStopped')} hint={t('settings.costsWhenStoppedHint')}>
              <input
                type="number"
                min={1}
                max={8}
                value={game.costsWhenStopped}
                onChange={(e) => setGame('costsWhenStopped', Math.max(1, Number(e.target.value)))}
              />
            </Row>
            <Row label={t('settings.inflationFixedDates')} hint={t('settings.inflationFixedDatesHint')}>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={game.inflationFixedDates}
                  onChange={(e) => setGame('inflationFixedDates', e.target.checked)}
                />
                {game.inflationFixedDates ? t('settings.on') : t('settings.off')}
              </label>
            </Row>
            <Row label={t('settings.paymentAlgorithm')} hint={t('settings.paymentAlgorithmHint')}>
              <select
                value={game.paymentAlgorithm}
                onChange={(e) =>
                  setGame('paymentAlgorithm', e.target.value as typeof game.paymentAlgorithm)
                }
              >
                <option value="modern">{t('settings.paymentModern')}</option>
                <option value="traditional">{t('settings.paymentTraditional')}</option>
              </select>
            </Row>
          </>
        )}
      </section>

      <section className="settings-group">
        <h3>{t('settings.display')}</h3>
        <Row label={t('settings.currency')} hint={t('settings.currencyHint')}>
          <select value={currency} onChange={(e) => setCurrency(e.target.value as CurrencyCode)}>
            {Object.entries(CURRENCIES).map(([code, c]) => (
              <option key={code} value={code}>
                {code} ({c.symbol.trim() || code}) ×{c.rate}
              </option>
            ))}
          </select>
        </Row>
      </section>

      <section className="settings-group">
        <h3>{t('settings.finance')}</h3>
        <Row label={t('settings.vehicleCosts')} hint={t('settings.vehicleCostsHint')}>
          <select
            value={game.vehicleCosts}
            onChange={(e) => setGame('vehicleCosts', Number(e.target.value) as 0 | 1 | 2)}
          >
            <option value={0}>{t('settings.low')} (×0.75)</option>
            <option value={1}>{t('settings.medium')} (×1)</option>
            <option value={2}>{t('settings.high')} (×1.125)</option>
          </select>
        </Row>
        <Row label={t('settings.constructionCost')} hint={t('settings.constructionCostHint')}>
          <select
            value={game.constructionCost}
            onChange={(e) => setGame('constructionCost', Number(e.target.value) as 0 | 1 | 2)}
          >
            <option value={0}>{t('settings.low')} (×0.75)</option>
            <option value={1}>{t('settings.medium')} (×1)</option>
            <option value={2}>{t('settings.high')} (×1.125)</option>
          </select>
        </Row>
        <Row label={t('settings.subsidyMultiplier')} hint={t('settings.subsidyMultiplierHint')}>
          <select
            value={game.subsidyMultiplier}
            onChange={(e) =>
              setGame('subsidyMultiplier', Number(e.target.value) as 0 | 1 | 2 | 3)
            }
          >
            <option value={0}>×1.5</option>
            <option value={1}>×2</option>
            <option value={2}>×3</option>
            <option value={3}>×4</option>
          </select>
        </Row>
        <Row label={t('settings.cargoAgingRate')} hint={t('settings.cargoAgingRateHint')}>
          <input
            type="number"
            min={1}
            max={1000}
            value={game.cargoAgingRate}
            onChange={(e) => setGame('cargoAgingRate', Math.max(1, Number(e.target.value)))}
          />
        </Row>
        <Row label={t('settings.inflation')} hint={t('settings.inflationHint')}>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={game.inflation}
              onChange={(e) => setGame('inflation', e.target.checked)}
            />
            {game.inflation ? t('settings.on') : t('settings.off')}
          </label>
        </Row>
        {game.inflation && (
          <Row label={t('settings.interest')} hint={t('settings.interestHint')}>
            <input
              type="number"
              min={2}
              max={4}
              value={game.inflationInterest}
              onChange={(e) => setGame('inflationInterest', Number(e.target.value))}
            />
          </Row>
        )}
      </section>

      <section className="settings-group">
        <h3>{t('settings.vehicles')}</h3>
        <Row label={t('settings.accelModel')} hint={t('settings.accelModelHint')}>
          <select
            value={game.accelerationModel}
            onChange={(e) =>
              setGame('accelerationModel', e.target.value as typeof game.accelerationModel)
            }
          >
            <option value="realistic">{t('settings.accelRealistic')}</option>
            <option value="original">{t('settings.accelOriginal')}</option>
          </select>
        </Row>
        <Row label={t('settings.freightTrains')} hint={t('settings.freightTrainsHint')}>
          <input
            type="number"
            min={1}
            max={255}
            value={game.freightTrains}
            onChange={(e) => setGame('freightTrains', Math.max(1, Number(e.target.value)))}
          />
        </Row>
        <Row label={t('settings.slopeSteepness')} hint={t('settings.slopeSteepnessHint')}>
          <input
            type="number"
            min={0}
            max={10}
            value={game.slopeSteepness}
            onChange={(e) => setGame('slopeSteepness', Number(e.target.value))}
          />
        </Row>
        <Row label={t('settings.gradualLoading')} hint={t('settings.gradualLoadingHint')}>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={game.gradualLoading}
              onChange={(e) => setGame('gradualLoading', e.target.checked)}
            />
            {game.gradualLoading ? t('settings.on') : t('settings.off')}
          </label>
        </Row>
      </section>

      <section className="settings-group">
        <h3>{t('settings.calc')}</h3>
        <Row label={t('consist.capacityParam')} hint={t('settings.capacityHint')}>
          <select
            value={calc.capacityIndex}
            onChange={(e) => setCalc('capacityIndex', Number(e.target.value))}
          >
            {trainsMeta.capacity_param_multipliers.map((m, i) => (
              <option key={i} value={i}>
                ×{m}
                {i === 2 ? ' (default)' : ''}
              </option>
            ))}
          </select>
        </Row>
        <Row label={t('settings.trackType')} hint={t('settings.trackTypeHint')}>
          <select
            value={calc.trackType}
            onChange={(e) => setCalc('trackType', e.target.value as typeof calc.trackType)}
          >
            <option value="RAIL">RAIL</option>
            <option value="NG">NG</option>
            <option value="METRO">METRO</option>
          </select>
        </Row>
        <Row label={t('settings.hillTiles')} hint={t('settings.hillTilesHint')}>
          <input
            type="number"
            min={1}
            max={64}
            value={calc.hillTiles}
            onChange={(e) => setCalc('hillTiles', Math.max(1, Number(e.target.value)))}
          />
        </Row>
        <Row label={t('settings.priceYear')} hint={t('settings.priceYearHint')}>
          <input
            type="number"
            min={1860}
            max={2090}
            value={calc.priceYear}
            onChange={(e) => setCalc('priceYear', Number(e.target.value))}
          />
        </Row>
      </section>

      <section className="settings-group">
        <h3>{t('settings.storage')}</h3>
        <p className="hint">{t('settings.storageHint')}</p>
        <button className="btn-danger" onClick={resetAll}>
          {t('settings.reset')}
        </button>
      </section>
    </div>
  );
}
