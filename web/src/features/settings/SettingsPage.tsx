import { trainsMeta } from '../../dataset';
import { Warning } from '../../components/Warning';
import { t } from '../../i18n';
import { CURRENCIES, useSettingsStore, type CurrencyCode } from '../../state/settingsStore';
import { BASECOST_MULTIPLIERS } from '../../engine/settings';
import { resetPersistedState } from '../../state';
import { LOCALES, useLocaleStore, type Locale } from '../../state/localeStore';

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

/**
 * Years drive the inflation tables, and an emptied number field reads as 0 — which would
 * count the full 170 years of inflation instead of none. Keep the value inside the range
 * the input advertises.
 */
function clampYear(value: number): number {
  if (!Number.isFinite(value)) return 1950;
  return Math.min(2090, Math.max(1920, Math.trunc(value)));
}

export default function SettingsPage() {
  const { currency, game, calc, setCurrency, setGame, setCalc } = useSettingsStore();
  const { locale, setLocale } = useLocaleStore();

  function resetAll() {
    resetPersistedState();
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
              switch=""
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
                  switch=""
                  checked={game.inflationFixedDates}
                  onChange={(e) => setGame('inflationFixedDates', e.target.checked)}
                />
                {game.inflationFixedDates ? t('settings.on') : t('settings.off')}
              </label>
            </Row>
            <Row
              label={t('settings.introRandomisation')}
              hint={t('settings.introRandomisationHint')}
            >
              <label className="checkbox">
                <input
                  type="checkbox"
                  switch=""
                  checked={game.vehicleIntroRandomisation}
                  onChange={(e) => setGame('vehicleIntroRandomisation', e.target.checked)}
                />
                {game.vehicleIntroRandomisation ? t('settings.on') : t('settings.off')}
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
        <h3>{t('settings.newgrf')}</h3>
        <p className="hint">{t('settings.newgrfHint')}</p>
        <Row label={t('settings.ironHorse')} hint={t('settings.ironHorseHint')}>
          <label className="checkbox">
            <input
              type="checkbox"
              switch=""
              checked={game.ironHorse}
              onChange={(e) => setGame('ironHorse', e.target.checked)}
            />
            {game.ironHorse ? t('settings.on') : t('settings.off')}
          </label>
        </Row>
        <Row label={t('settings.firs')} hint={t('settings.firsHint')}>
          <label className="checkbox">
            <input
              type="checkbox"
              switch=""
              checked={game.firs}
              onChange={(e) => setGame('firs', e.target.checked)}
            />
            {game.firs ? t('settings.on') : t('settings.off')}
          </label>
        </Row>
      </section>

      <section className="settings-group">
        <h3>
          {t('settings.basecostGrf')}
          <label className="checkbox group-toggle">
            <input
              type="checkbox"
              switch=""
              checked={game.basecostGrf}
              onChange={(e) => setGame('basecostGrf', e.target.checked)}
            />
            {game.basecostGrf ? t('settings.on') : t('settings.off')}
          </label>
        </h3>
        <p className="hint">{t('settings.basecostGrfHint')}</p>
        {game.basecostGrf && (
          <>
            <Row label={t('settings.basecostLoco')} hint={t('settings.basecostHint')}>
              <select
                value={game.basecostLocomotive}
                onChange={(e) => setGame('basecostLocomotive', Number(e.target.value))}
              >
                {BASECOST_MULTIPLIERS.map((m) => (
                  <option key={m.label} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </Row>
            <Row label={t('settings.basecostWagon')} hint={t('settings.basecostHint')}>
              <select
                value={game.basecostWagon}
                onChange={(e) => setGame('basecostWagon', Number(e.target.value))}
              >
                {BASECOST_MULTIPLIERS.map((m) => (
                  <option key={m.label} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </Row>
            <Row label={t('settings.basecostRunning')} hint={t('settings.basecostRunningHint')}>
              <select
                value={game.basecostTrainRunning}
                onChange={(e) => setGame('basecostTrainRunning', Number(e.target.value))}
              >
                {BASECOST_MULTIPLIERS.map((m) => (
                  <option key={m.label} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </Row>
          </>
        )}
      </section>

      <section className="settings-group">
        <h3>{t('settings.display')}</h3>
        <Row label={t('settings.language')} hint={t('settings.languageHint')}>
          <select value={locale} onChange={(e) => setLocale(e.target.value as Locale)}>
            {Object.entries(LOCALES).map(([code, l]) => (
              <option key={code} value={code}>
                {l.name}
              </option>
            ))}
          </select>
        </Row>
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
              switch=""
              checked={game.inflation}
              onChange={(e) => setGame('inflation', e.target.checked)}
            />
            {game.inflation ? t('settings.on') : t('settings.off')}
          </label>
        </Row>
        {game.inflation && (
          <Warning>
            <strong>{t('settings.inflationWarnTitle')}</strong>
            <p className="grf-error">{t('settings.inflationGrfError')}</p>
            <p>{t('settings.inflationWarnBody')}</p>
          </Warning>
        )}
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
        <h3>{t('settings.time')}</h3>
        <Row label={t('settings.timekeeping')} hint={t('settings.timekeepingHint')}>
          <select
            value={game.timekeeping}
            onChange={(e) => setGame('timekeeping', e.target.value as typeof game.timekeeping)}
          >
            <option value="calendar">{t('settings.calendar')}</option>
            <option value="wallclock">{t('settings.wallclock')}</option>
          </select>
        </Row>
        <Row label={t('settings.startingYear')} hint={t('settings.startingYearHint')}>
          <input
            type="number"
            min={1920}
            max={2090}
            value={game.startingYear}
            onChange={(e) => setGame('startingYear', clampYear(Number(e.target.value)))}
          />
        </Row>
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
              switch=""
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
                {i === 2 ? ` (${t('settings.default')})` : ''}
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
            {!game.ironHorse && <option value="MONO">MONO</option>}
            {!game.ironHorse && <option value="MAGLEV">MAGLEV</option>}
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
