import { ageAt, currentAbility, isJuniorAge } from './generator';
import { absWeek, computeRanking } from './ranking';
import type { Rng } from './rng';
import type { SeasonState } from './season';
import type { Discipline, Pair, Player, Ruleset, World } from './types';

/**
 * Pemain independen = atlet yang dilepas federasinya (`released`): tetap bertanding (diatur AI), tidak ikut beregu,
 * Olimpiade & multi-event. Hanya mereka yang boleh berpasangan beda negara (seperti pemain profesional di dunia nyata).
 * ASUMSI (konstanta, bukan ruleset, agar save lama ikut): negara AI menyimpan 10 atlet terkuat per gender; sisanya
 * usia ≥ 24 dilepas 25%/musim; usia 19–23 25% bila PA-nya di bawah kemampuan atlet ke-10 (tak akan menembus pelatnas), selain itu 5%.
 */
export const RELEASE_KEEP = 10, RELEASE_AGE = 24, RELEASE_CHANCE = 0.05, RELEASE_CHANCE_YOUNG = 0.01;
/** Pemain independen di luar 100 besar (tanpa dana pelatnas & hadiah kecil) berhenti 25%/musim, di luar pensiun biasa. */
export const INDEPENDENT_TOP = 100, INDEPENDENT_QUIT = 0.35;
/** Selisih kemampuan maksimal calon pasangan independen. */
export const PAIR_GAP = 5;

/** Pasangan beda negara: atletnya dari lebih dari satu negara. */
export const isCrossNation = (playerIds: string[], countryOf: (id: string) => string | undefined) => new Set(playerIds.map(countryOf)).size > 1;

/** Lepas atlet satu orang: pasangan aktifnya dengan atlet federasi dibubarkan (sesama independen tetap). */
export function markReleased(state: SeasonState, p: Player) {
  p.released = state.date.year;
  const out = new Set(state.players.filter((x) => x.released !== undefined).map((x) => x.id));
  for (const pair of state.pairs)
    if (!pair.dissolved && pair.playerIds.includes(p.id) && !pair.playerIds.every((id) => out.has(id))) pair.dissolved = { ...state.date };
}

/** Akhir musim: negara AI melepas atlet di luar 10 besar per gender. Junior (U19) tidak dilepas. */
export function releaseAthletes(state: SeasonState, rng: Rng): string[] {
  const out: string[] = [];
  const countries = new Set(state.players.map((p) => p.countryId));
  countries.delete(state.managedCountryId ?? '');
  for (const c of countries) for (const g of ['M', 'F'] as const) {
    const list = state.players
      .filter((p) => p.countryId === c && p.gender === g && p.retired === undefined && p.released === undefined && !isJuniorAge(p, state.date))
      .sort((a, b) => currentAbility(b.attrs) - currentAbility(a.attrs));
    if (list.length <= RELEASE_KEEP) continue;
    const bar = currentAbility(list[RELEASE_KEEP - 1].attrs);
    for (const p of list.slice(RELEASE_KEEP)) {
      const chance = ageAt(p.birth, state.date) >= RELEASE_AGE || p.pa < bar ? RELEASE_CHANCE : RELEASE_CHANCE_YOUNG;
      if (rng() < chance) { markReleased(state, p); out.push(p.id); }
    }
  }
  return out;
}

const PARTNER: Record<'MD' | 'WD' | 'XD', (g: 'M' | 'F') => 'M' | 'F' | null> = {
  MD: (g) => (g === 'M' ? 'M' : null), WD: (g) => (g === 'F' ? 'F' : null), XD: (g) => (g === 'M' ? 'F' : 'M'),
};

/**
 * AI memasangkan pemain independen yang belum punya pasangan utama di suatu nomor ganda: senegara dulu, lalu
 * sekonfederasi, lalu dari mana pun; hanya calon dengan selisih kemampuan ≤ 5, yang terdekat dipilih.
 * `onlyIds`: hanya atlet itu yang dicarikan pasangan (dipanggil saat manajer melepas atlet).
 */
export function pairIndependents(state: SeasonState, rs: Ruleset, world: World, rng: Rng, onlyIds?: string[]): Pair[] {
  const now = absWeek(state.date);
  // Spesialis tunggal (top 64 dunia) tidak dipasangkan, sama seperti `formPairs`.
  const stars = new Set((['MS', 'WS'] as Discipline[]).flatMap((d) => computeRanking(state.results, d, now, rs).filter((r) => r.rank <= 64).map((r) => r.entrantId)));
  const conf = new Map(world.countries.map((c) => [c.id, c.confederation]));
  const ca = new Map(state.players.map((p) => [p.id, currentAbility(p.attrs)]));
  const pool = state.players
    .filter((p) => p.released !== undefined && p.retired === undefined && p.focus !== 'S' && !stars.has(p.id)
      && !isJuniorAge(p, state.date) && ageAt(p.birth, state.date) >= 17)
    .sort((a, b) => ca.get(b.id)! - ca.get(a.id)!);
  const used = new Set(state.pairs.map((p) => p.id));
  const created: Pair[] = [];
  for (const d of ['MD', 'WD', 'XD'] as const) {
    const busy = new Set(state.pairs.filter((p) => p.discipline === d && !p.dissolved && !p.trial && !p.adHoc).flatMap((p) => p.playerIds));
    const seekers = onlyIds ? pool.filter((p) => onlyIds.includes(p.id)) : pool;
    for (const a of seekers) {
      const g = PARTNER[d](a.gender);
      if (!g || busy.has(a.id)) continue;
      const near = pool.filter((b) => b.id !== a.id && b.gender === g && !busy.has(b.id) && Math.abs(ca.get(b.id)! - ca.get(a.id)!) <= PAIR_GAP);
      const stages = [
        near.filter((b) => b.countryId === a.countryId),
        near.filter((b) => b.countryId !== a.countryId && conf.get(b.countryId) === conf.get(a.countryId)),
        near,
      ];
      const b = stages.find((s) => s.length)?.sort((x, y) => Math.abs(ca.get(x.id)! - ca.get(a.id)!) - Math.abs(ca.get(y.id)! - ca.get(a.id)!))[0];
      if (!b) continue;
      const [m, f] = d === 'XD' && a.gender === 'F' ? [b, a] : [a, b]; // XD: atlet putra di depan
      let n = 1;
      while (used.has(`${m.countryId}-${d}${state.date.year}-i${n}`)) n++;
      const pair: Pair = {
        id: `${m.countryId}-${d}${state.date.year}-i${n}`, discipline: d, playerIds: [m.id, f.id],
        chemistry: 30 + Math.floor(rng() * 20), matchesTogether: 0, formed: { ...state.date },
      };
      used.add(pair.id);
      busy.add(a.id).add(b.id);
      state.pairs.push(pair);
      created.push(pair);
    }
  }
  return created;
}
