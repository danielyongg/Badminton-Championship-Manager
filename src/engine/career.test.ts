import { describe, expect, it } from 'vitest';
import { dissolvePair, formPair, potentialStars, promoteJunior, promoteTrial, suggestTargets } from './career';
import { currentAbility } from './generator';
import { ROUNDS } from './types';
import { isJuniorAge, isPratama } from './generator';
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
    expect(state.career!.goals.map((g) => g.kind)).toEqual(['titles', 'top10', 'team', 'team', 'medals', 'medals', 'olympic']);
    expect(state.career!.goals.filter((g) => g.kind === 'medals').map((g) => g.eventId)).toEqual(['world-championships', 'asian-games']);
    expect(state.career!.goals.every((g) => g.target >= 1)).toBe(true);
    expect(state.career!.goals.find((g) => g.kind === 'olympic')!.year).toBe(2028);
    // Tantangan opsional: 3 pilihan, manajer memilih satu → dinilai di rapor (bonus / penalti reputasi).
    expect(state.career!.challengeOptions).toHaveLength(3);
    state.career!.challenge = state.career!.challengeOptions![0];
    while (state.date.year === 2026) await playWeek(state, rs, WORLD, rng);
    const report = state.career!.reports[0];
    expect(report.challenge && Math.abs(report.challenge.reputation)).toBeGreaterThan(0);
    expect(state.career!.challengeOptions).toHaveLength(3); // musim baru: pilihan baru
    expect(state.career!.challenge).toBeUndefined();
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
    const inaPairsBefore = state.pairs.filter((p) => p.id.startsWith('INA') && !p.adHoc).length;
    while (state.date.year === 2026) await playWeek(state, rs, WORLD, rng);
    const formedByAi = state.pairs.filter((p) => p.id.startsWith('INA') && p.formed.year === 2026 && p.formed.week === 52);
    expect(formedByAi).toHaveLength(0);
    // Pasangan junior otomatis (adHoc, khusus turnamen junior) bukan pasangan utama negara manajer.
    expect(state.pairs.filter((p) => p.id.startsWith('INA') && !p.adHoc).length).toBe(inaPairsBefore);
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
    for (const id of trial.playerIds) state.players.find((p) => p.id === id)!.injury = undefined; // yang diuji entry, bukan cedera
    state.manualEntries[weekKey(week)] = { [trial.id]: ev.id };
    await playWeek(state, rs, WORLD, rng);
    const rec = state.eventRecords.find((r) => r.tournamentId === ev.id && r.year === week.year && r.discipline === 'MD')!;
    const listed = [...rec.entry.main, ...rec.entry.wildcards, ...rec.entry.qualifying, ...rec.entry.reserves].map((c) => c.id);
    expect(listed).toContain(trial.id);
    // Atlet yang sama tidak bisa tampil dengan pasangan MD lain di minggu itu (turnamen mana pun).
    const weekEvents = new Set(rs.calendar.filter((e) => e.week === week.week).map((e) => e.id));
    expect(state.matches.some((m) => weekEvents.has(m.tournamentId) && m.year === week.year && m.sides.includes(main.id))).toBe(false);
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

describe('promosi junior (pelatnas pratama → utama)', () => {
  it('junior pratama negara sendiri tidak didaftarkan otomatis ke turnamen senior; manual & promosi bisa', async () => {
    const state = newSeason(WORLD, rs, 11, undefined, 'INA');
    const rng = makeRng(11);
    const pratama = () => state.players.filter((p) => p.countryId === 'INA' && isPratama(p, state.date));
    expect(pratama().length).toBeGreaterThan(2);
    const ids = new Set(pratama().map((p) => p.id));
    const sides = (m: { sides: string[] }) => m.sides.flatMap((s) => state.pairs.find((x) => x.id === s)?.playerIds ?? [s]);
    for (let i = 0; i < 6; i++) await playWeek(state, rs, WORLD, rng);
    // Hanya yang masih pratama sampai akhir (yang berulang tahun ke-19 di tengah jalan boleh didaftarkan AI).
    const still = new Set(pratama().map((p) => p.id).filter((id) => ids.has(id)));
    expect(still.size).toBeGreaterThan(0);
    // Turnamen junior (U19) boleh; turnamen senior tidak.
    const junior = new Set(rs.calendar.filter((e) => rs.tiers.find((x) => x.id === e.tierId)?.junior).map((e) => e.id));
    expect(state.matches.some((m) => !junior.has(m.tournamentId) && sides(m).some((id) => still.has(id)))).toBe(false);
    // Junior AI tetap bermain di sirkuit senior.
    const aiJuniors = new Set(state.players.filter((p) => p.countryId !== 'INA' && isJuniorAge(p, state.date)).map((p) => p.id));
    expect(state.matches.some((m) => sides(m).some((id) => aiJuniors.has(id)))).toBe(true);
    // Didaftarkan manual: ikut walau pratama.
    while (!rs.calendar.some((e) => e.week === state.date.week && e.tierId === 'S300')) await playWeek(state, rs, WORLD, rng);
    const ev = rs.calendar.find((e) => e.week === state.date.week && e.tierId === 'S300')!;
    const j = pratama().find((p) => p.gender === 'M' && p.focus !== 'D')!;
    state.manualEntries[weekKey(state.date)] = { [j.id]: ev.id };
    const year = state.date.year;
    await playWeek(state, rs, WORLD, rng);
    const rec = state.eventRecords.find((r) => r.tournamentId === ev.id && r.year === year && r.discipline === 'MS')!;
    expect([...rec.entry.main, ...rec.entry.wildcards, ...rec.entry.qualifying, ...rec.entry.reserves].map((c) => c.id)).toContain(j.id);
    promoteJunior(state, j.id);
    expect(isPratama(j, state.date)).toBe(false);
  });
});

describe('lepas dari pelatnas', () => {
  it('tetap bertanding diatur AI, keluar dari tim manajer; AI hanya memasangkan sesama yang dilepas', async () => {
    const { releasePlayer } = await import('./career');
    const { planWeek } = await import('./plan');
    const { formPairs, teamStrengths } = await import('./season');
    const state = newSeason(WORLD, rs, 21, undefined, 'INA');
    const md = state.pairs.find((p) => p.discipline === 'MD' && !p.dissolved && !p.trial && state.players.find((x) => x.id === p.playerIds[0])!.countryId === 'INA')!;
    const [a, partner] = md.playerIds;
    releasePlayer(state, a);
    expect(md.dissolved).toBeDefined(); // pasangan dengan anggota pelatnas bubar
    expect(state.players.find((x) => x.id === partner)!.released).toBeUndefined();
    // keluar dari rencana & tim beregu manajer
    const week = rs.calendar.find((e) => e.tierId === 'S500')!.week;
    expect(planWeek(state, rs, week).has(a)).toBe(false);
    const ina = teamStrengths(state, rs, 'thomas').find((s) => s.countryId === 'INA')!;
    expect(Object.values(ina.pool).flat().some((e) => e.playerIds.includes(a))).toBe(false);
    // AI memasangkan dua atlet putra yang dilepas, tidak dengan anggota pelatnas
    const other = state.players.find((x) => x.countryId === 'INA' && x.gender === 'M' && x.id !== a && x.retired === undefined && x.focus !== 'S' && x.birth.year <= 2007)!;
    releasePlayer(state, other.id);
    formPairs(state, rs, WORLD, makeRng(1));
    const fresh = state.pairs.filter((p) => !p.dissolved && p.playerIds.some((id) => id === a || id === other.id));
    expect(fresh.some((p) => p.discipline === 'MD' && p.playerIds.includes(a) && p.playerIds.includes(other.id))).toBe(true);
    expect(fresh.every((p) => p.playerIds.every((id) => state.players.find((x) => x.id === id)!.released !== undefined))).toBe(true);
    // tetap bertanding: AI mendaftarkan pasangan barunya ke turnamen
    const sides = new Set([a, other.id, ...fresh.map((p) => p.id)]);
    const rng = makeRng(2);
    while (state.date.week <= 20 && !state.matches.some((m) => m.sides.some((x) => sides.has(x)))) await playWeek(state, rs, WORLD, rng);
    expect(state.matches.some((m) => m.sides.some((x) => sides.has(x)))).toBe(true);
    // panggil kembali: masuk pelatnas lagi, pasangan bentukan AI bubar
    const { recallPlayer } = await import('./career');
    recallPlayer(state, a);
    expect(state.players.find((x) => x.id === a)!.released).toBeUndefined();
    expect(state.pairs.some((p) => !p.dissolved && p.playerIds.includes(a))).toBe(false);
    expect(planWeek(state, rs, week).has(a) || state.players.find((x) => x.id === a)!.focus === 'D').toBe(true);
  });
});

describe('saran target', () => {
  it('atlet terkuat negara mendapat target lebih tinggi; yang jauh di luar 32 besar perkiraan peserta tanpa target', () => {
    const state = newSeason(WORLD, BWF_2026, 3, undefined, 'INA');
    const ev = BWF_2026.calendar.find((e) => e.tierId === 'S1000')!;
    const ms = state.players.filter((p) => p.countryId === 'INA' && p.gender === 'M' && p.retired === undefined && p.focus !== 'D')
      .sort((a, b) => currentAbility(b.attrs) - currentAbility(a.attrs));
    const best = ms[0], weak = ms.at(-1)!;
    const s = suggestTargets(state, BWF_2026, WORLD, ev.id, [{ id: best.id, d: 'MS' }, { id: weak.id, d: 'MS' }]);
    expect(s.get(best.id)).toBeDefined();
    expect(s.get(weak.id)).toBeUndefined();
    expect(ROUNDS.indexOf(s.get(best.id)!)).toBeLessThanOrEqual(ROUNDS.indexOf('R16'));
  });
});
