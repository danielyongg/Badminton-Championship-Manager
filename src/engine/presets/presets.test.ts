import { describe, expect, it } from 'vitest';
import { ROUNDS } from '../types';
import { BWF_2026 } from './bwf2026';
import { BWF_2027 } from './bwf2027';
import { hostCityId, isHeld, weekOf } from '../season';
import { realRoster } from './realPlayers';
import { WORLD } from './world';

const count = (rs: typeof BWF_2026, tier: string, year = rs.startYear) => rs.calendar.filter((e) => e.tierId === tier && isHeld(e, year)).length;

describe.each([BWF_2026, BWF_2027])('preset $name', (rs) => {
  it('tiap tier punya 9 kolom poin & hadiah, poin menurun', () => {
    for (const t of rs.tiers) {
      for (const table of [t.points, t.prizeSplit.singles, t.prizeSplit.doubles, ...(t.bonusPoints ?? []).map((b) => b.points)])
        expect(table).toHaveLength(ROUNDS.length);
      if (t.points.some(Boolean)) // tier tanpa poin ranking (multi-event) dikecualikan
        for (let i = 1; i < t.points.length; i++) expect(t.points[i]).toBeLessThan(t.points[i - 1]);
    }
  });

  it('format grup cocok dengan ukuran draw', () => {
    for (const t of rs.tiers)
      for (const [d, g] of Object.entries(t.groupStage ?? {}))
      { // grup boleh berisi perGroup atau perGroup − 1 (Olimpiade: 38 tunggal → 10 grup × 3 + 2 grup × 4)
        const n = t.drawSize[d as 'MS'];
        expect(n, `${t.id} ${d}`).toBeLessThanOrEqual(g!.groups * g!.perGroup);
        expect(n, `${t.id} ${d}`).toBeGreaterThan(g!.groups * (g!.perGroup - 1));
      }
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

it('kalender resmi BWF 2026: 4/6/9/10/9 World Tour (Abu Dhabi dibatalkan), minggu sesuai kolom WEEK BWF', () => {
  expect(['S1000', 'S750', 'S500', 'S300', 'S100'].map((t) => count(BWF_2026, t))).toEqual([4, 6, 9, 10, 9]);
  const week = (id: string, y: number) => weekOf(BWF_2026.calendar.find((e) => e.id === id)!, y);
  expect([week('hong-kong-open', 2026), week('korea-open', 2026), week('taipei-open', 2026), week('world-tour-finals', 2026)]).toEqual([47, 45, 31, 50]);
  expect([week('syed-modi', 2027), week('indonesia-s100-2', 2027), week('indonesia-s100-2', 2028)]).toEqual([31, 38, 49]);
  // Continental Circuit: hanya turnamen di negara yang ada di game; semua kotanya terdaftar.
  const cities = new Set(WORLD.cities.map((c) => c.id));
  for (const e of BWF_2026.calendar) expect(cities.has(e.cityId), e.id).toBe(true);
  expect(count(BWF_2026, 'IC') + count(BWF_2026, 'IS') + count(BWF_2026, 'FS')).toBe(59);
});

it('ukuran draw default 2026: S300–S1000 = 32, S100 = 48 MS', () => {
  const tier = (id: string) => BWF_2026.tiers.find((t) => t.id === id)!;
  for (const id of ['S1000', 'S750', 'S500', 'S300']) expect(Object.values(tier(id).drawSize)).toEqual([32, 32, 32, 32, 32]);
  expect(tier('S100').drawSize).toEqual({ MS: 48, WS: 32, MD: 32, WD: 32, XD: 32 });
});

it('atlet asli: tunggal tanpa pasangan asli hanya sektor Single; yang punya pasangan tetap bisa ganda', () => {
  const { players, pairs } = realRoster(2027);
  const paired = new Set(pairs.flatMap((x) => x.playerIds));
  expect(players.find((p) => p.name === 'Alwi Farhan')!.focus).toBe('S');
  expect(players.filter((p) => p.focus === 'S' && paired.has(p.id))).toHaveLength(0);
});

it('tuan rumah per tahun: asli bila sudah diumumkan, bergilir bila belum; semua kota ada', () => {
  const ev = (id: string) => [...BWF_2027.calendar, ...BWF_2027.team.events].find((e) => e.id === id)!;
  expect(hostCityId(ev('world-championships'), 2026)).toBe('new-delhi');
  expect(hostCityId(ev('olympics'), 2032)).toBe('brisbane');
  expect(hostCityId(ev('sudirman-cup'), 2027)).toBe('beijing');
  expect(hostCityId(ev('suhandinata-cup'), 2026)).toBe('cairo');
  expect(hostCityId(ev('world-championships'), 2027)).not.toBe(hostCityId(ev('world-championships'), 2029));
  const cities = new Set(WORLD.cities.map((c) => c.id));
  for (const e of [...BWF_2027.calendar, ...BWF_2027.team.events])
    for (const c of [...Object.values(e.hosts ?? {}), ...(e.rotation ?? [])]) expect(cities, `${e.id} → ${c}`).toContain(c);
});
