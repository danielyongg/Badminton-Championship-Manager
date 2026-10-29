import { describe, expect, it } from 'vitest';
import { potentialStars } from './career';
import { BWF_2026 } from './presets/bwf2026';
import { WORLD } from './presets/world';
import { makeRng } from './rng';
import { autoPick, focusScore, gemLine, makeScouting, SCOUT_TYPES, scoutReport, similarPool, similarTo, suggestedEvent, recruit, recruitSome, starRangeAt, styleOf, withdrawCandidates, type Scouting } from './scouting';
import { currentAbility } from './generator';
import { traitHints } from './traits';
import { ATTRS, type Player } from './types';
import { newSeason, playWeek } from './season';

describe('pencarian bakat junior', () => {
  it('akhir musim: kandidat max(5, 2× kursi) hanya untuk negara manajer; jumlah rekrut bebas', async () => {
    const rs = BWF_2026;
    const state = newSeason(WORLD, rs, 11, { year: 2026, week: 50 }, 'INA');
    const rng = makeRng(11);
    while (state.date.year === 2026) await playWeek(state, rs, WORLD, rng);
    const s = state.scouting!;
    expect(s.year).toBe(2027);
    for (const g of ['M', 'F'] as const) {
      const n = s.candidates.filter((p) => p.gender === g).length;
      expect(n).toBe(Math.max(5, s.slots[g] * 2));
    }
    expect(s.candidates.every((p) => p.countryId === 'INA')).toBe(true);
    expect(state.players.some((p) => s.candidates.includes(p))).toBe(false); // belum masuk skuad
    // negara lain tetap menerima junior 2027 langsung
    expect(state.players.some((p) => p.countryId !== 'INA' && p.id.includes('2027-'))).toBe(true);
    // rentang bintang lebar 2 & memuat perkiraan potensi
    for (const p of s.candidates) {
      const [lo, hi] = s.starRange[p.id];
      expect(hi - lo).toBe(2);
      const est = potentialStars(p, { year: 2027, week: 1 }, 0);
      expect(est >= lo && est <= hi).toBe(true);
    }
    expect(autoPick(s).length).toBe(s.slots.M + s.slots.F); // saran = sejumlah kursi
    // jumlah rekrut bebas: semua kandidat boleh diambil
    const before = state.players.length;
    recruit(state, s.candidates.map((p) => p.id));
    expect(state.players.length - before).toBe(s.candidates.length);
    expect(state.scouting).toBeUndefined();
  });

  it('tidak dipilih sampai lewat minggu 4: diisi otomatis', async () => {
    const rs = BWF_2026;
    const state = newSeason(WORLD, rs, 12, { year: 2026, week: 52 }, 'INA');
    const rng = makeRng(12);
    await playWeek(state, rs, WORLD, rng);
    const s = state.scouting!;
    while (state.date.week <= 5) await playWeek(state, rs, WORLD, rng);
    expect(state.scouting).toBeUndefined();
    expect(state.players.filter((p) => s.candidates.includes(p)).length).toBe(s.slots.M + s.slots.F);
  });
});

describe('profil kandidat', () => {
  it('styleOf: dua atribut tertinggi', () => {
    const attrs = Object.fromEntries(ATTRS.map((a) => [a, 40])) as Player['attrs'];
    attrs.smash = 70; attrs.net = 65;
    expect(styleOf({ attrs } as Player)).toEqual(['smash', 'net']);
  });
  it('kandidat punya kota asal di negaranya, sifat, dan catatan pemandu', async () => {
    const state = newSeason(WORLD, BWF_2026, 13, { year: 2026, week: 52 }, 'INA');
    await playWeek(state, BWF_2026, WORLD, makeRng(13));
    const ina = new Set(WORLD.cities.filter((c) => c.countryId === 'INA').map((c) => c.id));
    const s = state.scouting!;
    expect(s.candidates.every((p) => p.hometown && ina.has(p.hometown) && Array.isArray(p.traits) && Array.isArray(s.notes?.[p.id]))).toBe(true);
  });
});

describe('fokus pencarian', () => {
  const ina = WORLD.countries.find((c) => c.id === 'INA')!;
  const date = { year: 2027, week: 1 };
  const avg = (ps: Player[], f: (p: Player) => number) => ps.reduce((s, p) => s + f(p), 0) / ps.length;
  it('attack → smash+deception lebih tinggi dari balanced; ready → CA lebih tinggi; raw → ruang tumbuh lebih besar', () => {
    const run = (f: Parameters<typeof makeScouting>[7]) => makeScouting([], ina, BWF_2026.generator, date, makeRng(21), undefined, undefined, f).candidates;
    const bal = run('balanced'), att = run('attack'), rdy = run('ready'), raw = run('raw');
    expect(avg(att, (p) => p.attrs.smash + p.attrs.deception)).toBeGreaterThan(avg(bal, (p) => p.attrs.smash + p.attrs.deception));
    expect(avg(rdy, (p) => currentAbility(p.attrs))).toBeGreaterThan(avg(bal, (p) => currentAbility(p.attrs)));
    expect(avg(raw, (p) => focusScore(p, 'raw', date))).toBeGreaterThan(avg(bal, (p) => focusScore(p, 'raw', date)));
    expect(att.length).toBe(bal.length);
  });
});

describe('catatan pemandu', () => {
  it('sifat asli sering tercatat, petunjuk salah jarang', () => {
    const p = { traits: ['clutch'], trait: 'late' } as unknown as Player;
    const rng = makeRng(5);
    let hit = 0, wrong = 0;
    for (let i = 0; i < 2000; i++) {
      const h = traitHints(p, rng);
      if (h.includes('clutch')) hit++;
      wrong += h.filter((x) => x !== 'clutch' && x !== 'late').length;
      expect(h.length).toBeLessThanOrEqual(3);
    }
    expect(hit / 2000).toBeGreaterThan(0.5);
    expect(wrong / 2000).toBeLessThan(0.2);
    expect(wrong).toBeGreaterThan(0);
  });
});

describe('waktu merekrut', () => {
  it('rentang menyempit tiap minggu dan tetap memuat perkiraan', async () => {
    const state = newSeason(WORLD, BWF_2026, 14, { year: 2026, week: 52 }, 'INA');
    await playWeek(state, BWF_2026, WORLD, makeRng(14));
    const s = state.scouting!;
    for (const p of s.candidates) {
      const est = potentialStars(p, { year: s.year, week: 1 }, 0);
      const widths = [1, 2, 3, 4].map((w) => { const [lo, hi] = starRangeAt(s, p, w); expect(est >= lo && est <= hi).toBe(true); expect(lo).toBeGreaterThanOrEqual(0.5); expect(hi).toBeLessThanOrEqual(5); return hi - lo; });
      expect(widths).toEqual([2, 1.5, 1, 0.5]);
      expect(starRangeAt(s, p, 1)).toEqual(s.starRange[p.id]);
    }
  });
  it('rekrut bertahap: pencarian tetap terbuka, batas minggu tidak mengisi otomatis lagi', async () => {
    const state = newSeason(WORLD, BWF_2026, 15, { year: 2026, week: 52 }, 'INA');
    const rng = makeRng(15);
    await playWeek(state, BWF_2026, WORLD, rng);
    const first = state.scouting!.candidates[0];
    const before = state.players.length;
    recruitSome(state, [first.id]);
    expect(state.players.length).toBe(before + 1);
    expect(state.scouting!.candidates.includes(first)).toBe(false);
    while (state.date.week <= 5) await playWeek(state, BWF_2026, WORLD, rng);
    expect(state.scouting).toBeUndefined();
    expect(state.players.length).toBe(before + 1);
  }, 120000);
  it('kandidat mundur tidak membuat kandidat < sisa kursi', () => {
    const s = { year: 2027, slots: { M: 5, F: 5 }, candidates: Array.from({ length: 5 }, (_, i) => ({ id: `m${i}`, gender: 'M', name: `M${i}` })), starRange: {} } as unknown as Scouting;
    for (let i = 0; i < 10; i++) withdrawCandidates(s, makeRng(i + 1));
    expect(s.candidates.length).toBe(5);
  });

  it('permata & tipe: jumlah kandidat tetap, permata di atas ambang, sisanya di bawah, CA ≤ PA', () => {
    const rs = BWF_2026, gen = rs.generator, ina = WORLD.countries.find((c) => c.id === 'INA')!;
    const line = gemLine(ina, gen);
    expect(line).toBe(Math.round(35 + 95 * 0.4 + 1.5 * 12)); // 91
    let flagged = 0, real = 0, twoGems = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const base = Array.from({ length: 9 }, (_, i) => ({ gender: i % 2 ? 'F' : 'M' }) as Player);
      const s = makeScouting(base, ina, gen, { year: 2027, week: 1 }, makeRng(seed));
      for (const g of ['M', 'F'] as const) {
        const pool = s.candidates.filter((p) => p.gender === g);
        expect(pool.length).toBe(Math.max(5, s.slots[g] * 2));
        const gems = pool.filter((p) => s.trueGems!.includes(p.id));
        expect(gems.length === 1 || gems.length === 2).toBe(true);
        if (gems.length === 2) twoGems++;
        for (const p of gems) expect(p.pa).toBeGreaterThanOrEqual(line);
        for (const p of pool.filter((x) => !gems.includes(x))) expect(p.pa).toBeLessThan(line);
      }
      for (const p of s.candidates) {
        expect(currentAbility(p.attrs)).toBeLessThanOrEqual(p.pa);
        expect(SCOUT_TYPES).toContain(s.types![p.id]);
        if (s.types![p.id] === 'doubles') expect(p.focus).toBe('D');
      }
      real += s.trueGems!.length;
      flagged += s.gems!.filter((id) => s.trueGems!.includes(id)).length;
    }
    expect(flagged / real).toBeGreaterThan(0.8); // ±90 % permata asli ditandai
    expect(twoGems).toBeGreaterThan(10); // ±40 % gender-angkatan punya 2 permata
  });

  it('tipe menggeser atribut: penyerang punya smash+deception di atas rata-rata atributnya', () => {
    const rs = BWF_2026, ina = WORLD.countries.find((c) => c.id === 'INA')!;
    const base = Array.from({ length: 9 }, (_, i) => ({ gender: i % 2 ? 'F' : 'M' }) as Player);
    let n = 0, above = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const s = makeScouting(base, ina, rs.generator, { year: 2027, week: 1 }, makeRng(seed));
      for (const p of s.candidates.filter((x) => s.types![x.id] === 'attack')) {
        n++;
        if ((p.attrs.smash + p.attrs.deception) / 2 > currentAbility(p.attrs)) above++;
      }
    }
    expect(above / n).toBeGreaterThan(0.85);
  });

  it('laporan pemandu, saran nomor & mirip atlet', () => {
    const p = { gender: 'M', focus: undefined, attrs: { speed: 70, stamina: 66, serve: 40, warmup: 50, consistency: 50, net: 45, defense: 50, smash: 52, deception: 48, mental: 30 } } as unknown as Player;
    expect(scoutReport(p)).toEqual({ strong: ['speed', 'stamina'], weak: 'mental' });
    expect(suggestedEvent(p)).toBe('MS');
    expect(suggestedEvent({ ...p, gender: 'F' } as Player, 'doubles')).toBe('WD');
    const twin = { ...p, id: 'a', attrs: { ...p.attrs, speed: 80, stamina: 76 } } as Player; // profil sama, lebih kuat
    const other = { ...p, id: 'b', attrs: { ...p.attrs, speed: 40, smash: 80 } } as Player;
    expect(similarTo(p, [other, twin])?.id).toBe('a');
    expect(similarTo(p, [])).toBeUndefined();
  });

  it('similarPool: top 100 senior aktif segender di nomor itu', () => {
    const rs = BWF_2026;
    const state = newSeason(WORLD, rs, 3, { year: 2026, week: 1 }, 'INA');
    const ms = similarPool(state, rs, 'MS', 'M');
    expect(ms.length).toBe(100);
    expect(ms.every((x) => x.gender === 'M' && x.retired === undefined)).toBe(true);
    const md = similarPool(state, rs, 'MD', 'M');
    expect(md.length).toBeGreaterThan(50);
    expect(md.every((x) => x.gender === 'M')).toBe(true);
  });
});
