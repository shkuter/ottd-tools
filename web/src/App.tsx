import { NavLink, Navigate, Route, Routes } from 'react-router';
import ConsistPage from './features/consist/ConsistPage';
import OptimizerPage from './features/optimizer/OptimizerPage';
import SettingsPage from './features/settings/SettingsPage';
import RoutePage from './features/route/RoutePage';
import FirsPage from './features/firs/FirsPage';
import CombinedPage from './features/combined/CombinedPage';
import { datasetMeta } from './dataset';
import { t } from './i18n';
import { useSettingsStore } from './state/settingsStore';
import { Warning } from './components/Warning';

const tabs = [
  { path: '/optimizer', label: 'nav.optimizer' },
  { path: '/consist', label: 'nav.consist' },
  { path: '/income', label: 'nav.income' },
  { path: '/firs', label: 'nav.firs' },
  { path: '/combined', label: 'nav.combined' },
  { path: '/settings', label: 'nav.settings' },
];

export default function App() {
  const inflation = useSettingsStore((s) => s.game.inflation);
  const firs = useSettingsStore((s) => s.game.firs);
  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>{t('app.title')}</h1>
          <p className="subtitle">{t('app.subtitle')}</p>
        </div>
        <nav>
          {tabs
            .filter((tab) => firs || tab.path !== '/firs')
            .map((tab) => (
            <NavLink
              key={tab.path}
              to={tab.path}
              className={({ isActive }) => (isActive ? 'tab active' : 'tab')}
            >
              {t(tab.label)}
            </NavLink>
          ))}
        </nav>
      </header>
      <main>
        {inflation && (
          <Warning>
            {t('settings.inflationBanner')}{' '}
            <NavLink to="/settings">{t('settings.inflationBannerLink')}</NavLink>
          </Warning>
        )}
        <Routes>
          <Route path="/" element={<Navigate to="/optimizer" replace />} />
          <Route path="/optimizer" element={<OptimizerPage />} />
          <Route path="/consist" element={<ConsistPage />} />
          <Route path="/income" element={<RoutePage />} />
          <Route path="/firs" element={<FirsPage />} />
          <Route path="/combined" element={<CombinedPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
      <footer className="app-footer">
        {t('footer.data')}: Iron Horse {datasetMeta.iron_horse} · FIRS {datasetMeta.firs} ·{' '}
        {t('footer.generated')} {datasetMeta.generated_at}
      </footer>
    </div>
  );
}
