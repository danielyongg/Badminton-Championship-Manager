import type { ReactNode } from 'react';
import { WINNER_SHOTS, type MatchStats } from '../engine/types';
import { numLocale, t } from '../i18n';

type Pair = [number, number];

/**
 * Statistik laga ala siaran TV (Live Match, detail laga, Lab): fakta laga di atas, lalu baris "nilai kiri · label ·
 * nilai kanan" dengan bar perbandingan per kelompok (poin, winner, kesalahan, area), dan sebaran panjang reli.
 * `mine`: sisi atlet sendiri (warna aksen). Kesalahan: yang lebih sedikit ditebalkan.
 */
export function MatchStatsView({ s: raw, names, mine, avgOf }: { s: MatchStats; names: [string, string]; mine?: 0 | 1; avgOf?: number }) {
  // Rata-rata per laga (profil/H2H): `raw` = jumlah dari `avgOf` laga; smash tercepat & reli terpanjang tetap maksimum.
  const s = avgOf ? perMatch(raw, avgOf) : raw;
  const sum = (p: Pair[]) => p.reduce<Pair>((a, x) => [a[0] + x[0], a[1] + x[1]], [0, 0]);
  const points: Pair = [s.srvWon[0] + s.srv[1] - s.srvWon[1], s.srvWon[1] + s.srv[0] - s.srvWon[0]];
  const recv: Pair = [s.srv[1] - s.srvWon[1], s.srv[0] - s.srvWon[0]];
  const winners = sum([...WINNER_SHOTS.map((k) => s.win[k]), s.sw]);
  const pct = (a: number, b: number) => (b ? ` (${Math.round((a / b) * 100)}%)` : '');
  const fmt = (n: number) => n.toLocaleString(numLocale(), { maximumFractionDigits: 1 });
  const fastest = s.kmh[0] || s.kmh[1] ? (s.kmh[0] >= s.kmh[1] ? 0 : 1) : undefined;
  const totalRallies = s.rallies[0] + s.rallies[1] + s.rallies[2];
  return (
    <div className={`mstats${mine === undefined ? '' : ` mine-${mine}`}`}>
      <div className="ms-head">
        <span className="ms-name s0">{names[0]}</span>
        <span className="ms-name s1">{names[1]}</span>
      </div>
      <dl className="ms-facts">
        <div><dt>{t(avgOf ? 'statDurationAvg' : 'statDuration')}</dt><dd>{Math.round(s.sec / 60)} <small>{t('minutesShort')}</small></dd></div>
        <div><dt>{t('statLongest')}</dt><dd>{s.longest} <small>{t('shotsUnit')}</small></dd></div>
        <div><dt>{t('statFastestSmash')}</dt><dd>{fastest === undefined ? '—' : <>{fmt(s.kmh[fastest])} <small>km/h</small><small className="who">{names[fastest].split(' ')[0]}</small></>}</dd></div>
      </dl>

      <Section title={t('statSectionPoints')}>
        <Row label={t('totalPoints')} v={points} />
        <Row label={t('statServePts')} v={s.srvWon} show={(x) => `${fmt(s.srvWon[x])}/${fmt(s.srv[x])}${pct(s.srvWon[x], s.srv[x])}`} />
        <Row label={t('statReceivePts')} v={recv} show={(x) => `${fmt(recv[x])}/${fmt(s.srv[1 - x])}${pct(recv[x], s.srv[1 - x])}`} />
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
      <p className="hint">{avgOf ? `${t('statsAvgHint', { n: avgOf })} ` : ''}{t('statsEstimateHint')}</p>
    </div>
  );
}

const PAIRS = ['ue', 'fe', 'sf', 'sw', 'srv', 'srvWon', 'streak', 'gp', 'gps', 'mps'] as const;
const div = (p: Pair, n: number): Pair => [p[0] / n, p[1] / n];
function perMatch(s: MatchStats, n: number): MatchStats {
  const out = structuredClone(s);
  for (const k of PAIRS) out[k] = div(s[k], n);
  for (const k of WINNER_SHOTS) out.win[k] = div(s.win[k], n);
  out.sec = s.sec / n;
  return out;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="ms-sec"><h4>{title}</h4>{children}</section>;
}

/** Satu baris perbandingan; `fewer` = nilai lebih kecil lebih baik (kesalahan). */
function Row({ label, v, show, fewer, strong }: { label: string; v: Pair; show?: (x: 0 | 1) => string; fewer?: boolean; strong?: boolean }) {
  const lead = v[0] === v[1] ? undefined : (v[0] > v[1]) !== !!fewer ? 0 : 1;
  const cell = (x: 0 | 1) => <b className={lead === undefined ? undefined : lead === x ? 'lead' : 'trail'}>{show ? show(x) : v[x].toLocaleString(numLocale(), { maximumFractionDigits: 1 })}</b>;
  return (
    <div className={`ms-row${strong ? ' strong' : ''}`}>
      {cell(0)}<span>{label}</span>{cell(1)}
      <div className="ms-bar">{v[0] > 0 && <i className="s0" style={{ flexGrow: v[0] }} />}{v[1] > 0 && <i className="s1" style={{ flexGrow: v[1] }} />}</div>
    </div>
  );
}

/**
 * Statistik pribadi di profil: rata-rata per laga dari `n` laga (sisi 0 = peserta ini; sisi 1 hanya untuk poin saat
 * menerima). Kotak angka utama, lalu kelompok baris dengan bar persentase & komposisi winner / panjang reli.
 */
export function PlayerStatsView({ s, n, record }: { s: MatchStats; n: number; record: [number, number] }) {
  const f = (x: number, d = 1) => x.toLocaleString(numLocale(), { maximumFractionDigits: d });
  const per = (x: number) => f(x / n);
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
  const recv = s.srv[1] - s.srvWon[1];
  const shots = [...WINNER_SHOTS.map((k) => ({ k: t(k), v: s.win[k][0] })), { k: t('statServiceWinners'), v: s.sw[0] }];
  const winners = shots.reduce((a, x) => a + x.v, 0);
  const rallies = s.rallies[0] + s.rallies[1] + s.rallies[2];
  const played = record[0] + record[1];
  const tile = (label: string, value: ReactNode, sub?: ReactNode) => <div><dt>{label}</dt><dd>{value}</dd>{sub && <small>{sub}</small>}</div>;
  const row = (label: string, value: string, bar?: number) => (
    <div className="ps-row"><span>{label}</span><b>{value}</b>{bar !== undefined && <span className="ps-bar"><i style={{ width: `${bar}%` }} /></span>}</div>
  );
  return (
    <div className="pstats">
      <dl className="ps-tiles">
        {tile(t('profRecord'), `${record[0]}–${record[1]}`, played ? `${pct(record[0], played)}% ${t('winRate')}` : undefined)}
        {tile(t('statWinnersTotal'), per(winners), `/${t('perMatch')}`)}
        {tile(t('statUE'), per(s.ue[0]), `/${t('perMatch')}`)}
        {tile(t('statDurationAvg'), <>{Math.round(s.sec / n / 60)} <small>{t('minutesShort')}</small></>)}
        {tile(t('statFastestSmash'), s.kmh[0] ? <>{f(s.kmh[0], 0)} <small>km/h</small></> : '—')}
        {tile(t('statLongest'), <>{s.longest} <small>{t('shotsUnit')}</small></>)}
      </dl>
      <div className="ps-groups">
        <section>
          <h4>{t('statSectionPoints')}</h4>
          {row(t('statServePts'), `${pct(s.srvWon[0], s.srv[0])}%`, pct(s.srvWon[0], s.srv[0]))}
          {row(t('statReceivePts'), `${pct(recv, s.srv[1])}%`, pct(recv, s.srv[1]))}
          {row(t('statStreak'), per(s.streak[0]))}
          {row(t('statGamePoints'), per(s.gp[0]))}
          {row(t('statGpSaved'), per(s.gps[0]))}
          {row(t('statMpSaved'), per(s.mps[0]))}
        </section>
        <section>
          <h4>{t('statSectionWinners')}</h4>
          <div className="ms-dist ps-mix" role="img" aria-label={t('statSectionWinners')}>
            {shots.map((x, i) => x.v > 0 && <i key={i} className={`w${i}`} style={{ flexGrow: x.v }} />)}
          </div>
          <ul className="ms-legend ps-legend">
            {shots.map((x, i) => <li key={i}><i className={`w${i}`} />{x.k} <b>{per(x.v)}</b> <span>({pct(x.v, winners)}%)</span></li>)}
          </ul>
        </section>
        <section>
          <h4>{t('statSectionErrors')}</h4>
          {row(t('statUE'), per(s.ue[0]))}
          {row(t('statFE'), per(s.fe[0]))}
          {row(t('statServiceFaults'), per(s.sf[0]))}
        </section>
        <section>
          <h4>{t('statRallyLen')}</h4>
          <div className="ms-dist ps-mix" role="img" aria-label={t('statRallyLen')}>
            {s.rallies.map((x, i) => x > 0 && <i key={i} className={`r${i}`} style={{ flexGrow: x }} />)}
          </div>
          <ul className="ms-legend ps-legend">
            {(['rallyShort', 'rallyMid', 'rallyLong'] as const).map((k, i) => <li key={k}><i className={`r${i}`} />{t(k)} <b>{pct(s.rallies[i], rallies)}%</b></li>)}
          </ul>
        </section>
      </div>
      <p className="hint">{t('statsAvgHint', { n })} {t('statsEstimateHint')}</p>
    </div>
  );
}
