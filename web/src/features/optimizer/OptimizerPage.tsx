import { useMemo, useState } from 'react';
import {
  ActionIcon,
  Button,
  Checkbox,
  Group,
  NumberInput,
  Select,
  Switch,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
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
              <Table.Th>{t('table.capacity')}</Table.Th>
              <Table.Th>{t('opt.speedLoadedEmpty')}</Table.Th>
              <Table.Th>{t('opt.gradeSpeed')}</Table.Th>
              <Table.Th>{t('opt.dwell')}</Table.Th>
              <Table.Th>{t('combined.roundTrip')}</Table.Th>
              <Table.Th>{t('opt.trips')}</Table.Th>
              <Table.Th>{t('opt.trains')}</Table.Th>
              <Table.Th title={t('opt.intervalHint')}>{t('opt.interval')}</Table.Th>
              <Table.Th title={t('opt.ratingHint')}>{t('opt.rating')}</Table.Th>
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
                </Table.Td>
                <Table.Td>{r.loadedSpeedMph} / {r.emptySpeedMph} {t('units.mph')}</Table.Td>
                <Table.Td>{r.gradeSpeedMph} {t('units.mph')}</Table.Td>
                <Table.Td>{num(r.loadingDays, 1)} {t('combined.days')}</Table.Td>
                <Table.Td>{num(r.roundTripDays, 1)} {t('combined.days')}</Table.Td>
                <Table.Td>{num(r.tripsPerYear, 1)}</Table.Td>
                <Table.Td>{r.trainsNeeded}</Table.Td>
                <Table.Td>{num(r.pickupIntervalDays, 1)} {t('combined.days')}</Table.Td>
                <Table.Td title={r.stationRating ? ratingBreakdown(r.stationRating) : undefined}>
                  {r.stationRating ? `${Math.round(r.stationRating.deliveredShare * 100)}%` : '—'}
                </Table.Td>
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
    </div>
  );
}
