import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { awardsOf } from '../engine/awards';
import { dissolvePair, peakRange, potentialStars, promoteJunior, recallPlayer, releasePlayer } from '../engine/career';
import { ageAt, currentAbility, isPratama } from '../engine/generator';
import { experienceFactor } from '../engine/development';
import { visibleTraits } from '../engine/traits';
import { EARLY_GAP, promotionLine, readyLines } from '../engine/promotion';
import { SCOUT_FOCI, scoutVerdict, styleOf, type ScoutFocus } from '../engine/scouting';
import { emptyStats, moraleTier, pairAbility } from '../engine/match';
import { addOriented, careerStats, statTotals, v2 } from '../engine/careerStats';
import { absWeek, computeRanking, rankMap } from '../engine/ranking';
import { rankFromSnapshots } from '../engine/season';
import { ATTRS, DISCIPLINES, type Attr, type Discipline, type GameDate, type Pair, type Player } from '../engine/types';
import { dataName, numLocale, t, type TextKey } from '../i18n';
import { entrantLabel, eventName as eventNameOf, lookup, saveGame, TIER_GROUPS, TierBadge, tierGroup, useGame } from './game';
import { formatName } from './Team';
import { ownPairs, Pairs } from './Pairs';
import { CommitmentChips, RankChart, RankingDetail } from './Ranking';
import { Flag } from './Flag';
import { MatchLink } from './MatchDetail';
import { MatchStatsView, PlayerStatsView } from './MatchStats';


/** Cedera: "Cedera berat: Robek otot betis · 14 mg · kembali minggu 33" (tahun ditulis bila melewati musim ini). */
export function injuryText(inj: NonNullable<Player['injury']>, date: { year: number; week: number }) {
  const at = date.week + inj.weeksLeft - 1;
  const y = date.year + Math.floor(at / 52), w = (at % 52) + 1;
  return `${t(`injLevel_${inj.level}` as TextKey)}: ${t(`inj_${inj.type}` as TextKey)} · ${t('weeksShort', { n: inj.weeksLeft })} · ${t('returnsWeek', { w: y > date.year ? `${w} (${y})` : w })}`;
}
export const isBadInjury = (inj?: Player['injury']) => inj?.level === 'severe' || inj?.level === 'critical';

export const starText = (n: number) => '★'.repeat(Math.floor(n)) + (n % 1 ? '½' : '');
export const arrow = (d?: number) => (!d ? '' : d > 0 ? ` ▲${d}` : ` ▼${-d}`);

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

/** Status siap main: cedera (detail di keterangan) / lelah (kondisi < 55%) / fit, dengan bulatan kondisi. Pasangan: kondisi atlet terburuk. */
export function FitStatus({ ps }: { ps: Player[] }) {
  const { game } = useGame();
  const hurt = ps.find((x) => x.injury), tired = Math.max(...ps.map((x) => x.fatigue));
  const who = (x: Player) => (ps.length > 1 ? `${x.name}: ` : '');
  const cond = Math.max(0, 100 - tired);
  // Kondisi (100 − kelelahan): ≥80 hijau, 55–79 hijau muda (Fit); 25–54 kuning, <25 merah (Lelah).
  // Batas Fit 55% = batas istirahat AI (kelelahan > restAbove 45 → istirahat).
  const tone = cond >= 80 ? 'good' : cond >= 55 ? 'fair' : cond >= 25 ? 'gold' : 'danger';
  return hurt?.injury ? <span className={`badge danger${isBadInjury(hurt.injury) ? ' strong' : ''}`} title={who(hurt) + injuryText(hurt.injury, game.state.date)}>✚ {t('injury')}</span>
    : <span className={`badge ${tone}`} title={`${t('condition')} ${Math.round(cond)}%`}>
        {/* Bulatan = kondisi: penuh saat segar, berkurang seiring lelah. */}
        <span className="cond" style={{ '--p': `${cond}%` } as CSSProperties} />{t(cond >= 55 ? 'statusFit' : 'statusTired')}
      </span>;
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
  // Ambang promosi junior (Promote sebelum siap = peringatan di tombol).
  const lines = useMemo(() => readyLines(state, ruleset), [version]);
  // Skuad → Senior/Junior (semua pemain) → sektor: Semua (atlet) / MS / WS (atlet tunggal) / MD / WD / XD (pasangan ganda).
  // Kelompok: Senior / Junior (pelatnas) / Non-pelatnas (atlet yang dilepas, senior & junior; yang pensiun tidak).
  const [group, setGroup] = useState<'senior' | 'junior' | 'released'>('senior');
  const juniors = group === 'junior', released = group === 'released';
  const [view, setView] = useState<'all' | Discipline>('all');
  const singlesView = view === 'MS' || view === 'WS', pairsView = view === 'MD' || view === 'WD' || view === 'XD';
  const commit = () => { changed(); void saveGame(game); };
  const counts = useMatchCounts();
  const ranks = useMemo(() => {
    const now = absWeek(state.date);
    const of = (results: typeof state.results) => Object.fromEntries(DISCIPLINES.map((d) => [d, rankMap(computeRanking(results, d, now, ruleset))])) as Record<Discipline, Map<string, number>>;
    return { senior: of(state.results), junior: of(state.juniorResults ?? []) };
  }, [version]);
  // Sektor = nomor yang dimainkan: tunggal (bila bukan spesialis ganda) + pasangan utama aktif.
  const mainPair = (id: string, d: DoublesD) => state.pairs.find((p) => p.discipline === d && !p.dissolved && !p.trial && !p.adHoc && p.playerIds.includes(id));
  const sectorsOf = (p: Player) => [...(p.focus === 'D' ? [] : [p.gender === 'M' ? 'MS' : 'WS']), ...doublesOf(p).filter((d) => mainPair(p.id, d))];
  const pairsOf = (id: string) => sectorsOf(lookup(state).players.get(id)!).join(', ');
  // BWF rank = semua peringkat atlet (tunggal & pasangan utama ganda), terbaik dulu.
  // Pasangan junior otomatis (turnamen junior) juga punya ranking junior.
  const juniorPair = (id: string, d: DoublesD) => state.pairs.find((p) => p.discipline === d && p.junior && p.playerIds.includes(id) && ranks.junior[d].has(p.id));
  const allRanks = (p: Player) => {
    const s = p.gender === 'M' ? 'MS' : 'WS';
    const senior = [{ d: s, r: ranks.senior[s].get(p.id) }, ...doublesOf(p).map((d) => ({ d, r: ranks.senior[d].get(mainPair(p.id, d)?.id ?? '') }))];
    const junior = [{ d: `${s} Jr`, r: ranks.junior[s].get(p.id) },
      ...doublesOf(p).map((d) => ({ d: `${d} Jr`, r: ranks.junior[d].get((mainPair(p.id, d) ?? juniorPair(p.id, d))?.id ?? '') }))];
    return [...senior, ...junior].filter((x) => x.r !== undefined).sort((a, b) => a.r! - b.r!);
  };
  const starsOf = (p: Player) => potentialStars(p, state.date, counts.get(p.id) ?? 0);
  // Kolom yang bisa diurutkan: nilai sort + arah awal (angka besar dulu untuk kemampuan dsb., kecil dulu untuk usia/ranking).
  // mHide: disembunyikan di HP (gender tersirat dari chip sektor, kelelahan dari kolom Status).
  const COLS: { key: string; label: TextKey; num?: boolean; value: (p: Player) => string | number; desc?: boolean; mHide?: boolean }[] = [
    { key: 'name', label: 'name', value: (p) => p.name },
    { key: 'gender', label: 'gender', value: (p) => p.gender, mHide: true },
    { key: 'sector', label: 'sector', value: (p) => pairsOf(p.id) },
    { key: 'age', label: 'age', num: true, value: (p) => ageAt(p.birth, state.date) },
    { key: 'ability', label: 'ability', num: true, value: (p) => currentAbility(p.attrs), desc: true },
    { key: 'potential', label: 'potential', value: starsOf, desc: true },
    { key: 'morale', label: 'morale', value: (p) => p.form, desc: true },
    { key: 'fatigue', label: 'fatigue', value: (p) => p.fatigue, desc: true, mHide: true },
    // Status: siap / lelah (di atas batas istirahat AI) / cedera (detail saat kursor diarahkan).
    { key: 'status', label: 'status', value: (p) => (p.injury ? 2 + p.injury.weeksLeft / 100 : p.fatigue > ruleset.ai.restAbove ? 1 : 0), desc: true },
    { key: 'rank', label: 'bwfRank', num: true, value: (p) => allRanks(p)[0]?.r ?? Infinity }, // urut menurut peringkat terbaik
  ];
  // Junior: kolom status pelatnas (pratama/utama) + tombol promosi.
  const juniorCols = juniors;
  if (juniorCols) COLS.splice(2, 0, { key: 'level', label: 'squadLevel', value: (p) => (isPratama(p, state.date) ? 0 : 1) });
  // Sub-tab MS/WS: sektor & gender sudah jelas dari tab-nya (seperti tab ganda), kedua kolom hanya di "Semua".
  if (singlesView) for (const k of ['sector', 'gender']) COLS.splice(COLS.findIndex((c) => c.key === k), 1);
  const [sort, setSort] = useState({ key: 'ability', desc: true });
  const col = COLS.find((c) => c.key === sort.key) ?? COLS.find((c) => c.key === 'ability')!; // urut sektor lalu pindah ke MS/WS → kemampuan
  const cmp = (a: Player, b: Player) => {
    const x = col.value(a), y = col.value(b);
    const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
    return sort.desc ? -r : r;
  };
  const list = state.players
    // Non-pelatnas: atlet yang sudah dilepas (senior & junior); selain itu junior yang sudah promosi masuk Senior.
    .filter((p) => p.countryId === country && p.retired === undefined && (released ? p.released !== undefined : p.released === undefined && isPratama(p, state.date) === juniors))
    .filter((p) => released || !singlesView || (p.focus !== 'D' && p.gender === (view === 'MS' ? 'M' : 'F')))
    .sort((a, b) => cmp(a, b) || currentAbility(b.attrs) - currentAbility(a.attrs));

  return (
    <>
      <nav className="controls">
        <button aria-pressed={group === 'senior'} onClick={() => setGroup('senior')}>{t('seniors')}</button>
        <button aria-pressed={juniors} onClick={() => setGroup('junior')}>{t('juniors')}</button>
        <button aria-pressed={released} onClick={() => setGroup('released')}>{t('nonSquad')}</button>
      </nav>
      <nav className="controls subnav">
        {!released && <>
          {(['all', ...DISCIPLINES] as const).map((x) => <button key={x} aria-pressed={view === x} onClick={() => setView(x)}>{x === 'all' ? t('all') : x}</button>)}
        </>}
        <span className="count">{pairsView && !released
          ? ((n) => t(n === 1 ? 'countPair' : 'countPairs', { n }))(ownPairs(state, view, juniors).length)
          : `${list.length} ${t('players')}`}</span>
      </nav>
      {juniorCols && !pairsView && <p className="hint">{t('pratamaHint')}</p>}
      {juniorCols && !pairsView && <ScoutFocusSelect />}
      {pairsView && !released ? <Pairs key={view} discipline={view} onOpen={onOpen} juniors={juniors} /> : (
      <div className="scroll">
        <table className="squadtable">
          <thead><tr>{COLS.map((c) => (
            <th key={c.key} className={`sortable${c.num ? ' num' : ''}${c.mHide ? ' m-hide' : ''}`} aria-sort={sort.key === c.key ? (sort.desc ? 'descending' : 'ascending') : undefined}
              onClick={() => setSort(sort.key === c.key ? { key: c.key, desc: !sort.desc } : { key: c.key, desc: !!c.desc })}>
              {t(c.label)}{sort.key === c.key ? (sort.desc ? ' ▼' : ' ▲') : ''}
            </th>
          ))}{released ? <th></th> : <th title={t('tierPrefsHint')}>{t(singlesView ? 'tierPrefs' : 'manageSectors')}</th>}</tr></thead>
          <tbody>{list.map((p) => (
            <tr key={p.id} onClick={() => onOpen(p.id)} style={{ cursor: 'pointer' }}>
              <td>{p.name}</td>{!singlesView && <td className="m-hide">{p.gender}</td>}
              {juniorCols && <td>{isPratama(p, state.date)
                ? <><span className="tag muted-tag" title={t('pratamaHint')}>{t('pratama')}</span>{p.readySince !== undefined && <> <span className="tag up-tag" title={t('readyPromo')}>⬆ <span className="m-hide">{t('readyPromo')}</span><span className="m-only">{t('newsReadyTag')}</span></span></>}</>
                : <span className="tag">{t('utama')}</span>}</td>}
              {!singlesView && <td>{sectorsOf(p).map((d) => {
                const pair = d.length === 2 && d[1] === 'D' ? mainPair(p.id, d as DoublesD) : undefined;
                const partner = pair && lookup(state).players.get(pair.playerIds.find((x) => x !== p.id)!)?.name;
                return <span key={d} className="chip sector" title={partner}>{d}</span>;
              })}</td>}
              <td className="num">{ageAt(p.birth, state.date)}</td>
              <td className="num">{currentAbility(p.attrs)}<span className={p.caDelta! > 0 ? 'up' : 'down'}>{arrow(p.caDelta)}</span></td>
              <td className="stars">{starText(starsOf(p))}</td>
              <td><MoraleTag value={p.form} short /></td>
              <td className="m-hide"><FatigueBar value={p.fatigue} /></td>
              <td><FitStatus ps={[p]} /></td>
              <td className="num"><RankCell ranks={allRanks(p)} /></td>
              <td onClick={(e) => e.stopPropagation()} style={{ cursor: 'default' }}>{released
                ? <button className="mini" onClick={() => { recallPlayer(state, p.id); commit(); }}>{t('recall')}</button>
                : singlesView ? <TierPrefs id={p.id} /> : <>
                  <SectorPicker p={p} onChange={commit} />
                  {isPratama(p, state.date) && <>{' '}<button className="mini btn-go" title={currentAbility(p.attrs) < promotionLine(p, lines) - EARLY_GAP ? t('promoteEarlyHint') : undefined}
                      onClick={() => { promoteJunior(state, p.id, ruleset); commit(); }}>{t('promote')}</button></>}
                  {' '}<button className="mini btn-danger" onClick={() => { if (confirm(t('confirmRelease', { name: p.name }))) { releasePlayer(state, p.id, { rs: game.ruleset, world: game.world, rng: game.rng }); commit(); } }}>{t('releaseShort')}</button>
                </>}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      )}
    </>
  );
}

/** Ranking terbaik + "+n"; ketuk/arahkan kursor untuk melihat semua (urut terbaik dulu). */
export function RankCell({ ranks }: { ranks: { d: string; r?: number }[] }) {
  if (!ranks.length) return <>—</>;
  const one = (x: (typeof ranks)[number]) => <>{x.r} <small className="muted-text">{x.d}</small></>;
  if (ranks.length === 1) return one(ranks[0]);
  return (
    <details className="ranks" title={ranks.map((x) => `${x.r} ${x.d}`).join(' · ')} onClick={(e) => e.stopPropagation()}>
      <summary>{one(ranks[0])} <small className="muted-text">+{ranks.length - 1}</small></summary>
      {ranks.slice(1).map((x) => <div key={x.d}>{one(x)}</div>)}
    </details>
  );
}

type DoublesD = 'MD' | 'WD' | 'XD';
const doublesOf = (p: Player): DoublesD[] => [p.gender === 'M' ? 'MD' : 'WD', 'XD'];

/** Atur sektor satu atlet: Single (ikut tunggal) & Pairs (boleh dipasangkan di form bentuk pasangan). Minimal satu tercentang. */
function SectorPicker({ p, onChange }: { p: Player; onChange: () => void }) {
  const { game } = useGame();
  const { state } = game;
  const single = p.focus !== 'D', pairs = p.focus !== 'S';
  const setPairs = (on: boolean) => {
    if (on) { delete p.focus; return onChange(); }
    const active = state.pairs.filter((x) => !x.dissolved && !x.adHoc && x.playerIds.includes(p.id));
    if (active.length && !confirm(t('confirmDissolve'))) return;
    for (const x of active) dissolvePair(state, x.id);
    p.focus = 'S';
    onChange();
  };
  return (
    <span className="sectors">
      <label title={t('singlesHint')}>
        <input type="checkbox" checked={single} disabled={single && !pairs} onChange={(e) => { if (e.target.checked) delete p.focus; else p.focus = 'D'; onChange(); }} />{t('sector_singles')}
      </label>
      <label title={t('pairsHint')}>
        <input type="checkbox" checked={pairs} disabled={pairs && !single} onChange={(e) => setPairs(e.target.checked)} />{t('sector_pairs')}
      </label>
    </span>
  );
}

/** Prioritas tier entry otomatis untuk satu atlet tunggal / pasangan. Tidak ada yang menyala = AI bebas memilih. */
export function TierPrefs({ id }: { id: string }) {
  const { game, changed } = useGame();
  const { state, ruleset } = game;
  const prefs = state.tierPrefs?.[id] ?? [];
  const toggle = (tier: string) => {
    const next = prefs.includes(tier) ? prefs.filter((x) => x !== tier) : [...prefs, tier];
    state.tierPrefs ??= {};
    if (next.length) state.tierPrefs[id] = next; else delete state.tierPrefs[id];
    changed(); void saveGame(game);
  };
  const tiers = ruleset.tiers.filter((x) => !x.junior && !['WC', 'OG', 'WTF'].includes(x.id)); // ponytail: turnamen kualifikasi & junior tidak dipilih manajer
  const on = tiers.map((x) => x.id).filter((x) => prefs.includes(x)); // urut tier tertinggi dulu
  return (
    <details className="tier-prefs" title={t('tierPrefsHint')}>
      <summary>{prefs.length ? (prefs.length > 3 ? `${on[0]} +${on.length - 1}` : on.join('·')) : t('tierPrefsFree')}</summary>
      <span>{tiers.map((x) => <button key={x.id} className="mini" aria-pressed={prefs.includes(x.id)} onClick={() => toggle(x.id)}>{x.id}</button>)}</span>
    </details>
  );
}

type ProfileTab = 'summary' | 'stats' | 'ranking' | 'events' | 'h2h' | 'matches';

/**
 * Profil atlet: kartu identitas (selalu tampil) + sub-tab Ringkasan (statistik, ranking, atribut, cedera),
 * Turnamen & Committed, Riwayat laga, H2H & pasangan.
 */
const MORALE_ICON = { veryHigh: '▲▲', high: '▲', normal: '–', low: '▼', veryLow: '▼▼' } as const;
/** Morale atlet (5 tingkat); `short` = ikon saja (tabel), nama tingkat sebagai keterangan. */
/** Fokus pencarian bakat untuk akhir musim berikutnya (negara manajer). */
export function ScoutFocusSelect() {
  const { game, changed } = useGame();
  const { state } = game;
  return (
    <p className="controls">
      <label>{t('scoutFocusNext')}{' '}
        <select value={state.scoutFocus ?? 'balanced'} onChange={(e) => { state.scoutFocus = e.target.value as ScoutFocus; changed(); void saveGame(game); }}>
          {SCOUT_FOCI.map((f) => <option key={f} value={f}>{t(`scoutFocus_${f}` as TextKey)}</option>)}
        </select>
      </label>
    </p>
  );
}

/** Sifat atlet yang sudah terbaca (fisik setelah 2 musim, lainnya setelah 30 laga). */
export function TraitTags({ p, matches }: { p: Player; matches: number }) {
  const ts = visibleTraits(p, matches);
  if (!ts.length) return null;
  return (
    <span className="trait-tags">
      {ts.map((x) => <span key={x} className="tag" title={t(`traitHint_${x}` as TextKey)}>{t(`trait_${x}` as TextKey)}</span>)}
    </span>
  );
}

export function MoraleTag({ value, short, detail }: { value: number; short?: boolean; detail?: string }) {
  const tier = moraleTier(value);
  const label = t(`morale_${tier}` as TextKey);
  return <span className={`morale morale-${tier}`} title={detail ? `${label} (${detail})` : label}>{MORALE_ICON[tier]}{!short && ` ${label}`}</span>;
}

export function Profile({ id, onBack, onOpen, onOpenEvent }: { id: string; onBack: () => void; onOpen: (id: string) => void; onOpenEvent?: (id: string, year: number) => void }) {
  const { game, changed, version } = useGame();
  const { state, ruleset } = game;
  // Profil pasangan ganda: id = pairId. Data milik pasangan (ranking, gelar, turnamen, laga, H2H) dari id pasangan;
  // data pribadi (atribut, cedera, morale) tetap di profil masing-masing atlet.
  const pair = lookup(state).pairs.get(id);
  const p: Player | undefined = lookup(state).players.get(pair?.playerIds[0] ?? id);
  const counts = useMatchCounts();
  const [tab, setTab] = useState<ProfileTab>('summary');
  const [matchYear, setMatchYear] = useState<number | 'all'>('all');
  const [shown, setShown] = useState(30);
  const [h2hOpp, setH2hOpp] = useState<string>();
  const [statSide, setStatSide] = useState<string>();
  const [statYear, setStatYear] = useState<number | 'all'>('all');
  const pairs = useMemo(() => (pair ? [] : state.pairs.filter((x) => x.playerIds.includes(id))), [version, id]);
  // Pembanding prediksi puncak: atlet senior aktif segender (kemampuan sekarang).
  const peakPool = useMemo(() => state.players.filter((x) => x.gender === p?.gender && x.retired === undefined && ageAt(x.birth, state.date) >= 19), [version, p?.gender]);
  const singles: Discipline = p?.gender === 'F' ? 'WS' : 'MS';
  // Ranking dunia saat ini: tunggal + tiap pasangan aktif.
  const ranks = useMemo(() => {
    const now = absWeek(state.date);
    return new Map(DISCIPLINES.map((d) => [d, rankMap(computeRanking(state.results, d, now, ruleset))]));
  }, [version, ruleset]);
  if (!p) return <p><button onClick={onBack}>← {t('back')}</button></p>;

  const sides = new Set([id, ...pairs.map((x) => x.id)]); // pasangan: hanya id pasangan itu
  const mine = state.matches.filter((m) => m.sides.some((s) => sides.has(s)));
  const myIdx = (m: (typeof mine)[number]) => (sides.has(m.sides[0]) ? 0 : 1);
  const won = (m: (typeof mine)[number]) => m.winner === myIdx(m);
  const eventName = (eid: string, year?: number) => eventNameOf(ruleset, eid, year) ?? eid;
  const { year } = state.date;
  const season = mine.filter((m) => m.year === year);
  const titles = state.champions.filter((c) => sides.has(c.winner));
  const awards = awardsOf(state, [...sides]).sort((a, b) => b.year - a.year || Number(b.won) - Number(a.won)); // BWF Player of the Year
  const activePairs = pairs.filter((x) => !x.dissolved);
  const openOpp = (opp: string) => { setH2hOpp(opp); setTab('h2h'); }; // nama lawan → H2H dengan lawan itu
  const evLink = (eid: string, y: number) => onOpenEvent
    ? <a href="#" onClick={(e) => { e.preventDefault(); onOpenEvent(eid, y); }}>{eventName(eid, y)}</a> : eventName(eid, y);
  const fact = (k: string, v: ReactNode) => <div><dt>{k}</dt><dd>{v}</dd></div>;
  const rankOf = (d: Discipline, entrant: string) => ranks.get(d)?.get(entrant);
  // Nomor tunggal hanya ditampilkan bila pernah main tunggal atau punya ranking tunggal (spesialis ganda: tidak).
  const playsSingles = !pair && (rankOf(singles, id) !== undefined || mine.some((m) => m.sides.includes(id)));

  // Turnamen yang diikuti per musim: hasil terbaik per nomor (juara, babak tersingkir, atau masih bertanding).
  const events = new Map<string, { eid: string; y: number; week: number; res: { d: Discipline; r: string; champ: boolean }[] }>();
  for (const m of mine) {
    const k = `${m.year}:${m.tournamentId}`;
    const ev = events.get(k) ?? { eid: m.tournamentId, y: m.year, week: 0, res: [] };
    const w = won(m);
    // Beregu: hasil tim negaranya (partai individu tidak menentukan babak tersingkir).
    const team = state.teamResults.find((x) => x.eventId === m.tournamentId && x.year === m.year && x.teams.includes(p.countryId) && x.ties.some((tie) => tie.matchIds?.includes(m.id)));
    const reached = team && (team.reached[p.countryId] ?? 'G');
    const r = team
      ? { d: m.discipline, r: reached === 'W' ? t('champion') : reached === 'G' ? t('roundG') : reached!, champ: reached === 'W' }
      : { d: m.discipline, r: w ? (m.round === 'F' ? t('champion') : t('stillIn')) : m.round, champ: w && m.round === 'F' };
    ev.res = [...ev.res.filter((x) => x.d !== m.discipline), r];
    events.set(k, ev);
  }
  const evYears = [...new Set([...events.values()].map((e) => e.y))].sort((a, b) => b - a);
  const matchYears = [...new Set(mine.map((m) => m.year))].sort((a, b) => b - a);
  const list = mine.filter((m) => matchYear === 'all' || m.year === matchYear).reverse();

  const opponents = new Map<string, number>();
  for (const m of mine) { const o = m.sides[1 - myIdx(m)]; opponents.set(o, (opponents.get(o) ?? 0) + 1); }

  const mineIds = new Set(mine.map((m) => m.id));
  // Gelar karier: individu + beregu (tim negaranya juara, atlet di skuad atau ikut bermain); urut tier tertinggi, lalu tahun terbaru.
  const titleRows = [
    ...titles.map((c) => ({ y: c.year, eid: c.tournamentId, tierId: ruleset.calendar.find((e) => e.id === c.tournamentId)?.tierId, team: undefined as { countries?: string[]; games?: true } | undefined,
      what: c.discipline as string, partner: pair ? undefined : lookup(state).pairs.get(c.winner)?.playerIds.find((x) => x !== id) })),
    ...state.teamResults.filter((r) => r.reached[p.countryId] === 'W' && (r.squads[p.countryId]?.includes(id) || r.ties.some((tie) => tie.matchIds?.some((mid) => mineIds.has(mid)))))
      .map((r) => ({ y: r.year, eid: r.eventId, tierId: undefined, team: ruleset.team.events.find((e) => e.id === r.eventId) ?? {}, what: formatName(r.format, r.eventId), partner: undefined })),
  ];
  const titleOrder = (x: (typeof titleRows)[number]) => {
    const tier = ruleset.tiers.find((tt) => tt.id === x.tierId);
    return TIER_GROUPS.indexOf(tierGroup(tier, x.team)) * 100 + (tier ? ruleset.tiers.indexOf(tier) : 1.5); // beregu setelah Kejuaraan Dunia
  };
  titleRows.sort((a, b) => titleOrder(a) - titleOrder(b) || b.y - a.y);
  // Ringkasan per badge: Grade 1 (Major) & Multi-sport Games digabung, selain itu per tier.
  const titleKey = (x: (typeof titleRows)[number]) => {
    const g = tierGroup(ruleset.tiers.find((tt) => tt.id === x.tierId), x.team);
    return g === 'g1' || g === 'msg' ? g : x.tierId ?? 'team';
  };
  const cs = careerStats(state.statArchive, mine, sides);
  const perMatch = (x: number) => (cs.n ? <small className="muted-text"> · {(x / cs.n).toFixed(1)}/{t('perMatch')}</small> : null);
  const careerCard = (
    <section className="card">
      <h3>{t('careerStats')}</h3>
      <dl className="facts">
        {fact(t('matchesPlayed'), mine.length)}
        {fact(t('statFastestSmash'), cs.kmh ? `${cs.kmh} km/h` : '—')}
        {fact(t('statWinnersTotal'), <>{cs.winners}{perMatch(cs.winners)}</>)}
        {fact(t('statUE'), <>{cs.ue}{perMatch(cs.ue)}</>)}
        {fact(t('statStreak'), cs.streak || '—')}
        {fact(t('deciderRecord'), cs.decider[0] + cs.decider[1] ? <>{cs.decider[0]}–{cs.decider[1]} <small className="muted-text">({Math.round((100 * cs.decider[0]) / (cs.decider[0] + cs.decider[1]))}%)</small></> : '—')}
      </dl>
    </section>
  );
  const matchRow = (m: (typeof mine)[number]) => {
    const i = myIdx(m), opp = m.sides[1 - i];
    return (
      <div key={m.id} className={`mrow ${won(m) ? 'w' : 'l'}`}>
        <span className={`badge ${won(m) ? 'good' : 'danger'}`}>{won(m) ? 'W' : 'L'}</span>
        <div className="grow">
          <div><a href="#" onClick={(e) => { e.preventDefault(); openOpp(opp); }}><Flag id={entrantLabel(state, opp).country} />{entrantLabel(state, opp).name}</a></div>
          <small className="muted-text">{evLink(m.tournamentId, m.year)} · {m.year} · {m.discipline} {m.round}</small>
        </div>
        <MatchLink m={m} name={(x) => entrantLabel(state, x).name} title={eventName(m.tournamentId, m.year)}>
          {m.scores.map(([a, b]) => (i === 0 ? `${a}-${b}` : `${b}-${a}`)).join(' ')}{m.walkover ? ' w/o' : m.retired ? ' ret.' : ''}
        </MatchLink>
      </div>
    );
  };
  const wl = (ms: typeof mine) => { const w = ms.filter(won).length; return `${w}–${ms.length - w}`; };

  return (
    <section>
      <p><button onClick={onBack}>← {t('back')}</button></p>
      {/* Kartu identitas: selalu tampil di atas sub-tab. */}
      {pair ? <PairCard pair={pair} rank={rankOf(pair.discipline, pair.id)} onOpen={onOpen} /> : <section className="card evinfo">
        <h2>{p.name}</h2>
        <dl className="facts">
          {fact(t('country'), <><Flag id={p.countryId} />{p.countryId} · {p.gender} · {p.hand}</>)}
          {fact(t('age'), ageAt(p.birth, state.date))}
          {p.hometown && fact(t('hometown'), dataName(game.world.cities.find((c) => c.id === p.hometown)?.name))}
          {fact(t('playStyle'), styleOf(p).map((a) => t(a)).join(' · '))}
          {fact(t('ability'), <>{currentAbility(p.attrs)}{arrow(p.caDelta)}</>)}
          {fact(t('morale'), <MoraleTag value={p.form} />)}
          {fact(t('potential'), <span className="stars">{starText(potentialStars(p, state.date, counts.get(p.id) ?? 0))}</span>)}
          {p.retired === undefined && ageAt(p.birth, state.date) <= 21 && (() => {
            // Prediksi puncak dari perkiraan potensi (rentang menyempit seiring usia & laga), bukan PA asli.
            const [a, m, b] = peakRange(p, state.date, counts.get(p.id) ?? 0, peakPool);
            const n = (x: number) => (x >= 500 ? '500+' : x);
            return fact(t('peakFact'), <>{t('peakText', { age: p.focus === 'D' ? 26 : 25, m: n(m) })}{a !== b && <> <small className="muted-text">({t('peakSpan', { a, b: n(b) })})</small></>}</>);
          })()}
          {isPratama(p, state.date) && p.readySince !== undefined && fact(t('promotion'), <span className="tag up-tag">⬆ {t('readyPromo')}</span>)}
          {p.scouted && (() => {
            // Asal-usul pencarian bakat: perkiraan ★ saat direkrut dibandingkan dengan ★ sekarang.
            const v = scoutVerdict(p, potentialStars(p, state.date, counts.get(p.id) ?? 0))!;
            const half = (n: number) => `${Math.floor(n) || ''}${n % 1 ? '½' : ''}`;
            return fact(t('scoutedFact'), <>{p.scouted.gem && '⭐ '}{t('scoutedText', { y: p.scouted.year, lo: half(p.scouted.stars[0]), hi: half(p.scouted.stars[1]) })}
              {' '}<span className={v === 'above' ? 'up' : v === 'below' ? 'down' : 'muted-text'}>({t(`scoutVerdict_${v}` as TextKey)})</span></>);
          })()}
          {fact(t('fatigue'), <FatigueBar value={p.fatigue} />)}
          {fact(t('traits'), visibleTraits(p, counts.get(p.id) ?? 0).length ? <TraitTags p={p} matches={counts.get(p.id) ?? 0} /> : <span className="muted-text">{t('traitsUnknown')}</span>)}
          {p.retired === undefined && ageAt(p.birth, state.date) <= ruleset.development.experience.untilAge
            && fact(t('expFactor'), <span title={t('expFactorHint')}>×{experienceFactor(ruleset.development, state.experience[p.id] ?? 0).toLocaleString(numLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · {t('expMatches', { n: Math.round(state.experience[p.id] ?? 0) })}</span>)}
          {fact(t('status'), p.retired !== undefined ? `${t('retired')} ${p.retired}`
            : p.released !== undefined ? <span className="tag muted-tag">{t('releasedTag', { year: p.released })}</span>
            : <FitStatus ps={[p]} />)}
        </dl>
        {p.injury && <p className={`injury-now${isBadInjury(p.injury) ? ' strong' : ''}`}>✚ {injuryText(p.injury, state.date)}</p>}
        {p.countryId === state.career?.countryId && p.retired === undefined && (
          <p>{p.released === undefined
            ? <button className="btn-danger" onClick={() => { if (confirm(t('confirmRelease', { name: p.name }))) { releasePlayer(state, p.id, { rs: game.ruleset, world: game.world, rng: game.rng }); changed(); void saveGame(game); } }}>{t('release')}</button>
            : <button onClick={() => { recallPlayer(state, p.id); changed(); void saveGame(game); }}>{t('recall')}</button>}</p>
        )}
      </section>}
      <nav className="controls">
        {(['summary', 'stats', 'ranking', 'events', 'h2h', 'matches'] as const).map((x) => (
          <button key={x} aria-pressed={tab === x} onClick={() => setTab(x)}>{t(({ summary: 'profSummary', stats: 'profStats', ranking: 'profRanking', events: 'profEvents', h2h: 'profH2HTab', matches: 'profMatches' } as const)[x])}</button>
        ))}
      </nav>

      {tab === 'summary' && pair && <><div className="split">
        <section className="card">
          <h3>{t('seasonStats')} {year}</h3>
          <dl className="facts">
            {fact(t('profRecord'), wl(season))}
            {fact(t('profRecordAll'), wl(mine))}
            {fact(t('titlesYear', { y: year }), titles.filter((c) => c.year === year).length)}
            {fact(t('profTitlesAll'), titles.length)}
          </dl>
        </section>
        <section className="card">
          <h3>{t('rankHistory')}</h3>
          <RankChart history={rankFromSnapshots(state, pair.id, pair.discipline, ruleset)} />
        </section>
      </div>{careerCard}</>}
      {tab === 'summary' && !pair && <>
        <div className="split">
          <section className="card">
            <h3>{t('seasonStats')} {year}</h3>
            <dl className="facts">
              {fact(t('profRecord'), wl(season))}
              {fact(t('titlesYear', { y: year }), titles.filter((c) => c.year === year).length)}
              {fact(t('profTitlesAll'), titles.length)}
              {fact(t('prizeMoney'), <>{usd(state.earnings[year]?.[p.id] ?? 0)} <small className="muted-text">/ {usd(Object.values(state.earnings).reduce((x, y) => x + (y[p.id] ?? 0), 0))} {t('career')}</small></>)}
            </dl>
          </section>
          <section className="card">
            <h3>{t('profRanks')}</h3>
            <table className="fit"><tbody>
              {playsSingles && <tr><td><span className="chip">{singles}</span></td><td>{p.name}</td><td className="num">{rankOf(singles, id) ? `#${rankOf(singles, id)}` : '—'}</td></tr>}
              {!playsSingles && activePairs.length === 0 && <tr><td className="muted-text">{t('profNoEvents')}</td></tr>}
              {activePairs.map((x) => (
                <tr key={x.id}><td><a href="#" title={t('pairProfile')} onClick={(e) => { e.preventDefault(); onOpen(x.id); }}><span className="chip">{x.discipline}</span></a></td>
                  <td>{x.playerIds.filter((pid) => pid !== id).map((pid) => <a key={pid} href="#" onClick={(e) => { e.preventDefault(); onOpen(pid); }}>{lookup(state).players.get(pid)?.name}</a>)}{x.trial && <> <span className="tag">{t('trialPair')}</span></>}</td>
                  <td className="num">{rankOf(x.discipline, x.id) ? `#${rankOf(x.discipline, x.id)}` : '—'}</td></tr>
              ))}
            </tbody></table>
          </section>
        </div>
        {careerCard}
        <AttrPanel p={p} date={state.date} />
        <section className="card">
            <h3>{t('injuryHistory')}</h3>
            {!p.injuryHistory?.length ? <p className="hint">{t('injuryHistoryNone')}</p> : (
              <table>
                <tbody>{[...p.injuryHistory].reverse().map((h, i) => (
                  <tr key={i}>
                    <td>{t('weekShort')}{h.week} {h.year}</td>
                    <td><span className={`badge danger${h.level === 'severe' || h.level === 'critical' ? ' strong' : ''}`}>{t(`injLevel_${h.level}` as TextKey)}</span></td>
                    <td>{t(`inj_${h.type}` as TextKey)}</td>
                    <td className="num">{h.weeks} {h.weeks === 1 ? t('week').toLowerCase() : t('weeks')}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
        </section>
      </>}

      {/* Ranking: satu kartu per nomor (tunggal & tiap pasangan aktif), ditambah ranking junior bila punya poin junior. */}
      {tab === 'ranking' && (() => {
        const entrants = pair ? [{ e: pair.id, d: pair.discipline, partner: undefined as string | undefined }]
          : [...(playsSingles ? [{ e: id, d: singles, partner: undefined as string | undefined }] : []),
            ...activePairs.map((x) => ({ e: x.id, d: x.discipline, partner: x.playerIds.find((pid) => pid !== id) }))];
        const now = absWeek(state.date);
        const hasJunior = (e: string) => (state.juniorResults ?? []).some((r) => r.entrantId === e && r.expiresAbsWeek > now);
        const cards = entrants.flatMap((x) => [{ ...x, junior: false }, ...(hasJunior(x.e) ? [{ ...x, junior: true }] : [])]);
        const wide = cards.length === 1;
        return cards.length === 0 ? <p className="hint">{t('noRankPoints')}</p> : <div className={wide ? undefined : 'split'}>{cards.map((x) => (
          <section key={`${x.e}${x.junior}`} className="card">
            <h3><span className="chip">{x.d}{x.junior ? ' Jr' : ''}</span>
              {x.partner && <> <a href="#" onClick={(ev) => { ev.preventDefault(); onOpen(x.e); }}>+ {lookup(state).players.get(x.partner)?.name}</a></>}</h3>
            <RankingDetail state={state} ruleset={ruleset} id={x.e} discipline={x.d} junior={x.junior} onOpenEvent={onOpenEvent} wide={wide} />
          </section>
        ))}</div>;
      })()}

      {tab === 'events' && awards.length > 0 && <section className="card">
        <h3>{t('awardsTitle')}</h3>
        <table className="fit"><tbody>{awards.map((x, i) => (
          <tr key={i} className={x.won ? undefined : 'muted-text'}>
            <td>{x.won ? '🏆' : '·'}</td><td>{t(`award_${x.cat}` as TextKey)} <span className="muted-text">{x.year}{!x.won && ` · ${t('awardNominee')}`}</span></td>
          </tr>
        ))}</tbody></table>
      </section>}

      {tab === 'events' && <section className="card">
        <h3>{t('profTitlesAll')} <span className="muted-text">({titleRows.length})</span></h3>
        {titleRows.length === 0 ? <p className="hint">{t('profTitlesNone')}</p> : <>
          <p className="title-counts">{[...new Set(titleRows.map(titleKey))].map((k) => {
            const x = titleRows.find((r) => titleKey(r) === k)!;
            const n = titleRows.filter((r) => titleKey(r) === k).length;
            return <span key={k}><TierBadge tierId={x.tierId} team={x.team} /> ×{n}</span>;
          })}</p>
          <table className="fit"><tbody>{titleRows.map((x, i) => (
            <tr key={i}>
              <td className="title-badge"><TierBadge tierId={x.tierId} team={x.team} /></td>
              <td>{evLink(x.eid, x.y)} <span className="muted-text">{x.y}</span><br /><small><span className="chip">{x.what}</span>
                {x.partner && <> + <a href="#" onClick={(e) => { e.preventDefault(); onOpen(x.partner!); }}>{lookup(state).players.get(x.partner)?.name}</a></>}</small></td>
            </tr>
          ))}</tbody></table>
        </>}
      </section>}

      {tab === 'events' && <div className="split">
        <div>
          {evYears.length === 0 ? <p className="hint">{t('profNoEvents')}</p> : evYears.map((y) => (
            <section key={y} className="card">
              <h3>{t('profEventsYear', { y })} <span className="muted-text">({[...events.values()].filter((e) => e.y === y).length})</span></h3>
              <table className="fit"><tbody>{[...events.values()].filter((e) => e.y === y).reverse().map((e) => (
                <tr key={e.eid}>
                  <td className="title-badge"><TierBadge tierId={ruleset.calendar.find((c) => c.id === e.eid)?.tierId} team={ruleset.team.events.find((c) => c.id === e.eid)} /></td>
                  <td>{evLink(e.eid, e.y)}</td>
                  <td>{e.res.map((r) => (
                    <span key={r.d} className="evres"><span className="chip">{r.d}</span> <span className={r.champ ? 'up' : 'muted-text'}>{r.champ ? '🏆 ' : ''}{r.r}</span></span>
                  ))}</td>
                </tr>
              ))}</tbody></table>
            </section>
          ))}
        </div>
        <aside>
          <section className="card">
            <h3>{t('viewCommitted')} {state.commitmentsYear ?? year}</h3>
            {(() => {
              const tc = [id, ...activePairs.map((x) => x.id)].filter((e) => state.commitments[e]?.length);
              return tc.length === 0 ? <p className="hint">{t('tcNone')}</p> : tc.map((e) => (
                <p key={e}><b>{e === id ? pair?.discipline ?? singles : pairs.find((x) => x.id === e)!.discipline}</b> <CommitmentChips state={state} ruleset={ruleset} entrantId={e} /></p>
              ));
            })()}
          </section>
        </aside>
      </div>}

      {tab === 'stats' && (() => {
        // Satu peserta per tampilan (tunggal atau satu pasangan) agar rata-rata tidak tercampur antar nomor.
        const count = (e: string) => mine.filter((m) => m.sides.includes(e)).length;
        const options = [...sides].filter((e) => count(e) > 0 || state.statArchive?.[e]?.s).sort((a, b) => count(b) - count(a));
        const side = statSide && options.includes(statSide) ? statSide : options[0];
        if (!side) return <p className="hint">{t('profNoEvents')}</p>;
        const sideMatches = mine.filter((m) => m.sides.includes(side));
        const years = [...new Set(sideMatches.filter((m) => v2(m)).map((m) => m.year))].sort((a, b) => b - a);
        const y = statYear !== 'all' && years.includes(statYear) ? statYear : 'all';
        const scope = y === 'all' ? sideMatches : sideMatches.filter((m) => m.year === y); // walkover ikut rekor (sama dengan tab lain), tanpa statistik
        const tot = statTotals(state.statArchive, scope, side, y === 'all');
        const label = (e: string) => e === id && !pair ? (lookup(state).pairs.get(e)?.discipline ?? singles) : lookup(state).pairs.get(e)?.discipline ?? singles;
        return <>
          {options.length > 1 && <nav className="controls subnav">
            {options.map((e) => (
              <button key={e} aria-pressed={e === side} onClick={() => setStatSide(e)}>
                {label(e)}{e !== id && !pair && <span className="muted-text"> {lookup(state).pairs.get(e)?.playerIds.filter((x) => x !== id).map((x) => lookup(state).players.get(x)?.name.split(' ')[0])}</span>}
              </button>
            ))}
          </nav>}
          <nav className="controls subnav">
            {(['all', ...years] as const).map((x) => <button key={x} aria-pressed={x === y} onClick={() => setStatYear(x)}>{x === 'all' ? t('all') : x}</button>)}
          </nav>
          <section className="card statcard capped">
            {tot.n === 0 ? <p className="hint">{t('noStatsYet')}</p>
              : <><h3>{entrantLabel(state, side).name}</h3><PlayerStatsView s={tot.s} n={tot.n} record={[scope.filter(won).length, scope.filter((m) => !won(m)).length]} /></>}
          </section>
        </>;
      })()}

      {tab === 'h2h' && (() => {
        const opps = [...opponents].sort((a, b) => b[1] - a[1]).map(([o]) => o);
        const opp = h2hOpp && opps.includes(h2hOpp) ? h2hOpp : opps[0];
        if (!opp) return <p className="hint">{t('profNoEvents')}</p>;
        const meet = mine.filter((m) => m.sides.includes(opp));
        const w = meet.filter(won).length;
        const own = meet[0].sides[myIdx(meet[0])];
        const rubber = meet.filter((m) => m.scores.length === 3 && !m.walkover && !m.retired);
        const rw = rubber.filter(won).length;
        const sum = emptyStats();
        let n = 0;
        for (const m of meet) { const st = v2(m); if (st) { addOriented(sum, st, myIdx(m)); n++; } }
        const recOf = (o: string) => { const ms = mine.filter((m) => m.sides.includes(o)); const x = ms.filter(won).length; return `${x}–${ms.length - x}`; };
        return <>
          <div className="controls">
            <label className="wide">{t('h2hOpponent')}
              <select value={opp} onChange={(e) => setH2hOpp(e.target.value)}>
                {opps.map((o) => <option key={o} value={o}>{entrantLabel(state, o).name} ({recOf(o)})</option>)}
              </select>
            </label>
          </div>
          <section className="card h2hcard">
            <div className="h2h-head">
              <span className="side"><Flag id={entrantLabel(state, own).country} /><b>{entrantLabel(state, own).name}</b></span>
              <span className={`h2h-score ${w > meet.length - w ? 'ahead' : w < meet.length - w ? 'behind' : ''}`}>{w}<small>–</small>{meet.length - w}</span>
              <span className="side"><a href="#" onClick={(e) => { e.preventDefault(); onOpen(opp); }}><Flag id={entrantLabel(state, opp).country} /><b>{entrantLabel(state, opp).name}</b></a></span>
            </div>
            <p className="h2h-sub muted-text">{t('h2hMeetings', { n: meet.length })}{rubber.length > 0 && <> · {t('deciderRecord')}: {rw}–{rubber.length - rw}</>}</p>
          </section>
          <div className="split">
            <section className="card">
              <h3>{t('h2hHistory')}</h3>
              <div className="mlist">{[...meet].reverse().map(matchRow)}</div>
            </section>
            <section className="card statcard">
              <h3>{t('h2hAvgStats')}</h3>
              {n === 0 ? <p className="hint">{t('noStatsYet')}</p>
                : <MatchStatsView s={sum} names={[entrantLabel(state, own).name, entrantLabel(state, opp).name]} mine={0} avgOf={n} />}
            </section>
          </div>
        </>;
      })()}

      {tab === 'matches' && <>
        <nav className="controls subnav">
          {(['all', ...matchYears] as const).map((y) => (
            <button key={y} aria-pressed={matchYear === y} onClick={() => { setMatchYear(y); setShown(30); }}>
              {y === 'all' ? t('all') : y} <span className="muted-text">{wl(y === 'all' ? mine : mine.filter((m) => m.year === y))}</span>
            </button>
          ))}
        </nav>
        <div className="split">
          {!pair && pairs.length > 0 && <details className="card foldcard">
            <summary><h3>{t('profPartners')} <span className="muted-text">({pairs.length})</span></h3></summary>
            <table className="fit">
              <thead><tr><th></th><th>{t('partner')}</th><th className="num">{t('chemistry')}</th><th className="num">{t('matchesShort')}</th></tr></thead>
              <tbody>{[...pairs].reverse().map((x) => (
              <tr key={x.id} className={x.dissolved ? 'muted-text' : undefined}>
                <td><a href="#" title={t('pairProfile')} onClick={(e) => { e.preventDefault(); onOpen(x.id); }}><span className="chip">{x.discipline}</span></a></td>
                <td>{x.playerIds.filter((pid) => pid !== id).map((pid) => <a key={pid} href="#" onClick={(e) => { e.preventDefault(); onOpen(pid); }}>{lookup(state).players.get(pid)?.name}</a>)}
                  {x.trial && <> <span className="tag">{t('trialPair')}</span></>}{x.dissolved && <> <span className="tag muted-tag">{t('profDissolved')}</span></>}</td>
                <td className="num" title={t('chemistry')}>{Math.round(x.chemistry)}</td>
                <td className="num" title={t('matchesTogether')}>{x.matchesTogether}</td>
              </tr>
            ))}</tbody></table>
          </details>}
        </div>
        {list.length === 0 ? <p className="hint">{t('profNoEvents')}</p> : (
          <div className="mlist">{list.slice(0, shown).map(matchRow)}</div>
        )}
        {list.length > shown && <p><button onClick={() => setShown(shown + 30)}>{t('showMore')} ({list.length - shown})</button></p>}
      </>}

    </section>
  );
}

/** Kartu identitas pasangan: kedua atlet (ke profil masing-masing), nomor, chemistry, lama berpasangan, ranking, status. */
function PairCard({ pair, rank, onOpen }: { pair: Pair; rank?: number; onOpen: (id: string) => void }) {
  const { game } = useGame();
  const { state } = game;
  const [a, b] = pair.playerIds.map((x) => lookup(state).players.get(x)!);
  const fact = (k: string, v: ReactNode) => <div><dt>{k}</dt><dd>{v}</dd></div>;
  const since = `${t('weekShort')}${pair.formed.week} ${pair.formed.year}`;
  const member = (x: Player) => (
    <div key={x.id} className="drow">
      <span className="grow"><a href="#" onClick={(e) => { e.preventDefault(); onOpen(x.id); }}>{x.name}</a>
        <small className="muted-text">{ageAt(x.birth, state.date)} {t('yearsShort')} · {t('ability')} {currentAbility(x.attrs)}</small></span>
      <MoraleTag value={x.form} short />
      {x.injury ? <span className={`badge danger${isBadInjury(x.injury) ? ' strong' : ''}`} title={injuryText(x.injury, state.date)}>✚</span> : <FatigueBar value={x.fatigue} />}
    </div>
  );
  return (
    <section className="card evinfo">
      <h2>{a.name} / {b.name}</h2>
      <dl className="facts">
        {fact(t('country'), <><Flag id={a.countryId} />{a.countryId} · <span className="chip">{pair.discipline}</span></>)}
        {fact(t('bwfRank'), rank ? `#${rank}` : '—')}
        {fact(t('pairAbility'), <span title={`${currentAbility(a.attrs)} / ${currentAbility(b.attrs)} + ${t('chemistry')}`}>{Math.round(pairAbility([currentAbility(a.attrs), currentAbility(b.attrs)], pair.chemistry, game.ruleset.match))}</span>)}
        {fact(t('morale'), <MoraleTag value={(a.form + b.form) / 2} detail={[a, b].map((x) => `${x.name}: ${t(`morale_${moraleTier(x.form)}` as TextKey)}`).join(' · ')} />)}
        {fact(t('chemistry'), Math.round(pair.chemistry))}
        {fact(t('matchesTogether'), pair.matchesTogether)}
        {fact(t('pairSince'), pair.dissolved ? `${since} – ${t('weekShort')}${pair.dissolved.week} ${pair.dissolved.year}` : since)}
        {fact(t('status'), pair.dissolved ? <span className="tag muted-tag">{t('profDissolved')}</span>
          : pair.trial ? <span className="tag muted-tag">{t('trialPair')}</span>
          : pair.adHoc ? <span className="tag muted-tag">{t('adHocPair')}</span>
          : <span className="tag">{t('mainPair')}</span>)}
      </dl>
      <div className="dlist">{[a, b].map(member)}</div>
    </section>
  );
}

export const usd = (x: number) => `$${Math.round(x).toLocaleString(numLocale())}`;

/**
 * Atribut: grafik per usia + daftar atribut (bar, nilai kini, perubahan sejak akhir musim lalu). Kemampuan (CA) selalu di
 * grafik; atribut yang dipencet di daftar ditambahkan sebagai garis kedua. Titik = akhir tiap musim (riwayat) + sekarang.
 */
function AttrPanel({ p, date }: { p: Player; date: GameDate }) {
  const [attr, setAttr] = useState<Attr | 'ca'>('ca');
  // Pembanding ▲▼: akhir musim terakhir; bila belum ada perubahan sejak itu (awal musim), akhir musim sebelumnya.
  const same = (h?: { attrs: Player['attrs'] }) => !!h && ATTRS.every((a) => Math.round(h.attrs[a]) === Math.round(p.attrs[a]));
  const base = same(p.attrHistory.at(-1)) && p.attrHistory.length > 1 ? p.attrHistory.at(-2) : p.attrHistory.at(-1);
  const prev = base?.attrs;
  const rows: { key: Attr | 'ca'; label: string; now: number; delta?: number }[] = [
    { key: 'ca', label: t('ability'), now: currentAbility(p.attrs), delta: prev && currentAbility(p.attrs) - currentAbility(prev) },
    ...ATTRS.map((a) => ({ key: a, label: t(a), now: Math.round(p.attrs[a]), delta: prev && Math.round(p.attrs[a]) - Math.round(prev[a]) })),
  ];
  // Grafik butuh ≥ 2 titik (riwayat akhir musim + sekarang di usia berbeda); tanpa grafik daftar memakai lebar penuh.
  const hasChart = new Set([...p.attrHistory.map((h) => h.year + 1), date.year + (date.week - 1) / 52]).size > 1;
  return (
    <section className="card attrpanel">
      <h3>{t('attributes')}</h3>
      {!hasChart && <p className="hint">{t('attrChartWait')}</p>}
      <div className={hasChart ? 'attrgrid' : 'attrlist-only'}>
        {hasChart && <AttrChart p={p} date={date} attr={attr} />}
        <div className="attrlist" role="list">
          {rows.map((r) => (
            <button key={r.key} role="listitem" className={`attrrow${r.key === 'ca' ? ' ca' : ''}${r.key === attr ? ' sel' : ''}`}
              aria-pressed={r.key === attr} title={t('attrShowChart')} onClick={() => setAttr(r.key === attr ? 'ca' : r.key)}>
              <span className="name">{r.label}</span>
              <span className="meter"><span style={{ width: `${r.now}%` }} /></span>
              <b className="val">{r.now}</b>
              <span className="delta">{r.delta ? <span className={r.delta > 0 ? 'up' : 'down'}>{r.delta > 0 ? '▲' : '▼'}{Math.abs(r.delta)}</span> : ''}</span>
            </button>
          ))}
          {prev && hasChart && <p className="hint">{t('attrDeltaHint', { y: base!.year })}</p>}
        </div>
      </div>
    </section>
  );
}

/** Grafik per usia: Kemampuan + (opsional) satu atribut. Satu sumbu, dipersempit ke rentang data. */
function AttrChart({ p, date, attr }: { p: Player; date: GameDate; attr: Attr | 'ca' }) {
  // Riwayat tahun Y = kondisi akhir musim Y (usia ±(Y + 1) − tahun lahir); "sekarang" memakai usia pecahan menurut minggu.
  const byAge = new Map<number, Player['attrs']>();
  for (const h of p.attrHistory) byAge.set(h.year + 1 - p.birth.year, h.attrs);
  byAge.set(date.year - p.birth.year + (date.week - 1) / 52, p.attrs);
  const pts = [...byAge].sort((a, b) => a[0] - b[0]);
  if (pts.length < 2) return <p className="hint">{t('attrChartWait')}</p>;
  const series = [
    { key: 'ca', label: t('ability'), color: 'var(--series-1)', vals: pts.map(([, a]) => currentAbility(a)) },
    ...(attr === 'ca' ? [] : [{ key: attr, label: t(attr), color: 'var(--series-2)', vals: pts.map(([, a]) => Math.round(a[attr])) }]),
  ];
  const all = series.flatMap((s) => s.vals);
  const lo = Math.max(0, Math.floor((Math.min(...all) - 5) / 10) * 10), hi = Math.min(100, Math.ceil((Math.max(...all) + 5) / 10) * 10);
  const W = 360, H = 200, L = 28, R = 34, T = 12, B = 26;
  const ages = pts.map(([a]) => a);
  const x = (age: number) => L + ((age - ages[0]) / Math.max(1, ages.at(-1)! - ages[0])) * (W - L - R);
  const y = (v: number) => T + ((hi - v) / (hi - lo)) * (H - T - B);
  const ticks = Array.from({ length: (hi - lo) / 10 + 1 }, (_, i) => lo + i * 10);
  // Label ujung garis tidak boleh bertumpuk: geser saling menjauh bila terlalu dekat.
  const ly = series.map((s) => y(s.vals.at(-1)!));
  if (ly.length === 2 && Math.abs(ly[0] - ly[1]) < 14) {
    const mid = (ly[0] + ly[1]) / 2, up = ly[0] <= ly[1] ? 0 : 1;
    ly[up] = mid - 7; ly[1 - up] = mid + 7;
  }
  return (
    <div className="attrchart">
      <div className="legend">
        <small className="muted-text">{t('attrChart')}</small>
        {series.map((s) => <span key={s.key}><span className="swatch" style={{ background: s.color }} /> {s.label}</span>)}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={t('attrChart')}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth="1" />
            <text x={L - 5} y={y(v) + 4} fontSize="11" textAnchor="end" fill="currentColor" opacity=".7">{v}</text>
          </g>
        ))}
        {Array.from({ length: Math.floor(ages.at(-1)!) - Math.ceil(ages[0]) + 1 }, (_, i) => Math.ceil(ages[0]) + i).map((a) => (
          <text key={a} x={x(a)} y={H - 8} fontSize="11" textAnchor="middle" fill="currentColor" opacity=".7">{a}</text>
        ))}
        <text x={W - R} y={H - 8} fontSize="11" fill="currentColor" opacity=".7" dx="10">{t('yearsShort')}</text>
        {series.map((s, k) => (
          <g key={s.key}>
            <polyline points={s.vals.map((v, i) => `${x(ages[i])},${y(v)}`).join(' ')} fill="none" stroke={s.color} strokeWidth="2.5" strokeLinejoin="round" />
            {s.vals.map((v, i) => (
              <circle key={i} cx={x(ages[i])} cy={y(v)} r="4" fill={s.color} stroke="var(--surface)" strokeWidth="2">
                <title>{`${s.label} · ${Math.floor(ages[i])} ${t('yearsShort')}: ${v}`}</title>
              </circle>
            ))}
            <text x={x(ages.at(-1)!) + 8} y={ly[k] + 4} fontSize="12" fontWeight="700" fill={s.color}>{s.vals.at(-1)}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}
