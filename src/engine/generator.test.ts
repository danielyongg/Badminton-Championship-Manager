import { describe, expect, it } from 'vitest';
import { ageAt, currentAbility, generateWorld } from './generator';
import { BWF_2026 } from './presets/bwf2026';
import { WORLD } from './presets/world';
import { makeRng } from './rng';
import { ATTRS } from './types';

const date = { year: 2026, week: 1 };
const gen = (seed: number) => generateWorld(makeRng(seed), BWF_2026.generator, WORLD.countries, date);
const { players, pairs } = gen(42);
const avgCa = (cid: string) => {
  const ps = players.filter((p) => p.countryId === cid && ageAt(p.birth, date) >= 18);
  return ps.reduce((s, p) => s + currentAbility(p.attrs), 0) / ps.length;
};

describe('generator atlet fiktif', () => {
  it('seed sama → dunia sama', () => {
    expect(gen(42)).toEqual({ players, pairs });
  });

  it('negara tradisi kuat punya lebih banyak & lebih kuat atlet', () => {
    const n = (cid: string) => players.filter((p) => p.countryId === cid).length;
    expect(n('CHN')).toBeGreaterThan(n('NZL') * 3);
    expect(avgCa('INA')).toBeGreaterThan(avgCa('PER') + 10);
  });

  it('atribut 1–100, CA ≤ PA, id unik', () => {
    for (const p of players) {
      for (const a of ATTRS) expect(p.attrs[a]).toBeGreaterThanOrEqual(1), expect(p.attrs[a]).toBeLessThanOrEqual(100);
      expect(currentAbility(p.attrs)).toBeLessThanOrEqual(p.pa);
    }
    expect(new Set(players.map((p) => p.id)).size).toBe(players.length);
  });

  it('pasangan valid: gender sesuai nomor, satu negara, tidak ada pemain ganda di dua pasangan nomor yang sama', () => {
    const byId = new Map(players.map((p) => [p.id, p]));
    for (const pair of pairs) {
      const [a, b] = pair.playerIds.map((id) => byId.get(id)!);
      expect(a.countryId).toBe(b.countryId);
      const genders = [a.gender, b.gender].sort().join('');
      expect(genders).toBe({ MD: 'MM', WD: 'FF', XD: 'FM' }[pair.discipline]);
    }
    for (const d of ['MD', 'WD', 'XD']) {
      const ids = pairs.filter((p) => p.discipline === d).flatMap((p) => p.playerIds);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('nama tidak kembar dalam satu negara', () => {
    for (const c of ['CHN', 'INA', 'DEN']) {
      const names = players.filter((p) => p.countryId === c).map((p) => p.name);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it('ada atlet kelas dunia (CA ≥ 75) dan junior 15–17 th', () => {
    expect(players.some((p) => currentAbility(p.attrs) >= 75)).toBe(true);
    expect(players.some((p) => ageAt(p.birth, date) <= 17)).toBe(true);
  });
});
