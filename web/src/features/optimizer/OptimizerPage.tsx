import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionIcon,
  Button,
  Checkbox,
  Group,
  NumberInput,
  SegmentedControl,
  Select,
  Switch,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { useOptimizerStore } from '../../state/optimizerStore';
import { useSettingsStore } from '../../state/settingsStore';
import { useNavigate } from 'react-router';
import { activeCargos, activeTrains, activeTrainsMeta, economies, economyIdForCargo } from '../../dataset';
import { intlLocale, t, useLocale } from '../../i18n';
import { cargoName, cargoUnits, sortCargos } from '../../i18n/names';
import { num, speed, speedUnitLabel, speedValue } from '../../components/format';
import { Money } from '../../components/Money';
import { optimizeConsists, type OptimizeResult } from '../../engine/optimize';
import { createOptimizerCache } from '../../engine/optimizeCache';
import { cargoPaymentRate } from '../../engine/income';
import { waitTimeThresholdDays, type StationRating } from '../../engine/rating';
import { effectiveDayLength } from '../../engine/settings';
import { introRandomisationActive, type IntroAvailability } from '../../engine/availability';
import { doubtfulGroups } from './doubtful';
import { useConsistStore } from '../../state/consistStore';
import { useRouteStore } from '../../state/routeStore';
import { CargoIcon } from '../../components/CargoIcon';
import { TrainImage } from '../../components/TrainImage';

/** Rows drawn before the "show more" button; the search itself still ranks all of them. */
const PAGE_SIZE = 15;

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

/**
 * Which loading branch the row won in. Shown only where the branches actually differ: on a
 * route the source keeps up with, the full-load order changes nothing and saying so would be
 * noise. Struck through when the order is the thing costing the route its haul.
 */
function LoadingBranchMark({ row }: { row: OptimizeResult }) {
  if (!row.branchesDiffer || !row.otherBranch) return null;
  // What the branch that lost would have given, so the tooltip compares rather than asserts.
  const other = {
    interval: num(row.otherBranch.pickupIntervalDays, 1),
    cargo: num(row.otherBranch.cargoPerTrip),
  };
  return (
    <sup
      className={row.waitForFullLoad ? 'branch-mark' : 'branch-mark branch-mark--off'}
      title={
        row.waitForFullLoad
          ? t('opt.branchWait', { days: num(row.waitDays, 1), ...other })
          : t('opt.branchNoWait', other)
      }
    >
      {t('opt.fullLoadMark')}
    </sup>
  );
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
    year, cargoLabel, distanceTiles: distance, stationTiles, productionPerMonth, goal, maxTrains,
    allowElectric, excludedIds, setYear, setCargoLabel, setDistanceTiles: setDistance,
    setStationTiles, setProductionPerMonth, setGoal, setMaxTrains, setAllowElectric,
    toggleExcluded, clearExcluded,
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

  // The search runs synchronously and takes about a second on the worst input (late year,
  // long station, transported goal). Typing a distance would otherwise re-run it per
  // keystroke, so the numeric fields feed the search only after they settle.
  const searchFields = useMemo(
    () => ({ year, distance, stationTiles, productionPerMonth, maxTrains }),
    [year, distance, stationTiles, productionPerMonth, maxTrains],
  );
  const [searchInput] = useDebouncedValue(searchFields, 250);

  // Ranking by transported cargo needs a flow to have a delivered share at all; the engine
  // falls back to profit on its own, the UI only stops the user from picking a dead option.
  // It reads the settled production, not the field: inside the debounce window the rows on
  // screen were computed for the old value, and a goal ahead of them would label columns
  // with numbers that do not belong to the search that produced them.
  const goalAvailable = searchInput.productionPerMonth > 0;
  const activeGoal = goalAvailable ? goal : 'profit';

  // The rating thresholds are stated in days, and a slowed JGRPP economy stretches them:
  // at factor 5 the first one sits at 262.5 days, not 52.5. Built at render time so the
  // string follows the language the way the table headers do.
  const intervalHint = t('opt.intervalHint', {
    thresholds: waitTimeThresholdDays(effectiveDayLength(game))
      .map((d) => num(d, 1))
      .join(' / '),
  });

  // Consist physics survives between searches, so editing production or the fleet limit
  // only redoes the money. The cache belongs to the tab: the search stays a pure function.
  const searchCache = useRef(createOptimizerCache());

  const results = useMemo(() => {
    if (!cargo || !economyId) return [];
    return optimizeConsists(
      trains,
      {
        year: searchInput.year,
        distanceTiles: searchInput.distance,
        cargo,
        economyId,
        maxLengthTiles: searchInput.stationTiles,
        productionPerMonth: searchInput.productionPerMonth,
        goal: activeGoal,
        maxTrains: searchInput.maxTrains,
        allowElectric,
        subsidised,
        excludedIds,
        game,
        calc,
      },
      activeTrainsMeta(game),
      50,
      searchCache.current,
    );
  }, [trains, cargo, economyId, searchInput, activeGoal, allowElectric, subsidised, excludedIds, game, calc]);

  // машины, которые в выбранном году могут ещё не появиться, — их можно выключить
  const collator = useMemo(() => new Intl.Collator(intlLocale(locale)), [locale]);
  const doubtful = useMemo(
    () => doubtfulGroups(results, trains, excludedIds, searchInput.year, game, calc.capacityIndex, collator),
    [results, trains, excludedIds, searchInput.year, game, calc.capacityIndex, collator],
  );

  const matching = useMemo(
    () =>
      engineFilter
        ? results.filter((r) => r.engine.name.toLowerCase().includes(engineFilter.toLowerCase()))
        : results,
    [results, engineFilter],
  );
  // Drawing fifty rows of sprites costs more than the search itself, and the answer is in
  // the first few anyway — the rest is one click away. The page resets on a new set of rows,
  // not on a new row count: a different search of the same size is still a different answer.
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  useEffect(() => setVisibleCount(PAGE_SIZE), [matching]);
  const shown = matching.slice(0, visibleCount);
  const hiddenCount = matching.length - shown.length;

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
    // The row was computed for the settled distance, so that is what travels with it:
    // inside the debounce window the field already holds a distance no row was priced at.
    routeStore.setDistanceTiles(searchInput.distance);
    // The output and the loading branch travel too: both tabs settle a route by the same
    // model, and a row carried over without them would be recomputed by a different one.
    routeStore.setProductionPerMonth(searchInput.productionPerMonth);
    routeStore.setWaitForFullLoad(r.waitForFullLoad);
    navigate('/income');
  }

  return (
    <div className="page-optimizer">
      <Title order={2}>{t('opt.title')}</Title>
      <Group className="filters" align="flex-end" gap="xs">
        <NumberInput
          label={t('consist.filter.year')}
          min={1860}
          max={2050}
          value={year}
          onChange={(v) => setYear(Number(v) || 1860)}
        />
        <Select
          label={t('route.cargo')}
          searchable
          allowDeselect={false}
          leftSection={<CargoIcon icon={cargo?.icon ?? ''} />}
          value={cargo?.label ?? null}
          onChange={(v) => v && setCargoLabel(v)}
          data={cargoList.map((c) => ({ value: c.label, label: cargoName(c) }))}
        />
        <NumberInput
          label={t('opt.distance')}
          min={10}
          value={distance}
          onChange={(v) => setDistance(Number(v) || 10)}
        />
        <NumberInput
          label={t('opt.stationTiles')}
          min={1}
          max={16}
          value={stationTiles}
          onChange={(v) => setStationTiles(Number(v) || 1)}
        />
        <Tooltip label={t('opt.productionHint')} multiline w={320}>
          <NumberInput
            label={t('opt.production')}
            min={0}
            step={10}
            value={productionPerMonth}
            onChange={(v) => setProductionPerMonth(Math.max(0, Number(v) || 0))}
          />
        </Tooltip>
        <div className="goal-field">
          <Text component="label" size="sm">{t('opt.goal')}</Text>
          <SegmentedControl
            value={activeGoal}
            onChange={(v) => setGoal(v as typeof goal)}
            data={[
              { value: 'profit', label: t('opt.goalProfit') },
              { value: 'transported', label: t('opt.goalTransported'), disabled: !goalAvailable },
            ]}
          />
        </div>
        {!goalAvailable && <Text className="hint goal-hint">{t('opt.goalNeedsProduction')}</Text>}
        <Tooltip label={t('opt.maxTrainsHint')} multiline w={320}>
          <NumberInput
            label={t('opt.maxTrains')}
            min={1}
            max={20}
            value={maxTrains}
            onChange={(v) => setMaxTrains(Math.max(1, Number(v) || 1))}
          />
        </Tooltip>
        <Switch
          checked={allowElectric}
          onChange={(e) => setAllowElectric(e.currentTarget.checked)}
          label={t('opt.allowElectric')}
        />
        <Switch
          checked={subsidised}
          onChange={(e) => setSubsidised(e.currentTarget.checked)}
          label={t('opt.subsidised')}
        />
        <TextInput
          type="search"
          placeholder={t('opt.engineFilter')}
          value={engineFilter}
          onChange={(e) => setEngineFilter(e.currentTarget.value)}
        />
      </Group>
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
          <Group className="intro-toggles" gap="xs">
            <Text className="hint">{t('opt.introInclude')}</Text>
            {doubtful.map(({ ids, train, intro, capacity, ambiguous }) => (
              <Checkbox
                key={ids[0]}
                title={introTitle(intro)}
                checked={!ids.every((id) => excludedIds.includes(id))}
                onChange={() => toggleExcluded(ids)}
                label={
                  ambiguous
                    ? `${train.name} (${num(capacity)} ${cargoUnits(cargo?.units)})`
                    : train.name
                }
              />
            ))}
            {excludedIds.length > 0 && (
              <Button
                variant="subtle"
                className="intro-reset"
                onClick={() => {
                  clearExcluded();
                  notifications.show({ message: t('notify.introFilterReset') });
                }}
              >
                {t('opt.introReset')}
              </Button>
            )}
          </Group>
        </>
      )}
      <div className="table-wrap">
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>#</Table.Th>
              <Table.Th colSpan={2}>{t('opt.engine')}</Table.Th>
              <Table.Th colSpan={2}>{t('opt.wagons')}</Table.Th>
              <Table.Th title={t('opt.cargoTripHint')}>{t('opt.cargoTrip')}</Table.Th>
              <Table.Th>{t('opt.speedLoadedEmpty')}</Table.Th>
              <Table.Th>{t('opt.gradeSpeed')}</Table.Th>
              <Table.Th>{t('opt.dwell')}</Table.Th>
              <Table.Th>{t('combined.roundTrip')}</Table.Th>
              <Table.Th>{t('opt.trips')}</Table.Th>
              <Table.Th title={t('opt.fleetHint')}>{t('opt.fleet')}</Table.Th>
              <Table.Th title={intervalHint}>{t('opt.interval')}</Table.Th>
              <Table.Th title={t('opt.ratingHint')}>{t('opt.rating')}</Table.Th>
              {activeGoal === 'transported' && <Table.Th>{t('opt.hauled')}</Table.Th>}
              <Table.Th className="cell-money">{t('opt.incomeTrip')}</Table.Th>
              <Table.Th className="cell-money">{t('table.running')}</Table.Th>
              <Table.Th className="cell-money">{t('table.cost')}</Table.Th>
              <Table.Th className="cell-money">{t('opt.profitYear')}</Table.Th>
              <Table.Th>{t('opt.payback')}</Table.Th>
              <Table.Th></Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {shown.map((r, i) => (
              <Table.Tr key={`${r.engine.id}-${r.engineCount}-${r.wagon.id}`}>
                <Table.Td>{i + 1}</Table.Td>
                <Table.Td><TrainImage trainId={r.engine.id} /></Table.Td>
                <Table.Td>
                  {r.engineCount > 1 ? `${r.engineCount}× ` : ''}{r.engine.name}
                  <IntroNote intro={r.engineIntro} />
                  <span className="dim"> ({r.engine.power_hp * r.engineCount} {t('units.hp')})</span>
                </Table.Td>
                <Table.Td><TrainImage trainId={r.wagon.id} /></Table.Td>
                <Table.Td>{r.wagonCount}× {r.wagon.name}<IntroNote intro={r.wagonIntro} /></Table.Td>
                <Table.Td>
                  {num(r.cargoPerTrip)} {cargoUnits(cargo?.units)}
                  {r.cargoPerTrip < r.capacity - 0.5 && (
                    <span className="dim"> / {num(r.capacity)}</span>
                  )}
                  <LoadingBranchMark row={r} />
                </Table.Td>
                <Table.Td>
                  {speedValue(r.loadedSpeedInternal)} / {speedValue(r.emptySpeedInternal)}{' '}
                  {speedUnitLabel()}
                </Table.Td>
                <Table.Td>{speed(r.gradeSpeedInternal)}</Table.Td>
                <Table.Td>{num(r.loadingDays, 1)} {t('combined.days')}</Table.Td>
                <Table.Td>{num(r.roundTripDays, 1)} {t('combined.days')}</Table.Td>
                <Table.Td>{num(r.tripsPerYear, 1)}</Table.Td>
                <Table.Td>
                  {r.fleetSize}
                  {r.fleetLimited && (
                    <sup className="intro-warn" title={t('opt.fleetLimited')}>!</sup>
                  )}
                </Table.Td>
                <Table.Td>{num(r.pickupIntervalDays, 1)} {t('combined.days')}</Table.Td>
                <Table.Td title={r.stationRating ? ratingBreakdown(r.stationRating) : undefined}>
                  {r.stationRating ? `${Math.round(r.stationRating.deliveredShare * 100)}%` : '—'}
                </Table.Td>
                {activeGoal === 'transported' && (
                  <Table.Td>{num(r.hauledPerYear)} {cargoUnits(cargo?.units)}</Table.Td>
                )}
                <Table.Td className="cell-money"><Money value={r.incomePerTrip} /></Table.Td>
                <Table.Td className="cell-money"><Money value={r.runningCostPerYear} /></Table.Td>
                <Table.Td className="cell-money"><Money value={r.buyCostTotal} /></Table.Td>
                <Table.Td className={"cell-money " + (r.profitPerYear >= 0 ? "profit" : "money-neg")}><strong><Money value={r.profitPerYear} /></strong></Table.Td>
                <Table.Td>{r.paybackYears ? `${num(r.paybackYears, 1)} ${t('combined.years')}` : '—'}</Table.Td>
                <Table.Td>
                  <ActionIcon
                    className="btn-add"
                    onClick={() => applyToConsist(i)}
                    title={t('opt.apply')}
                    aria-label={t('opt.apply')}
                  >
                    →
                  </ActionIcon>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </div>
      {hiddenCount > 0 && (
        <Group className="table-more" gap="xs" align="center">
          <Button variant="subtle" onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}>
            {t('opt.showMore', { count: num(Math.min(PAGE_SIZE, hiddenCount)) })}
          </Button>
          <Button variant="subtle" onClick={() => setVisibleCount(matching.length)}>
            {t('opt.showAll', { count: num(matching.length) })}
          </Button>
          <Text className="hint">
            {t('opt.shownOf', { shown: num(shown.length), total: num(matching.length) })}
          </Text>
        </Group>
      )}
    </div>
  );
}
