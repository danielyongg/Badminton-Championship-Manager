import { useState } from 'react';
import { t, type TextKey } from '../i18n';
import { getTheme, setTheme, THEMES, type Theme } from './theme';

/** Pilihan tema: Otomatis (ikut perangkat) / Terang / Gelap. */
export function ThemeSelect() {
  const [v, setV] = useState(getTheme);
  return (
    <label>{t('theme')}
      <select value={v} onChange={(e) => { const x = e.target.value as Theme; setTheme(x); setV(x); }}>
        {THEMES.map((x) => <option key={x} value={x}>{t(`theme_${x}` as TextKey)}</option>)}
      </select>
    </label>
  );
}
