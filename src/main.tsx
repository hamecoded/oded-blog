import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'katex/dist/katex.min.css';
import './index.css';
import App from './App';

// No zooming the page on phones (pinch or double tap). Safari ignores user-scalable=no in the viewport tag, so its
// pinch gesture is cancelled here; index.css adds touch-action for the double tap.
const blockZoom = (e: Event) => e.preventDefault();
document.addEventListener('gesturestart', blockZoom, { passive: false });
document.addEventListener('gesturechange', blockZoom, { passive: false });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
