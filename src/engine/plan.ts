import { isPratama } from './generator';
import { aiEventChoice, entrantsFor, isHeld, weekKey, type SeasonState } from './season';
import { DISCIPLINES, type Discipline, type Ruleset } from './types';

// Ringkasan rencana musim: perkiraan entry negara manajer untuk satu minggu ke depan.

export interface PlanCell {
  /** id turnamen, 'rest' (istirahat manual), atau null (tidak didaftarkan). */
  eventId: string | null;
  kind: 'manual' | 'required' | 'guess';
  /** Keputusan manual atlet yang sama menunjuk turnamen berbeda di minggu ini. */
  conflict?: boolean;
}

/** Turnamen individu senior minggu itu yang entry-nya diatur manajer (tanpa WTF & junior), tier tertinggi dulu. */
export function plannableEvents(rs: Ruleset, year: number, week: number) {
  const tier = (id: string) => rs.tiers.find((t) => t.id === id)!;
  return rs.calendar.filter((e) => e.week === week && isHeld(e, year) && e.tierId !== 'WTF' && !tier(e.tierId).junior)
    .sort((a, b) => tier(b.tierId).points[0] - tier(a.tierId).points[0]);
}

/**
 * Perkiraan per peserta negara manajer: manual → turnamen wajib → pilihan AI (prioritas tier / rentang ranking).
 * Urutan & pengikatan "satu atlet satu turnamen per minggu" sama dengan `chooseEntries`; peluang ikut & kelelahan
 * tidak dihitung (tidak bisa ditebak jauh hari).
 */
export function predictWeek(state: SeasonState, rs: Ruleset, week: number, ranks: Map<Discipline, Map<string, number>>) {
  const year = state.date.year;
  const events = plannableEvents(rs, year, week);
  const tier = (id: string) => rs.tiers.find((t) => t.id === id)!;
  const manual = state.manualEntries[weekKey({ year, week })] ?? {};
  const players = new Map(state.players.map((p) => [p.id, p]));
  const all = DISCIPLINES.flatMap((d) => entrantsFor(state, d).filter((e) => e.countryId === state.managedCountryId).map((e) => ({ e, d })));
  const isManual = (x: (typeof all)[number]) => manual[x.e.id] !== undefined;
  const playerEvent = new Map<string, string>();
  const out = new Map<string, PlanCell>();
  for (const { e, d } of [...all.filter(isManual), ...all.filter((x) => !isManual(x))]) {
    const fixed = e.playerIds.map((id) => playerEvent.get(id)).find(Boolean);
    const options = events.filter((ev) => tier(ev.tierId).drawSize[d] > 0 && (!fixed || ev.id === fixed));
    const decision = manual[e.id];
    let cell: PlanCell;
    if (decision) cell = { eventId: decision, kind: 'manual' };
    else {
      const required = options.find((ev) => state.commitments[e.id]?.includes(ev.id));
      const auto = !e.trial && !e.playerIds.some((id) => isPratama(players.get(id)!, state.date)); // AI tidak mendaftarkan
      cell = required ? { eventId: required.id, kind: 'required' }
        : { eventId: auto ? aiEventChoice(options, rs, ranks.get(d)!.get(e.id), state.tierPrefs?.[e.id])?.id ?? null : null, kind: 'guess' };
    }
    if (cell.eventId && cell.eventId !== 'rest' && !fixed) e.playerIds.forEach((id) => playerEvent.set(id, cell.eventId!));
    out.set(e.id, cell);
  }
  // Bentrok: keputusan manual seorang atlet ke dua turnamen berbeda di minggu yang sama.
  const manualEvents = new Map<string, Set<string>>();
  for (const { e } of all) {
    const v = manual[e.id];
    if (v && v !== 'rest') for (const id of e.playerIds) manualEvents.set(id, (manualEvents.get(id) ?? new Set()).add(v));
  }
  for (const { e } of all) {
    const v = manual[e.id];
    if (v && v !== 'rest' && e.playerIds.some((id) => manualEvents.get(id)!.size > 1)) out.get(e.id)!.conflict = true;
  }
  return out;
}
