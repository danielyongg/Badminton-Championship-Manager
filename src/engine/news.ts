import { absWeek, computeRanking, rankMap } from './ranking';
import { weekOf, type SeasonState } from './season';
import type { EntrantId, Match, Ruleset } from './types';

// Berita mingguan Dashboard: judul singkat dari laga minggu lalu (tanpa data baru di save).

export type NewsItem =
  | { kind: 'upset'; m: Match; winner: EntrantId; loser: EntrantId; wr?: number; lr: number }
  | { kind: 'streak'; id: EntrantId; n: number; tournamentId: string }
  | { kind: 'smash'; m: Match; id: EntrantId; kmh: number; record: boolean }
  | { kind: 'rally'; m: Match; shots: number; record: boolean }
  | { kind: 'fire'; id: EntrantId; wins: number };

/** Kejutan: pemenang ≥ UPSET_GAP peringkat di bawah lawan yang ada di UPSET_TOP besar (ranking senior/junior sebelum minggu itu). */
const UPSET_TOP = 20, UPSET_GAP = 20;

export function weeklyNews(state: SeasonState, rs: Ruleset): NewsItem[] {
  const { year, week } = state.date;
  const last = week > 1 ? { year, week: week - 1 } : { year: year - 1, week: 52 };
  const defs = new Map(rs.calendar.map((e) => [e.id, e]));
  const junior = new Set(rs.calendar.filter((e) => rs.tiers.find((t) => t.id === e.tierId)?.junior).map((e) => e.id));
  const weekIn = (m: Match) => { const e = defs.get(m.tournamentId); return e ? absWeek({ year: m.year, week: weekOf(e, m.year) }) : 0; };
  const lastAbs = absWeek(last);
  const individual = state.matches.filter((m) => defs.has(m.tournamentId)); // tanpa partai beregu
  const thisWeek = individual.filter((m) => weekIn(m) === lastAbs);
  if (!thisWeek.length) return [];
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

  // On fire: kondisi terbawa tertinggi minggu itu (kemenangan beruntun), selain juara yang sudah diberitakan.
  const hot = state.hotForm?.absWeek === lastAbs ? state.hotForm.by : {};
  const { hotFrom, winBonus, winCap } = rs.match.dayForm;
  const fire = Object.entries(hot)
    .filter(([id, h]) => h.v + Math.min(winCap, h.wins * winBonus) >= hotFrom && !items.some((x) => x.kind === 'streak' && x.id === id))
    .sort((a, b) => b[1].wins - a[1].wins)[0];
  if (fire) items.push({ kind: 'fire', id: fire[0], wins: fire[1].wins });
  return items;
}
