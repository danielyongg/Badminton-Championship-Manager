import { describe, expect, it } from 'vitest';
import { BWF_2026 } from './presets/bwf2026';
import { WORLD } from './presets/world';
import { plannableEvents, predictWeek } from './plan';
import { absWeek, computeRanking, rankMap } from './ranking';
import { entrantsFor, newSeason, weekKey } from './season';
import { DISCIPLINES } from './types';

describe('perkiraan rencana musim', () => {
  const rs = BWF_2026;
  const state = newSeason(WORLD, rs, 7, undefined, 'INA');
  const ranks = new Map(DISCIPLINES.map((d) => [d, rankMap(computeRanking(state.results, d, absWeek(state.date), rs))]));
  // Minggu dengan ≥ 2 turnamen yang bisa diatur, dan turnamen pertama membuka MS & XD.
  const week = rs.calendar.map((e) => e.week).find((w) => plannableEvents(rs, 2026, w).length >= 2)!;
  const [top, low] = plannableEvents(rs, 2026, week);
  const ms = entrantsFor(state, 'MS').find((e) => e.countryId === 'INA')!;
  const xd = entrantsFor(state, 'XD').find((e) => e.countryId === 'INA' && !e.trial)!;
  const key = weekKey({ year: 2026, week });
  const reset = () => { state.manualEntries = {}; state.commitments = {}; state.tierPrefs = {}; };

  it('urutan: manual → wajib → prioritas tier', () => {
    reset();
    state.tierPrefs = { [ms.id]: [low.tierId] };
    expect(predictWeek(state, rs, week, ranks).get(ms.id)).toEqual({ eventId: low.id, kind: 'guess' });
    state.commitments[ms.id] = [top.id];
    expect(predictWeek(state, rs, week, ranks).get(ms.id)).toEqual({ eventId: top.id, kind: 'required' });
    state.manualEntries[key] = { [ms.id]: 'rest' };
    expect(predictWeek(state, rs, week, ranks).get(ms.id)).toEqual({ eventId: 'rest', kind: 'manual' });
  });

  it('satu atlet satu turnamen per minggu & bentrok manual', () => {
    reset();
    const shared = entrantsFor(state, 'XD').find((e) => e.countryId === 'INA' && !e.trial && e.playerIds.includes(ms.id)) ?? xd;
    const player = shared.playerIds.find((id) => id === ms.id) ? ms : entrantsFor(state, 'MS').find((e) => shared.playerIds.includes(e.id))!;
    // Pasangan mau kedua tier; atletnya hanya `low` → pasangan ikut terikat ke `low`, bukan `top`.
    state.tierPrefs = { [shared.id]: [top.tierId, low.tierId], [player.id]: [low.tierId] };
    expect(predictWeek(state, rs, week, ranks).get(shared.id)?.eventId).toBe(low.id);
    state.manualEntries[key] = { [player.id]: top.id };
    expect(predictWeek(state, rs, week, ranks).get(shared.id)?.eventId).toBe(top.id); // ikut turnamen atletnya
    state.manualEntries[key] = { [player.id]: top.id, [shared.id]: low.id };
    const out = predictWeek(state, rs, week, ranks);
    expect(out.get(player.id)?.conflict).toBe(true);
    expect(out.get(shared.id)?.conflict).toBe(true);
  });
});
