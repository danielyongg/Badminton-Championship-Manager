import { describe, expect, it } from 'vitest';
import { ageAt, isJuniorAge } from './generator';
import { BWF_2026 } from './presets/bwf2026';
import { BWF_2027 } from './presets/bwf2027';
import { WORLD } from './presets/world';
import { absWeek, computeRanking } from './ranking';
import { makeRng } from './rng';
import { entrantsFor, newSeason, playWeek } from './season';
import { isDoubles, type Discipline } from './types';

const rs = BWF_2026;
const juniorEvents = (r = rs) => r.calendar.filter((e) => r.tiers.find((t) => t.id === e.tierId)?.junior);

describe('turnamen junior', () => {
  it('ada di kalender 2026 & 2027+: 5 kontinental (minggu 28) + Kejuaraan Dunia Junior (minggu 41)', () => {
    for (const r of [BWF_2026, BWF_2027]) {
      const js = juniorEvents(r);
      expect(js.filter((e) => e.week === 28 && e.confederation).map((e) => e.confederation).sort()).toEqual(['BA', 'BAM', 'BCA', 'BE', 'BO']);
      expect(js.filter((e) => e.week === 41 && !e.confederation)).toHaveLength(1);
    }
  });

  it('hanya U19, kontinental hanya konfederasinya, tanpa poin senior; ranking junior terbentuk; tidak bentrok dengan turnamen senior', async () => {
    const state = newSeason(WORLD, rs, 21, undefined, 'INA');
    const rng = makeRng(21);
    while (state.date.week < 42) await playWeek(state, rs, WORLD, rng);
    const conf = new Map(WORLD.countries.map((c) => [c.id, c.confederation]));
    const players = new Map(state.players.map((p) => [p.id, p]));
    const pairs = new Map(state.pairs.map((p) => [p.id, p]));
    const idsOf = (s: string) => pairs.get(s)?.playerIds ?? [s];
    const ids = new Set(juniorEvents().map((e) => e.id));
    const jm = state.matches.filter((m) => ids.has(m.tournamentId));
    expect(jm.length).toBeGreaterThan(100);
    for (const m of jm) {
      const ev = rs.calendar.find((e) => e.id === m.tournamentId)!;
      for (const id of m.sides.flatMap(idsOf)) {
        const p = players.get(id)!;
        expect(ageAt(p.birth, { year: 2026, week: ev.week })).toBeLessThanOrEqual(18);
        if (ev.confederation) expect(conf.get(p.countryId)).toBe(ev.confederation);
      }
    }
    expect(state.results.some((r) => ids.has(r.tournamentId))).toBe(false); // tanpa poin ranking senior
    expect(computeRanking(state.juniorResults, 'MS', absWeek(state.date), rs).length).toBeGreaterThan(20);
    // Indonesia (termasuk junior pratama) ikut Kejuaraan Dunia Junior.
    const wjc = juniorEvents().find((e) => e.week === 41)!;
    expect(state.matches.some((m) => m.tournamentId === wjc.id && m.sides.flatMap(idsOf).some((id) => players.get(id)!.countryId === 'INA'))).toBe(true);
    // Atlet di turnamen junior tidak bermain di turnamen senior minggu yang sama.
    for (const week of [28, 41]) {
      const evs = rs.calendar.filter((e) => e.week === week);
      const inJunior = new Set(state.matches.filter((m) => ids.has(m.tournamentId) && evs.some((e) => e.id === m.tournamentId)).flatMap((m) => m.sides.flatMap(idsOf)));
      const inSenior = state.matches.filter((m) => !ids.has(m.tournamentId) && evs.some((e) => e.id === m.tournamentId) && m.year === 2026).flatMap((m) => m.sides.flatMap(idsOf));
      expect(inSenior.filter((id) => inJunior.has(id))).toEqual([]);
    }
    // Kuota per negara di Kejuaraan Dunia Junior & pasangan junior otomatis tidak masuk turnamen senior.
    const rec = (d: Discipline) => state.eventRecords.find((r) => r.tournamentId === wjc.id && r.discipline === d)!;
    for (const d of ['MS', 'XD'] as Discipline[]) {
      const entered = [...rec(d).entry.main, ...rec(d).entry.qualifying, ...rec(d).entry.reserves];
      const per = new Map<string, number>();
      for (const c of entered) per.set(c.countryId, (per.get(c.countryId) ?? 0) + 1);
      expect(Math.max(...per.values())).toBeLessThanOrEqual(isDoubles(d) ? 2 : 3);
    }
    const auto = state.pairs.filter((p) => p.junior);
    expect(auto.length).toBeGreaterThan(0);
    expect(auto.every((p) => p.adHoc && !entrantsFor(state, p.discipline).some((e) => e.id === p.id))).toBe(true);
    expect(auto.every((p) => p.playerIds.every((id) => isJuniorAge(players.get(id)!, { year: 2026, week: 28 })))).toBe(true);
  }, 60000);
});

describe('spesialis ganda', () => {
  it('tidak masuk nomor tunggal (individu, beregu, junior)', async () => {
    const { juniorTeamEntrants } = await import('./junior');
    const { teamStrengths } = await import('./season');
    const state = newSeason(WORLD, rs, 3, undefined, 'INA');
    state.players.filter((p) => p.gender === 'M').forEach((p, i) => { if (i % 2) p.focus = 'D'; });
    const d = new Set(state.players.filter((p) => p.focus === 'D').map((p) => p.id));
    expect(entrantsFor(state, 'MS').some((e) => d.has(e.id))).toBe(false);
    expect(juniorTeamEntrants(state, 'MS').some((e) => d.has(e.id))).toBe(false);
    expect(teamStrengths(state, rs, 'thomas').some((s) => s.pool.MS?.some((e) => d.has(e.id)))).toBe(false);
  });
});
