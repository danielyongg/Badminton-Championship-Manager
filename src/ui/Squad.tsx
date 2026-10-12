import { useMemo, useState } from 'react';
import { potentialStars } from '../engine/career';
import { ageAt, currentAbility } from '../engine/generator';
import { headToHead } from '../engine/match';
import { absWeek, computeRanking, rankMap } from '../engine/ranking';
import { rankFromSnapshots } from '../engine/season';
import { ATTRS, type Attr, type Discipline, type GameDate, type Player } from '../engine/types';
import { numLocale, t } from '../i18n';
import { entrantLabel, eventName as eventNameOf, lookup, useGame } from './game';
import { RankChart } from './Ranking';

const JUNIOR_MAX_AGE = 18; // ASUMSI: junior = U19

export const starText = (n: number) => '★'.repeat(Math.floor(n)) + (n % 1 ? '½' : '');
const arrow = (d?: number) => (!d ? '' : d > 0 ? ` ▲${d}` : ` ▼${-d}`);

/** Jumlah laga tiap atlet (tunggal + ganda), untuk akurasi perkiraan potensi. */
function useMatchCounts() {
  const { game, version } = useGame();
  return useMemo(() => {
    const { pairs } = lookup(game.state);
    const n = new Map<string, number>();
    for (const m of game.state.matches)
      for (const side of m.sides)
        for (const id of pairs.get(side)?.playerIds ?? [side]) n.set(id, (n.get(id) ?? 0) + 1);
    return n;
  }, [version, game]);
}

export function FatigueBar({ value }: { value: number }) {
  const color = value > 60 ? '#c0392b' : value > 35 ? '#d4a017' : '#1a8f3a';
  return (
    <span className="bar" title={`${Math.round(value)}`}>
      <span style={{ width: `${Math.min(100, value)}%`, background: color }} />
    </span>
  );
}

export function Squad({ onOpen }: { onOpen: (id: string) => void }) {
  const { game, version } = useGame();
  const { state, ruleset } = game;
  const country = state.career!.countryId!;
  const [juniors, setJuniors] = useState(false);
  const counts = useMatchCounts();
  const ranks = useMemo(() => {
    const now = absWeek(state.date);
    return { MS: rankMap(computeRanking(state.results, 'MS', now, ruleset)), WS: rankMap(computeRanking(state.results, 'WS', now, ruleset)) };
  }, [version]);
  const pairsOf = (id: string) => state.pairs.filter((p) => !p.dissolved && !p.adHoc && p.playerIds.includes(id)).map((p) => p.discipline).join(', ');
  const list = state.players
    .filter((p) => p.countryId === country && p.retired === undefined && (ageAt(p.birth, state.date) <= JUNIOR_MAX_AGE) === juniors)
    .sort((a, b) => currentAbility(b.attrs) - currentAbility(a.attrs));

  return (
    <>
      <nav className="controls">
        <button aria-pressed={!juniors} onClick={() => setJuniors(false)}>{t('seniors')}</button>
        <button aria-pressed={juniors} onClick={() => setJuniors(true)}>{t('juniors')}</button>
        <span>{list.length} {t('players')}</span>
      </nav>
      <div className="scroll">
        <table>
          <thead><tr><th>{t('name')}</th><th>{t('gender')}</th><th>{t('age')}</th><th>{t('ability')}</th><th>{t('potential')}</th><th>{t('fatigue')}</th><th>{t('injury')}</th><th>{t('singlesRank')}</th><th>{t('pair')}</th></tr></thead>
          <tbody>{list.map((p) => (
            <tr key={p.id} onClick={() => onOpen(p.id)} style={{ cursor: 'pointer' }}>
              <td>{p.name}</td><td>{p.gender}</td>
              <td className="num">{ageAt(p.birth, state.date)}</td>
              <td className="num">{currentAbility(p.attrs)}<span className={p.caDelta! > 0 ? 'up' : 'down'}>{arrow(p.caDelta)}</span></td>
              <td className="stars">{starText(potentialStars(p, state.date, counts.get(p.id) ?? 0))}</td>
              <td><FatigueBar value={p.fatigue} /></td>
              <td>{p.injury ? `${p.injury.weeksLeft} ${t('weeks')}${p.injury.severe ? ' ⚠' : ''}` : ''}</td>
              <td className="num">{ranks[p.gender === 'M' ? 'MS' : 'WS'].get(p.id) ?? '—'}</td>
              <td>{pairsOf(p.id)}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </>
  );
}

export function Profile({ id, onBack, onOpen, onOpenEvent }: { id: string; onBack: () => void; onOpen: (id: string) => void; onOpenEvent?: (id: string, year: number) => void }) {
  const { game } = useGame();
  const { state, ruleset } = game;
  const p: Player | undefined = lookup(state).players.get(id);
  const counts = useMatchCounts();
  if (!p) return <p><button onClick={onBack}>← {t('back')}</button></p>;

  const pairs = state.pairs.filter((x) => x.playerIds.includes(id));
  const sides = new Set([id, ...pairs.map((x) => x.id)]);
  const mine = state.matches.filter((m) => m.sides.some((s) => sides.has(s)));
  const recent = mine.slice(-15).reverse();
  const eventName = (eid: string, year?: number) => eventNameOf(ruleset, eid, year) ?? eid;
  const singles: Discipline = p.gender === 'M' ? 'MS' : 'WS';

  // H2H tunggal: lawan yang paling sering dihadapi.
  const opponents = new Map<string, number>();
  for (const m of mine) if (m.sides.includes(id)) { const o = m.sides[0] === id ? m.sides[1] : m.sides[0]; opponents.set(o, (opponents.get(o) ?? 0) + 1); }
  const h2h = [...opponents].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([o]) => ({ o, rec: headToHead(mine, id, o) }));

  return (
    <section>
      <p><button onClick={onBack}>← {t('back')}</button></p>
      <h2>{p.name} <small>({p.countryId}, {p.gender}, {p.hand})</small></h2>
      <p>
        {t('age')} {ageAt(p.birth, state.date)} · {t('ability')} <b>{currentAbility(p.attrs)}</b>{arrow(p.caDelta)} ·
        {' '}{t('potential')} <span className="stars">{starText(potentialStars(p, state.date, counts.get(p.id) ?? 0))}</span> ·
        {' '}{t('fatigue')} <FatigueBar value={p.fatigue} />
        {p.injury && <> · {t('injury')}: {p.injury.weeksLeft} {t('weeks')}{p.injury.severe ? ` (${t('injurySevere')})` : ''}</>}
        {p.retired !== undefined && <> · {t('retired')} {p.retired}</>}
        {' · '}{t('prizeMoney')}: {usd(state.earnings[state.date.year]?.[p.id] ?? 0)} {t('thisSeason')} / {usd(Object.values(state.earnings).reduce((s, y) => s + (y[p.id] ?? 0), 0))} {t('career')}
      </p>
      <AttrChart p={p} date={state.date} />
      <div className="split">
        <div className="scroll">
          <h3>{t('attributes')}</h3>
          <table>
            <thead><tr><th></th>{p.attrHistory.map((h) => <th key={h.year}>{h.year}</th>)}<th>{t('now')}</th></tr></thead>
            <tbody>
              {ATTRS.map((a) => (
                <tr key={a}><td>{t(a)}</td>{p.attrHistory.map((h) => <td className="num" key={h.year}>{Math.round(h.attrs[a])}</td>)}<td className="num"><b>{Math.round(p.attrs[a])}</b></td></tr>
              ))}
              <tr><td><b>{t('ability')}</b></td>{p.attrHistory.map((h) => <td className="num" key={h.year}>{currentAbility(h.attrs)}</td>)}<td className="num"><b>{currentAbility(p.attrs)}</b></td></tr>
            </tbody>
          </table>
        </div>
        <aside>
          <h3>{t('rankHistory')} ({singles})</h3>
          <RankChart history={rankFromSnapshots(state, id, singles)} />
          {pairs.filter((x) => !x.dissolved).map((x) => (
            <div key={x.id}>
              <h4>{x.discipline}: {entrantLabel(state, x.id).name}</h4>
              <RankChart history={rankFromSnapshots(state, x.id, x.discipline)} />
            </div>
          ))}
        </aside>
      </div>
      <h3>{t('recentMatches')}</h3>
      <div className="scroll">
        <table>
          <tbody>{recent.map((m) => {
            const i = sides.has(m.sides[0]) ? 0 : 1;
            const opp = m.sides[1 - i];
            return (
              <tr key={m.id}>
                <td>{m.year}</td><td>{onOpenEvent ? <a href="#" onClick={(e) => { e.preventDefault(); onOpenEvent(m.tournamentId, m.year); }}>{eventName(m.tournamentId, m.year)}</a> : eventName(m.tournamentId, m.year)}</td><td>{m.discipline} {m.round}</td>
                <td><a href="#" onClick={(e) => { e.preventDefault(); onOpen(lookup(state).pairs.get(opp)?.playerIds[0] ?? opp); }}>{entrantLabel(state, opp).name} ({entrantLabel(state, opp).country})</a></td>
                <td>{m.scores.map(([a, b]) => (i === 0 ? `${a}-${b}` : `${b}-${a}`)).join(', ')}</td>
                <td className={m.winner === i ? 'up' : 'down'}>{m.winner === i ? t('won') : t('lost')}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
      {h2h.length > 0 && (
        <>
          <h3>{t('h2h')}</h3>
          <table style={{ maxWidth: 480 }}>
            <tbody>{h2h.map(({ o, rec }) => <tr key={o}><td>{entrantLabel(state, o).name} ({entrantLabel(state, o).country})</td><td className="num">{rec[0]} – {rec[1]}</td></tr>)}</tbody>
          </table>
        </>
      )}
    </section>
  );
}

export const usd = (x: number) => `$${Math.round(x).toLocaleString(numLocale())}`;

/**
 * Grafik atribut per usia: Kemampuan (CA) + satu atribut pilihan. Titik = akhir tiap musim (riwayat) + sekarang.
 * Satu sumbu (0–100 dipersempit ke rentang data); tabel atribut di bawahnya sebagai tampilan tabel.
 */
function AttrChart({ p, date }: { p: Player; date: GameDate }) {
  const [attr, setAttr] = useState<Attr>('speed');
  // Riwayat tahun Y = kondisi akhir musim Y (usia ±(Y + 1) − tahun lahir); "sekarang" memakai usia pecahan menurut minggu.
  const byAge = new Map<number, Player['attrs']>();
  for (const h of p.attrHistory) byAge.set(h.year + 1 - p.birth.year, h.attrs);
  byAge.set(date.year - p.birth.year + (date.week - 1) / 52, p.attrs);
  const pts = [...byAge].sort((a, b) => a[0] - b[0]);
  if (pts.length < 2) return <p className="hint">{t('attrChartWait')}</p>;
  const series = [
    { key: 'ca', label: t('ability'), color: 'var(--series-1)', vals: pts.map(([, a]) => currentAbility(a)) },
    { key: attr, label: t(attr), color: 'var(--series-2)', vals: pts.map(([, a]) => Math.round(a[attr])) },
  ];
  const all = series.flatMap((s) => s.vals);
  const lo = Math.max(0, Math.floor((Math.min(...all) - 5) / 10) * 10), hi = Math.min(100, Math.ceil((Math.max(...all) + 5) / 10) * 10);
  const W = 360, H = 170, L = 30, R = 56, T = 10, B = 24;
  const ages = pts.map(([a]) => a);
  const x = (age: number) => L + ((age - ages[0]) / Math.max(1, ages.at(-1)! - ages[0])) * (W - L - R);
  const y = (v: number) => T + ((hi - v) / (hi - lo)) * (H - T - B);
  const ticks = Array.from({ length: (hi - lo) / 10 + 1 }, (_, i) => lo + i * 10);
  return (
    <section>
      <div className="controls">
        <h3 style={{ margin: 0 }}>{t('attrChart')}</h3>
        {series.map((s) => <span key={s.key}><span className="swatch" style={{ background: s.color }} /> {s.label}</span>)}
        <select value={attr} onChange={(e) => setAttr(e.target.value as Attr)} aria-label={t('attributes')}>
          {ATTRS.map((a) => <option key={a} value={a}>{t(a)}</option>)}
        </select>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W * 1.6 }} role="img" aria-label={t('attrChart')}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth="1" />
            <text x={L - 4} y={y(v) + 3} fontSize="9" textAnchor="end" fill="currentColor" opacity=".7">{v}</text>
          </g>
        ))}
        {Array.from({ length: Math.floor(ages.at(-1)!) - Math.ceil(ages[0]) + 1 }, (_, i) => Math.ceil(ages[0]) + i).map((a) => (
          <text key={a} x={x(a)} y={H - 8} fontSize="9" textAnchor="middle" fill="currentColor" opacity=".7">{a}</text>
        ))}
        <text x={W - R} y={H - 8} fontSize="9" fill="currentColor" opacity=".7" dx="6">{t('yearsShort')}</text>
        {series.map((s) => (
          <g key={s.key}>
            <polyline points={s.vals.map((v, i) => `${x(ages[i])},${y(v)}`).join(' ')} fill="none" stroke={s.color} strokeWidth="2" />
            {s.vals.map((v, i) => (
              <circle key={i} cx={x(ages[i])} cy={y(v)} r="4" fill={s.color} stroke="Canvas" strokeWidth="2">
                <title>{`${s.label} · ${Math.floor(ages[i])} ${t('yearsShort')}: ${v}`}</title>
              </circle>
            ))}
            <text x={x(ages.at(-1)!) + 8} y={y(s.vals.at(-1)!) + 3} fontSize="10" fill="currentColor">{s.label} {s.vals.at(-1)}</text>
          </g>
        ))}
      </svg>
    </section>
  );
}
