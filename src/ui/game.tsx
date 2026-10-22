import { WORLD } from '../engine/presets/world';
import { createContext, useContext } from 'react';
import { INJURY_TYPES } from '../engine/development';
import { writeSave } from '../db/saves';
import { PRESETS, syncOfficialCalendar, withDefaults } from '../engine/pack';
import { BWF_2026 } from '../engine/presets/bwf2026';
import { dataName, t } from '../i18n';
import { makeRng, type Rng } from '../engine/rng';
import { ensureRankWeeks, playWeek, teamFormatsIn, weekOf, type SeasonState, type WeekHooks } from '../engine/season';
import { isJuniorFormat, type Ruleset, type Tier, type SaveMeta, type World } from '../engine/types';

// Satu permainan aktif (save yang sedang dimainkan). Engine mengubah `state` di tempat; `version` memicu render ulang.

export interface Game {
  meta: SaveMeta;
  state: SeasonState;
  ruleset: Ruleset;
  world: World;
  rng: Rng;
}

/** Pengaturan yang belum ada di save lama diisi nilai preset (Ruleset bertambah tiap fase). */
export function gameFromBlob(meta: SaveMeta, blob: { state: SeasonState; ruleset: Ruleset; world: World; rngState: number }): Game {
  const preset = PRESETS.find((r) => r.id === blob.ruleset.id) ?? BWF_2026;
  blob.state.teamResults ??= []; // save sebelum Fase 9
  blob.state.teamLineups ??= {};
  blob.state.teamSquads ??= {};
  blob.state.earnings ??= {};
  blob.state.eventRecords ??= []; // save sebelum halaman turnamen: bagan disusun dari daftar laga
  blob.state.juniorResults ??= []; // save sebelum turnamen junior
  // Save sebelum 4 tingkat cedera: ringan/berat → tingkat + jenis cedera bawaan.
  for (const p of blob.state.players)
    if (p.injury && !p.injury.level) {
      p.injury.level = p.injury.severe ? 'severe' : 'minor';
      p.injury.type = INJURY_TYPES[p.injury.level][0];
      delete p.injury.severe;
    }
  // Save sebelum turnamen junior: tambahkan tier & event junior dari preset (event lain di kalender tidak diubah).
  for (const tier of preset.tiers.filter((x) => x.junior && !blob.ruleset.tiers.some((y) => y.id === x.id))) blob.ruleset.tiers.push(structuredClone(tier));
  const juniorTiers = new Set(preset.tiers.filter((x) => x.junior).map((x) => x.id));
  for (const e of preset.calendar.filter((x) => juniorTiers.has(x.tierId) && !blob.ruleset.calendar.some((y) => y.id === x.id))) blob.ruleset.calendar.push({ ...e });
  // ponytail: save sebelum nama resmi kejuaraan kontinental → ambil nama dari preset (hanya nama lama bawaan "Kejuaraan Beregu …").
  for (const e of blob.ruleset.team?.events ?? []) {
    const p = preset.team.events.find((x) => x.id === e.id);
    if (p && e.name.startsWith('Kejuaraan Beregu ')) Object.assign(e, { name: p.name, nameMixed: p.nameMixed });
    if (p && e.qualifiers === undefined && p.qualifiers) e.qualifiers = p.qualifiers; // kuota kontinental (Asia & Eropa 4)
  }
  for (const r of blob.state.teamResults) r.squads ??= {};
  // Save sebelum kualifikasi Olimpiade (LA28): draw & grup Olimpiade dari preset, tanpa kuota negara lama.
  const ogPreset = preset.tiers.find((x) => x.id === 'OG'), ogSaved = blob.ruleset.tiers.find((x) => x.id === 'OG');
  if (ogPreset && ogSaved?.countryQuota && ogSaved.drawSize.MS === 48) {
    Object.assign(ogSaved, { drawSize: { ...ogPreset.drawSize }, groupStage: structuredClone(ogPreset.groupStage) });
    delete ogSaved.countryQuota;
  }
  // Save sebelum multi-event (Asian Games, SEA Games, dll.): tambahkan tier, turnamen & beregu-nya dari preset.
  for (const tier of preset.tiers.filter((x) => x.id === 'MSG' && !blob.ruleset.tiers.some((y) => y.id === x.id))) blob.ruleset.tiers.push(structuredClone(tier));
  for (const e of preset.calendar.filter((x) => x.countries && !blob.ruleset.calendar.some((y) => y.id === x.id))) blob.ruleset.calendar.push(structuredClone(e));
  // Nomor perorangan multi-event bernama "... Individual" (pasangan dari "... Team"); nama lama bawaan ikut diganti.
  for (const e of blob.ruleset.calendar) {
    const p = e.countries && preset.calendar.find((x) => x.id === e.id);
    if (p && `${e.name} Individual` === p.name) e.name = p.name;
    if (p?.contingent && !e.contingent) e.contingent = { ...p.contingent }; // save sebelum kontingen
  }
  for (const e of preset.team.events.filter((x) => x.countries && !blob.ruleset.team.events.some((y) => y.id === x.id))) blob.ruleset.team.events.push(structuredClone(e));
  // Save sebelum kejuaraan individu kontinental: tambah tier & turnamennya (musim ini bila minggunya belum lewat).
  for (const tier of preset.tiers.filter((x) => CONTINENTAL_TIERS.has(x.id) && !blob.ruleset.tiers.some((y) => y.id === x.id))) blob.ruleset.tiers.push(structuredClone(tier));
  for (const e of preset.calendar.filter((x) => CONTINENTAL_TIERS.has(x.tierId) && !blob.ruleset.calendar.some((y) => y.id === x.id))) blob.ruleset.calendar.push(structuredClone(e));
  // Tahun mulai: juara pertamanya, atau musim ini (musim depan bila minggunya sudah lewat) — tahun-tahun sebelum save
  // mendapat turnamen ini tidak menampilkannya di kalender. Juga memperbaiki save yang sudah ditambah tanpa `years`.
  for (const e of blob.ruleset.calendar.filter((x) => CONTINENTAL_TIERS.has(x.tierId) && !x.years)) {
    const { year, week } = blob.state.date;
    const first = Math.min(...blob.state.champions.filter((c) => c.tournamentId === e.id).map((c) => c.year));
    const from = Number.isFinite(first) ? first : weekOf(e, year) < week ? year + 1 : year;
    if (from > blob.ruleset.startYear) e.years = { from };
  }
  for (const [id, r] of Object.entries(preset.ai.rankRange)) blob.ruleset.ai.rankRange[id] ??= r;
  for (const [id, p] of Object.entries(preset.ai.playProb)) blob.ruleset.ai.playProb[id] ??= p;
  // Save sebelum tuan rumah per tahun: tambah kota baru & salin `hosts`/`rotation` dari preset (kecuali kota event diubah di Editor).
  for (const c of WORLD.cities) if (!blob.world.cities.some((x) => x.id === c.id)) blob.world.cities.push({ ...c });
  for (const e of [...blob.ruleset.calendar, ...(blob.ruleset.team?.events ?? [])]) {
    const p = [...preset.calendar, ...preset.team.events].find((x) => x.id === e.id);
    if ('finals' in (p ?? {}) && !('finals' in e)) (e as { finals?: unknown }).finals = structuredClone((p as { finals?: unknown }).finals); // save sebelum fase grup kontinental
    if (p?.hosts && !e.hosts && e.cityId === p.cityId) Object.assign(e, { hosts: { ...p.hosts }, rotation: p.rotation && [...p.rotation] });
    // Save sebelum kalender per tahun: jadwal resmi preset untuk tahun-tahun yang belum dimainkan.
    for (const [y, w] of Object.entries(p?.weeks ?? {})) if (Number(y) > blob.state.date.year && e.weeks?.[y] === undefined) (e.weeks ??= {})[y] = w;
  }
  // Save sebelum kalender resmi BWF (World Tour 2026–28 & Continental Circuit 2026): berlaku mulai musim depan.
  if (PRESETS.some((r) => r.id === blob.ruleset.id)) syncOfficialCalendar(blob.ruleset.calendar, preset.calendar, blob.state.date.year);
  // Save sebelum Suhandinata Cup: tambahkan event beregu junior dari preset.
  for (const e of preset.team.events.filter((x) => x.formats?.some(isJuniorFormat))) {
    const saved = blob.ruleset.team.events.find((y) => y.id === e.id);
    if (!saved) blob.ruleset.team.events.push({ ...e });
    else saved.finals ??= e.finals;
  }
  // Save dengan id pasangan ganda (bug pembentukan pasangan AI di akhir musim): pasangan yang lebih baru diberi id baru.
  const seenPairs = new Set<string>();
  for (const p of blob.state.pairs) {
    if (seenPairs.has(p.id)) { let n = 2; while (seenPairs.has(`${p.id}-${n}`)) n++; p.id = `${p.id}-${n}`; }
    seenPairs.add(p.id);
  }
  if (!blob.state.juniorPromotion) {
    // Save sebelum promosi junior: junior yang sudah pernah main di turnamen senior langsung pelatnas utama.
    const pairIds = new Map(blob.state.pairs.map((p) => [p.id, p.playerIds]));
    const played = new Set(blob.state.matches.flatMap((m) => m.sides.flatMap((x) => pairIds.get(x) ?? [x])));
    for (const p of blob.state.players) if (played.has(p.id)) p.promoted = true;
    blob.state.juniorPromotion = true;
  }
  // Save sebelum rentang entry AI grade 3 yang realistis: rentang bawaan lama IC/IS/FS diganti preset (ubahan Editor dibiarkan).
  const range = blob.ruleset.ai?.rankRange;
  const OLD = { IC: [25, 400], IS: [40, 9999], FS: [60, 9999] } as const;
  if (range) for (const k of ['IC', 'IS', 'FS'] as const)
    if (range[k]?.[0] === OLD[k][0] && range[k]?.[1] === OLD[k][1] && preset.ai.rankRange[k]) range[k] = [...preset.ai.rankRange[k]];
  // Save sebelum unforced error menentukan reli: nilai strategi bawaan lama (risiko 0,03/0,03/0,04) diganti hasil
  // kalibrasi baru dari preset (ubahan Editor dibiarkan).
  const strat = blob.ruleset.match?.strategies;
  if (strat && !blob.ruleset.match.ownError && strat.attacking?.error === 0.03 && strat.fast?.error === 0.03 && strat.deceptive?.error === 0.04)
    blob.ruleset.match.strategies = structuredClone(preset.match.strategies);
  // Save sebelum aturan wildcard GCR 7.11 (grade 3, S300, S100) & slot qualifier S100 MS: ambil dari preset bila belum diatur.
  for (const tier of blob.ruleset.tiers) {
    const p = preset.tiers.find((x) => x.id === tier.id);
    if (p?.wildcardOnlyIfHostAbsent && tier.wildcardOnlyIfHostAbsent === undefined)
      Object.assign(tier, { wildcardOnlyIfHostAbsent: true, zeroPointsForR1WildcardLoss: p.zeroPointsForR1WildcardLoss });
    if (p?.qualifierSlots && !tier.qualifierSlots) tier.qualifierSlots = { ...p.qualifierSlots };
  }
  const ruleset = withDefaults(blob.ruleset, preset);
  // Save sebelum minggu di peringkat: isi dari snapshot + minggu berjalan, agar langsung tampil tanpa menunggu minggu berikutnya.
  ensureRankWeeks(blob.state, ruleset);
  return { meta, state: blob.state, ruleset, world: blob.world, rng: makeRng(blob.rngState) };
}

export async function saveGame(g: Game) {
  g.meta = { ...g.meta, date: { ...g.state.date }, countryId: g.state.career?.countryId ?? null, updatedAt: Date.now() };
  await writeSave(g.meta, { id: g.meta.id, state: g.state, ruleset: g.ruleset, world: g.world, rngState: g.rng.state() });
}

export { JUNIOR_MAX_AGE } from '../engine/generator';

export async function advance(g: Game, weeks: number, hooks: WeekHooks = {}) {
  for (let i = 0; i < weeks; i++) await playWeek(g.state, g.ruleset, g.world, g.rng, hooks);
}

export interface GameCtx {
  game: Game;
  version: number;
  /** Panggil setelah mengubah state (entry manual, pasangan, ...) agar UI diperbarui & disimpan. */
  changed: () => void;
}

export const GameContext = createContext<GameCtx | null>(null);
export const useGame = () => useContext(GameContext)!;

const lookups = new WeakMap<SeasonState, { n: number; players: Map<string, SeasonState['players'][number]>; pairs: Map<string, SeasonState['pairs'][number]> }>();

/** Peta id → atlet/pasangan, di-cache per state (dibuat ulang bila jumlahnya berubah). */
export function lookup(state: SeasonState) {
  let c = lookups.get(state);
  const n = state.players.length + state.pairs.length;
  if (!c || c.n !== n) {
    c = { n, players: new Map(state.players.map((p) => [p.id, p])), pairs: new Map(state.pairs.map((p) => [p.id, p])) };
    lookups.set(state, c);
  }
  return c;
}

/** Nama turnamen individu atau kejuaraan beregu (kejuaraan kontinental bernama lain di tahun Sudirman Cup). */
/** Kejuaraan individu kontinental senior (Asia, Eropa, Pan Am, Afrika & Oseania). */
const CONTINENTAL_TIERS = new Set(['CCA', 'CCE', 'CCP', 'CCI']);
/** Label tier untuk tampilan: multi-event (tier MSG) & kejuaraan kontinental ditulis lengkap. */
export const tierLabel = (id: string) => (id === 'MSG' ? t('multiEvent') : CONTINENTAL_TIERS.has(id) ? t('continental') : id);
/** Kode tier junior seperti di kalender BWF (Junior International Grand Prix = IGP, dst.). */
const JUNIOR_CODE: Record<string, string> = { JGP: 'IGP', JIC: 'IC', JIS: 'IS', JC2: 'JC' };
/** Kelompok tier untuk tampilan, urut dari yang tertinggi (lihat TierBadge). */
export const TIER_GROUPS = ['g1', 'msg', 'cont', 'g2', 'g3', 'junior'] as const;
/** Urutan & label filter kalender: Grade 1–3, lalu Multi-sport, Continental, Junior (urutan gelar di profil tetap TIER_GROUPS). */
export const CAL_GROUPS = ['g1', 'g2', 'g3', 'msg', 'cont', 'junior'] as const;
export const groupLabel = (g: string) => g === 'all' ? t('all') : g === 'g1' ? t('gradeN', { n: 1 }) : g === 'g2' ? t('gradeN', { n: 2 }) : g === 'g3' ? t('gradeN', { n: 3 })
  : g === 'msg' ? t('multiSport') : g === 'cont' ? t('continental') : t('juniorShort');
type TeamLike = { countries?: string[]; games?: true; confederation?: string };
/** Multi-sport Games: Olimpiade & multi-event (Asian Games, SEA Games, ...), individu maupun beregu. */
export const tierGroup = (tier?: Tier, team?: TeamLike): (typeof TIER_GROUPS)[number] =>
  tier?.id === 'OG' || tier?.id === 'MSG' || team?.countries || team?.games ? 'msg'
    : team?.confederation || CONTINENTAL_TIERS.has(tier?.id ?? '') ? 'cont' // kejuaraan kontinental (konfederasi, bukan BWF): bukan Major Events
    : team || tier?.id === 'WJC' || (tier?.grade === 1 && tier.id !== 'WTF') ? 'g1' : tier?.junior ? 'junior' : tier?.grade === 3 ? 'g3' : 'g2';
/**
 * Badge tier: kelompok kecil (Grade 1/2/3/Junior) di atas kode besar, warna per kelompok.
 * Grade 1 = Major Events BWF (Kejuaraan Dunia senior & junior, beregu BWF); Multi-sport Games & Continental (konfederasi) terpisah; WTF ikut Grade 2 bersama World Tour.
 */
export function TierBadge({ tierId, team }: { tierId?: string; team?: TeamLike }) {
  const tier = useGame().game.ruleset.tiers.find((x) => x.id === tierId);
  const group = tierGroup(tier, team);
  const [label, code] = group === 'msg' ? [t('multiSport'), t('msgGames')]
    : group === 'g1' ? [t('gradeN', { n: 1 }), t('major')]
    : group === 'cont' ? [t('continental'), team ? t('teamShort') : t('individual')]
    : group === 'junior' ? [t('juniorShort'), JUNIOR_CODE[tier!.id] ?? tier!.id]
    : [t('gradeN', { n: group === 'g3' ? 3 : 2 }), tierId ?? ''];
  return <span className={`tierb ${group}`} title={tier ? dataName(tier.name) : undefined}><small>{label}</small><b>{code}</b></span>;
}
/** Label event beregu: beregu multi-event (Asian Games Team dll.) ikut tier "Multi-event", selain itu "Tim". */
export const teamLabel = (e?: { countries?: string[]; games?: true }) => (e?.countries || e?.games ? t('multiEvent') : t('teamShort'));

export function eventName(ruleset: Ruleset, id: string, year?: number) {
  const team = ruleset.team.events.find((e) => e.id === id);
  if (!team) return dataName(ruleset.calendar.find((e) => e.id === id)?.name);
  const mixed = year !== undefined && teamFormatsIn(ruleset, year).includes('sudirman');
  return (mixed && team.nameMixed) || team.name;
}

/** Nama tampilan peserta (atlet atau pasangan) + negaranya. */
export function entrantLabel(state: SeasonState, id: string) {
  const { players, pairs } = lookup(state);
  const ps = (pairs.get(id)?.playerIds ?? [id]).map((x) => players.get(x));
  if (!ps[0]) return { name: id, country: '' };
  return { name: ps.map((p) => p?.name).join(' / '), country: ps[0].countryId };
}
