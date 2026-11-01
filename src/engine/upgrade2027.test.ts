import { expect, it } from 'vitest';
import { BWF_2026 } from './presets/bwf2026';
import { BWF_2027, upgradeTo2027 } from './presets/bwf2027';
import { WORLD } from './presets/world';
import { makeRng } from './rng';
import { isHeld, newSeason, playWeek, weekOf } from './season';

it('upgradeTo2027: hanya untuk ruleset BWF 2026, tier & turnamen 2027 diterapkan', () => {
  const rs = structuredClone(BWF_2026);
  const changed = upgradeTo2027(rs);
  expect(rs.id).toBe('bwf-2027');
  expect(rs.tiers.find((t) => t.id === 'S1000')!.groupStage?.MS?.groups).toBe(16);
  expect(rs.calendar.find((e) => e.id === 'denmark-open')!.tierId).toBe('S1000');
  expect(changed).toContain('denmark-open');
  expect(changed).toContain('malaysia-open');
  expect(upgradeTo2027(rs)).toEqual([]); // sekali saja
});

it('save BWF 2026 melewati pergantian tahun: Super 1000 awal 2027 dimainkan dengan format baru', async () => {
  const rs = structuredClone(BWF_2026);
  const state = newSeason(WORLD, rs, 4, { year: 2026, week: 46 });
  const rng = makeRng(4);
  const mo = rs.calendar.find((e) => e.id === 'malaysia-open')!;
  while (!(state.date.year === 2027 && state.date.week > weekOf(mo, 2027))) await playWeek(state, rs, WORLD, rng);
  expect(rs.id).toBe('bwf-2027');
  const rec = state.eventRecords.find((r) => r.tournamentId === 'malaysia-open' && r.year === 2027 && r.discipline === 'MS')!;
  expect(rec.groups?.groups.length).toBe(16);
}, 300000);

it('Super 1000 2027+ menempati 2 minggu: pesertanya tidak terdaftar di turnamen minggu berikutnya', async () => {
  const rs = structuredClone(BWF_2027);
  const state = newSeason(WORLD, rs, 5, { year: 2027, week: 1 });
  const rng = makeRng(5);
  while (state.date.week < 14) await playWeek(state, rs, WORLD, rng);
  const pairs = new Map(state.pairs.map((p) => [p.id, p]));
  const playersOf = (eventId: string) => new Set(Object.values(state.entryLists?.[`2027:${eventId}`] ?? {}).flat().flatMap((c) => pairs.get(c!.id)?.playerIds ?? [c!.id]));
  let checked = 0;
  for (const s1000 of rs.calendar.filter((e) => e.tierId === 'S1000' && isHeld(e, 2027) && weekOf(e, 2027) < 13)) {
    const inS = playersOf(s1000.id);
    expect(inS.size).toBeGreaterThan(0);
    for (const next of rs.calendar.filter((e) => isHeld(e, 2027) && weekOf(e, 2027) === weekOf(s1000, 2027) + 1)) {
      const clash = [...playersOf(next.id)].filter((p) => inS.has(p));
      expect(clash, `${s1000.id} → ${next.id}`).toEqual([]);
      checked++;
    }
  }
  expect(checked).toBeGreaterThan(0);
}, 300000);
