import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/global.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

console.log('%c0x90 0x90 0x90', 'color:#FF6A13;font-family:monospace', '— nothing happened here.');
