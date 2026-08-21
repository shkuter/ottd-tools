import { Suspense, lazy, useEffect } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router';
import { Anchor, Box, Button, Group, Text, Title } from '@mantine/core';
import OptimizerPage from './features/optimizer/OptimizerPage';
import SettingsPage from './features/settings/SettingsPage';
import FirsPage from './features/firs/FirsPage';
import { datasetMeta } from './dataset';
import { t, useLocale } from './i18n';
import { useSettingsStore } from './state/settingsStore';
import { Warning } from './components/Warning';
import { usePageviews } from './analytics';

// the catalogue pulls in mantine-datatable and the income tab pulls in recharts;
// nothing else needs either, so both tabs load with their own chunk
const ConsistPage = lazy(() => import('./features/consist/ConsistPage'));
const RoutePage = lazy(() => import('./features/route/RoutePage'));

const tabs = [
  { path: '/optimizer', label: 'nav.optimizer' },
  { path: '/consist', label: 'nav.consist' },
  { path: '/income', label: 'nav.income' },
  { path: '/firs', label: 'nav.firs' },
  { path: '/settings', label: 'nav.settings' },
];

export default function App() {
  const inflation = useSettingsStore((s) => s.game.inflation);
  const firs = useSettingsStore((s) => s.game.firs);
  // t() reads the locale outside React, so the whole tree re-renders from here
  const locale = useLocale();
  usePageviews();

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return (
    <div className="app">
      <Box component="header" className="app-header">
        <div>
          <Title order={1}>{t('app.title')}</Title>
          <Text className="subtitle">{t('app.subtitle')}</Text>
        </div>
        {/* tabs stay links: NavLink marks the current one with aria-current,
            which is what the skin presses in */}
        <Box component="nav">
          <Group gap={4}>
            {tabs
              .filter((tab) => firs || tab.path !== '/firs')
              .map((tab) => (
                <Button key={tab.path} component={NavLink} to={tab.path} size="compact-md">
                  {t(tab.label)}
                </Button>
              ))}
          </Group>
        </Box>
      </Box>
      <Box component="main">
        {inflation && (
          <Warning>
            {t('settings.inflationBanner')}{' '}
            <NavLink to="/settings">{t('settings.inflationBannerLink')}</NavLink>
          </Warning>
        )}
        <Suspense fallback={null}>
          <Routes>
            <Route path="/" element={<Navigate to="/optimizer" replace />} />
            <Route path="/optimizer" element={<OptimizerPage />} />
            <Route path="/consist" element={<ConsistPage />} />
            <Route path="/income" element={<RoutePage />} />
            <Route path="/firs" element={<FirsPage />} />
            <Route path="/combined" element={<Navigate to="/income" replace />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </Suspense>
      </Box>
      <Box component="footer" className="app-footer">
        {t('footer.version')} {__APP_VERSION__} · {t('footer.data')}: Iron Horse{' '}
        {datasetMeta.iron_horse} · FIRS {datasetMeta.firs} · OpenTTD {datasetMeta.openttd}
        {/* The translation revision only matters where names actually come from it. */}
        {locale !== 'en' && ` (${t('footer.translation')} ${datasetMeta.firs_ru})`} ·{' '}
        {t('footer.generated')} {datasetMeta.generated_at}
        <br />
        {t('footer.graphics')}:{' '}
        <Anchor href="https://github.com/OpenTTD/OpenGFX2/">OpenGFX2 Classic</Anchor>,{' '}
        <Anchor href="https://github.com/andythenorth/iron-horse">Iron Horse</Anchor>,{' '}
        <Anchor href="https://github.com/andythenorth/firs">FIRS</Anchor> —{' '}
        {/* GPL asks that whoever gets the site can get its source: both links say where. */}
        <Anchor href="https://github.com/shkuter/ottd-tools/blob/master/LICENSE">GPL-2.0</Anchor>
        {' · '}
        <Anchor href="https://github.com/shkuter/ottd-tools">{t('footer.source')}</Anchor>
      </Box>
    </div>
  );
}
