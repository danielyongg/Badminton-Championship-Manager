import { describe, expect, it } from 'vitest';
import { developQuarter, INJURY_TYPES, newJuniors, retirementChance, rollInjury } from './development';
import { ageAt, currentAbility, generatePlayer } from './generator';
import { BWF_2026 } from './presets/bwf2026';
import { WORLD } from './presets/world';
import { makeRng } from './rng';
import { ATTRS, type Player } from './types';

const rs = BWF_2026;
const cfg = rs.development;
const country = WORLD.countries.find((c) => c.id === 'INA')!;
const mean = (p: Player) => ATTRS.reduce((s, a) => s + p.attrs[a], 0) / ATTRS.length;

/** Simulasi kohort: n atlet usia 15 selama `years` tahun; kembalikan rata-rata CA per usia. */
function cohort(n: number, years: number, seed: number, doubles = false, trait?: Player['trait']) {
  const rng = makeRng(seed);
  const start = { year: 2026, week: 1 };
  const players = Array.from({ length: n }, (_, i) => {
    const p = generatePlayer(rng, rs.generator, country, 'M', 15, start, `p${i}`);
    p.birth = { year: 2011, week: 1 }; // tepat 15 th di awal simulasi
    p.trait = trait;
    return p;
  });
  const byAge = new Map<number, number[]>();
  let exceeded = 0;
  for (let q = 0; q < years * 4; q++) {
    const date = { year: 2026 + Math.floor(q / 4), week: 1 + (q % 4) * 13 };
    const ctx = {
      date,
      experience: new Map(players.map((p) => [p.id, 4 + rng() * 12])),
      doublesPlayers: new Set(doubles ? players.map((p) => p.id) : []),
    };
    for (const p of players) {
      developQuarter(p, cfg, ctx, rng);
      if (mean(p) > p.pa + 1e-9) exceeded++;
      for (const a of ATTRS) if (p.attrs[a] < 1 || p.attrs[a] > 100) exceeded++;
    }
    if (q % 4 === 3) {
      const age = ageAt(players[0].birth, { year: date.year + 1, week: 1 });
      byAge.set(age, players.map(mean));
    }
  }
  const avg = new Map([...byAge].map(([age, xs]) => [age, xs.reduce((s, x) => s + x, 0) / xs.length]));
  return { avg, exceeded };
}

describe('kurva perkembangan & penuaan (1.000 atlet × 20 tahun)', () => {
  const { avg, exceeded } = cohort(1000, 20, 1);
  const peakAge = [...avg].sort((a, b) => b[1] - a[1])[0][0];

  it('puncak rata-rata di usia 25–29', () => {
    expect(peakAge).toBeGreaterThanOrEqual(25);
    expect(peakAge).toBeLessThanOrEqual(29);
  });

  it('naik cepat saat muda, turun setelah 30 dan makin cepat', () => {
    expect(avg.get(19)! - avg.get(16)!).toBeGreaterThan(avg.get(25)! - avg.get(22)!);
    expect(avg.get(31)!).toBeLessThan(avg.get(peakAge)!);
    const drop31to33 = avg.get(31)! - avg.get(33)!;
    const drop33to35 = avg.get(33)! - avg.get(35)!;
    expect(drop31to33).toBeGreaterThan(0);
    expect(drop33to35).toBeGreaterThan(drop31to33);
  });

  it('atlet tidak pernah melampaui PA, atribut tetap 1–100', () => {
    expect(exceeded).toBe(0);
  });

  it('pemain ganda puncaknya lebih lambat', () => {
    const d = cohort(300, 20, 2, true).avg;
    const s = cohort(300, 20, 2, false).avg;
    expect(d.get(31)! - d.get(27)!).toBeGreaterThan(s.get(31)! - s.get(27)!);
  });

  it('late bloomer tertinggal saat muda tapi mengejar; stagnan tetap rendah', () => {
    const normal = cohort(300, 12, 3).avg;
    const late = cohort(300, 12, 3, false, 'late').avg;
    const stag = cohort(300, 12, 3, false, 'stagnant').avg;
    expect(late.get(19)!).toBeLessThan(normal.get(19)! - 2);
    expect(normal.get(26)! - late.get(26)!).toBeLessThan(normal.get(19)! - late.get(19)!);
    expect(stag.get(24)!).toBeLessThan(normal.get(24)! - 3);
  });
});

describe('pensiun & regenerasi', () => {
  const date = { year: 2040, week: 52 };
  const at = (age: number) => {
    const p = generatePlayer(makeRng(age), rs.generator, country, 'M', 25, { year: 2040 - age, week: 1 }, 'x');
    p.birth = { year: 2040 - age, week: 1 };
    return p;
  };

  it('belum pensiun sebelum 30 (kecuali kemampuan sangat rendah), hampir pasti ≤ 38', () => {
    const p = at(26);
    p.attrs = Object.fromEntries(ATTRS.map((a) => [a, 70])) as Player['attrs'];
    expect(retirementChance(p, cfg, date, 10)).toBe(0);
    expect(retirementChance(at(38), cfg, date, 10)).toBe(1);
    expect(retirementChance(at(34), cfg, date, 300)).toBeGreaterThan(retirementChance(at(34), cfg, date, 5));
  });

  it('junior baru 15–17 th; negara tradisi kuat menghasilkan lebih banyak & lebih berbakat', () => {
    const rng = makeRng(9);
    const chn = WORLD.countries.find((c) => c.id === 'CHN')!, nzl = WORLD.countries.find((c) => c.id === 'NZL')!;
    const gen = (c: typeof chn) => Array.from({ length: 50 }, (_, y) => {
      const d = { year: 2030 + y, week: 1 };
      const js = newJuniors(c, cfg, rs.generator, d, rng);
      for (const p of js) expect([15, 16, 17]).toContain(ageAt(p.birth, d));
      return js;
    }).flat();
    const a = gen(chn), b = gen(nzl);
    expect(a.length).toBeGreaterThan(b.length * 2);
    const avgPa = (xs: Player[]) => xs.reduce((s, p) => s + p.pa, 0) / xs.length;
    expect(avgPa(a)).toBeGreaterThan(avgPa(b) + 15);
    expect(new Set(a.map((p) => p.id)).size).toBe(a.length);
    expect(currentAbility(a[0].attrs)).toBeLessThanOrEqual(a[0].pa);
  });
});

it('cedera berat menurunkan PA dan CA langsung ikut dijepit (termasuk atribut di batas bawah)', async () => {
  const { applySevereInjury } = await import('./development');
  const p = generatePlayer(makeRng(1), rs.generator, country, 'M', 25, { year: 2026, week: 1 }, 'x');
  p.pa = 21;
  p.attrs = { ...p.attrs, speed: 1, stamina: 1, serve: 40, warmup: 40, consistency: 1, net: 1, defense: 40, smash: 40, deception: 1, mental: 40 };
  applySevereInjury(p, { ...cfg, severeInjuryPaLoss: { min: 1, max: 1 } }, makeRng(2));
  expect(p.pa).toBe(20);
  expect(mean(p)).toBeLessThanOrEqual(20 + 1e-9);
  for (const a of ATTRS) expect(p.attrs[a]).toBeGreaterThanOrEqual(1);
});

describe('cedera 4 tingkat', () => {
  it('peluang 67/21/10/2 %, lama absen sesuai tingkat, jenis sesuai tingkat, pensiun hanya cedera parah', () => {
    const cfg = BWF_2026.injury, rng = makeRng(3), n = 50000;
    const count: Record<string, number> = {};
    let retired = 0;
    for (let i = 0; i < n; i++) {
      const { injury, retire } = rollInjury(cfg, rng);
      const lv = cfg.levels.find((l) => l.id === injury.level)!;
      expect(injury.weeksLeft).toBeGreaterThanOrEqual(lv.weeks.min);
      expect(injury.weeksLeft).toBeLessThanOrEqual(lv.weeks.max);
      expect(INJURY_TYPES[injury.level]).toContain(injury.type);
      count[injury.level] = (count[injury.level] ?? 0) + 1;
      if (retire) { expect(injury.level).toBe('critical'); retired++; }
    }
    for (const l of cfg.levels) expect(Math.abs(count[l.id] / n - l.chance)).toBeLessThan(0.01);
    expect(Math.abs(retired / count.critical - 0.3)).toBeLessThan(0.06);
  });
});
