import { promote } from './promotion';
import { bumpForm, DISSOLVE_PENALTY } from './boosts';
import { ageAt, currentAbility, isJuniorAge } from './generator';
import { markReleased, pairIndependents } from './independents';
import { pairAbility } from './match';
import { nextOlympics, olympicField } from './olympics';
import { absWeek, computeRanking, rankMap } from './ranking';
import { shuffle, type Rng } from './rng';
import { aiEventChoice, entrantsFor, hostCityId, isHeld, openTo, teamFormatsIn, teamStrengths, weekOf, type SeasonState } from './season';
import { levelOf } from './team';
import { DISCIPLINES, type Challenge, type Discipline, type FederationGoal, type Pair, type Player, type Round, type Ruleset, type SeasonReport, type TeamFormat, type World } from './types';
import { t } from '../i18n';

// Mode karier: target federasi, rapor akhir musim, perkiraan potensi, kelola pasangan.

// Untuk target federasi: atlet yang keluar pelatnas bukan lagi tim negara itu.
const countryOfEntrant = (state: SeasonState) => {
  const player = new Map(state.players.filter((p) => p.released === undefined).map((p) => [p.id, p.countryId]));
  const pair = new Map(state.pairs.map((p) => [p.id, p.playerIds.every((id) => player.has(id)) ? player.get(p.playerIds[0]) : undefined]));
  return (id: string) => pair.get(id) ?? player.get(id);
};

/** Gelar negara dalam satu musim (tier di `career.titleTiers`, semua nomor). */
export function titlesOf(state: SeasonState, rs: Ruleset, countryId: string, year: number) {
  const tierOf = new Map(rs.calendar.map((e) => [e.id, e.tierId]));
  const country = countryOfEntrant(state);
  return state.champions.filter((c) => c.year === year && rs.career.titleTiers.includes(tierOf.get(c.tournamentId) ?? '') && country(c.winner) === countryId).length;
}

/** Jumlah atlet/pasangan negara di top 10 dunia (semua nomor) saat ini. */
export function top10Of(state: SeasonState, rs: Ruleset, countryId: string) {
  const country = countryOfEntrant(state);
  const now = absWeek(state.date);
  return DISCIPLINES.reduce((n, d) => n + computeRanking(state.results, d, now, rs).filter((r) => r.rank <= 10 && country(r.entrantId) === countryId).length, 0);
}

/** Hasil beregu negara di putaran final tahun ini (0 = tidak lolos / belum dimainkan … 5 = juara). */
export function teamLevel(state: SeasonState, countryId: string, year: number, format: TeamFormat) {
  const r = state.teamResults.find((x) => x.year === year && x.format === format && !x.confederation && !x.games);
  const qualified = !!r?.teams.includes(countryId) || !!state.teamQualifiers?.[`${year}:${format}`]?.includes(countryId); // lolos sebelum final dimainkan
  return levelOf(qualified, r?.reached[countryId]);
}

/**
 * Target beregu dari peringkat kekuatan tim di awal musim (ASUMSI):
 * #1 → juara, #2 → final, #3–4 → semifinal, #5–8 → perempat final, #9–16 → lolos ke putaran final.
 */
function teamGoals(state: SeasonState, rs: Ruleset, countryId: string): FederationGoal[] {
  return teamFormatsIn(rs, state.date.year).flatMap((format) => {
    const rank = teamStrengths(state, rs, format).findIndex((t) => t.countryId === countryId) + 1;
    const target = rank === 0 || rank > rs.team.finals.teams ? 0 : rank === 1 ? 5 : rank === 2 ? 4 : rank <= 4 ? 3 : rank <= 8 ? 2 : 1;
    return target ? [{ kind: 'team' as const, format, target }] : [];
  });
}

/** Peringkat terbaik negara di tiap nomor saat ini (Infinity = tidak berperingkat). */
function bestRanks(state: SeasonState, rs: Ruleset, countryId: string) {
  const country = countryOfEntrant(state);
  const now = absWeek(state.date);
  return DISCIPLINES.map((d) => Math.min(Infinity, ...computeRanking(state.results, d, now, rs).filter((r) => country(r.entrantId) === countryId).map((r) => r.rank)));
}

const heldOfTier = (rs: Ruleset, tierId: string, year: number) => rs.calendar.find((e) => e.tierId === tierId && isHeld(e, year));

/**
 * Medali (semifinalis ke atas) atau emas negara di satu event besar tahun itu. Multi-event: termasuk beregu-nya
 * (`<eventId>-team`, per format putra/putri/campuran).
 */
export function medalsOf(state: SeasonState, countryId: string, eventId: string, year: number, gold = false) {
  const country = countryOfEntrant(state);
  const team = state.teamResults.filter((r) => r.eventId === `${eventId}-team` && r.year === year)
    .filter((r) => (gold ? ['W'] : ['W', 'F', 'SF']).includes(r.reached[countryId] ?? '')).length;
  if (gold) return team + state.champions.filter((c) => c.tournamentId === eventId && c.year === year && country(c.winner) === countryId).length;
  const ids = new Set(state.matches.filter((m) => m.tournamentId === eventId && m.year === year && m.round === 'SF').flatMap((m) => m.sides));
  return team + [...ids].filter((id) => country(id) === countryId).length;
}

/**
 * Target multi-event untuk negara anggota (ASUMSI): emas sebanyak nomor yang dipimpin negara itu di antara peserta anggota
 * (peringkat terbaik); bila tidak ada, medali sebanyak nomor dengan wakil 4 besar di antara anggota.
 */
function gamesGoals(state: SeasonState, rs: Ruleset, countryId: string): FederationGoal[] {
  const year = state.date.year;
  const country = countryOfEntrant(state);
  const now = absWeek(state.date);
  return rs.calendar.filter((e) => e.countries?.includes(countryId) && isHeld(e, year)).flatMap((e): FederationGoal[] => {
    const places = DISCIPLINES.map((d) => {
      const members = computeRanking(state.results, d, now, rs).filter((r) => e.countries!.includes(country(r.entrantId) ?? ''));
      const i = members.findIndex((r) => country(r.entrantId) === countryId);
      return i < 0 ? Infinity : i + 1;
    });
    const golds = places.filter((p) => p === 1).length;
    if (golds) return [{ kind: 'medals', eventId: e.id, gold: true, target: golds, games: true }];
    const medals = places.filter((p) => p <= 4).length;
    return medals ? [{ kind: 'medals', eventId: e.id, target: medals, games: true }] : [];
  });
}

/**
 * Wakil negara di Olimpiade terdekat: setelah Olimpiade dimainkan = peserta sebenarnya; sebelumnya = daftar lolos menurut
 * ranking Olimpiade (periode kualifikasi) & kuota saat ini (`olympicField`).
 */
export function olympicQualifiers(state: SeasonState, rs: Ruleset, countryId: string, world?: World) {
  const next = nextOlympics(rs, state.date.year);
  if (!next) return 0;
  const country = countryOfEntrant(state);
  const played = state.matches.filter((m) => m.tournamentId === next.event.id && m.year === next.year);
  if (played.length) return new Set(played.flatMap((m) => m.sides).filter((id) => country(id) === countryId)).size;
  return DISCIPLINES.reduce((n, d) => n + olympicField(state, rs, d, next.year, world).filter((c) => c.countryId === countryId).length, 0);
}

/**
 * Target turnamen besar (ASUMSI): tahun Olimpiade = emas bila punya peringkat 1–2 dunia, selain itu medali sebanyak entri top 4
 * (min 1); tahun Kejuaraan Dunia = medali sebanyak entri top 4 (min 1). Hanya bila punya entri top 16.
 */
function majorGoals(state: SeasonState, rs: Ruleset, countryId: string): FederationGoal[] {
  const year = state.date.year;
  const best = bestRanks(state, rs, countryId);
  if (!best.some((r) => r <= 16)) return [];
  const top4 = Math.max(1, best.filter((r) => r <= 4).length);
  const og = heldOfTier(rs, 'OG', year), wc = heldOfTier(rs, 'WC', year);
  if (og) return [best.some((r) => r <= 2) ? { kind: 'medals', eventId: og.id, gold: true, target: 1 } : { kind: 'medals', eventId: og.id, target: top4 }];
  return wc ? [{ kind: 'medals', eventId: wc.id, target: top4 }] : [];
}

/** Target siklus Olimpiade: ditetapkan sekali per siklus = proyeksi wakil saat itu + 1 (ASUMSI), dinilai di tahun Olimpiade. */
function olympicGoal(state: SeasonState, rs: Ruleset, countryId: string, world?: World): FederationGoal[] {
  const next = nextOlympics(rs, state.date.year);
  if (!next || !state.career) return [];
  const { year } = next;
  const max = DISCIPLINES.length * 2; // maks 2 wakil per nomor
  if (state.career.olympicCycle?.year !== year) state.career.olympicCycle = { year, target: Math.max(1, Math.min(max, olympicQualifiers(state, rs, countryId, world) + 1)) };
  return [{ kind: 'olympic', eventId: next.event.id, year, target: state.career.olympicCycle.target }];
}

/**
 * Target musim dari posisi awal negara: top 10 = pertahankan jumlah saat ini (min 1 bila punya atlet top 20);
 * gelar = gelar musim lalu, atau perkiraan 1,5 per entri top 10 di musim pertama. (ASUMSI)
 */
export function seasonGoals(state: SeasonState, rs: Ruleset, countryId: string, world?: World): FederationGoal[] {
  const top10 = top10Of(state, rs, countryId);
  const lastYear = titlesOf(state, rs, countryId, state.date.year - 1);
  const hadSeason = state.champions.some((c) => c.year === state.date.year - 1);
  const titles = hadSeason ? lastYear : Math.round(top10 * 1.5);
  return [
    { kind: 'titles', target: Math.max(1, titles) },
    { kind: 'top10', target: Math.max(top10 > 0 ? 1 : 0, top10) },
    ...teamGoals(state, rs, countryId),
    ...majorGoals(state, rs, countryId),
    ...gamesGoals(state, rs, countryId),
    ...olympicGoal(state, rs, countryId, world),
    ...juniorGoals(state, rs, countryId),
  ];
}

/**
 * Target junior (ASUMSI): medali Kejuaraan Dunia Junior sebanyak nomor dengan junior top 4 ranking junior;
 * Suhandinata dari peringkat kekuatan tim junior (1 → juara, 2 → final, 3–4 → semifinal, 5–8 → perempat final).
 */
function juniorGoals(state: SeasonState, rs: Ruleset, countryId: string): FederationGoal[] {
  const year = state.date.year, out: FederationGoal[] = [];
  const wjc = heldOfTier(rs, 'WJC', year);
  const country = countryOfEntrant(state), now = absWeek(state.date);
  const top4 = DISCIPLINES.filter((d) => computeRanking(state.juniorResults ?? [], d, now, rs).some((r) => r.rank <= 4 && country(r.entrantId) === countryId)).length;
  if (wjc && top4) out.push({ kind: 'medals', eventId: wjc.id, target: top4, junior: true });
  if (rs.team.events.some((e) => e.formats?.includes('suhandinata') && isHeld(e, year))) {
    const rank = teamStrengths(state, rs, 'suhandinata').findIndex((t) => t.countryId === countryId) + 1;
    const target = rank === 1 ? 5 : rank === 2 ? 4 : rank >= 3 && rank <= 4 ? 3 : rank >= 5 && rank <= 8 ? 2 : 0;
    if (target) out.push({ kind: 'team', format: 'suhandinata', target });
  }
  return out;
}

/** Capaian terkini suatu target (dipakai Dashboard & rapor). */
export function goalProgress(state: SeasonState, rs: Ruleset, countryId: string, g: FederationGoal, world?: World) {
  const year = state.date.year;
  return g.kind === 'titles' ? titlesOf(state, rs, countryId, year) : g.kind === 'top10' ? top10Of(state, rs, countryId)
    : g.kind === 'medals' ? medalsOf(state, countryId, g.eventId!, year, g.gold)
    : g.kind === 'olympic' ? olympicQualifiers(state, rs, countryId, world)
    : teamLevel(state, countryId, year, g.format!);
}

/** Bobot target di rapor: Kejuaraan Dunia & Olimpiade 2×, multi-event 1×; siklus Olimpiade hanya dinilai di tahun Olimpiade (2×). */
export const goalWeight = (g: FederationGoal, year: number): number => (g.kind === 'medals' ? (g.games || g.junior ? 1 : 2) : g.kind === 'olympic' ? (g.year === year ? 2 : 0) : 1);

// ASUMSI: bonus / penalti reputasi tantangan opsional.
export const CHALLENGE_REWARD = 8;
export const CHALLENGE_PENALTY = 5;
/** Tantangan bisa dipilih sampai minggu ini; lewat = musim tanpa tantangan. */
export const CHALLENGE_DEADLINE_WEEK = 8;

const superTitles = (state: SeasonState, rs: Ruleset, countryId: string, year: number) => {
  const tierOf = new Map(rs.calendar.map((e) => [e.id, e.tierId]));
  const country = countryOfEntrant(state);
  return state.champions.filter((c) => c.year === year && tierOf.get(c.tournamentId) === 'S1000' && country(c.winner) === countryId).length;
};

/**
 * Tiga tantangan acak dari yang berlaku: juara di turnamen kandang tertinggi, gelar lebih banyak dari rival
 * (negara dengan gelar musim lalu terdekat), gelar Super 1000 (musim lalu + 1), juara Kejuaraan Dunia Junior.
 */
export function makeChallenges(state: SeasonState, rs: Ruleset, world: World, countryId: string, rng: Rng): Challenge[] {
  const year = state.date.year;
  const out: Challenge[] = [];
  const cityCountry = new Map(world.cities.map((c) => [c.id, c.countryId]));
  const points = (e: (typeof rs.calendar)[number]) => rs.tiers.find((x) => x.id === e.tierId)?.points[0] ?? 0;
  const home = rs.calendar.filter((e) => isHeld(e, year) && ['S1000', 'S750', 'S500', 'S300', 'S100'].includes(e.tierId) && cityCountry.get(hostCityId(e, year)) === countryId)
    .sort((a, b) => points(b) - points(a))[0];
  if (home) out.push({ kind: 'homeTitle', eventId: home.id });
  const mine = titlesOf(state, rs, countryId, year - 1);
  const rival = world.countries.filter((c) => c.id !== countryId)
    .map((c) => ({ id: c.id, n: titlesOf(state, rs, c.id, year - 1), top: top10Of(state, rs, c.id) }))
    .sort((a, b) => Math.abs(a.n - mine) - Math.abs(b.n - mine) || b.top - a.top)[0];
  if (rival) out.push({ kind: 'beatRival', rival: rival.id });
  out.push({ kind: 'superTitles', target: superTitles(state, rs, countryId, year - 1) + 1 });
  const wjc = heldOfTier(rs, 'WJC', year);
  if (wjc) out.push({ kind: 'juniorWorld', eventId: wjc.id });
  return shuffle(rng, out).slice(0, 3);
}

/** Capaian tantangan: [sekarang, target] — berhasil bila sekarang ≥ target. */
export function challengeProgress(state: SeasonState, rs: Ruleset, countryId: string, c: Challenge, year = state.date.year): [number, number] {
  const country = countryOfEntrant(state);
  const won = (eventId: string) => state.champions.filter((x) => x.tournamentId === eventId && x.year === year && country(x.winner) === countryId).length;
  if (c.kind === 'homeTitle' || c.kind === 'juniorWorld') return [won(c.eventId!), 1];
  if (c.kind === 'beatRival') return [titlesOf(state, rs, countryId, year), titlesOf(state, rs, c.rival!, year) + 1];
  return [superTitles(state, rs, countryId, year), c.target ?? 1];
}

const GRADES = ['A', 'B', 'C', 'D', 'E'];

/** Rapor akhir musim: rata-rata pencapaian (maks 150% per target) → nilai; ≥ 3 pelanggaran turun satu nilai. */
export function seasonReport(state: SeasonState, rs: Ruleset, countryId: string, goals: FederationGoal[], world?: World): SeasonReport {
  const year = state.date.year;
  const achieved = goals.map((g) => ({
    ...g,
    achieved: goalProgress(state, rs, countryId, g, world),
  }));
  const weights = achieved.map((g) => goalWeight(g, year));
  const ratio = achieved.reduce((s, g, i) => s + weights[i] * Math.min(1.5, g.achieved / Math.max(1, g.target)), 0) / Math.max(1, weights.reduce((a, b) => a + b, 0));
  const violations = state.violations.filter((v) => v.year === year && v.countryId === countryId).length;
  let idx = ratio >= 1 ? 0 : ratio >= 0.8 ? 1 : ratio >= 0.6 ? 2 : ratio >= 0.4 ? 3 : 4;
  if (violations >= 3) idx = Math.min(4, idx + 1);
  const grade = GRADES[idx];
  const ch = state.career?.challenge;
  const challenge = ch && (() => {
    const [now, target] = challengeProgress(state, rs, countryId, ch, year);
    const done = now >= target;
    return { ...ch, done, reputation: done ? CHALLENGE_REWARD : -CHALLENGE_PENALTY };
  })();
  return { year, countryId, goals: achieved, violations, grade, reputationChange: (rs.career.gradeReputation[grade] ?? 0) + (challenge?.reputation ?? 0), ...(challenge && { challenge }) };
}

/**
 * Perkiraan potensi (bintang 0,5–5) yang makin akurat seiring usia & jumlah laga.
 * Galat tetap per atlet (dari id) agar tidak berubah-ubah tiap dibuka. (ASUMSI: sd 15 → 2 poin PA)
 */
export function potentialStars(p: Player, date: { year: number; week: number }, matchesPlayed: number) {
  const { est } = potentialEstimate(p, date, matchesPlayed);
  return Math.max(0.5, Math.min(5, Math.round(est / 10) / 2));
}

/** Perkiraan potensi yang terlihat (bukan PA asli): titik tengah & sebaran yang menyempit dengan usia & jumlah laga. */
export function potentialEstimate(p: Player, date: { year: number; week: number }, matchesPlayed: number) {
  let h = 0;
  for (const ch of p.id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  const unit = ((h >>> 0) % 1000) / 1000 - 0.5; // −0,5..0,5
  const sd = Math.max(2, 15 - (ageAt(p.birth, date) - 15) * 1.2 - matchesPlayed / 30);
  return { est: p.pa + unit * 2 * sd * 1.5, sd };
}

const PEAK_STEPS = [1, 3, 5, 10, 20, 30, 50, 100, 200, 300, 500];
/**
 * Prediksi peringkat puncak [terbaik, terburuk] dari perkiraan potensi (est ± ½ sd): berapa atlet `pool` (aktif segender)
 * yang kemampuannya sekarang di atas level itu, dibulatkan ke PEAK_STEPS (500 = 500 ke bawah).
 */
export function peakRange(p: Player, date: { year: number; week: number }, matchesPlayed: number, pool: Player[]): [number, number] {
  const { est, sd } = potentialEstimate(p, date, matchesPlayed);
  const cas = pool.map((x) => currentAbility(x.attrs));
  const rankAt = (lvl: number) => { const n = cas.filter((c) => c > lvl).length + 1; return PEAK_STEPS.find((s) => s >= n) ?? 500; };
  return [rankAt(Math.min(99, est + sd / 2)), rankAt(est - sd / 2)]; // ½ sd: rentang tetap berguna di usia 15–17
}

const PAIR_GENDERS: Record<Pair['discipline'], string> = { MD: 'MM', WD: 'FF', XD: 'FM' };

/** Bentuk pasangan baru. Mengembalikan pesan galat, atau pasangan baru bila sah. */
export function formPair(
  state: Pick<SeasonState, 'players' | 'pairs' | 'date'>, discipline: Pair['discipline'], aId: string, bId: string, rng: Rng, trial = false,
): Pair | string {
  const a = state.players.find((p) => p.id === aId), b = state.players.find((p) => p.id === bId);
  if (!a || !b || a === b) return t('err_pickTwo');
  if (a.retired !== undefined || b.retired !== undefined) return t('err_retired');
  if (a.countryId !== b.countryId) return t('err_sameCountry');
  if ([a.gender, b.gender].sort().join('') !== PAIR_GENDERS[discipline]) return t('err_gender', { d: discipline });
  const active = state.pairs.filter((p) => p.discipline === discipline && !p.dissolved && !p.adHoc);
  if (active.some((p) => p.playerIds.includes(aId) && p.playerIds.includes(bId))) return t('err_samePair', { d: discipline });
  // Pasangan utama: tiap atlet hanya satu. Pasangan percobaan boleh dibentuk walau atletnya sudah punya pasangan utama.
  if (!trial && active.some((p) => !p.trial && p.playerIds.some((id) => id === aId || id === bId))) return t('err_hasPair', { d: discipline });
  const pair: Pair = {
    id: `${a.countryId}-${discipline}-${state.date.year}w${state.date.week}-${state.pairs.length}`,
    discipline, playerIds: [aId, bId], chemistry: 30 + Math.floor(rng() * 20), matchesTogether: 0, formed: { ...state.date },
    ...(trial ? { trial: true } : {}),
  };
  state.pairs.push(pair);
  return pair;
}

/** Jadikan pasangan percobaan pasangan utama: pasangan utama lama kedua atletnya di nomor ini dibubarkan. */
export function promoteTrial(state: SeasonState, pairId: string) {
  const pair = state.pairs.find((p) => p.id === pairId);
  if (!pair?.trial || pair.dissolved) return;
  for (const p of state.pairs)
    if (p !== pair && p.discipline === pair.discipline && !p.dissolved && !p.trial && p.playerIds.some((id) => pair.playerIds.includes(id)))
      p.dissolved = { ...state.date };
  delete pair.trial;
}

/** Promosikan junior ke pelatnas utama (ikut didaftarkan otomatis ke turnamen senior); `rs` = catat promosi terlalu cepat. */
export function promoteJunior(state: SeasonState, playerId: string, rs?: Ruleset) {
  if (rs) return promote(state, rs, playerId);
  const p = state.players.find((x) => x.id === playerId);
  if (p) p.promoted = true;
}

/**
 * Lepas atlet dari pelatnas: tetap bertanding (diatur AI) tapi tidak lagi dikelola manajer.
 * Pasangan dengan anggota pelatnas dibubarkan; atlet dikeluarkan dari skuad beregu & prioritas tier.
 * `ctx`: atlet langsung dicarikan pasangan independen (bisa beda negara), tanpa menunggu akhir musim.
 */
export function releasePlayer(state: SeasonState, playerId: string, ctx?: { rs: Ruleset; world: World; rng: Rng }) {
  const p = state.players.find((x) => x.id === playerId);
  if (!p || p.released !== undefined) return;
  markReleased(state, p);
  for (const f of Object.keys(state.teamSquads) as TeamFormat[]) state.teamSquads[f] = state.teamSquads[f]!.filter((id) => id !== playerId);
  if (state.tierPrefs) delete state.tierPrefs[playerId];
  if (ctx) pairIndependents(state, ctx.rs, ctx.world, ctx.rng, [playerId]);
}

/** Panggil kembali ke pelatnas: pasangan yang dibentuk AI selama di luar pelatnas dibubarkan (manajer memasangkan lagi). */
export function recallPlayer(state: SeasonState, playerId: string) {
  const p = state.players.find((x) => x.id === playerId);
  if (!p || p.released === undefined) return;
  delete p.released;
  for (const pair of state.pairs) if (!pair.dissolved && pair.playerIds.includes(playerId)) dissolvePair(state, pair.id);
}

/** `byManager`: keputusan manajer (bukan pensiun/cedera/pembersihan otomatis) — kedua atlet kecewa. */
export function dissolvePair(state: SeasonState, pairId: string, byManager = false) {
  const pair = state.pairs.find((p) => p.id === pairId);
  if (!pair || pair.dissolved) return;
  pair.dissolved = { ...state.date };
  if (byManager) for (const id of pair.playerIds) { const p = state.players.find((x) => x.id === id); if (p) bumpForm(p, -DISSOLVE_PENALTY); }
}

/** Target babak manual untuk satu entrant di satu turnamen; `round` kosong = kembali otomatis, 'none' = tanpa target. */
export function setTarget(state: SeasonState, year: number, eventId: string, entrantId: string, round?: Round | 'none') {
  const map = ((state.targets ??= {})[`${year}:${eventId}`] ??= {});
  if (round) map[entrantId] = round; else delete map[entrantId];
}

/** Saran target: posisi 1–2 → final (juara bila unggul ≥ TARGET_FAVORITE_GAP atas posisi 2), 3–4 → SF, 5–8 → QF, 9–16 → R16, 17–32 → R32. ASUMSI. */
export const TARGET_FAVORITE_GAP = 5;
const TARGET_BY_POSITION: [number, Round][] = [[2, 'F'], [4, 'SF'], [8, 'QF'], [16, 'R16'], [32, 'R32']];

/**
 * Target babak realistis untuk entrant manajer di satu turnamen: urutan kekuatan (kemampuan; ganda termasuk chemistry)
 * di antara perkiraan peserta — entrant negara lain yang menurut aturan pilihan AI (rentang ranking per tier) ke
 * turnamen ini, ditambah `mine` (entry manajer). Lebih dari 32 besar = tanpa target.
 */
export function suggestTargets(state: SeasonState, rs: Ruleset, world: World, eventId: string, mine: { id: string; d: Discipline }[]) {
  const out = new Map<string, Round | undefined>();
  const ev = rs.calendar.find((e) => e.id === eventId);
  if (!ev) return out;
  const { year } = state.date;
  const country = state.managedCountryId;
  const tier = (id: string) => rs.tiers.find((x) => x.id === id)!;
  const players = new Map(state.players.map((p) => [p.id, p]));
  const pairs = new Map(state.pairs.map((p) => [p.id, p]));
  const cutoff = absWeek(state.date) - rs.ranking.entryCutoffWeeks;
  const strength = (e: { id: string; playerIds: string[] }) => {
    const ab = e.playerIds.map((id) => currentAbility(players.get(id)!.attrs));
    const pair = pairs.get(e.id);
    return pair ? pairAbility(ab, pair.chemistry, rs.match) : ab[0];
  };
  for (const d of new Set(mine.map((m) => m.d))) {
    const ranks = rankMap(computeRanking(state.results, d, cutoff, rs));
    // Turnamen minggu itu, urut seperti pilihan AI (tier tertinggi dulu).
    const week = rs.calendar.filter((e) => weekOf(e, year) === weekOf(ev, year) && isHeld(e, year) && e.tierId !== 'WTF' && e.tierId !== 'OG' && tier(e.tierId).drawSize[d] > 0)
      .sort((a, b) => tier(b.tierId).points[0] - tier(a.tierId).points[0]);
    const ids = new Set(mine.filter((m) => m.d === d).map((m) => m.id));
    const field = entrantsFor(state, d).filter((e) => ids.has(e.id) || (e.countryId !== country && !e.trial
      && !e.playerIds.some((id) => players.get(id)!.injury)
      && aiEventChoice(week.filter((x) => openTo(x, e.countryId, world)), rs, ranks.get(e.id))?.id === eventId))
      .map((e) => ({ id: e.id, s: strength(e) }))
      .sort((a, b) => b.s - a.s);
    assignTargets(field, ids, out);
  }
  return out;
}

/** Target menurut posisi kekuatan di `field` (urut kuat → lemah) untuk entrant `ids`. */
function assignTargets(field: { id: string; s: number }[], ids: Set<string>, out: Map<string, Round | undefined>) {
  field.forEach((e, i) => {
    if (!ids.has(e.id)) return;
    const round = TARGET_BY_POSITION.find(([n]) => i < n)?.[1];
    out.set(e.id, i === 0 && e.s - (field[1]?.s ?? 0) >= TARGET_FAVORITE_GAP ? 'W' : round);
  });
}

/**
 * Target realistis di turnamen junior. Perkiraan peserta negara lain mengikuti aturan entry junior: atlet U19 sehat
 * (konfederasi turnamen; turnamen lokal: benua tuan rumah), tiap negara maks kuota tunggal/ganda — atlet terkuat, ganda
 * dipasangkan berurutan menurut kemampuan (campuran: putra ke-i + putri ke-i). Kekuatan = rata-rata kemampuan.
 */
export function suggestJuniorTargets(state: SeasonState, rs: Ruleset, world: World, eventId: string, mine: { id: string; d: Discipline; playerIds: string[] }[]) {
  const out = new Map<string, Round | undefined>();
  const ev = rs.calendar.find((e) => e.id === eventId);
  const tier = ev && rs.tiers.find((x) => x.id === ev.tierId);
  if (!ev || !tier?.junior) return out;
  const conf = new Map(world.countries.map((c) => [c.id, c.confederation]));
  const hostConf = conf.get(world.cities.find((c) => c.id === hostCityId(ev, state.date.year))?.countryId ?? '');
  const ca = new Map(state.players.map((p) => [p.id, currentAbility(p.attrs)]));
  const avg = (ids: string[]) => ids.reduce((s, id) => s + (ca.get(id) ?? 0), 0) / ids.length;
  const juniors = state.players.filter((p) => p.retired === undefined && !p.injury && p.countryId !== state.managedCountryId && isJuniorAge(p, state.date)
    && (!ev.confederation || conf.get(p.countryId) === ev.confederation) && (!tier.junior!.local || conf.get(p.countryId) === hostConf));
  const byCountry = new Map<string, Player[]>();
  for (const p of juniors) byCountry.set(p.countryId, [...(byCountry.get(p.countryId) ?? []), p]);
  for (const d of new Set(mine.map((m) => m.d))) {
    const cap = d === 'MS' || d === 'WS' ? tier.junior.quota.singles : tier.junior.quota.doubles;
    const field: { id: string; s: number }[] = mine.filter((m) => m.d === d).map((m) => ({ id: m.id, s: avg(m.playerIds) }));
    for (const [c, ps] of byCountry) {
      const sorted = (g: 'M' | 'F', single: boolean) => ps.filter((p) => p.gender === g && (!single || p.focus !== 'D')).sort((a, b) => ca.get(b.id)! - ca.get(a.id)!);
      const sides: string[][] = d === 'MS' || d === 'WS' ? sorted(d === 'MS' ? 'M' : 'F', true).map((p) => [p.id])
        : d === 'XD' ? sorted('M', false).map((m, i) => [m.id, sorted('F', false)[i]?.id]).filter((x): x is string[] => !!x[1])
        : (() => { const g = sorted(d === 'MD' ? 'M' : 'F', false); return g.slice(0, g.length - (g.length % 2)).flatMap((p, i) => (i % 2 ? [] : [[p.id, g[i + 1].id]])); })();
      sides.slice(0, cap).forEach((ids, i) => field.push({ id: `${c}:${d}:${i}`, s: avg(ids) }));
    }
    field.sort((a, b) => b.s - a.s);
    assignTargets(field, new Set(mine.filter((m) => m.d === d).map((m) => m.id)), out);
  }
  return out;
}

/** Rapor target per entrant (atlet / pasangan) satu musim: jumlah target, tercapai, meleset (≥ 2 babak), urut terbanyak. */
export function targetReport(state: SeasonState, year: number) {
  const by = new Map<string, { id: string; n: number; hit: number; miss: number }>();
  for (const x of state.targetLog ?? []) {
    if (x.year !== year) continue;
    const r = by.get(x.id) ?? { id: x.id, n: 0, hit: 0, miss: 0 };
    r.n++;
    if (x.res === 'hit') r.hit++; else if (x.res === 'miss') r.miss++;
    by.set(x.id, r);
  }
  return [...by.values()].sort((a, b) => b.n - a.n || b.hit / b.n - a.hit / a.n);
}
