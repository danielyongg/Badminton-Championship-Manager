import { describe, expect, it } from 'vitest';
import { contingentOf, lockContingents, lockWeek, setContingent } from './contingent';
import { BWF_2026 } from './presets/bwf2026';
import { WORLD } from './presets/world';
import { makeRng } from './rng';
import { newSeason, playWeek } from './season';

describe('kontingen multi-event', () => {
  const ag = BWF_2026.calendar.find((e) => e.id === 'asian-games')!;

  it('dikunci 4 minggu sebelum nomor pertama; maks putra/putri; pilihan manajer dipertahankan', () => {
    const state = newSeason(WORLD, BWF_2026, 1);
    const lock = lockWeek(BWF_2026, ag, 2026);
    expect(lock).toBe(38 - 4); // beregu minggu 38
    const mine = state.players.filter((p) => p.countryId === 'INA' && p.gender === 'M').slice(0, 3).map((p) => p.id);
    setContingent(state, ag.id, 2026, 'INA', mine);
    state.date = { year: 2026, week: lock - 1 };
    lockContingents(state, BWF_2026);
    expect(contingentOf(state, ag.id, 'CHN')).toBeUndefined();
    state.date.week = lock;
    lockContingents(state, BWF_2026);
    expect(contingentOf(state, 'asian-games-team', 'INA')).toEqual(mine);
    const gender = new Map(state.players.map((p) => [p.id, p.gender]));
    for (const c of ag.countries!) {
      const ids = contingentOf(state, ag.id, c)!;
      for (const g of ['M', 'F'] as const) expect(ids.filter((id) => gender.get(id) === g).length).toBeLessThanOrEqual(10);
    }
  });

  it('skuad beregu & peserta perorangan Asian Games hanya dari kontingen', async () => {
    const state = newSeason(WORLD, BWF_2026, 2);
    state.date = { year: 2026, week: 34 };
    const rng = makeRng(3);
    for (let w = 34; w <= 39; w++) await playWeek(state, BWF_2026, WORLD, rng);
    const team = state.teamResults.filter((r) => r.eventId === 'asian-games-team');
    expect(team.length).toBe(2);
    for (const r of team) for (const [c, squad] of Object.entries(r.squads)) expect(squad.every((id) => contingentOf(state, ag.id, c)!.includes(id)), c).toBe(true);
    const country = new Map(state.players.map((p) => [p.id, p.countryId]));
    const pids = new Map<string, string[]>([...state.players.map((p) => [p.id, [p.id]] as [string, string[]]), ...state.pairs.map((p) => [p.id, p.playerIds] as [string, string[]])]);
    const matches = state.matches.filter((m) => m.tournamentId === ag.id);
    expect(matches.length).toBeGreaterThan(0);
    for (const m of matches) for (const side of m.sides) for (const id of pids.get(side)!) expect(contingentOf(state, ag.id, country.get(id)!)).toContain(id);
  });
});
