export type Theme = 'auto' | 'light' | 'dark';
export const THEMES: Theme[] = ['auto', 'light', 'dark'];

export function getTheme(): Theme {
  try { const v = localStorage.getItem('bcm-theme'); return v === 'light' || v === 'dark' ? v : 'auto'; } catch { return 'auto'; }
}

/** Otomatis = tanpa atribut (CSS mengikuti prefers-color-scheme). */
export function applyTheme(t: Theme) {
  if (t === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
}

export function setTheme(t: Theme) {
  try { localStorage.setItem('bcm-theme', t); } catch { /* mode privat: hanya untuk sesi ini */ }
  applyTheme(t);
}
