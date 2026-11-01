import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/global.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

const accent = getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-accent').trim();
console.log('%c0x90 0x90 0x90', `color:${accent};font-family:monospace`, '— nothing happened here.');
