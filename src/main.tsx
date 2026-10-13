import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/barlow/400.css';
import '@fontsource/barlow/600.css';
import '@fontsource/barlow/800.css';
import { getLang } from './i18n';
import { App } from './ui/App';
import { applyTheme, getTheme } from './ui/theme';
import './ui/style.css';

document.documentElement.lang = getLang();
applyTheme(getTheme()); // sebelum render pertama agar tidak berkedip
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
