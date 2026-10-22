import type { ReactNode } from 'react';
import { WINNER_SHOTS, type MatchStats } from '../engine/types';
import { numLocale, t } from '../i18n';

type Pair = [number, number];

/**
 * Statistik laga ala siaran TV (Live Match, detail laga, Lab): fakta laga di atas, lalu baris "nilai kiri · label ·
 * nilai kanan" dengan bar perbandingan per kelompok (poin, winner, kesalahan, area), dan sebaran panjang reli.
 * `mine`: sisi atlet sendiri (warna aksen). Kesalahan: yang lebih sedikit ditebalkan.
 */
export function MatchStatsView({ s, names, mine }: { s: MatchStats; names: [string, string]; mine?: 0 | 1 }) {
  const sum = (p: Pair[]) => p.reduce<Pair>((a, x) => [a[0] + x[0], a[1] + x[1]], [0, 0]);
  const points: Pair = [s.srvWon[0] + s.srv[1] - s.srvWon[1], s.srvWon[1] + s.srv[0] - s.srvWon[0]];
  const recv: Pair = [s.srv[1] - s.srvWon[1], s.srv[0] - s.srvWon[0]];
  const winners = sum([...WINNER_SHOTS.map((k) => s.win[k]), s.sw]);
  const pct = (a: number, b: number) => (b ? ` (${Math.round((a / b) * 100)}%)` : '');
  const fmt = (n: number) => n.toLocaleString(numLocale());
  const fastest = s.kmh[0] || s.kmh[1] ? (s.kmh[0] >= s.kmh[1] ? 0 : 1) : undefined;
  const totalRallies = s.rallies[0] + s.rallies[1] + s.rallies[2];
  return (
    <div className={`mstats${mine === undefined ? '' : ` mine-${mine}`}`}>
      <div className="ms-head">
        <span className="ms-name s0">{names[0]}</span>
        <span className="ms-name s1">{names[1]}</span>
      </div>
      <dl className="ms-facts">
        <div><dt>{t('statDuration')}</dt><dd>{Math.round(s.sec / 60)} <small>{t('minutesShort')}</small></dd></div>
        <div><dt>{t('statLongest')}</dt><dd>{s.longest} <small>{t('shotsUnit')}</small></dd></div>
        <div><dt>{t('statFastestSmash')}</dt><dd>{fastest === undefined ? '—' : <>{fmt(s.kmh[fastest])} <small>km/h · {names[fastest].split(' ')[0]}</small></>}</dd></div>
      </dl>

      <Section title={t('statSectionPoints')}>
        <Row label={t('totalPoints')} v={points} />
        <Row label={t('statServePts')} v={s.srvWon} show={(x) => `${s.srvWon[x]}/${s.srv[x]}${pct(s.srvWon[x], s.srv[x])}`} />
        <Row label={t('statReceivePts')} v={recv} show={(x) => `${recv[x]}/${s.srv[1 - x]}${pct(recv[x], s.srv[1 - x])}`} />
        <Row label={t('statStreak')} v={s.streak} />
        <Row label={t('statGamePoints')} v={s.gp} />
        <Row label={t('statGpSaved')} v={s.gps} />
        {(s.mps[0] > 0 || s.mps[1] > 0) && <Row label={t('statMpSaved')} v={s.mps} />}
      </Section>

      <Section title={t('statSectionWinners')}>
        {WINNER_SHOTS.map((k) => <Row key={k} label={t(k)} v={s.win[k]} />)}
        <Row label={t('statServiceWinners')} v={s.sw} />
        <Row label={t('statWinnersTotal')} v={winners} strong />
      </Section>

      <Section title={t('statSectionErrors')}>
        <Row label={t('statUE')} v={s.ue} fewer />
        <Row label={t('statFE')} v={s.fe} fewer />
        <Row label={t('statServiceFaults')} v={s.sf} fewer />
      </Section>

      <Section title={t('statSectionArea')}>
        <Row label={t('areaFront')} v={sum([s.win.net, s.win.drop])} />
        <Row label={t('areaMid')} v={s.win.smash} />
        <Row label={t('areaBack')} v={s.win.clear} />
      </Section>

      <Section title={t('statRallyLen')}>
        <div className="ms-dist" role="img" aria-label={t('statRallyLen')}>
          {s.rallies.map((n, i) => n > 0 && <i key={i} className={`r${i}`} style={{ flexGrow: n }} />)}
        </div>
        <ul className="ms-legend">
          {(['rallyShort', 'rallyMid', 'rallyLong'] as const).map((k, i) => (
            <li key={k}><i className={`r${i}`} />{t(k)} <b>{totalRallies ? Math.round((s.rallies[i] / totalRallies) * 100) : 0}%</b></li>
          ))}
        </ul>
      </Section>
      <p className="hint">{t('statsEstimateHint')}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="ms-sec"><h4>{title}</h4>{children}</section>;
}

/** Satu baris perbandingan; `fewer` = nilai lebih kecil lebih baik (kesalahan). */
function Row({ label, v, show, fewer, strong }: { label: string; v: Pair; show?: (x: 0 | 1) => string; fewer?: boolean; strong?: boolean }) {
  const lead = v[0] === v[1] ? undefined : (v[0] > v[1]) !== !!fewer ? 0 : 1;
  const cell = (x: 0 | 1) => <b className={lead === undefined ? undefined : lead === x ? 'lead' : 'trail'}>{show ? show(x) : v[x]}</b>;
  return (
    <div className={`ms-row${strong ? ' strong' : ''}`}>
      {cell(0)}<span>{label}</span>{cell(1)}
      <div className="ms-bar">{v[0] > 0 && <i className="s0" style={{ flexGrow: v[0] }} />}{v[1] > 0 && <i className="s1" style={{ flexGrow: v[1] }} />}</div>
    </div>
  );
}
