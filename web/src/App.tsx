import { Suspense, lazy, useEffect } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router';
import { Anchor, Box, Button, Group, Text, Title } from '@mantine/core';
import OptimizerPage from './features/optimizer/OptimizerPage';
import SettingsPage from './features/settings/SettingsPage';
import FirsPage from './features/firs/FirsPage';
import { datasetMeta } from './dataset';
import { t, useLocale } from './i18n';
import { useSettingsStore } from './state/settingsStore';
import { Warning } from './components/Warning';
import { usePageviews } from './analytics';
import { useKitWindowStore } from './state/kitWindowStore';
import { TABS } from './tabs';

// the income tab pulls in recharts and the catalogue is a page of its own;
// nothing else needs either, so both tabs load with their own chunk
const ConsistPage = lazy(() => import('./features/consist/ConsistPage'));
const RoutePage = lazy(() => import('./features/route/RoutePage'));
// the supply tab drags the optimizer along and runs one sweep per input; it stays out of the
// main chunk for the same reason the other two do
const IndustrySupplyPage = lazy(() => import('./features/industry-supply/IndustrySupplyPage'));
// the interface-elements page is for working on the skin, not for using the
// calculator: no tab of its own, and no weight in the main chunk
const KitPage = lazy(() => import('./features/kit/KitPage'));

export default function App() {
  const inflation = useSettingsStore((s) => s.game.inflation);
  const firs = useSettingsStore((s) => s.game.firs);
  // t() reads the locale outside React, so the whole tree re-renders from here
  const locale = useLocale();
  const { pathname } = useLocation();
  usePageviews();

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  /*
   * The window colour goes on <html> rather than on the page: dropdowns,
   * tooltips and notifications are rendered into a portal under <body>, and a
   * theme set on the page would not reach them.
   *
   * This is the only writer of the attribute. The interface-elements page needs
   * to change it too, and it does so through a store rather than by writing the
   * attribute itself: with two writers the winner would be decided by effect
   * order, and a child's effect runs before its parent's.
   */
  const kitWindow = useKitWindowStore((s) => s.colour);
  useEffect(() => {
    const colour = pathname === '/kit' ? kitWindow : TABS.find((tab) => tab.path === pathname)?.windowColour;
    if (colour) document.documentElement.dataset.window = colour;
    else delete document.documentElement.dataset.window;
  }, [pathname, kitWindow]);

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
            {TABS
              // both tabs answer about FIRS industries, and there are none with FIRS off
              .filter((tab) => firs || (tab.path !== '/firs' && tab.path !== '/supply'))
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
            <Route path="/supply" element={<IndustrySupplyPage />} />
            <Route path="/firs" element={<FirsPage />} />
            <Route path="/combined" element={<Navigate to="/income" replace />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/kit" element={<KitPage />} />
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
