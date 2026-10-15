import { useEffect, useState } from 'react';
import { t } from '../i18n';

// Layar pembuka: hanya saat dibuka dari ikon layar Home (web app). `?splash` di URL memaksanya tampil (untuk uji di browser).
const standalone = () =>
  (navigator as Navigator & { standalone?: boolean }).standalone === true
  || matchMedia('(display-mode: standalone)').matches
  || new URLSearchParams(location.search).has('splash');

export function Splash() {
  const [stage, setStage] = useState<'show' | 'fade' | 'gone'>(() => (standalone() ? 'show' : 'gone'));
  useEffect(() => {
    if (stage === 'show') { const id = setTimeout(() => setStage('fade'), 1000); return () => clearTimeout(id); }
    if (stage === 'fade') { const id = setTimeout(() => setStage('gone'), 400); return () => clearTimeout(id); }
  }, [stage]);
  if (stage === 'gone') return null;
  return (
    <div className={`splash${stage === 'fade' ? ' out' : ''}`} onClick={() => setStage('fade')} role="presentation">
      {/* Kok saja (tanpa kotak ikon) agar menyatu dengan latar; sama dengan favicon.svg */}
      <svg viewBox="3 1 26 30" width={104} height={120} aria-hidden="true">
        <g transform="rotate(35 16 16)">
          <path d="M10.5 20 L6.5 5 L25.5 5 L21.5 20 Z" fill="#fff" />
          <path d="M12.5 20 L11 5 M16 20 V5 M19.5 20 L21 5 M8 9.5 H24" stroke="var(--accent)" strokeWidth="1" />
          <circle cx="16" cy="23.5" r="4.2" fill="#f2c94c" />
        </g>
      </svg>
      <h1>{t('appTitle')}</h1>
      <p>{t('splashTagline')}</p>
    </div>
  );
}
