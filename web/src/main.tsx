// first import of the entry point: saved state that moves between stores is carried over
// before any store module can hydrate and rewrite its key
import './state/upgradeOnLoad';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { loadSnapshot } from './savegame/snapshotStore';
import { BrowserRouter } from 'react-router';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import App from './App.tsx';
import './layers.css';
import '@mantine/core/styles.layer.css';
import '@mantine/notifications/styles.layer.css';
/* the chart package brings its own: without it the marker in a tooltip is an
   <svg> with no size, which a browser then draws at its default 300x150 */
import '@mantine/charts/styles.layer.css';
import './skin.css';
import './skin-mantine.css';
import { applyPalette } from './skin';
import { cssVariablesResolver, theme } from './theme';
// base-set colours become CSS custom properties before the first paint
applyPalette();

// the stored snapshot is read once at startup; nothing waits on it
void loadSnapshot();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* one skin, no toggle: forceColorScheme also keeps Mantine from storing a
        colour scheme of its own in localStorage */}
    <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver} forceColorScheme="dark">
      <Notifications />
      {/* base path of the deployment ('/ottd-tools/' on Pages, '/' anywhere else) */}
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <App />
      </BrowserRouter>
    </MantineProvider>
  </StrictMode>,
);
