import { Button, Fieldset, Group, NumberInput, Select, Switch } from '@mantine/core';
import { activeEconomy, economies, trainsMeta } from '../../dataset';
import { Warning } from '../../components/Warning';
import { currencyLabel, unitSuffix } from '../../components/format';
import { t } from '../../i18n';
import { trainSetName } from '../../i18n/names';
import {
  CURRENCIES,
  useSettingsStore,
  type CurrencyCode,
  type SpeedUnit,
} from '../../state/settingsStore';
import { BASECOST_MULTIPLIERS, TRAIN_SETS, type GameSettings } from '../../engine/settings';
import { resetPersistedState } from '../../state';
import { LOCALES, useLocaleStore, type Locale } from '../../state/localeStore';
import { SavegameImportPanel } from './SavegameImportPanel';
import { useYearField } from '../../components/useYearField';
import { TrackTypeField } from '../../components/TrackTypeField';

function Row({
  label,
  hint,
  className = 'setting-row',
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <div className="setting-label">
        <span>{label}</span>
        {hint && <span className="hint setting-hint">{hint}</span>}
      </div>
      <div className="setting-control">{children}</div>
    </div>
  );
}

/**
 * A parameter of the set above it — the FIRS economy, a Base Costs multiplier, the Iron Horse
 * capacity index — shown as part of that set rather than as a setting of its own rank.
 */
function NestedRow(props: Omit<Parameters<typeof Row>[0], 'className'>) {
  return <Row {...props} className="setting-row setting-row--nested" />;
}

/** A NumberInput hands back a string while it is being typed; settings are numbers. */
function asNumber(value: string | number, min: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(min, parsed) : min;
}

/** Numeric settings travel through Select as strings — these two keep that in one place. */
function numericData(options: { value: number; label: string }[]) {
  return options.map((o) => ({ value: String(o.value), label: o.label }));
}

export default function SettingsPage() {
  const { currency, speedUnit, game, calc, setCurrency, setSpeedUnit, setGame, setCalc } =
    useSettingsStore();
  const { locale, setLocale } = useLocaleStore();
  const priceYear = useYearField(calc.priceYear, (v) => setCalc('priceYear', v));
  const startingYear = useYearField(game.startingYear, (v) => setGame('startingYear', v));

  async function resetAll() {
    // awaited: the imported game lives in IndexedDB, and reloading before the delete lands
    // would bring it back
    await resetPersistedState();
    // route, optimizer and FIRS state only leaves memory on a reload, so a
    // notification here would be swept away with the page
    location.reload();
  }

  const difficultyData = numericData([
    { value: 0, label: `${t('settings.low')} (×0.75)` },
    { value: 1, label: `${t('settings.medium')} (×1)` },
    { value: 2, label: `${t('settings.high')} (×1.125)` },
  ]);

  return (
    <div className="page-settings">
      <h2>{t('settings.title')}</h2>
      <p className="hint">{t('settings.intro')}</p>

      <Fieldset
        className="settings-group"
        legend={
          <Group gap="xs">
            {t('settings.jgrpp')}
            <Switch
              className="group-toggle"
              checked={game.jgrpp}
              onChange={(e) => setGame('jgrpp', e.currentTarget.checked)}
              label={game.jgrpp ? t('settings.on') : t('settings.off')}
            />
          </Group>
        }
      >
        <p className="hint">{t('settings.jgrppHint')}</p>
        {game.jgrpp && (
          <>
            <Row label={t('settings.dayLength')} hint={t('settings.dayLengthHint')}>
              <NumberInput
                min={1}
                max={125}
                value={game.dayLengthFactor}
                onChange={(v) => setGame('dayLengthFactor', asNumber(v, 1))}
              />
            </Row>
            <Row label={t('settings.costsWhenStopped')} hint={t('settings.costsWhenStoppedHint')}>
              <NumberInput
                min={1}
                max={8}
                value={game.costsWhenStopped}
                onChange={(v) => setGame('costsWhenStopped', asNumber(v, 1))}
              />
            </Row>
            <Row
              label={t('settings.inflationFixedDates')}
              hint={t('settings.inflationFixedDatesHint')}
            >
              <Switch
                checked={game.inflationFixedDates}
                onChange={(e) => setGame('inflationFixedDates', e.currentTarget.checked)}
                label={game.inflationFixedDates ? t('settings.on') : t('settings.off')}
              />
            </Row>
            <Row
              label={t('settings.introRandomisation')}
              hint={t('settings.introRandomisationHint')}
            >
              <Switch
                checked={game.vehicleIntroRandomisation}
                onChange={(e) => setGame('vehicleIntroRandomisation', e.currentTarget.checked)}
                label={game.vehicleIntroRandomisation ? t('settings.on') : t('settings.off')}
              />
            </Row>
            <Row label={t('settings.paymentAlgorithm')} hint={t('settings.paymentAlgorithmHint')}>
              <Select
                allowDeselect={false}
                value={game.paymentAlgorithm}
                onChange={(v) =>
                  v && setGame('paymentAlgorithm', v as typeof game.paymentAlgorithm)
                }
                data={[
                  { value: 'modern', label: t('settings.paymentModern') },
                  { value: 'traditional', label: t('settings.paymentTraditional') },
                ]}
              />
            </Row>
          </>
        )}
      </Fieldset>

      <Fieldset className="settings-group" legend={t('settings.newgrf')}>
        <p className="hint">{t('settings.newgrfHint')}</p>
        {/* The train roster is one per game — the sets swap the whole catalogue, the
            track table and the basecost shifts — so it is a choice, not switches. */}
        <Row label={t('settings.trainSet')} hint={t('settings.trainSetHint')}>
          <Select
            allowDeselect={false}
            value={game.trainSet}
            onChange={(v) => v && setGame('trainSet', v as GameSettings['trainSet'])}
            data={TRAIN_SETS.map((set) => ({
              value: set,
              label: trainSetName(set),
            }))}
          />
        </Row>
        {game.trainSet === 'iron_horse' && (
          <NestedRow label={t('consist.capacityParam')} hint={t('settings.capacityHint')}>
            <Select
              allowDeselect={false}
              value={String(calc.capacityIndex)}
              onChange={(v) => v && setCalc('capacityIndex', Number(v))}
              data={trainsMeta.capacity_param_multipliers.map((m, i) => ({
                value: String(i),
                label: `×${m}${i === 2 ? ` (${t('settings.default')})` : ''}`,
              }))}
            />
          </NestedRow>
        )}
        <Row label={t('settings.firs')} hint={t('settings.firsHint')}>
          <Switch
            checked={game.firs}
            onChange={(e) => setGame('firs', e.currentTarget.checked)}
            label={game.firs ? t('settings.on') : t('settings.off')}
          />
        </Row>
        {game.firs && (
          <NestedRow label={t('settings.firsEconomy')} hint={t('settings.firsEconomyHint')}>
            <Select
              allowDeselect={false}
              // shows what the calculation actually uses: an id the data lost reads back as
              // the default, and the field would otherwise sit empty while numbers say otherwise
              value={activeEconomy(game).id}
              onChange={(v) => v && setGame('firsEconomy', v)}
              data={economies.map((eco) => ({ value: eco.id, label: eco.name }))}
            />
          </NestedRow>
        )}
        {/* Base Costs is a set the game loads like any other, so it stands beside the other
            two rather than in a section of its own. */}
        <Row label={t('settings.basecostGrf')} hint={t('settings.basecostGrfHint')}>
          <Switch
            checked={game.basecostGrf}
            onChange={(e) => setGame('basecostGrf', e.currentTarget.checked)}
            label={game.basecostGrf ? t('settings.on') : t('settings.off')}
          />
        </Row>
        {game.basecostGrf && (
          <>
            <NestedRow label={t('settings.basecostLoco')} hint={t('settings.basecostHint')}>
              <Select
                allowDeselect={false}
                value={String(game.basecostLocomotive)}
                onChange={(v) => v && setGame('basecostLocomotive', Number(v))}
                data={numericData(BASECOST_MULTIPLIERS)}
              />
            </NestedRow>
            <NestedRow label={t('settings.basecostWagon')} hint={t('settings.basecostHint')}>
              <Select
                allowDeselect={false}
                value={String(game.basecostWagon)}
                onChange={(v) => v && setGame('basecostWagon', Number(v))}
                data={numericData(BASECOST_MULTIPLIERS)}
              />
            </NestedRow>
            <NestedRow
              label={t('settings.basecostRunningSteam')}
              hint={t('settings.basecostRunningHint')}
            >
              <Select
                allowDeselect={false}
                value={String(game.basecostTrainRunningSteam)}
                onChange={(v) => v && setGame('basecostTrainRunningSteam', Number(v))}
                data={numericData(BASECOST_MULTIPLIERS)}
              />
            </NestedRow>
            <NestedRow
              label={t('settings.basecostRunningDiesel')}
              hint={t('settings.basecostRunningHint')}
            >
              <Select
                allowDeselect={false}
                value={String(game.basecostTrainRunningDiesel)}
                onChange={(v) => v && setGame('basecostTrainRunningDiesel', Number(v))}
                data={numericData(BASECOST_MULTIPLIERS)}
              />
            </NestedRow>
            <NestedRow
              label={t('settings.basecostRunningElectric')}
              hint={t('settings.basecostRunningHint')}
            >
              <Select
                allowDeselect={false}
                value={String(game.basecostTrainRunningElectric)}
                onChange={(v) => v && setGame('basecostTrainRunningElectric', Number(v))}
                data={numericData(BASECOST_MULTIPLIERS)}
              />
            </NestedRow>
          </>
        )}
      </Fieldset>

      <Fieldset className="settings-group" legend={t('savegame.title')}>
        <SavegameImportPanel />
      </Fieldset>

      <Fieldset className="settings-group" legend={t('settings.display')}>
        <Row label={t('settings.language')} hint={t('settings.languageHint')}>
          <Select
            allowDeselect={false}
            value={locale}
            onChange={(v) => v && setLocale(v as Locale)}
            data={Object.entries(LOCALES).map(([code, l]) => ({ value: code, label: l.name }))}
          />
        </Row>
        <Row label={t('settings.currency')} hint={t('settings.currencyHint')}>
          <Select
            allowDeselect={false}
            value={currency}
            onChange={(v) => v && setCurrency(v as CurrencyCode)}
            data={Object.keys(CURRENCIES).map((code) => ({
              value: code,
              label: currencyLabel(code as CurrencyCode),
            }))}
          />
        </Row>
        <Row label={t('settings.speedUnit')} hint={t('settings.speedUnitHint')}>
          <Select
            allowDeselect={false}
            value={speedUnit}
            onChange={(v) => v && setSpeedUnit(v as SpeedUnit)}
            data={[
              { value: 'imperial', label: t('settings.speedUnit.imperial') },
              { value: 'metric', label: t('settings.speedUnit.metric') },
            ]}
          />
        </Row>
      </Fieldset>

      <Fieldset className="settings-group" legend={t('settings.finance')}>
        <Row label={t('settings.vehicleCosts')} hint={t('settings.vehicleCostsHint')}>
          <Select
            allowDeselect={false}
            value={String(game.vehicleCosts)}
            onChange={(v) => v && setGame('vehicleCosts', Number(v) as 0 | 1 | 2)}
            data={difficultyData}
          />
        </Row>
        <Row label={t('settings.constructionCost')} hint={t('settings.constructionCostHint')}>
          <Select
            allowDeselect={false}
            value={String(game.constructionCost)}
            onChange={(v) => v && setGame('constructionCost', Number(v) as 0 | 1 | 2)}
            data={difficultyData}
          />
        </Row>
        <Row label={t('settings.subsidyMultiplier')} hint={t('settings.subsidyMultiplierHint')}>
          <Select
            allowDeselect={false}
            value={String(game.subsidyMultiplier)}
            onChange={(v) => v && setGame('subsidyMultiplier', Number(v) as 0 | 1 | 2 | 3)}
            data={numericData([
              { value: 0, label: '×1.5' },
              { value: 1, label: '×2' },
              { value: 2, label: '×3' },
              { value: 3, label: '×4' },
            ])}
          />
        </Row>
        <Row label={t('settings.cargoAgingRate')} hint={t('settings.cargoAgingRateHint')}>
          <NumberInput
            min={1}
            max={1000}
            value={game.cargoAgingRate}
            onChange={(v) => setGame('cargoAgingRate', asNumber(v, 1))}
          />
        </Row>
        <Row label={t('settings.inflation')} hint={t('settings.inflationHint')}>
          <Switch
            checked={game.inflation}
            onChange={(e) => setGame('inflation', e.currentTarget.checked)}
            label={game.inflation ? t('settings.on') : t('settings.off')}
          />
        </Row>
        {/* the fatal error is Iron Horse's; without it inflation is an ordinary setting */}
        {game.inflation && game.trainSet === 'iron_horse' && (
          <Warning>
            <strong>{t('settings.inflationWarnTitle')}</strong>
            <p className="grf-error">{t('settings.inflationGrfError')}</p>
            <p>{t('settings.inflationWarnBody')}</p>
          </Warning>
        )}
        {game.inflation && (
          <Row label={t('settings.interest')} hint={t('settings.interestHint')}>
            <NumberInput
              min={2}
              max={4}
              value={game.inflationInterest}
              onChange={(v) => setGame('inflationInterest', asNumber(v, 2))}
            />
          </Row>
        )}
      </Fieldset>

      <Fieldset className="settings-group" legend={t('settings.time')}>
        <Row label={t('settings.timekeeping')} hint={t('settings.timekeepingHint')}>
          <Select
            allowDeselect={false}
            value={game.timekeeping}
            onChange={(v) => v && setGame('timekeeping', v as typeof game.timekeeping)}
            data={[
              { value: 'calendar', label: t('settings.calendar') },
              { value: 'wallclock', label: t('settings.wallclock') },
            ]}
          />
        </Row>
        <Row label={t('settings.startingYear')} hint={t('settings.startingYearHint')}>
          <NumberInput {...startingYear} />
        </Row>
      </Fieldset>

      <Fieldset className="settings-group" legend={t('settings.vehicles')}>
        <Row label={t('settings.neverExpire')} hint={t('settings.neverExpireHint')}>
          <Switch
            checked={game.neverExpireVehicles}
            onChange={(e) => setGame('neverExpireVehicles', e.currentTarget.checked)}
            label={game.neverExpireVehicles ? t('settings.on') : t('settings.off')}
          />
        </Row>
        <Row label={t('settings.accelModel')} hint={t('settings.accelModelHint')}>
          <Select
            allowDeselect={false}
            value={game.accelerationModel}
            onChange={(v) => v && setGame('accelerationModel', v as typeof game.accelerationModel)}
            data={[
              { value: 'realistic', label: t('settings.accelRealistic') },
              { value: 'original', label: t('settings.accelOriginal') },
            ]}
          />
        </Row>
        <Row label={t('settings.freightTrains')} hint={t('settings.freightTrainsHint')}>
          <NumberInput
            min={1}
            max={255}
            value={game.freightTrains}
            onChange={(v) => setGame('freightTrains', asNumber(v, 1))}
          />
        </Row>
        <Row label={t('settings.slopeSteepness')} hint={t('settings.slopeSteepnessHint')}>
          <NumberInput
            min={0}
            max={10}
            value={game.slopeSteepness}
            onChange={(v) => setGame('slopeSteepness', asNumber(v, 0))}
          />
        </Row>
        <Row label={t('settings.gradualLoading')} hint={t('settings.gradualLoadingHint')}>
          <Switch
            checked={game.gradualLoading}
            onChange={(e) => setGame('gradualLoading', e.currentTarget.checked)}
            label={game.gradualLoading ? t('settings.on') : t('settings.off')}
          />
        </Row>
      </Fieldset>

      <Fieldset className="settings-group" legend={t('settings.calc')}>
        <Row label={t('settings.trackType')} hint={t('settings.trackTypeHint')}>
          <TrackTypeField width="wide" withLabel={false} />
        </Row>
        <Row label={t('settings.hillTiles')} hint={t('settings.hillTilesHint')}>
          <NumberInput
            suffix={unitSuffix(t('units.tiles'))}
            min={1}
            max={64}
            value={calc.hillTiles}
            onChange={(v) => setCalc('hillTiles', asNumber(v, 1))}
          />
        </Row>
        <Row label={t('settings.priceYear')} hint={t('settings.priceYearHint')}>
          {/* the same editing rule the tabs use: this is one setting, not two fields */}
          <NumberInput {...priceYear} />
        </Row>
      </Fieldset>

      <Fieldset className="settings-group" legend={t('settings.storage')}>
        <p className="hint">{t('settings.storageHint')}</p>
        <Button className="btn-danger" onClick={() => void resetAll()}>
          {t('settings.reset')}
        </Button>
      </Fieldset>
    </div>
  );
}
