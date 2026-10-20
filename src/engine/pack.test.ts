import { describe, expect, it } from 'vitest';
import { ageAt, currentAbility, generateWorld, TEAM_MIN_PER_GENDER } from './generator';
import { normalizePack, presetPack, PRESETS, syncOfficialCalendar, validatePack, type DataPack } from './pack';
import { WORLD } from './presets/world';
import { makeRng } from './rng';
import { isHeld, newSeason, teamStrengths, weekOf } from './season';
import { ATTRS, type Player, type TournamentDef } from './types';

/** Paket penuh: preset + atlet fiktif yang sudah diedit (seperti hasil "Salin untuk diedit"). */
function fullPack(): DataPack {
  const pack = structuredClone(presetPack(PRESETS[1]));
  const w = generateWorld(makeRng(5), pack.ruleset.generator, pack.world.countries, { year: 2027, week: 1 });
  Object.assign(pack, { id: 'p1', name: 'Paket uji', updatedAt: 123, players: w.players, pairs: w.pairs });
  pack.players[0].name = 'Atlet Diedit';
  pack.ruleset.calendar[0].week = 3;
  pack.world.countries[0].traditionStrength = 77;
  return pack;
}

const player = (id: string, countryId: string, gender: 'M' | 'F', v = 80): Player => ({
  id, name: id, countryId, gender, hand: 'R', birth: { year: 2000, week: 10 },
  attrs: Object.fromEntries(ATTRS.map((a) => [a, v])) as Player['attrs'], pa: v + 5, form: 0, fatigue: 0, attrHistory: [],
});

describe('paket data (Editor, import/export)', () => {
  it('preset bawaan sah', () => {
    for (const rs of PRESETS) expect(validatePack(presetPack(rs))).toEqual([]);
  });

  it('round-trip: ekspor → impor menghasilkan paket identik', () => {
    const pack = fullPack();
    expect(validatePack(pack)).toEqual([]);
    const back = normalizePack(JSON.parse(JSON.stringify(pack)));
    expect(back).toEqual(pack);
    expect(JSON.stringify(back)).toBe(JSON.stringify(pack)); // termasuk urutan kunci
  });

  it('impor sebagian: hanya atlet → ruleset & dunia bawaan, nilai kosong diisi', () => {
    const { attrHistory, form, fatigue, hand, ...bare } = player('X1', 'INA', 'M');
    void attrHistory; void form; void fatigue; void hand;
    const pack = normalizePack({ players: [bare] });
    expect(pack.ruleset.id).toBe('bwf-2026');
    expect(pack.world.countries.length).toBe(WORLD.countries.length);
    expect(pack.players[0]).toMatchObject({ hand: 'R', form: 0, fatigue: 0, attrHistory: [] });
    expect(validatePack(pack)).toEqual([]);
    expect(() => normalizePack([1, 2])).toThrow();
  });

  it('validasi menangkap rujukan rusak & nilai tidak sah', () => {
    const pack = normalizePack({ players: [player('A', 'INA', 'M'), player('B', 'INA', 'F'), player('C', 'XXX', 'M', 150)] });
    pack.pairs.push({ id: 'p', discipline: 'MD', playerIds: ['A', 'B'], chemistry: 50, matchesTogether: 0, formed: { year: 2026, week: 1 } });
    pack.ruleset = structuredClone(pack.ruleset);
    pack.ruleset.calendar[0].cityId = 'atlantis';
    pack.world = structuredClone(pack.world);
    pack.world.cities.push({ ...pack.world.cities[0] });
    const errs = validatePack(pack).join('\n');
    expect(errs).toMatch(/kota "atlantis" tidak ada/);
    expect(errs).toMatch(/Atlet C: negara "XXX"/);
    expect(errs).toMatch(/Atlet C: atribut/);
    expect(errs).toMatch(/gender tidak cocok untuk MD/);
    expect(errs).toMatch(/Kota: id "kuala-lumpur" dipakai lebih dari sekali/);
  });

  it('New Game memakai atlet paket; kekurangan & negara lain diisi generator; pasangan dibentuk bila kurang', () => {
    const roster = ['M1', 'M2', 'M3', 'M4'].map((id) => player(id, 'INA', 'M')).concat(['F1', 'F2', 'F3'].map((id) => player(id, 'INA', 'F')));
    roster[0].name = 'Bintang Impor';
    const state = newSeason(WORLD, PRESETS[0], 1, undefined, 'INA', { players: roster, pairs: [] });
    const ina = state.players.filter((p) => p.countryId === 'INA');
    expect(ina.filter((p) => p.gender === 'M' && ageAt(p.birth, state.date) >= 18).length).toBe(TEAM_MIN_PER_GENDER); // 4 asli + 3 fiktif
    for (const r of roster) expect(ina.some((p) => p.id === r.id)).toBe(true);
    // Senior fiktif tambahan tidak lebih kuat dari senior paket terlemah.
    const weakest = Math.min(...roster.map((p) => currentAbility(p.attrs)));
    for (const p of ina) if (!roster.some((r) => r.id === p.id) && ageAt(p.birth, state.date) >= 18) expect(currentAbility(p.attrs)).toBeLessThanOrEqual(weakest);
    expect(state.players.find((p) => p.id === 'M1')!.name).toBe('Bintang Impor');
    expect(state.players.some((p) => p.countryId === 'CHN')).toBe(true);
    const inaPairs = state.pairs.filter((p) => ina.some((r) => r.id === p.playerIds[0]));
    expect(new Set(inaPairs.map((p) => p.discipline))).toEqual(new Set(['MD', 'WD', 'XD']));
    expect(state.managedCountryId).toBe('INA');
    expect(roster[0].fatigue).toBe(0); // roster tidak ikut berubah (disalin)
  });

  it('paket bawaan berisi atlet asli; atlet fiktif hanya untuk melengkapi tim beregu', () => {
    const pack = presetPack(PRESETS[0]);
    const state = newSeason(pack.world, pack.ruleset, 1, undefined, 'INA', pack);
    const ina = state.players.filter((p) => p.countryId === 'INA');
    expect(ina.some((p) => p.name === 'Jonatan Christie')).toBe(true);
    // Senior asli cukup → tanpa senior fiktif; junior (belum ada data asli) tetap ada.
    expect(ina.filter((p) => ageAt(p.birth, state.date) >= 18).every((p) => p.id.includes('-r-'))).toBe(true);
    expect(ina.some((p) => ageAt(p.birth, state.date) <= 17)).toBe(true);
    expect(state.players.filter((p) => p.countryId === 'MAC' && p.gender === 'F' && ageAt(p.birth, state.date) >= 18).length).toBe(TEAM_MIN_PER_GENDER); // sedikit atlet asli + fiktif
    // Semua negara bisa menurunkan tim beregu.
    for (const f of ['thomas', 'uber', 'sudirman'] as const) expect(teamStrengths(state, pack.ruleset, f).length).toBe(pack.world.countries.length);
    expect(state.pairs.some((p) => p.id === 'INA-r-MD1')).toBe(true);
    expect(state.players.some((p) => p.countryId === 'PHI')).toBe(true); // negara tanpa atlet asli tetap terisi
    // Spesialis ganda asli tidak punya ranking tunggal awal (AI tidak mendaftarkannya di tunggal).
    const doublesOnly = new Set(state.players.filter((p) => p.focus === 'D').map((p) => p.id));
    expect(doublesOnly.size).toBeGreaterThan(0);
    expect(state.results.some((r) => (r.discipline === 'MS' || r.discipline === 'WS') && doublesOnly.has(r.entrantId))).toBe(false);
    // Tiap atlet paling banyak satu pasangan aktif per nomor (dulu pasangan berisi spesialis tunggal tidak terhitung).
    const slots = state.pairs.filter((p) => !p.dissolved && !p.trial).flatMap((p) => p.playerIds.map((id) => `${p.discipline}:${id}`));
    expect(new Set(slots).size).toBe(slots.length);
  });
});

describe('syncOfficialCalendar (save lama → kalender resmi)', () => {
  const t = (id: string, week: number, tierId = 'IC', extra = {}): TournamentDef => ({ id, name: id, cityId: 'lima', week, tierId, prizeUsd: 0, ...extra });
  it('musim berjalan tetap; minggu/tier baru musim depan; turnamen baru mulai tahun depan; yang hilang berhenti tahun ini', () => {
    const saved = [t('peru-ic', 14), t('lingshui-masters', 15, 'S100'), t('asia-junior', 28, 'JC')];
    const preset = [t('peru-ic', 43), t('swedish-is', 3, 'IS'), t('philippine-open', 15, 'S100', { years: { from: 2027 }, weeks: { 2027: 15, 2028: 7 } })];
    syncOfficialCalendar(saved, preset, 2026);
    const get = (id: string) => saved.find((e) => e.id === id)!;
    expect([weekOf(get('peru-ic'), 2026), weekOf(get('peru-ic'), 2027)]).toEqual([14, 43]);
    expect([isHeld(get('lingshui-masters'), 2026), isHeld(get('lingshui-masters'), 2027)]).toEqual([true, false]);
    expect([isHeld(get('swedish-is'), 2026), isHeld(get('swedish-is'), 2027)]).toEqual([false, true]);
    expect(get('philippine-open').weeks).toEqual({ 2027: 15, 2028: 7 });
    expect(get('asia-junior').week).toBe(28); // junior tidak disentuh
  });
});
