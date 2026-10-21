import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/barlow/400.css';
import '@fontsource/barlow/600.css';
import '@fontsource/barlow/800.css';
import { getLang } from './i18n';
import { App } from './ui/App';
import { Splash } from './ui/Splash';
import { UpdateBar } from './ui/UpdateBar';
import { applyTheme, getTheme } from './ui/theme';
import './ui/style.css';

document.documentElement.lang = getLang();
applyTheme(getTheme()); // sebelum render pertama agar tidak berkedip
// Offline: simpan file game di perangkat (service-worker.js). Hanya build produksi.
if (import.meta.env.PROD && 'serviceWorker' in navigator) void navigator.serviceWorker.register('./sw.js').catch(() => {});
createRoot(document.getElementById('root')!).render(<StrictMode><App /><UpdateBar /><Splash /></StrictMode>);
