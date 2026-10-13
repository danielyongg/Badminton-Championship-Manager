import { useMemo, useState } from 'react';
import { dissolvePair, formPair, potentialStars, promoteJunior } from '../engine/career';
import { ageAt, currentAbility, isPratama } from '../engine/generator';
import { headToHead } from '../engine/match';
import { absWeek, computeRanking, rankMap } from '../engine/ranking';
import { rankFromSnapshots } from '../engine/season';
import { ATTRS, DISCIPLINES, type Attr, type Discipline, type GameDate, type Pair, type Player } from '../engine/types';
import { numLocale, t, type TextKey } from '../i18n';
import { entrantLabel, eventName as eventNameOf, JUNIOR_MAX_AGE, lookup, saveGame, useGame } from './game';
import { Pairs } from './Pairs';
import { RankChart } from './Ranking';
import { Flag } from './Flag';
import { MatchLink } from './MatchDetail';


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
  const color = value > 60 ? 'var(--danger)' : value > 35 ? 'var(--gold)' : 'var(--accent)';
  return (
    <span className="bar" title={`${Math.round(value)}`}>
      <span style={{ width: `${Math.min(100, value)}%`, background: color }} />
    </span>
  );
}

export function Squad({ onOpen }: { onOpen: (id: string) => void }) {
  const { game, version, changed } = useGame();
  const { state, ruleset } = game;
  const country = state.career!.countryId!;
  // Skuad → Senior/Junior (semua pemain) → filter sektor: Single (pemain tunggal) / Pairs (pasangan ganda).
  const [juniors, setJuniors] = useState(false);
  const [view, setView] = useState<'all' | 'singles' | 'pairs'>('all');
  const commit = () => { changed(); void saveGame(game); };
  const counts = useMatchCounts();
  const ranks = useMemo(() => {
    const now = absWeek(state.date);
    return Object.fromEntries(DISCIPLINES.map((d) => [d, rankMap(computeRanking(state.results, d, now, ruleset))])) as Record<Discipline, Map<string, number>>;
  }, [version]);
  // Sektor = nomor yang dimainkan: tunggal (bila bukan spesialis ganda) + pasangan utama aktif.
  const mainPair = (id: string, d: DoublesD) => state.pairs.find((p) => p.discipline === d && !p.dissolved && !p.trial && !p.adHoc && p.playerIds.includes(id));
  const sectorsOf = (p: Player) => [...(p.focus === 'D' ? [] : [p.gender === 'M' ? 'MS' : 'WS']), ...doublesOf(p).filter((d) => mainPair(p.id, d))];
  const pairsOf = (id: string) => sectorsOf(lookup(state).players.get(id)!).join(', ');
  // BWF rank = semua peringkat atlet (tunggal & pasangan utama ganda), terbaik dulu.
  const allRanks = (p: Player) => [
    { d: p.gender === 'M' ? 'MS' : 'WS', r: ranks[p.gender === 'M' ? 'MS' : 'WS'].get(p.id) },
    ...doublesOf(p).map((d) => ({ d, r: ranks[d].get(mainPair(p.id, d)?.id ?? '') })),
  ].filter((x) => x.r !== undefined).sort((a, b) => a.r! - b.r!);
  const starsOf = (p: Player) => potentialStars(p, state.date, counts.get(p.id) ?? 0);
  // Kolom yang bisa diurutkan: nilai sort + arah awal (angka besar dulu untuk kemampuan dsb., kecil dulu untuk usia/ranking).
  const COLS: { key: string; label: TextKey; num?: boolean; value: (p: Player) => string | number; desc?: boolean }[] = [
    { key: 'name', label: 'name', value: (p) => p.name },
    { key: 'gender', label: 'gender', value: (p) => p.gender },
    { key: 'sector', label: 'sector', value: (p) => pairsOf(p.id) },
    { key: 'age', label: 'age', num: true, value: (p) => ageAt(p.birth, state.date) },
    { key: 'ability', label: 'ability', num: true, value: (p) => currentAbility(p.attrs), desc: true },
    { key: 'potential', label: 'potential', value: starsOf, desc: true },
    { key: 'fatigue', label: 'fatigue', value: (p) => p.fatigue, desc: true },
    { key: 'injury', label: 'injury', value: (p) => p.injury?.weeksLeft ?? 0, desc: true },
    { key: 'rank', label: 'bwfRank', num: true, value: (p) => allRanks(p)[0]?.r ?? Infinity }, // urut menurut peringkat terbaik
  ];
  // Junior: kolom status pelatnas (pratama/utama) + tombol promosi.
  if (juniors) COLS.splice(2, 0, { key: 'level', label: 'squadLevel', value: (p) => (isPratama(p, state.date) ? 0 : 1) });
  const [sort, setSort] = useState({ key: 'ability', desc: true });
  const col = COLS.find((c) => c.key === sort.key)!;
  const cmp = (a: Player, b: Player) => {
    const x = col.value(a), y = col.value(b);
    const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
    return sort.desc ? -r : r;
  };
  const list = state.players
    .filter((p) => p.countryId === country && p.retired === undefined && (ageAt(p.birth, state.date) <= JUNIOR_MAX_AGE) === juniors)
    .filter((p) => view !== 'singles' || p.focus !== 'D')
    .sort((a, b) => cmp(a, b) || currentAbility(b.attrs) - currentAbility(a.attrs));

  return (
    <>
      <nav className="controls">
        <button aria-pressed={!juniors} onClick={() => setJuniors(false)}>{t('seniors')}</button>
        <button aria-pressed={juniors} onClick={() => setJuniors(true)}>{t('juniors')}</button>
      </nav>
      <nav className="controls subnav">
        <button aria-pressed={view === 'all'} onClick={() => setView('all')}>{t('all')}</button>
        <button aria-pressed={view === 'singles'} onClick={() => setView('singles')}>{t('sector_singles')}</button>
        <button aria-pressed={view === 'pairs'} onClick={() => setView('pairs')}>{t('sector_pairs')}</button>
        {view !== 'pairs' && <span className="count">{list.length} {t('players')}</span>}
      </nav>
      {juniors && view !== 'pairs' && <p className="hint">{t('pratamaHint')}</p>}
      {view === 'pairs' ? <Pairs onOpen={onOpen} juniors={juniors} /> : (
      <div className="scroll">
        <table>
          <thead><tr>{COLS.map((c) => (
            <th key={c.key} className={`sortable${c.num ? ' num' : ''}`} aria-sort={sort.key === c.key ? (sort.desc ? 'descending' : 'ascending') : undefined}
              onClick={() => setSort(sort.key === c.key ? { key: c.key, desc: !sort.desc } : { key: c.key, desc: !!c.desc })}>
              {t(c.label)}{sort.key === c.key ? (sort.desc ? ' ▼' : ' ▲') : ''}
            </th>
          ))}<th>{t('manageSectors')}</th></tr></thead>
          <tbody>{list.map((p) => (
            <tr key={p.id} onClick={() => onOpen(p.id)} style={{ cursor: 'pointer' }}>
              <td>{p.name}</td><td>{p.gender}</td>
              {juniors && <td onClick={(e) => e.stopPropagation()}>{isPratama(p, state.date)
                ? <><span className="tag muted-tag" title={t('pratamaHint')}>{t('pratama')}</span> <button className="mini" onClick={() => { promoteJunior(state, p.id); commit(); }}>{t('promote')}</button></>
                : <span className="tag">{t('utama')}</span>}</td>}
              <td>{sectorsOf(p).map((d) => {
                const pair = d.length === 2 && d[1] === 'D' ? mainPair(p.id, d as DoublesD) : undefined;
                const partner = pair && lookup(state).players.get(pair.playerIds.find((x) => x !== p.id)!)?.name;
                return <span key={d} className="chip sector" title={partner}>{d}</span>;
              })}</td>
              <td className="num">{ageAt(p.birth, state.date)}</td>
              <td className="num">{currentAbility(p.attrs)}<span className={p.caDelta! > 0 ? 'up' : 'down'}>{arrow(p.caDelta)}</span></td>
              <td className="stars">{starText(starsOf(p))}</td>
              <td><FatigueBar value={p.fatigue} /></td>
              <td>{p.injury ? `${p.injury.weeksLeft} ${t('weeks')}${p.injury.severe ? ' ⚠' : ''}` : ''}</td>
              <td className="num">{allRanks(p).map((x, i) => <span key={x.d}>{i > 0 && <span className="muted-text"> · </span>}{x.r} <small className="muted-text">{x.d}</small></span>)}{allRanks(p).length === 0 && '—'}</td>
              <td onClick={(e) => e.stopPropagation()} style={{ cursor: 'default' }}><SectorPicker p={p} mainPair={mainPair} onChange={commit} /></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      )}
    </>
  );
}

type DoublesD = 'MD' | 'WD' | 'XD';
const doublesOf = (p: Player): DoublesD[] => [p.gender === 'M' ? 'MD' : 'WD', 'XD'];

/** Atur sektor satu atlet: centang tunggal (fokus) & tiap nomor ganda (bentuk pasangan dengan memilih partner / bubarkan). */
function SectorPicker({ p, mainPair, onChange }: { p: Player; mainPair: (id: string, d: DoublesD) => Pair | undefined; onChange: () => void }) {
  const { game } = useGame();
  const { state } = game;
  const [picking, setPicking] = useState<DoublesD>();
  const [err, setErr] = useState('');
  const partnerGender = (d: DoublesD) => (d === 'XD' ? (p.gender === 'M' ? 'F' : 'M') : p.gender);
  const candidates = (d: DoublesD) => state.players
    .filter((x) => x.countryId === p.countryId && x.id !== p.id && x.retired === undefined && x.gender === partnerGender(d) && !mainPair(x.id, d))
    .sort((a, b) => currentAbility(b.attrs) - currentAbility(a.attrs));
  const singles = p.gender === 'M' ? 'MS' : 'WS';
  return (
    <span className="sectors">
      <label title={t('singlesHint')}>
        <input type="checkbox" checked={p.focus !== 'D'} onChange={(e) => { if (e.target.checked) delete p.focus; else p.focus = 'D'; onChange(); }} />{singles}
      </label>
      {doublesOf(p).map((d) => {
        const pair = mainPair(p.id, d);
        return (
          <label key={d}>
            <input type="checkbox" checked={!!pair || picking === d} onChange={(e) => {
              setErr('');
              if (e.target.checked) setPicking(d);
              else if (pair) { if (confirm(t('confirmDissolve'))) { dissolvePair(state, pair.id); onChange(); } }
              else setPicking(undefined);
            }} />{d}
            {picking === d && !pair && (candidates(d).length ? (
              <select autoFocus value="" onChange={(e) => {
                const r = formPair(state, d, p.id, e.target.value, game.rng);
                if (typeof r === 'string') setErr(r); else { setPicking(undefined); onChange(); }
              }}>
                <option value="">{t('choosePartner')}</option>
                {candidates(d).map((x) => <option key={x.id} value={x.id}>{x.name} ({currentAbility(x.attrs)})</option>)}
              </select>
            ) : <small className="muted-text"> {t('noPartner')}</small>)}
          </label>
        );
      })}
      {err && <small className="down"> {err}</small>}
    </span>
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
      <h2>{p.name} <small>(<Flag id={p.countryId} />{p.countryId}, {p.gender}, {p.hand})</small></h2>
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
                <td><MatchLink m={m} name={(x) => entrantLabel(state, x).name} title={eventName(m.tournamentId, m.year)}>{m.scores.map(([a, b]) => (i === 0 ? `${a}-${b}` : `${b}-${a}`)).join(', ')}</MatchLink></td>
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
              <circle key={i} cx={x(ages[i])} cy={y(v)} r="4" fill={s.color} stroke="var(--surface)" strokeWidth="2">
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
