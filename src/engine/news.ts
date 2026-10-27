import { ageAt, JUNIOR_MAX_AGE } from './generator';
import { absWeek, computeRanking, rankMap } from './ranking';
import { weekOf, type SeasonState } from './season';
import type { AwardYear } from './awards';
import type { Discipline, EntrantId, Match, Ruleset } from './types';

// Berita mingguan Dashboard: judul singkat dari laga minggu lalu (tanpa data baru di save).

export type NewsItem =
  | { kind: 'upset'; m: Match; winner: EntrantId; loser: EntrantId; wr?: number; lr: number }
  | { kind: 'streak'; id: EntrantId; n: number; tournamentId: string }
  | { kind: 'smash'; m: Match; id: EntrantId; kmh: number; record: boolean }
  | { kind: 'rally'; m: Match; shots: number; record: boolean }
  | { kind: 'fire'; id: EntrantId; wins: number }
  | { kind: 'firstTitle'; id: EntrantId; tournamentId: string; discipline: Discipline }
  | { kind: 'careerHigh'; id: EntrantId; rank: number; discipline: Discipline }
  | { kind: 'seedOut'; m: Match; id: EntrantId; opp: EntrantId }
  | { kind: 'comeback'; m: Match; id: EntrantId }
  | { kind: 'youngChamp'; id: EntrantId; age: number; tournamentId: string; discipline: Discipline }
  | { kind: 'hosts'; year: number; drawn: { id: string; cityId: string }[] }
  | { kind: 'awards'; award: AwardYear };

/** Kejutan: pemenang ≥ UPSET_GAP peringkat di bawah lawan yang ada di UPSET_TOP besar (ranking senior/junior sebelum minggu itu). */
const UPSET_TOP = 20, UPSET_GAP = 20;
/** Urutan tampil (yang lebih jarang/lebih dekat dengan manajer dulu); smash, reli & on fire mengisi sisa tempat. */
const PRIORITY: NewsItem['kind'][] = ['careerHigh', 'youngChamp', 'firstTitle', 'upset', 'seedOut', 'comeback', 'streak', 'smash', 'rally', 'fire'];
const MAX_NEWS = 6;
/** Hasil undian tuan rumah musim depan tampil di berita selama minggu-minggu pertama musim. */
const HOSTS_WEEKS = 4;
/** Babak utama sebelum perempat final (unggulan 1 "tersingkir dini"). */
const EARLY = new Set(['R128', 'R64', 'R32', 'R16']);

export function weeklyNews(state: SeasonState, rs: Ruleset): NewsItem[] {
  const { year, week } = state.date;
  const last = week > 1 ? { year, week: week - 1 } : { year: year - 1, week: 52 };
  const defs = new Map(rs.calendar.map((e) => [e.id, e]));
  const junior = new Set(rs.calendar.filter((e) => rs.tiers.find((t) => t.id === e.tierId)?.junior).map((e) => e.id));
  const weekIn = (m: Match) => { const e = defs.get(m.tournamentId); return e ? absWeek({ year: m.year, week: weekOf(e, m.year) }) : 0; };
  const lastAbs = absWeek(last);
  const individual = state.matches.filter((m) => defs.has(m.tournamentId)); // tanpa partai beregu
  const thisWeek = individual.filter((m) => weekIn(m) === lastAbs);
  const hd = state.hostDraw;
  const hosts: NewsItem[] = hd?.drawn.length && hd.year === year + 1 && week <= HOSTS_WEEKS ? [{ kind: 'hosts', ...hd }] : [];
  // BWF Player of the Year: nominasi tampil sampai pemenang diumumkan, pemenang sampai akhir musim (paling atas).
  const award = state.awards?.find((a) => a.year === year);
  if (award) hosts.unshift({ kind: 'awards', award });
  if (!thisWeek.length) return hosts;
  const items: NewsItem[] = [];

  // Kejutan terbesar.
  const ranks = new Map<string, Map<string, number>>();
  const rankOf = (m: Match, id: EntrantId) => {
    const k = `${junior.has(m.tournamentId)}:${m.discipline}`;
    if (!ranks.has(k)) ranks.set(k, rankMap(computeRanking(junior.has(m.tournamentId) ? state.juniorResults : state.results, m.discipline, lastAbs - 1, rs)));
    return ranks.get(k)!.get(id);
  };
  let upset: Extract<NewsItem, { kind: 'upset' }> | undefined;
  for (const m of thisWeek) {
    if (m.walkover || m.retired) continue;
    const winner = m.sides[m.winner], loser = m.sides[1 - m.winner];
    const lr = rankOf(m, loser), wr = rankOf(m, winner);
    if (!lr || lr > UPSET_TOP || (wr ?? Infinity) - lr < UPSET_GAP) continue;
    if (!upset || (wr ?? 999) - lr > (upset.wr ?? 999) - upset.lr) upset = { kind: 'upset', m, winner, loser, wr, lr };
  }
  if (upset) items.push(upset);

  // Juara minggu ini (individu): gelar perdana, juara muda di turnamen senior.
  const weekChamps = state.champions.filter((c) => { const e = defs.get(c.tournamentId); return e && absWeek({ year: c.year, week: weekOf(e, c.year) }) === lastAbs; });
  const pairOf = new Map(state.pairs.map((p) => [p.id, p]));
  const playersOf = (id: EntrantId) => pairOf.get(id)?.playerIds ?? [id];
  const seniorChamps = state.champions.filter((c) => !junior.has(c.tournamentId));
  // Gelar perdana hanya bila save sudah punya juara musim sebelumnya (awal karier: semua juara tampak "perdana").
  // ponytail: hanya gelar sejak awal save yang diketahui; atlet/pasangan yang juara sebelum save dimulai tetap bisa muncul.
  const history = seniorChamps.some((c) => c.year < last.year);
  for (const c of weekChamps) {
    if (junior.has(c.tournamentId)) continue;
    const ps = playersOf(c.winner);
    const titled = seniorChamps.some((x) => !weekChamps.includes(x) && playersOf(x.winner).some((id) => ps.includes(id)));
    if (history && !titled) items.push({ kind: 'firstTitle', id: c.winner, tournamentId: c.tournamentId, discipline: c.discipline });
    const ages = ps.map((id) => state.players.find((p) => p.id === id)).filter((p) => p).map((p) => ageAt(p!.birth, last));
    if (ages.length && Math.max(...ages) <= JUNIOR_MAX_AGE) items.push({ kind: 'youngChamp', id: c.winner, age: Math.max(...ages), tournamentId: c.tournamentId, discipline: c.discipline });
  }

  // Unggulan 1 tersingkir sebelum perempat final (babak utama).
  for (const r of state.eventRecords) {
    const e = defs.get(r.tournamentId);
    if (!e || r.year !== last.year || weekOf(e, r.year) !== last.week) continue;
    const top = r.slots.find((x) => x.seed === 1)?.entrant;
    const lost = top && thisWeek.find((m) => m.tournamentId === r.tournamentId && m.discipline === r.discipline && m.sides.includes(top)
      && m.sides[m.winner] !== top && EARLY.has(m.round));
    if (lost) items.push({ kind: 'seedOut', m: lost, id: top, opp: lost.sides[lost.winner] });
  }

  // Comeback di final: juara setelah kalah di game pertama.
  for (const m of thisWeek)
    if (m.round === 'F' && m.scores.length === 3 && !m.retired && m.scores[0][m.winner] < m.scores[0][1 - m.winner]) items.push({ kind: 'comeback', m, id: m.sides[m.winner] });

  // Juara beruntun: gelar minggu ini + gelar di turnamen-turnamen sebelumnya yang diikuti, tanpa putus.
  const won = new Set(state.champions.map((c) => `${c.year}:${c.tournamentId}:${c.winner}`));
  for (const c of state.champions) {
    const e = defs.get(c.tournamentId);
    if (!e || absWeek({ year: c.year, week: weekOf(e, c.year) }) !== lastAbs) continue;
    const played = [...new Set(individual.filter((m) => m.sides.includes(c.winner)).sort((a, b) => weekIn(b) - weekIn(a)).map((m) => `${m.year}:${m.tournamentId}`))];
    let n = 0;
    while (n < played.length && won.has(`${played[n]}:${c.winner}`)) n++;
    if (n >= 2) items.push({ kind: 'streak', id: c.winner, n, tournamentId: c.tournamentId });
  }

  // Smash tercepat & reli terpanjang minggu ini; rekor = melampaui semua laga musim ini sebelumnya.
  const stats = (m: Match) => (m.stats && 'v' in m.stats ? m.stats : undefined);
  const season = individual.filter((m) => m.year === last.year && weekIn(m) < lastAbs);
  const maxKmh = (m: Match) => Math.max(...(stats(m)?.kmh ?? [0]));
  const smash = thisWeek.reduce<Match | undefined>((b, m) => (maxKmh(m) > (b ? maxKmh(b) : 0) ? m : b), undefined);
  if (smash) {
    const s = stats(smash)!;
    const side = s.kmh[0] >= s.kmh[1] ? 0 : 1;
    items.push({ kind: 'smash', m: smash, id: smash.sides[side], kmh: s.kmh[side], record: season.every((m) => maxKmh(m) < s.kmh[side]) });
  }
  const longest = (m: Match) => stats(m)?.longest ?? 0;
  const rally = thisWeek.reduce<Match | undefined>((b, m) => (longest(m) > (b ? longest(b) : 0) ? m : b), undefined);
  if (rally) items.push({ kind: 'rally', m: rally, shots: longest(rally), record: season.every((m) => longest(m) < longest(rally)) });

  // Peringkat tertinggi karier (negara manajer): minggu pertama di peringkat yang belum pernah dicapai (1–100).
  const managed = state.career?.countryId;
  const countryOf = (id: EntrantId) => state.players.find((p) => p.id === playersOf(id)[0])?.countryId;
  if (managed) for (const [d, byId] of Object.entries(state.rankWeeks ?? {}) as [Discipline, Record<string, { r: number; at: Record<number, number> }>][]) {
    for (const [id, w] of Object.entries(byId)) {
      const ranks = Object.keys(w.at).map(Number);
      const weeks = Object.values(w.at).reduce((a, b) => a + b, 0);
      if (w.r > 0 && w.at[w.r] === 1 && Math.min(...ranks) === w.r && weeks >= 5 && countryOf(id) === managed)
        items.push({ kind: 'careerHigh', id, rank: w.r, discipline: d });
    }
  }

  // On fire: kondisi terbawa tertinggi minggu itu (kemenangan beruntun), selain juara yang sudah diberitakan.
  const hot = state.hotForm?.absWeek === lastAbs ? state.hotForm.by : {};
  const { hotFrom, winBonus, winCap } = rs.match.dayForm;
  const fire = Object.entries(hot)
    .filter(([id, h]) => h.v + Math.min(winCap, h.wins * winBonus) >= hotFrom && !items.some((x) => x.kind === 'streak' && x.id === id))
    .sort((a, b) => b[1].wins - a[1].wins)[0];
  if (fire) items.push({ kind: 'fire', id: fire[0], wins: fire[1].wins });

  // Satu berita per jenis (yang paling menonjol: turnamen tier tertinggi, beruntun terpanjang, peringkat terbaik),
  // lalu maksimal MAX_NEWS menurut prioritas jenis.
  const tierRank = (tid: string) => { const i = rs.tiers.findIndex((x) => x.id === defs.get(tid)?.tierId); return i < 0 ? 99 : i; };
  const weight = (n: NewsItem) =>
    n.kind === 'careerHigh' ? n.rank
    : n.kind === 'streak' ? -n.n * 100 + tierRank(n.tournamentId)
    : 'tournamentId' in n ? tierRank(n.tournamentId)
    : 'm' in n ? tierRank(n.m.tournamentId) : 0;
  const best = new Map<NewsItem['kind'], NewsItem>();
  for (const n of items) { const b = best.get(n.kind); if (!b || weight(n) < weight(b)) best.set(n.kind, n); }
  return [...hosts, ...PRIORITY.filter((k) => best.has(k)).map((k) => best.get(k)!)].slice(0, MAX_NEWS);
}
