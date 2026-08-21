import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import App from './App.tsx';
import './layers.css';
import '@mantine/core/styles.layer.css';
import '@mantine/notifications/styles.layer.css';
import 'mantine-datatable/styles.layer.css';
import './index.css';
import './skin.css';
import './skin-mantine.css';
import { applyPalette } from './skin';
import { cssVariablesResolver, theme } from './theme';

// base-set colours become CSS custom properties before the first paint
applyPalette();
document.documentElement.dataset.skin = 'pixel';

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
