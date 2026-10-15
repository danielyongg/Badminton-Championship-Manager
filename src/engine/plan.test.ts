import { describe, expect, it } from 'vitest';
import { BWF_2026 } from './presets/bwf2026';
import { WORLD } from './presets/world';
import { plannableEvents, planWeek } from './plan';
import { entrantsFor, newSeason, weekKey } from './season';

describe('rencana musim', () => {
  const rs = BWF_2026;
  const state = newSeason(WORLD, rs, 7, undefined, 'INA');
  // Minggu dengan ≥ 2 turnamen yang bisa diatur.
  const week = rs.calendar.map((e) => e.week).find((w) => plannableEvents(rs, 2026, w).length >= 2)!;
  const [top, low] = plannableEvents(rs, 2026, week);
  const key = weekKey({ year: 2026, week });
  const xd = entrantsFor(state, 'XD').find((e) => e.countryId === 'INA' && !e.trial && entrantsFor(state, 'MS').some((m) => e.playerIds.includes(m.id)))!;
  const ms = entrantsFor(state, 'MS').find((m) => xd.playerIds.includes(m.id))!;
  const reset = () => { state.manualEntries = {}; state.commitments = {}; };

  it('urutan: manual → turnamen wajib → otomatis', () => {
    reset();
    expect(planWeek(state, rs, week).get(ms.id)).toEqual({ eventId: null, kind: 'auto' });
    state.commitments[ms.id] = [top.id];
    expect(planWeek(state, rs, week).get(ms.id)).toEqual({ eventId: top.id, kind: 'required' });
    state.manualEntries[key] = { [ms.id]: 'rest' };
    expect(planWeek(state, rs, week).get(ms.id)).toEqual({ eventId: 'rest', kind: 'manual' });
  });

  it('satu atlet satu turnamen per minggu & bentrok manual', () => {
    reset();
    state.commitments[xd.id] = [low.id];
    expect(planWeek(state, rs, week).get(xd.id)?.eventId).toBe(low.id);
    state.manualEntries[key] = { [ms.id]: top.id }; // atletnya dikunci ke turnamen lain → wajib XD tidak bisa
    expect(planWeek(state, rs, week).get(xd.id)).toEqual({ eventId: null, kind: 'auto' });
    state.manualEntries[key] = { [ms.id]: top.id, [xd.id]: low.id };
    const out = planWeek(state, rs, week);
    expect(out.get(ms.id)?.conflict).toBe(true);
    expect(out.get(xd.id)?.conflict).toBe(true);
  });
});
