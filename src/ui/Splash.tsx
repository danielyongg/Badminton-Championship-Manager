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
    if (stage === 'show') { const id = setTimeout(() => setStage('fade'), 1500); return () => clearTimeout(id); }
    if (stage === 'fade') { const id = setTimeout(() => setStage('gone'), 400); return () => clearTimeout(id); }
  }, [stage]);
  if (stage === 'gone') return null;
  return (
    <div className={`splash${stage === 'fade' ? ' out' : ''}`} onClick={() => setStage('fade')} role="presentation">
      <img src={`${import.meta.env.BASE_URL}icon-192.png`} alt="" width={96} height={96} />
      <h1>{t('appTitle')}</h1>
      <p>{t('splashTagline')}</p>
    </div>
  );
}
