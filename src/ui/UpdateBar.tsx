import { useEffect, useState } from 'react';
import { t } from '../i18n';

declare const __BUILD__: string;

/** Diset Career selama minggu berjalan: progres minggu itu belum tersimpan, jadi jangan muat ulang otomatis. */
export const weekRunning = { on: false };

/**
 * Pengecekan versi: saat dibuka & tiap kembali ke aplikasi (web app di layar utama sering hanya melanjutkan dari memori),
 * bandingkan version.json di server dengan build ini. Versi baru → muat ulang otomatis; bila minggu sedang berjalan,
 * tampilkan bilah dengan tombol muat ulang.
 */
/** Muat ulang dengan alamat baru (?v=) agar index.html tidak diambil dari cache browser. */
const reload = (build: string) => location.replace(`${location.pathname}?v=${build}${location.hash}`);

export function UpdateBar() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!import.meta.env.PROD) return;
    const check = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const r = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' });
        const { build } = await r.json();
        if (build === __BUILD__) return;
        // Sekali per versi baru: bila setelah muat ulang build ini masih lama (cache), tampilkan bilah, jangan berulang.
        let tried = false;
        try { tried = sessionStorage.getItem('reloadedFor') === build; sessionStorage.setItem('reloadedFor', build); } catch { tried = true; }
        if (weekRunning.on || tried) setReady(true); else reload(build);
      } catch { /* offline / gagal: dicek lagi saat kembali ke aplikasi */ }
    };
    void check();
    document.addEventListener('visibilitychange', check);
    return () => document.removeEventListener('visibilitychange', check);
  }, []);
  if (!ready) return null;
  return <div className="updatebar">{t('newVersion')} <button className="primary" onClick={() => reload(Date.now().toString(36))}>{t('reload')}</button></div>;
}
