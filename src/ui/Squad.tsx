import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { dissolvePair, potentialStars, promoteJunior, recallPlayer, releasePlayer } from '../engine/career';
import { ageAt, currentAbility, isPratama } from '../engine/generator';
import { headToHead, moraleTier, pairAbility } from '../engine/match';
import { absWeek, computeRanking, rankMap } from '../engine/ranking';
import { rankFromSnapshots } from '../engine/season';
import { ATTRS, DISCIPLINES, type Attr, type Discipline, type GameDate, type Pair, type Player } from '../engine/types';
import { numLocale, t, type TextKey } from '../i18n';
import { entrantLabel, eventName as eventNameOf, lookup, saveGame, TIER_GROUPS, TierBadge, tierGroup, useGame } from './game';
import { formatName } from './Team';
import { ownPairs, Pairs } from './Pairs';
import { CommitmentChips, RankChart } from './Ranking';
import { Flag } from './Flag';
import { MatchLink } from './MatchDetail';


/** Cedera: "Cedera berat: Robek otot betis · 14 mg · kembali minggu 33" (tahun ditulis bila melewati musim ini). */
export function injuryText(inj: NonNullable<Player['injury']>, date: { year: number; week: number }) {
  const at = date.week + inj.weeksLeft - 1;
  const y = date.year + Math.floor(at / 52), w = (at % 52) + 1;
  return `${t(`injLevel_${inj.level}` as TextKey)}: ${t(`inj_${inj.type}` as TextKey)} · ${t('weeksShort', { n: inj.weeksLeft })} · ${t('returnsWeek', { w: y > date.year ? `${w} (${y})` : w })}`;
}
export const isBadInjury = (inj?: Player['injury']) => inj?.level === 'severe' || inj?.level === 'critical';

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
  const [sort, setSort] = useState({ key: 'ability', desc: true });
  const col = COLS.find((c) => c.key === sort.key)!;
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
              <td>{p.name}</td><td className="m-hide">{p.gender}</td>
              {juniorCols && <td>{isPratama(p, state.date)
                ? <span className="tag muted-tag" title={t('pratamaHint')}>{t('pratama')}</span>
                : <span className="tag">{t('utama')}</span>}</td>}
              <td>{sectorsOf(p).map((d) => {
                const pair = d.length === 2 && d[1] === 'D' ? mainPair(p.id, d as DoublesD) : undefined;
                const partner = pair && lookup(state).players.get(pair.playerIds.find((x) => x !== p.id)!)?.name;
                return <span key={d} className="chip sector" title={partner}>{d}</span>;
              })}</td>
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
                  {isPratama(p, state.date) && <>{' '}<button className="mini btn-go" onClick={() => { promoteJunior(state, p.id); commit(); }}>{t('promote')}</button></>}
                  {' '}<button className="mini btn-danger" onClick={() => { if (confirm(t('confirmRelease', { name: p.name }))) { releasePlayer(state, p.id); commit(); } }}>{t('releaseShort')}</button>
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

type ProfileTab = 'summary' | 'titles' | 'events' | 'matches' | 'h2h';

/**
 * Profil atlet: kartu identitas (selalu tampil) + sub-tab Ringkasan (statistik, ranking, atribut, cedera),
 * Turnamen & Committed, Riwayat laga, H2H & pasangan.
 */
const MORALE_ICON = { veryHigh: '▲▲', high: '▲', normal: '–', low: '▼', veryLow: '▼▼' } as const;
/** Morale atlet (5 tingkat); `short` = ikon saja (tabel), nama tingkat sebagai keterangan. */
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
  const pairs = useMemo(() => (pair ? [] : state.pairs.filter((x) => x.playerIds.includes(id))), [version, id]);
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
  const activePairs = pairs.filter((x) => !x.dissolved);
  const openOpp = (opp: string) => onOpen(opp); // lawan ganda → profil pasangannya
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
  const h2h = [...opponents].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([o]) => {
    const own = mine.find((m) => m.sides.includes(o))!.sides[myIdx(mine.find((m) => m.sides.includes(o))!)];
    return { o, rec: headToHead(mine, own, o) };
  });
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
          {fact(t('ability'), <>{currentAbility(p.attrs)}{arrow(p.caDelta)}</>)}
          {fact(t('morale'), <MoraleTag value={p.form} />)}
          {fact(t('potential'), <span className="stars">{starText(potentialStars(p, state.date, counts.get(p.id) ?? 0))}</span>)}
          {fact(t('fatigue'), <FatigueBar value={p.fatigue} />)}
          {fact(t('status'), p.retired !== undefined ? `${t('retired')} ${p.retired}`
            : p.released !== undefined ? <span className="tag muted-tag">{t('releasedTag', { year: p.released })}</span>
            : p.injury ? <span className={`badge danger${isBadInjury(p.injury) ? ' strong' : ''}`}>✚ {t('injury')}</span>
            : <span className="badge good">{t('fit')}</span>)}
        </dl>
        {p.injury && <p className={`injury-now${isBadInjury(p.injury) ? ' strong' : ''}`}>✚ {injuryText(p.injury, state.date)}</p>}
        {p.countryId === state.career?.countryId && p.retired === undefined && (
          <p>{p.released === undefined
            ? <button className="btn-danger" onClick={() => { if (confirm(t('confirmRelease', { name: p.name }))) { releasePlayer(state, p.id); changed(); void saveGame(game); } }}>{t('release')}</button>
            : <button onClick={() => { recallPlayer(state, p.id); changed(); void saveGame(game); }}>{t('recall')}</button>}</p>
        )}
      </section>}
      <nav className="controls">
        {(['summary', 'titles', 'events', 'matches', 'h2h'] as const).map((x) => (
          <button key={x} aria-pressed={tab === x} onClick={() => setTab(x)}>{t(({ summary: 'profSummary', titles: 'profTitles', events: 'profEvents', matches: 'profMatches', h2h: pair ? 'h2h' : 'profH2H' } as const)[x])}</button>
        ))}
      </nav>

      {tab === 'summary' && pair && <div className="split">
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
          <RankChart history={rankFromSnapshots(state, pair.id, pair.discipline)} />
        </section>
      </div>}
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
          <div>
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
          </div>
        </div>
      </>}

      {tab === 'titles' && <section className="card">
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
          <section className="card">
            <h3>{t('rankHistory')}</h3>
            {pair && <RankChart history={rankFromSnapshots(state, pair.id, pair.discipline)} />}
            {playsSingles && <><h4>{singles}</h4><RankChart history={rankFromSnapshots(state, id, singles)} /></>}
            {activePairs.map((x) => (
              <div key={x.id}>
                <h4>{x.discipline}: {entrantLabel(state, x.id).name}</h4>
                <RankChart history={rankFromSnapshots(state, x.id, x.discipline)} />
              </div>
            ))}
          </section>
        </aside>
      </div>}

      {tab === 'matches' && <>
        <nav className="controls subnav">
          {(['all', ...matchYears] as const).map((y) => (
            <button key={y} aria-pressed={matchYear === y} onClick={() => { setMatchYear(y); setShown(30); }}>
              {y === 'all' ? t('all') : y} <span className="muted-text">{wl(y === 'all' ? mine : mine.filter((m) => m.year === y))}</span>
            </button>
          ))}
        </nav>
        {list.length === 0 ? <p className="hint">{t('profNoEvents')}</p> : (
          <div className="mlist">{list.slice(0, shown).map((m) => {
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
          })}</div>
        )}
        {list.length > shown && <p><button onClick={() => setShown(shown + 30)}>{t('showMore')} ({list.length - shown})</button></p>}
      </>}

      {tab === 'h2h' && <div className="split">
        <section className="card">
          <h3>{t('h2h')}</h3>
          {h2h.length === 0 ? <p className="hint">{t('profNoEvents')}</p> : (
            <table className="fit"><tbody>{h2h.map(({ o, rec }) => (
              <tr key={o}>
                <td><a href="#" onClick={(e) => { e.preventDefault(); openOpp(o); }}><Flag id={entrantLabel(state, o).country} />{entrantLabel(state, o).name}</a></td>
                <td className={`num h2h ${rec[0] > rec[1] ? 'ahead' : rec[0] < rec[1] ? 'behind' : ''}`}>{rec[0]} – {rec[1]}</td>
              </tr>
            ))}</tbody></table>
          )}
        </section>
        {!pair && <section className="card">
          <h3>{t('profPartners')}</h3>
          {pairs.length === 0 ? <p className="hint">—</p> : (
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
          )}
        </section>}
      </div>}
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
