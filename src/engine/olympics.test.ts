import { describe, expect, it } from 'vitest';
import { olympicField, olympicRanking, qualificationWindow } from './olympics';
import { BWF_2026 } from './presets/bwf2026';
import { WORLD } from './presets/world';
import { entrantsFor, newSeason } from './season';

describe('kualifikasi Olimpiade (LA28)', () => {
  const state = newSeason(WORLD, BWF_2026, 1);
  const conf = new Map(WORLD.countries.map((c) => [c.id, c.confederation]));

  it('periode kualifikasi Mei tahun sebelumnya s/d April tahun Olimpiade', () => {
    expect(qualificationWindow(2028)).toEqual({ from: 2027 * 52 + 18, to: 2028 * 52 + 17 });
  });

  it.each([['MS', 38, 16, 2], ['WS', 38, 16, 2], ['MD', 16, 8, 1], ['XD', 16, 8, 1]] as const)('%s: %i tempat, 2 per negara hanya bila keduanya top %i, wakil benua', (d, size, top, perConf) => {
    const field = olympicField(state, BWF_2026, d, 2028, WORLD);
    expect(field).toHaveLength(size);
    for (const list of [...new Set(field.map((c) => c.countryId))].map((id) => field.filter((c) => c.countryId === id))) {
      expect(list.length).toBeLessThanOrEqual(2);
      if (list.length === 2) expect(list.every((c) => c.rank! <= top)).toBe(true);
    }
    // Wakil benua: tiap konfederasi min. `perConf`, sebanyak yang layak (tunggal s/d peringkat 250, ganda s/d 50).
    const country = new Map(entrantsFor(state, d).map((e) => [e.id, e.countryId]));
    const limit = d === 'MS' || d === 'WS' ? 250 : 50;
    const eligible = olympicRanking(state, BWF_2026, d, 2028).rows.filter((r) => r.rank <= limit && country.has(r.entrantId));
    for (const cf of new Set(conf.values())) {
      const avail = new Set(eligible.filter((r) => conf.get(country.get(r.entrantId)!) === cf).map((r) => country.get(r.entrantId))).size;
      expect(field.filter((c) => conf.get(c.countryId) === cf).length, cf).toBeGreaterThanOrEqual(Math.min(perConf, avail));
    }
  });

  it('tuan rumah (AS, LA 2028) dapat tempat di tunggal', () => {
    for (const d of ['MS', 'WS'] as const) expect(olympicField(state, BWF_2026, d, 2028, WORLD).some((c) => c.countryId === 'USA')).toBe(true);
  });
});
