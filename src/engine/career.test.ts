import { describe, expect, it } from 'vitest';
import { dissolvePair, formPair, potentialStars, promoteTrial } from './career';
import { validatePack } from './pack';
import { BWF_2026 } from './presets/bwf2026';
import { WORLD } from './presets/world';
import { absWeek, computeRanking } from './ranking';
import { makeRng } from './rng';
import { newSeason, playWeek, weekKey, type SeasonState } from './season';
import type { Pair } from './types';

const rs = BWF_2026;

describe('mode karier', () => {
  it('target musim & rapor akhir musim, reputasi berubah', async () => {
    const state = newSeason(WORLD, rs, 1, undefined, 'INA');
    const rng = makeRng(1);
    await playWeek(state, rs, WORLD, rng);
    expect(state.career!.goals.map((g) => g.kind)).toEqual(['titles', 'top10', 'team', 'team']);
    expect(state.career!.goals.every((g) => g.target >= 1)).toBe(true);
    while (state.date.year === 2026) await playWeek(state, rs, WORLD, rng);
    const report = state.career!.reports[0];
    expect(report.year).toBe(2026);
    expect(['A', 'B', 'C', 'D', 'E']).toContain(report.grade);
    expect(report.goals.every((g) => g.achieved !== undefined)).toBe(true);
    expect(state.career!.reputation).toBe(50 + report.reputationChange);
  }, 30000); // satu musim penuh: bisa > 5 dtk saat semua tes berjalan paralel

  it('istirahatkan atlet Top Committed di turnamen wajib → pelanggaran & reputasi turun; pilihan manual dihormati', async () => {
    const state = newSeason(WORLD, rs, 2, undefined, 'INA');
    const rng = makeRng(2);
    await playWeek(state, rs, WORLD, rng); // minggu 1: komitmen & target dibuat
    const top = computeRanking(state.results, 'MS', absWeek(state.date), rs).find((r) => r.entrantId.startsWith('INA') && r.rank <= 15)!;
    expect(state.commitments[top.entrantId]).toContain('malaysia-open');
    const rival = computeRanking(state.results, 'MS', absWeek(state.date), rs).find((r) => r.entrantId.startsWith('INA') && r.rank > 40 && r.rank < 100)!;
    // Minggu 2 (Malaysia Open): bintang diistirahatkan, atlet lain dimasukkan manual.
    state.manualEntries[weekKey(state.date)] = { [top.entrantId]: 'rest', [rival.entrantId]: 'malaysia-open' };
    const rep = state.career!.reputation;
    await playWeek(state, rs, WORLD, rng);
    const inMalaysia = (id: string) => state.matches.some((m) => m.tournamentId === 'malaysia-open' && m.sides.includes(id));
    expect(inMalaysia(top.entrantId)).toBe(false);
    expect(state.violations.some((v) => v.entrantId === top.entrantId && v.tournamentId === 'malaysia-open')).toBe(true);
    expect(state.career!.reputation).toBe(rep - rs.career.violationPenalty);
    // Atlet manual masuk daftar entry (main draw atau cadangan); bila diterima, ia bertanding.
    expect(state.violations.some((v) => v.entrantId === rival.entrantId)).toBe(false);
  });

  it('cedera terjadi; atlet cedera tidak didaftarkan dan tidak dihitung melanggar', async () => {
    const state = newSeason(WORLD, rs, 3, undefined, 'INA');
    const rng = makeRng(3);
    let injuredSeen = 0;
    while (state.date.week < 30) {
      const injured = new Set(state.players.filter((p) => p.injury && p.injury.weeksLeft > 1).map((p) => p.id));
      injuredSeen += injured.size;
      const before = state.matches.length;
      await playWeek(state, rs, WORLD, rng);
      for (const m of state.matches.slice(before)) for (const id of m.sides) expect(injured.has(id)).toBe(false);
    }
    expect(injuredSeen).toBeGreaterThan(0);
    expect(state.violations.filter((v) => v.year === 2026)).toHaveLength(0);
  });

  it('save → load → lanjut menghasilkan dunia yang identik (RNG ikut tersimpan)', async () => {
    const a = newSeason(WORLD, rs, 4, undefined, 'JPN');
    const rngA = makeRng(4);
    for (let i = 0; i < 6; i++) await playWeek(a, rs, WORLD, rngA);
    const saved: SeasonState = structuredClone(a);
    const rngB = makeRng(rngA.state());
    for (let i = 0; i < 6; i++) { await playWeek(a, rs, WORLD, rngA); await playWeek(saved, rs, WORLD, rngB); }
    expect(saved.results.length).toBe(a.results.length);
    expect(saved.champions).toEqual(a.champions);
    expect(saved.players.map((p) => p.fatigue)).toEqual(a.players.map((p) => p.fatigue));
  });
});

describe('pasangan', () => {
  const state = newSeason(WORLD, rs, 5, undefined, 'INA');
  const rng = makeRng(5);
  const ina = (g: 'M' | 'F') => state.players.filter((p) => p.countryId === 'INA' && p.gender === g);

  it('validasi: gender, negara, sudah berpasangan', async () => {
    expect(formPair(state, 'MD', ina('M')[0].id, ina('F')[0].id, rng)).toMatch(/Gender/);
    const jpn = state.players.find((p) => p.countryId === 'JPN' && p.gender === 'M')!;
    expect(formPair(state, 'MD', ina('M')[0].id, jpn.id, rng)).toMatch(/negara/);
    const existing = state.pairs.find((p) => p.discipline === 'XD' && p.id.startsWith('INA'))!;
    const otherWoman = ina('F').find((p) => !existing.playerIds.includes(p.id))!;
    expect(formPair(state, 'XD', existing.playerIds[0], otherWoman.id, rng)).toMatch(/sudah punya/);
  });

  it('bubarkan lalu bentuk pasangan baru (junior + senior boleh); AI tidak mengubah pasangan negara manajer', async () => {
    const pair = state.pairs.find((p) => p.discipline === 'MD' && p.id.startsWith('INA') && !p.dissolved)!;
    dissolvePair(state, pair.id);
    const junior = ina('M').sort((a, b) => b.birth.year - a.birth.year)[0];
    const fresh = formPair(state, 'MD', pair.playerIds[0], junior.id, rng);
    expect(typeof fresh).toBe('object');
    const inaPairsBefore = state.pairs.filter((p) => p.id.startsWith('INA')).length;
    while (state.date.year === 2026) await playWeek(state, rs, WORLD, rng);
    const formedByAi = state.pairs.filter((p) => p.id.startsWith('INA') && p.formed.year === 2026 && p.formed.week === 52);
    expect(formedByAi).toHaveLength(0);
    expect(state.pairs.filter((p) => p.id.startsWith('INA')).length).toBe(inaPairsBefore);
  });
});

describe('pasangan percobaan', () => {
  const setup = () => {
    const state = newSeason(WORLD, rs, 7, undefined, 'INA');
    const main = state.pairs.find((p) => p.discipline === 'MD' && p.id.startsWith('INA') && !p.dissolved)!;
    const other = state.players.find((p) => p.countryId === 'INA' && p.gender === 'M' && !state.pairs.some((x) => !x.dissolved && x.discipline === 'MD' && x.playerIds.includes(p.id)))!;
    return { state, main, other, rng: makeRng(7) };
  };

  it('dibentuk tanpa membubarkan pasangan utama; kombinasi yang sama ditolak; pasangan biasa tetap ditolak', () => {
    const { state, main, other, rng } = setup();
    expect(formPair(state, 'MD', main.playerIds[0], other.id, rng)).toMatch(/sudah punya/); // bukan percobaan
    const trial = formPair(state, 'MD', main.playerIds[0], other.id, rng, true);
    expect(typeof trial === 'object' && trial.trial).toBe(true);
    expect(main.dissolved).toBeUndefined();
    expect(formPair(state, 'MD', other.id, main.playerIds[0], rng, true)).toMatch(/sudah berpasangan/);
    expect(validatePack({ ruleset: rs, world: WORLD, players: state.players, pairs: state.pairs })).toEqual([]);
  });

  it('AI tidak mendaftarkannya; entry manual dipakai & atlet hanya satu pasangan per nomor', async () => {
    const { state, main, other, rng } = setup();
    const trial = formPair(state, 'MD', main.playerIds[0], other.id, rng, true) as Pair;
    for (let i = 0; i < 6; i++) await playWeek(state, rs, WORLD, rng);
    expect(state.matches.some((m) => m.sides.includes(trial.id))).toBe(false);
    // Minggu berikutnya dengan turnamen: daftarkan pasangan percobaan; pasangan utama juga didaftarkan ke turnamen yang sama.
    while (!rs.calendar.some((e) => e.week === state.date.week && e.tierId === 'S300')) await playWeek(state, rs, WORLD, rng);
    const ev = rs.calendar.find((e) => e.week === state.date.week && e.tierId === 'S300')!;
    // Pasangan percobaan didaftarkan manual; pasangan utama "Otomatis" → keputusan manual menang atas pilihan AI.
    const week = { ...state.date };
    state.manualEntries[weekKey(week)] = { [trial.id]: ev.id };
    await playWeek(state, rs, WORLD, rng);
    const rec = state.eventRecords.find((r) => r.tournamentId === ev.id && r.year === week.year && r.discipline === 'MD')!;
    const listed = [...rec.entry.main, ...rec.entry.wildcards, ...rec.entry.qualifying, ...rec.entry.reserves].map((c) => c.id);
    expect(listed).toContain(trial.id);
    // Atlet yang sama tidak bisa tampil dengan pasangan MD lain di minggu itu (turnamen mana pun).
    const weekEvents = new Set(rs.calendar.filter((e) => e.week === week.week).map((e) => e.id));
    expect(state.matches.some((m) => weekEvents.has(m.tournamentId) && m.year === week.year && m.sides.includes(main.id))).toBe(false);
  });

  it('pop-up entry: dipanggil sebelum entry minggu turnamen; pilihan yang diatur di dalamnya dipakai', async () => {
    const { state, main, rng } = setup();
    const calls: number[] = [];
    let entered = '';
    const entry = ({ week, events }: { week: number; events: { id: string; tierId: string }[] }) => {
      calls.push(week);
      const ev = events.find((e) => e.tierId === 'S1000' || e.tierId === 'S750' || e.tierId === 'S500' || e.tierId === 'S300');
      if (ev && !entered) { entered = ev.id; state.manualEntries[weekKey(state.date)] = { [main.id]: 'rest' }; }
      return Promise.resolve();
    };
    for (let i = 0; i < 4; i++) await playWeek(state, rs, WORLD, rng, { entry });
    expect(calls).toEqual(rs.calendar.filter((e) => e.week <= 4 && e.tierId !== 'WTF').map((e) => e.week).filter((w, i, a) => a.indexOf(w) === i).sort((x, y) => x - y));
    expect(state.matches.some((m) => m.tournamentId === entered && m.sides.includes(main.id))).toBe(false); // diistirahatkan di pop-up
  });

  it('jadikan pasangan utama: pasangan utama lama dibubarkan', () => {
    const { state, main, other, rng } = setup();
    const trial = formPair(state, 'MD', main.playerIds[0], other.id, rng, true) as Pair;
    promoteTrial(state as SeasonState, trial.id);
    expect(trial.trial).toBeUndefined();
    expect(main.dissolved).toBeDefined();
  });
});

it('perkiraan potensi makin akurat seiring usia & jumlah laga', async () => {
  const state = newSeason(WORLD, rs, 6);
  const err = (age: number, matches: number) => {
    const ps = state.players.slice(0, 400);
    return ps.reduce((s, p) => s + Math.abs(potentialStars({ ...p, birth: { year: 2026 - age, week: 1 } }, { year: 2026, week: 1 }, matches) - p.pa / 20), 0) / ps.length;
  };
  expect(err(16, 0)).toBeGreaterThan(err(24, 100));
  expect(err(24, 100)).toBeLessThan(0.3);
});
