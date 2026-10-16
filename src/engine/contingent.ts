import { currentAbility } from './generator';
import { absWeek, computeRanking } from './ranking';
import { entrantsFor, isHeld, teamStrengths, weekOf, type SeasonState } from './season';
import { DISCIPLINES, type Ruleset, type TournamentDef } from './types';

// Kontingen multi-event: tiap negara mendaftarkan atlet putra/putri sebelum Games; skuad beregu & wakil perorangan
// hanya dari kontingen. Asian Games 10+10 (Hangzhou 2022), SEA Games 10+10, Commonwealth 5+5 (Birmingham 2022),
// Pan American 4+4 (Santiago 2023). ASUMSI: European Games 4+4, African Games 5+5; dikunci 4 minggu sebelum nomor pertama.
export const CONTINGENT_LOCK_WEEKS = 4;

const key = (year: number, id: string) => `${year}:${id.replace(/-team$/, '')}`;

/** Kontingen negara di multi-event (id perorangan atau beregu `x-team`); undefined = belum dikunci / tanpa kontingen. */
export const contingentOf = (state: SeasonState, eventId: string, countryId: string) =>
  state.contingents?.[key(state.date.year, eventId)]?.[countryId];

export const inContingent = (state: SeasonState, eventId: string, countryId: string, playerIds: string[]) => {
  const c = contingentOf(state, eventId, countryId);
  return !c || playerIds.every((id) => c.includes(id));
};

/** Minggu kontingen dikunci: 4 minggu sebelum nomor pertama (beregu atau perorangan). */
export function lockWeek(rs: Ruleset, ev: TournamentDef, year: number) {
  const team = rs.team.events.find((e) => e.id === `${ev.id}-team` && isHeld(e, year));
  return Math.min(weekOf(ev, year), team ? weekOf(team, year) : Infinity) - CONTINGENT_LOCK_WEEKS;
}

/** Multi-event tahun ini yang kontingennya masih bisa dipilih / sudah dikunci tapi belum selesai. */
export const gamesThisYear = (rs: Ruleset, year: number) => rs.calendar.filter((e) => e.contingent && e.countries && isHeld(e, year));

/** Peringkat terbaik tiap atlet di nomor mana pun (pasangan: kedua atlet). */
export function playerBestRanks(state: SeasonState, rs: Ruleset) {
  const now = absWeek(state.date);
  const best = new Map<string, number>();
  for (const d of DISCIPLINES) {
    const ids = new Map(entrantsFor(state, d).map((e) => [e.id, e.playerIds]));
    for (const r of computeRanking(state.results, d, now, rs)) ids.get(r.entrantId)?.forEach((id) => best.set(id, Math.min(best.get(id) ?? Infinity, r.rank)));
  }
  return best;
}

/**
 * Kontingen otomatis per negara: atlet line-up beregu terbaik dulu (lima partai pasti terisi), lalu peringkat
 * terbaik di nomor mana pun (pasangan ikut bersama), lalu kemampuan. Cedera, pensiun & keluar pelatnas dilewati.
 */
export function autoContingents(state: SeasonState, rs: Ruleset, ev: TournamentDef, countries: string[]): Record<string, string[]> {
  const best = playerBestRanks(state, rs);
  const team = rs.team.events.find((e) => e.id === `${ev.id}-team` && isHeld(e, state.date.year));
  const lineups = (team?.formats ?? []).map((f) => teamStrengths(state, rs, f));
  const out: Record<string, string[]> = {};
  for (const c of countries) {
    const players = state.players.filter((p) => p.countryId === c && !p.injury && p.retired === undefined && p.released === undefined)
      .sort((a, b) => (best.get(a.id) ?? Infinity) - (best.get(b.id) ?? Infinity) || currentAbility(b.attrs) - currentAbility(a.attrs));
    const seed = new Set(lineups.flatMap((all) => {
      const t = all.find((x) => x.countryId === c);
      return t ? t.lineup.flatMap((id) => Object.values(t.pool).flat().find((e) => e.id === id)?.playerIds ?? []) : [];
    }));
    out[c] = (['M', 'F'] as const).flatMap((g) => {
      const list = players.filter((p) => p.gender === g);
      return [...list.filter((p) => seed.has(p.id)), ...list.filter((p) => !seed.has(p.id))].slice(0, ev.contingent![g]).map((p) => p.id);
    });
  }
  return out;
}

/** Awal minggu: multi-event yang sudah lewat batas pilih → kontingen negara yang belum memilih diisi otomatis. */
export function lockContingents(state: SeasonState, rs: Ruleset) {
  const { year, week } = state.date;
  for (const ev of gamesThisYear(rs, year)) {
    if (week < lockWeek(rs, ev, year) || week > weekOf(ev, year)) continue;
    const map = ((state.contingents ??= {})[key(year, ev.id)] ??= {});
    const missing = ev.countries!.filter((c) => !map[c]);
    if (missing.length) Object.assign(map, autoContingents(state, rs, ev, missing));
  }
}

/** Kontingen pilihan manajer (sebelum dikunci). */
export function setContingent(state: SeasonState, eventId: string, year: number, countryId: string, ids: string[]) {
  ((state.contingents ??= {})[key(year, eventId)] ??= {})[countryId] = ids;
}
