import { useMemo, useRef } from 'react';
import {
  Button,
  Group,
  NumberInput,
  Paper,
  Select,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { TableFrame } from '../../components/table/TableFrame';
import { useDebouncedValue } from '@mantine/hooks';
import { activeIndustries, industriesMeta, industrySupplyInputs } from '../../dataset';
import { intlLocale, t, useLocale } from '../../i18n';
import { cargoName, industryName } from '../../i18n/names';
import { engineLabel, num, unitSuffix, wagonLabel, withUnit } from '../../components/format';
import { CargoIcon } from '../../components/CargoIcon';
import { fieldWidth } from '../../skin';
import { TrainImage } from '../../components/TrainImage';
import { BuyMenuNote } from '../../components/BuyMenuNote';
import { Warning } from '../../components/Warning';
import {
  assessIndustrySupply,
  hasVerdict,
  supplyWindowDays,
  type InputState,
} from '../../engine/supply';
import { useSettingsStore } from '../../state/settingsStore';
import { YearField } from '../../components/YearField';
import { TrackTypeField } from '../../components/TrackTypeField';
import { EMPTY_INPUT, inputKey, useIndustrySupplyStore } from '../../state/industrySupplyStore';
import type { OptimizerCache } from '../../engine/optimizeCache';
import { runSupplyInputs, type InputRun } from './inputs';
import { useSoldIds } from '../savegame/soldIds';
import { summaryLines } from './summary';

export default function IndustrySupplyPage() {
  const store = useIndustrySupplyStore();
  const { game, calc } = useSettingsStore();
  const locale = useLocale();

  // Industries of the active economy: one the economy does not have drops out of the list, so
  // a choice left over from another economy simply stops being selected (ADR-0002).
  const industryList = useMemo(() => {
    const collator = new Intl.Collator(intlLocale(locale));
    return activeIndustries(game).sort((a, b) => collator.compare(industryName(a), industryName(b)));
  }, [game, locale]);
  const industry = industryList.find((i) => i.id === store.industryId) ?? null;

  const inputs = useMemo(
    () => (industry ? industrySupplyInputs(game, industry.id) : []),
    [game, industry],
  );

  // One sweep per input runs synchronously, so typing a distance must not restart them on
  // every keystroke — the same debounce the optimizer tab uses on its numeric fields.
  const searchFields = useMemo(
    () => ({
      year: calc.priceYear,
      stationTiles: store.stationTiles,
      maxTrains: store.maxTrains,
      routes: inputs.map(({ cargoLabel }) => ({
        cargoLabel,
        ...(store.inputs[inputKey(industry?.id ?? '', cargoLabel)] ?? EMPTY_INPUT),
      })),
    }),
    [calc.priceYear, store.stationTiles, store.maxTrains, store.inputs, inputs, industry],
  );
  const [settled] = useDebouncedValue(searchFields, 300);

  // Consist physics survives between searches; one cache per cargo, because the cache keys on
  // the route length and every input has a length of its own.
  const caches = useRef(new Map<string, OptimizerCache>());

  // what the imported game sells decides this list too, see engine/availability.ts
  const soldIds = useSoldIds(settled.year, game);

  const runs: InputRun[] = useMemo(() => {
    if (!industry) return [];
    return runSupplyInputs({
      game,
      calc,
      industryId: industry.id,
      inputs: inputs.map(({ cargoLabel, ratio }) => ({
        cargoLabel,
        ratio,
        params: settled.routes.find((r) => r.cargoLabel === cargoLabel) ?? EMPTY_INPUT,
      })),
      year: settled.year,
      stationTiles: settled.stationTiles,
      maxTrains: settled.maxTrains,
      caches: caches.current,
      soldIds,
    });
  }, [game, calc, industry, inputs, settled, soldIds]);

  const summary = useMemo(
    () => (industry ? assessIndustrySupply(industry, runs) : null),
    [industry, runs],
  );

  const windowDays = supplyWindowDays(industriesMeta.supply_window_ticks);
  // Translated at render time, like every string that lands inside a memo on the other tabs.
  const stateLabel = (state: InputState) => t(`supply.state.${state}`);

  return (
    <div className="page-industry-supply">
      <Title order={2}>{t('supply.title')}</Title>
      <Text className="subtitle">{t('supply.intro', { window: num(windowDays, 1) })}</Text>
      {soldIds && <p className="hint">{t('vehicle.listFromGame')}</p>}

      <Group className="filters" align="flex-end" gap="xs">
        <Select
          {...fieldWidth('wide')}
          label={t('supply.industry')}
          searchable
          value={industry?.id ?? null}
          placeholder={t('supply.industryPlaceholder')}
          onChange={(v) => v && store.setIndustryId(v)}
          data={industryList.map((i) => ({ value: i.id, label: industryName(i) }))}
        />
        <YearField />
        <NumberInput
          {...fieldWidth('narrow')}
          label={t('opt.stationTiles')}
          suffix={unitSuffix(t('units.tiles'))}
          min={1}
          max={16}
          value={store.stationTiles}
          onChange={(v) => store.setStationTiles(Number(v) || 1)}
        />
        <NumberInput
          {...fieldWidth('narrow')}
          label={t('opt.maxTrains')}
          min={1}
          max={20}
          value={store.maxTrains}
          onChange={(v) => store.setMaxTrains(Number(v) || 1)}
        />
        <TrackTypeField />
      </Group>

      {/* nothing to compute yet — no industry chosen, or one with no inputs. Said
          in the frame the list would stand in, rather than as blank space under
          the filters: blank space reads as a calculation that failed rather than
          as one not asked for */}
      {(!industry || inputs.length === 0) && (
        <TableFrame
          rowCount={0}
          emptyMessage={industry ? t('supply.noInputs') : t('supply.pickIndustry')}
        />
      )}

      {industry && inputs.length > 0 && summary && !hasVerdict(summary.rule) && (
        <Text>
          {summary.rule === 'no-supplies' ? t('supply.noSupplies') : t('supply.ruleUnknown')}
        </Text>
      )}

      {industry && inputs.length > 0 && summary && hasVerdict(summary.rule) && (
        <>
          <Group className="filters" align="flex-end" gap="xs">
            <NumberInput
              {...fieldWidth('narrow')}
              label={t('supply.commonDistance')}
              suffix={unitSuffix(t('units.tiles'))}
              description={t('supply.commonDistanceHint')}
              min={1}
              value={store.commonDistanceTiles}
              onChange={(v) => store.setCommonDistanceTiles(Number(v) || 1)}
            />
            <Button
              onClick={() =>
                store.applyCommonDistance(
                  inputs.map(({ cargoLabel }) => inputKey(industry.id, cargoLabel)),
                )
              }
            >
              {t('supply.applyCommonDistance')}
            </Button>
          </Group>

          <TableFrame rowCount={runs.length} emptyMessage={t('supply.noInputs')}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('route.cargo')}</Table.Th>
                <Table.Th className="cell-num">
                  {withUnit(t('supply.distance'), t('units.tiles'))}
                </Table.Th>
                <Table.Th className="cell-num">
                  {withUnit(t('supply.production'), t('units.perMonth'))}
                </Table.Th>
                <Table.Th className="cell-num">{t('supply.trains')}</Table.Th>
                <Table.Th colSpan={2}>{t('opt.engine')}</Table.Th>
                <Table.Th colSpan={2}>{t('opt.wagons')}</Table.Th>
                <Table.Th className="cell-num">{t('supply.ratio')}</Table.Th>
                <Table.Th>{t('supply.state')}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {runs.map((run, index) => {
                const key = inputKey(industry.id, run.cargoLabel);
                const params = store.inputs[key] ?? EMPTY_INPUT;
                const state = summary.states[index];
                return (
                  <Table.Tr key={run.cargoLabel}>
                    <Table.Td>
                      {/* Icon and name on one line, the way the cargo select shows them. */}
                      <span className="supply-cargo">
                        <CargoIcon icon={run.cargo?.icon ?? ''} />
                        {run.cargo ? cargoName(run.cargo) : run.cargoLabel}
                      </span>
                    </Table.Td>
                    <Table.Td className="cell-num">
                      <NumberInput
                        min={0}
                        value={params.distanceTiles || ''}
                        placeholder={t('supply.unsetField')}
                        onChange={(v) =>
                          store.setInput(key, { distanceTiles: Math.max(0, Number(v) || 0) })
                        }
                      />
                    </Table.Td>
                    <Table.Td className="cell-num">
                      <NumberInput
                        min={0}
                        step={10}
                        value={params.productionPerMonth || ''}
                        placeholder={t('supply.unsetField')}
                        onChange={(v) =>
                          store.setInput(key, {
                            productionPerMonth: Math.max(0, Number(v) || 0),
                          })
                        }
                      />
                    </Table.Td>
                    {/* Whole trains and the vehicles inside one of them are different counts,
                        so they get columns of their own rather than one crowded cell. */}
                    <Table.Td className="cell-num">{run.best ? run.best.fleetSize : '—'}</Table.Td>
                    {/* Sprite and name apart, the way the optimizer's rows read: the wagon's
                        own length shows in its sprite and nowhere in its name. */}
                    <Table.Td>
                      {run.best && <TrainImage trainId={run.best.engine.id} />}
                    </Table.Td>
                    <Table.Td>
                      {run.best ? (
                        <>
                          {engineLabel(run.best)}
                          <BuyMenuNote availability={run.best.engineBuyMenu} />
                        </>
                      ) : (
                        '—'
                      )}
                    </Table.Td>
                    <Table.Td>
                      {run.best && <TrainImage trainId={run.best.wagon.id} />}
                    </Table.Td>
                    <Table.Td>
                      {run.best ? (
                        <>
                          {wagonLabel(run.best)}
                          <BuyMenuNote availability={run.best.wagonBuyMenu} />{' '}
                          <span className="dim">
                            · {num(run.best.lengthTiles, 1)} {t('units.tiles')}
                          </span>
                        </>
                      ) : (
                        '—'
                      )}
                    </Table.Td>
                    <Table.Td className="cell-num">
                      {run.outcome?.ratio != null ? num(run.outcome.ratio, 2) : '—'}
                    </Table.Td>
                    <Table.Td className={`supply-${state}`}>{stateLabel(state)}</Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </TableFrame>

          <Paper component="section" className="supply-summary" p="sm">
            {summaryLines({ summary, maxTrains: store.maxTrains, windowDays }).map((line) =>
              line.tone === 'warning' ? (
                <Warning key={line.text}>{line.text}</Warning>
              ) : (
                <Text key={line.text} className={line.tone === 'hint' ? 'hint' : undefined}>
                  {line.text}
                </Text>
              ),
            )}
          </Paper>
        </>
      )}
    </div>
  );
}
