import { BWF_2026 } from './presets/bwf2026';
import { BWF_2027 } from './presets/bwf2027';
import { realRoster } from './presets/realPlayers';
import { WORLD } from './presets/world';
import { ATTRS, DISCIPLINES, ROUNDS, type Confederation, type Pair, type Player, type Ruleset, type TournamentDef, type World } from './types';
import { t } from '../i18n';

// Paket data = semua yang bisa diedit di Editor & diimpor/ekspor sebagai satu file JSON:
// ruleset (tier, kalender, aturan), dunia (negara & kota), dan atlet/pasangan buatan sendiri.
// Negara tanpa atlet di paket diisi atlet fiktif oleh generator saat New Game.

export interface DataPack {
  id: string;
  name: string;
  updatedAt: number;
  ruleset: Ruleset;
  world: World;
  players: Player[];
  pairs: Pair[];
}

export const PRESETS = [BWF_2026, BWF_2027];
export const CONFEDERATIONS: Confederation[] = ['BA', 'BE', 'BAM', 'BCA', 'BO'];

/** Paket bawaan (hanya-baca): preset ruleset + dunia bawaan + atlet asli (kekurangan diisi atlet fiktif saat New Game). */
export const presetPack = (rs: Ruleset): DataPack =>
  ({ id: `preset-${rs.id}`, name: rs.name, updatedAt: 0, ruleset: rs, world: WORLD, ...realRoster(rs.startYear) });

/** Isi pengaturan yang tidak ada dengan nilai bawaan (objek digabung per kunci; array & nilai lain diambil utuh). */
export function withDefaults<T>(saved: T, defaults: T): T {
  if (Array.isArray(defaults) || typeof defaults !== 'object' || defaults === null) return saved ?? defaults;
  const out = { ...defaults, ...saved } as Record<string, unknown>;
  for (const k of Object.keys(defaults)) out[k] = withDefaults((saved as Record<string, unknown>)?.[k], (defaults as Record<string, unknown>)[k]);
  return out as T;
}

/**
 * Hasil JSON.parse → paket lengkap. Bagian yang tidak ada diisi bawaan (ruleset dari preset dengan id sama,
 * atau BWF 2026), sehingga file berisi sebagian data saja (mis. hanya atlet) tetap bisa diimpor.
 */
export function normalizePack(raw: unknown): DataPack {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error(t('v_notPack'));
  const r = raw as Partial<DataPack>;
  const base = PRESETS.find((p) => p.id === r.ruleset?.id) ?? BWF_2026;
  const ruleset = withDefaults(r.ruleset as Ruleset, base);
  return {
    id: r.id ?? '',
    name: r.name ?? ruleset.name,
    updatedAt: r.updatedAt ?? 0,
    ruleset,
    world: { countries: r.world?.countries ?? WORLD.countries, cities: r.world?.cities ?? WORLD.cities },
    // Nilai bawaan ditambahkan di belakang agar urutan kunci file asli tidak berubah (round-trip identik).
    players: ((r.players ?? []) as Partial<Player>[]).map((p) => ({ ...p, hand: p.hand ?? 'R', form: p.form ?? 0, fatigue: p.fatigue ?? 0, attrHistory: p.attrHistory ?? [] }) as Player),
    pairs: ((r.pairs ?? []) as Partial<Pair>[]).map((p) => ({ ...p, chemistry: p.chemistry ?? 50, matchesTogether: p.matchesTogether ?? 0, formed: p.formed ?? { year: ruleset.startYear, week: 1 } }) as Pair),
  };
}

const PAIR_GENDERS: Record<Pair['discipline'], string> = { MD: 'MM', WD: 'FF', XD: 'FM' };
const inRange = (n: unknown, lo: number, hi: number) => typeof n === 'number' && n >= lo && n <= hi;

/** Pemeriksaan isi & rujukan antar-data. Kosong = sah. */
const venues = (e: Pick<TournamentDef, 'cityId' | 'hosts' | 'rotation'>) => [e.cityId, ...Object.values(e.hosts ?? {}), ...(e.rotation ?? [])];

export function validatePack(p: Pick<DataPack, 'ruleset' | 'world' | 'players' | 'pairs'>): string[] {
  const errs: string[] = [];
  const unique = (what: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (!id) errs.push(`${what}: ${t('v_emptyId')}`);
      else if (seen.has(id)) errs.push(`${what}: ${t('v_dupId', { id })}`);
      seen.add(id);
    }
    return seen;
  };
  const { ruleset: rs, world } = p;
  const countries = unique(t('country'), world.countries.map((c) => c.id));
  const cities = unique(t('city'), world.cities.map((c) => c.id));
  const tiers = unique(t('tier'), rs.tiers.map((t) => t.id));
  unique(t('tournament'), [...rs.calendar.map((e) => e.id), ...rs.team.events.map((e) => e.id)]);

  for (const c of world.countries) {
    if (!CONFEDERATIONS.includes(c.confederation)) errs.push(`${t('country')} ${c.id}: ${t('v_confed', { c: c.confederation })}`);
    if (!inRange(c.traditionStrength, 1, 100)) errs.push(`${t('country')} ${c.id}: ${t('v_tradition')}`);
  }
  for (const c of world.cities) {
    if (!countries.has(c.countryId)) errs.push(`${t('city')} ${c.id}: ${t('v_country', { c: c.countryId })}`);
    if (!inRange(c.lat, -90, 90) || !inRange(c.lon, -180, 180)) errs.push(`${t('city')} ${c.id}: ${t('v_coords')}`);
  }
  for (const x of rs.tiers) {
    for (const [what, table] of [[t('points'), x.points], [`${t('prize')} ${t('singles')}`, x.prizeSplit.singles], [`${t('prize')} ${t('doubles')}`, x.prizeSplit.doubles]] as const)
      if (table.length !== ROUNDS.length || table.some((v) => typeof v !== 'number')) errs.push(`${t('tier')} ${x.id}: ${t('v_table', { what, n: ROUNDS.length })}`);
    for (const d of DISCIPLINES) if (!inRange(x.drawSize[d], 0, 256)) errs.push(`${t('tier')} ${x.id}: ${t('v_drawSize', { d })}`);
  }
  for (const e of rs.calendar) {
    for (const c of venues(e)) if (!cities.has(c)) errs.push(`${t('tournament')} ${e.id}: ${t('v_city', { c })}`);
    if (!tiers.has(e.tierId)) errs.push(`${t('tournament')} ${e.id}: ${t('v_tierRef', { tier: e.tierId })}`);
    if (![e.week, ...Object.values(e.weeks ?? {})].every((w) => inRange(w, 1, 52))) errs.push(`${t('tournament')} ${e.id}: ${t('v_week')}`);
  }
  for (const e of rs.team.events) {
    for (const c of venues(e)) if (!cities.has(c)) errs.push(`${t('tabTeam')} ${e.id}: ${t('v_city', { c })}`);
    if (![e.week, ...Object.values(e.weeks ?? {})].every((w) => inRange(w, 1, 52))) errs.push(`${t('tabTeam')} ${e.id}: ${t('v_week')}`);
  }

  const players = new Map(p.players.map((x) => [x.id, x]));
  unique(t('athlete'), p.players.map((x) => x.id));
  for (const x of p.players) {
    if (!countries.has(x.countryId)) errs.push(`${t('athlete')} ${x.name}: ${t('v_country', { c: x.countryId })}`);
    if (x.gender !== 'M' && x.gender !== 'F') errs.push(`${t('athlete')} ${x.name}: ${t('v_genderMF')}`);
    if (ATTRS.some((a) => !inRange(x.attrs?.[a], 1, 100)) || !inRange(x.pa, 1, 100)) errs.push(`${t('athlete')} ${x.name}: ${t('v_attrs')}`);
  }
  unique(t('pair'), p.pairs.map((x) => x.id));
  const busy = new Set<string>();
  for (const x of p.pairs) {
    const [a, b] = x.playerIds.map((id) => players.get(id));
    if (!a || !b) { errs.push(`${t('pair')} ${x.id}: ${t('v_pairMissing')}`); continue; }
    if (a.countryId !== b.countryId) errs.push(`${t('pair')} ${x.id}: ${t('v_pairCountry')}`);
    if ([a.gender, b.gender].sort().join('') !== PAIR_GENDERS[x.discipline]) errs.push(`${t('pair')} ${x.id}: ${t('v_pairGender', { d: x.discipline })}`);
    if (x.dissolved || x.trial || x.adHoc) continue; // pasangan percobaan boleh berbagi atlet dengan pasangan utama
    for (const id of x.playerIds) {
      if (busy.has(`${x.discipline}:${id}`)) errs.push(`${t('pair')} ${x.id}: ${t('v_pairBusy', { name: players.get(id)!.name, d: x.discipline })}`);
      busy.add(`${x.discipline}:${id}`);
    }
  }
  return errs;
}
