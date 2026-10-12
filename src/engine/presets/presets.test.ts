import { describe, expect, it } from 'vitest';
import { ROUNDS } from '../types';
import { BWF_2026 } from './bwf2026';
import { BWF_2027 } from './bwf2027';
import { WORLD } from './world';

const count = (rs: typeof BWF_2026, tier: string) => rs.calendar.filter((e) => e.tierId === tier).length;

describe.each([BWF_2026, BWF_2027])('preset $name', (rs) => {
  it('tiap tier punya 9 kolom poin & hadiah, poin menurun', () => {
    for (const t of rs.tiers) {
      for (const table of [t.points, t.prizeSplit.singles, t.prizeSplit.doubles, ...(t.bonusPoints ?? []).map((b) => b.points)])
        expect(table).toHaveLength(ROUNDS.length);
      for (let i = 1; i < t.points.length; i++) expect(t.points[i]).toBeLessThan(t.points[i - 1]);
    }
  });

  it('format grup cocok dengan ukuran draw', () => {
    for (const t of rs.tiers)
      for (const [d, g] of Object.entries(t.groupStage ?? {}))
        expect(g!.groups * g!.perGroup, `${t.id} ${d}`).toBe(t.drawSize[d as 'MS']);
  });

  it('kalender hanya merujuk tier & kota yang ada, id unik', () => {
    const tiers = new Set(rs.tiers.map((t) => t.id));
    const cities = new Set(WORLD.cities.map((c) => c.id));
    for (const e of rs.calendar) {
      expect(tiers.has(e.tierId), e.id).toBe(true);
      expect(cities.has(e.cityId), e.id).toBe(true);
    }
    expect(new Set(rs.calendar.map((e) => e.id)).size).toBe(rs.calendar.length);
  });
});

it('kota merujuk negara yang ada', () => {
  const countries = new Set(WORLD.countries.map((c) => c.id));
  for (const c of WORLD.cities) expect(countries.has(c.countryId), c.id).toBe(true);
});

it('struktur World Tour 2027: 5/5/9/8/8, Syed Modi S100, Denmark S1000', () => {
  expect(['S1000', 'S750', 'S500', 'S300', 'S100'].map((t) => count(BWF_2027, t))).toEqual([5, 5, 9, 8, 8]);
  const tierOf = (id: string) => BWF_2027.calendar.find((e) => e.id === id)!.tierId;
  expect(tierOf('syed-modi')).toBe('S100');
  expect(tierOf('denmark-open')).toBe('S1000');
});

it('ukuran draw default 2026: S300–S1000 = 32, S100 = 48 MS', () => {
  const tier = (id: string) => BWF_2026.tiers.find((t) => t.id === id)!;
  for (const id of ['S1000', 'S750', 'S500', 'S300']) expect(Object.values(tier(id).drawSize)).toEqual([32, 32, 32, 32, 32]);
  expect(tier('S100').drawSize).toEqual({ MS: 48, WS: 32, MD: 32, WD: 32, XD: 32 });
});
