import type { Candidate } from './entry';
import { currentAbility, isJuniorAge } from './generator';
import type { Rng } from './rng';
import { adHocId } from './team';
import { DISCIPLINES, isDoubles, type Discipline, type Pair, type Player, type Ruleset, type TournamentDef, type World } from './types';

// Turnamen junior (U19): peserta dipilih otomatis per negara (maks kuota tier), diurutkan ranking junior lalu kemampuan.
// Ganda: pasangan junior yang ada (kedua atlet U19), sisanya dipasangkan otomatis (pasangan `junior` + `adHoc`).

const GENDERS: Record<'MD' | 'WD' | 'XD', ['M' | 'F', 'M' | 'F']> = { MD: ['M', 'M'], WD: ['F', 'F'], XD: ['M', 'F'] };

interface JuniorState {
  players: Player[];
  pairs: Pair[];
  date: { year: number; week: number };
}

/**
 * Peserta turnamen junior minggu ini. `manual`: keputusan entry manajer minggu ini (istirahat / turnamen lain →
 * tidak ikut turnamen junior). Mengembalikan peserta per event & nomor, pasangan baru, dan atlet yang sibuk.
 */
export function juniorEntries(
  state: JuniorState, events: TournamentDef[], rs: Ruleset, world: World,
  ranks: Map<Discipline, Map<string, number>>, manual: Record<string, string>, rng: Rng,
) {
  const conf = new Map(world.countries.map((c) => [c.id, c.confederation]));
  const entries = new Map<string, Map<Discipline, Candidate[]>>();
  const created: Pair[] = [];
  const busy = new Set<string>();
  const abil = new Map(state.players.map((p) => [p.id, currentAbility(p.attrs)]));
  const ca = (id: string) => abil.get(id)!;

  const hostConf = (ev: TournamentDef) => conf.get(world.cities.find((c) => c.id === ev.cityId)?.countryId ?? '');
  for (const ev of events) {
    const tier = rs.tiers.find((x) => x.id === ev.tierId)!;
    const { quota, play = 1, local } = tier.junior!;
    const free = (id: string) => manual[id] === undefined || manual[id] === ev.id;
    // Atlet yang sudah terdaftar di turnamen junior lain minggu ini tidak ikut lagi.
    const elsewhere = new Set(busy);
    // Turnamen opsional (Grand Prix/Challenge/Series), sekali per atlet per turnamen: istirahat bila lelah, peluang ikut
    // per tier, dan turnamen lokal sebagian besar diikuti atlet dari benua tuan rumah. Kejuaraan dunia/kontinental &
    // pilihan manajer: selalu ikut.
    const optional = play < 1 || local;
    const wants = new Map<string, boolean>();
    const joins = (p: Player) => !optional || manual[p.id] === ev.id || (wants.get(p.id) ?? wants.set(p.id, p.fatigue <= rs.ai.restAbove
      && rng() < play && (!local || conf.get(p.countryId) === hostConf(ev) || rng() < rs.ai.awayGrade3)).get(p.id)!);
    const eligible = (p: Player) => p.retired === undefined && !p.injury && isJuniorAge(p, state.date) && !elsewhere.has(p.id)
      && (!ev.confederation || conf.get(p.countryId) === ev.confederation) && free(p.id) && joins(p);
    const byD = new Map<Discipline, Candidate[]>();
    for (const d of DISCIPLINES) {
      if (!tier.drawSize[d]) { byD.set(d, []); continue; }
      const cap = isDoubles(d) ? quota.doubles : quota.singles;
      const list: { id: string; countryId: string; playerIds: string[] }[] = isDoubles(d)
        ? juniorPairs(state, d as 'MD' | 'WD' | 'XD', eligible, free, cap, created, rng)
        : state.players.filter((p) => p.gender === (d === 'MS' ? 'M' : 'F') && eligible(p))
          .sort((a, b) => Number(a.focus === 'D') - Number(b.focus === 'D')) // spesialis tunggal didahulukan
          .map((p) => ({ id: p.id, countryId: p.countryId, playerIds: [p.id] }));
      const strength = (e: { playerIds: string[] }) => e.playerIds.reduce((s, id) => s + ca(id), 0);
      const rank = ranks.get(d)!;
      const sorted = list.sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity) || strength(b) - strength(a));
      const per = new Map<string, number>();
      const picked = sorted.filter((e) => {
        const n = per.get(e.countryId) ?? 0;
        if (n >= cap) return false;
        per.set(e.countryId, n + 1);
        return true;
      });
      // Peringkat entry: ranking junior, yang belum punya diurutkan menurut kemampuan (agar unggulan masuk akal).
      byD.set(d, picked.map((e, i) => ({ id: e.id, countryId: e.countryId, rank: i + 1 })));
      for (const e of picked) e.playerIds.forEach((id) => busy.add(id));
    }
    entries.set(ev.id, byD);
  }
  return { entries, created, busy };
}

/** Pasangan junior satu nomor: pasangan aktif yang kedua atletnya U19, lalu sisa junior dipasangkan otomatis per negara. */
function juniorPairs(
  state: JuniorState, d: 'MD' | 'WD' | 'XD', eligible: (p: Player) => boolean, free: (id: string) => boolean,
  cap: number, created: Pair[], rng: Rng,
) {
  const players = new Map(state.players.map((p) => [p.id, p]));
  const ok = (id: string) => { const p = players.get(id); return !!p && eligible(p); };
  const existing = state.pairs.filter((p) => p.discipline === d && !p.dissolved && !p.trial && (!p.adHoc || p.junior)
    && p.playerIds.every(ok) && free(p.id));
  const out = existing.filter((p) => !p.junior).map((p) => ({ id: p.id, countryId: players.get(p.playerIds[0])!.countryId, playerIds: [...p.playerIds] }));
  const used = new Set(out.flatMap((e) => e.playerIds));
  const byCountry = new Map<string, Player[]>();
  for (const p of state.players) if (eligible(p) && !used.has(p.id)) byCountry.set(p.countryId, [...(byCountry.get(p.countryId) ?? []), p]);
  for (const [country, pool] of byCountry) {
    let have = out.filter((e) => e.countryId === country).length;
    const left = pool.sort((a, b) => currentAbility(b.attrs) - currentAbility(a.attrs));
    const [g1, g2] = GENDERS[d];
    while (have < cap) {
      const a = left.find((p) => p.gender === g1);
      const b = a && left.find((p) => p !== a && p.gender === g2);
      if (!a || !b) break;
      left.splice(left.indexOf(a), 1);
      left.splice(left.indexOf(b), 1);
      // Pakai ulang pasangan junior otomatis yang sama (ranking junior berlanjut), atau bentuk baru.
      let pair = existing.find((p) => p.junior && p.playerIds.includes(a.id) && p.playerIds.includes(b.id))
        ?? created.find((p) => p.discipline === d && p.playerIds.includes(a.id) && p.playerIds.includes(b.id));
      if (!pair) {
        pair = {
          id: `${country}-${d}-J${state.date.year}-${state.pairs.length + created.length}`, discipline: d, playerIds: [a.id, b.id],
          chemistry: 35 + Math.floor(rng() * 15), matchesTogether: 0, formed: { ...state.date }, adHoc: true, junior: true, // ASUMSI
        };
        created.push(pair);
      }
      out.push({ id: pair.id, countryId: country, playerIds: [a.id, b.id] });
      have++;
    }
  }
  return out;
}

/**
 * Peserta tim junior (Suhandinata Cup) satu nomor, tanpa efek samping: tunggal = atlet U19; ganda = pasangan aktif yang
 * kedua atletnya U19, lalu sisa junior dipasangkan sebagai ganda dadakan (`adhoc:a+b`, jadi pasangan nyata saat main).
 */
export function juniorTeamEntrants(state: JuniorState, d: Discipline, perCountry = 3) {
  const junior = (p: Player) => p.retired === undefined && isJuniorAge(p, state.date);
  const players = new Map(state.players.map((p) => [p.id, p]));
  if (!isDoubles(d))
    return state.players.filter((p) => junior(p) && p.gender === (d === 'MS' ? 'M' : 'F') && p.focus !== 'D').map((p) => ({ id: p.id, countryId: p.countryId, playerIds: [p.id] }));
  const ok = (id: string) => { const p = players.get(id); return !!p && junior(p); };
  const out = state.pairs.filter((p) => p.discipline === d && !p.dissolved && !p.trial && p.playerIds.every(ok))
    .map((p) => ({ id: p.id, countryId: players.get(p.playerIds[0])!.countryId, playerIds: [...p.playerIds] }));
  const used = new Set(out.flatMap((e) => e.playerIds));
  const [g1, g2] = GENDERS[d as 'MD' | 'WD' | 'XD'];
  const byCountry = new Map<string, Player[]>();
  for (const p of state.players) if (junior(p) && !used.has(p.id)) byCountry.set(p.countryId, [...(byCountry.get(p.countryId) ?? []), p]);
  for (const [country, pool] of byCountry) {
    const left = pool.sort((a, b) => currentAbility(b.attrs) - currentAbility(a.attrs));
    for (let have = out.filter((e) => e.countryId === country).length; have < perCountry; have++) {
      const a = left.find((p) => p.gender === g1);
      const b = a && left.find((p) => p !== a && p.gender === g2);
      if (!a || !b) break;
      left.splice(left.indexOf(a), 1);
      left.splice(left.indexOf(b), 1);
      out.push({ id: adHocId(a.id, b.id), countryId: country, playerIds: [a.id, b.id] });
    }
  }
  return out;
}
