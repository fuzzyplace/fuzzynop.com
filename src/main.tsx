import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/global.css';

// v2.12: a load (or reload) without a #section starts at the top, so the entrance is always seen;
// a browser restoring the old scroll position would skip it
if (!window.location.hash && 'scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

const accent = getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-accent').trim();
console.log('%c0x90 0x90 0x90', `color:${accent};font-family:monospace`, 'nothing happened here.');
