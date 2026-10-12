import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { getLang } from './i18n';
import { App } from './ui/App';
import './ui/style.css';

document.documentElement.lang = getLang();
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
