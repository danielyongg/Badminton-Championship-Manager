import { describe, expect, it } from 'vitest';
import { generateWorld } from './generator';
import { normalizePack, presetPack, PRESETS, validatePack, type DataPack } from './pack';
import { WORLD } from './presets/world';
import { makeRng } from './rng';
import { newSeason } from './season';
import { ATTRS, type Player } from './types';

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

  it('New Game memakai atlet paket; negara lain diisi generator; pasangan dibentuk bila kurang', () => {
    const roster = ['M1', 'M2', 'M3', 'M4'].map((id) => player(id, 'INA', 'M')).concat(['F1', 'F2', 'F3'].map((id) => player(id, 'INA', 'F')));
    roster[0].name = 'Bintang Impor';
    const state = newSeason(WORLD, PRESETS[0], 1, undefined, 'INA', { players: roster, pairs: [] });
    const ina = state.players.filter((p) => p.countryId === 'INA');
    expect(ina.map((p) => p.id).sort()).toEqual(['F1', 'F2', 'F3', 'M1', 'M2', 'M3', 'M4']);
    expect(state.players.find((p) => p.id === 'M1')!.name).toBe('Bintang Impor');
    expect(state.players.some((p) => p.countryId === 'CHN')).toBe(true);
    const inaPairs = state.pairs.filter((p) => roster.some((r) => r.id === p.playerIds[0]));
    expect(new Set(inaPairs.map((p) => p.discipline))).toEqual(new Set(['MD', 'WD', 'XD']));
    expect(state.managedCountryId).toBe('INA');
    expect(roster[0].fatigue).toBe(0); // roster tidak ikut berubah (disalin)
  });
});
