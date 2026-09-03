import { useMemo, useState } from 'react';
import { Group, Select, Tabs, Text, Title } from '@mantine/core';
import { intlLocale, t, useLocale } from '../../i18n';
import { fieldWidth } from '../../skin';
import type { SnapshotRecord } from '../../savegame/snapshotStore';
import { useSettingsStore } from '../../state/settingsStore';
import { RoutesTab } from './RoutesTab';
import { TrainsTab } from './TrainsTab';
import { StationsTab } from './StationsTab';
import { IndustriesTab } from './IndustriesTab';
import { CompanyNetworkCard } from './CompanyNetworkCard';
import { defaultCompanyId, differingSettings } from './game';
import { companyLabel } from './labels';

/**
 * The imported game. Four lists over one snapshot, all of them for the company picked at the
 * top — except the industries, which belong to nobody.
 *
 * Everything here is computed from the settings stored beside the snapshot, never from the
 * settings store: the figures describe the game the file came from, and editing the
 * calculator afterwards must not silently restate them.
 */
export default function GamePage({ record }: { record: SnapshotRecord }) {
  const locale = useLocale();
  const current = useSettingsStore();
  const { snapshot, settings } = record;

  const [companyId, setCompanyId] = useState(() => defaultCompanyId(snapshot.companies));
  const company = snapshot.companies.find((c) => c.id === companyId);
  // built during render, not memoised: the labels are translated strings, and a memo would
  // hold the old language until something else changed (see the i18n note in CLAUDE.md)
  const companies = snapshot.companies.map((each) => ({
    value: String(each.id),
    label: companyLabel(each),
  }));

  // what the user has changed since importing; the forecasts ignore it, and say so.
  // The comparison is memoised, its translation is not: a memoised name would hold the
  // language it was built in
  const driftedKeys = useMemo(
    () => differingSettings(settings, { game: current.game, calc: current.calc }),
    [settings, current.game, current.calc],
  );

  return (
    <div className="page-game">
      <Title order={2}>{t('game.title')}</Title>
      <Group className="filters" justify="space-between" align="flex-end">
        <Select
          {...fieldWidth('wide')}
          label={t('game.company')}
          data={companies}
          value={String(companyId)}
          onChange={(value) => value !== null && setCompanyId(Number(value))}
          allowDeselect={false}
        />
        <Text className="hint">
          {t('game.snapshotOf', {
            file: record.fileName,
            date: new Date(record.savedAt).toLocaleDateString(intlLocale(locale)),
          })}
        </Text>
      </Group>

      {company && <CompanyNetworkCard company={company} />}

      {driftedKeys.length > 0 && (
        <Text className="hint game-drift">
          {t('game.settingsDiffer', { settings: driftedKeys.map((key) => t(key)).join(', ') })}
        </Text>
      )}

      <Tabs defaultValue="routes" keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="routes">{t('game.routes')}</Tabs.Tab>
          <Tabs.Tab value="trains">{t('game.trains')}</Tabs.Tab>
          <Tabs.Tab value="stations">{t('game.stations')}</Tabs.Tab>
          <Tabs.Tab value="industries">{t('game.industries')}</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="routes" pt="sm">
          <RoutesTab snapshot={snapshot} settings={settings} companyId={companyId} />
        </Tabs.Panel>
        <Tabs.Panel value="trains" pt="sm">
          <TrainsTab snapshot={snapshot} settings={settings} companyId={companyId} />
        </Tabs.Panel>
        <Tabs.Panel value="stations" pt="sm">
          <StationsTab snapshot={snapshot} settings={settings} companyId={companyId} />
        </Tabs.Panel>
        <Tabs.Panel value="industries" pt="sm">
          <IndustriesTab snapshot={snapshot} settings={settings} />
        </Tabs.Panel>
      </Tabs>
    </div>
  );
}
