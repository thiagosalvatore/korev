import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './design-system/styles/index.css';
import { App } from './app/App';
import { ListeningWave } from './app/ListeningWave';
import { LISTENING_HASH } from './shared/voice';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    {location.hash === `#${LISTENING_HASH}` ? <ListeningWave /> : <App />}
  </StrictMode>,
);
