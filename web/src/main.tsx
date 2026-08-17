import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import App from './App.tsx';
import 'input-switch-polyfill/input-switch-polyfill.css';
import './index.css';
import './skin.css';
import { applyPalette } from './skin';

// base-set colours become CSS custom properties before the first paint
applyPalette();
document.documentElement.dataset.skin = 'pixel';

// <input type="checkbox" switch> is native in Safari 17.4+; elsewhere polyfill it
if (!('switch' in HTMLInputElement.prototype)) {
  await import('input-switch-polyfill/input-switch-polyfill.js');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
