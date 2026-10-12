import { getLang, LANGS, setLang, t, type Lang } from '../i18n';

const LABEL: Record<Lang, string> = { id: 'Bahasa Indonesia', en: 'English' };

/** Pilihan bahasa. `onChange` memicu render ulang seluruh aplikasi (teks dibaca ulang dari kamus). */
export function LangSelect({ onChange }: { onChange: () => void }) {
  return (
    <label>{t('language')}
      <select value={getLang()} onChange={(e) => { setLang(e.target.value as Lang); document.documentElement.lang = e.target.value; onChange(); }}>
        {LANGS.map((l) => <option key={l} value={l}>{LABEL[l]}</option>)}
      </select>
    </label>
  );
}
