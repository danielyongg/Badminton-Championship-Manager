import { describe, expect, it } from 'vitest';
import { potentialStars } from './career';
import { BWF_2026 } from './presets/bwf2026';
import { WORLD } from './presets/world';
import { makeRng } from './rng';
import { autoPick, recruit } from './scouting';
import { newSeason, playWeek } from './season';

describe('pencarian bakat junior', () => {
  it('akhir musim: kandidat 2× kursi hanya untuk negara manajer; jumlah rekrut bebas', async () => {
    const rs = BWF_2026;
    const state = newSeason(WORLD, rs, 11, { year: 2026, week: 50 }, 'INA');
    const rng = makeRng(11);
    while (state.date.year === 2026) await playWeek(state, rs, WORLD, rng);
    const s = state.scouting!;
    expect(s.year).toBe(2027);
    for (const g of ['M', 'F'] as const) {
      const n = s.candidates.filter((p) => p.gender === g).length;
      expect(n).toBe(s.slots[g] && Math.max(2, s.slots[g] * 2));
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
