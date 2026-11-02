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
// Strip tab yang bisa digeser (HP): tab aktif yang terpotong di tepi digeser ke tengah strip,
// baik saat diketuk (World di ujung kanan menu) maupun saat strip baru tampil.
const showPressed = (b: HTMLElement) => {
  const nav = b.closest('nav.controls');
  if (!nav) return;
  const nr = nav.getBoundingClientRect(), br = b.getBoundingClientRect();
  if (br.right > nr.right + 1 || br.left < nr.left - 1) nav.scrollLeft += br.left - nr.left - (nr.width - br.width) / 2;
};
new MutationObserver((muts) => {
  for (const m of muts) {
    if (m.type === 'attributes') { if ((m.target as HTMLElement).getAttribute('aria-pressed') === 'true') showPressed(m.target as HTMLElement); continue; }
    for (const n of m.addedNodes) if (n instanceof HTMLElement) n.querySelectorAll<HTMLElement>('nav.controls button[aria-pressed="true"]').forEach(showPressed);
  }
}).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-pressed'] });
createRoot(document.getElementById('root')!).render(<StrictMode><App /><UpdateBar /><Splash /></StrictMode>);
