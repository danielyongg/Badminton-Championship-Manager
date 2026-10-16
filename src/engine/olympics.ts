import type { Candidate } from './entry';
import { absWeek, computeRanking } from './ranking';
import { entrantsFor, hostCityId, isHeld, type SeasonState } from './season';
import { isDoubles, type Discipline, type Ruleset, type World } from './types';

// Kualifikasi Olimpiade (BWF, regulasi LA28 disetujui IOC Des 2025):
// periode kualifikasi 3 Mei (tahun sebelumnya) – 30 April (tahun Olimpiade) → "LA28 Olympic Ranking";
// tunggal 38 tempat (35 kuota + 1 tuan rumah + 2 universality), ganda 16 pasangan;
// 2 tempat per negara hanya bila keduanya top 16 (tunggal) / top 8 (ganda);
// wakil benua: tunggal min. 2 atlet per konfederasi (s/d peringkat 250), ganda 1 pasangan (s/d peringkat 50).
// ASUMSI: 2 tempat universality diperlakukan sebagai tempat ranking biasa; batas 8 atlet per gender per negara
// otomatis terpenuhi (maks 2 per nomor); batas "2 nomor lewat wakil benua" tidak dimodelkan.

/** Olimpiade terdekat (tahun ini atau sesudahnya). */
export function nextOlympics(rs: Ruleset, year: number) {
  const og = rs.calendar.find((e) => e.tierId === 'OG');
  if (!og) return undefined;
  for (let y = year; y < year + 8; y++) if (isHeld(og, y)) return { event: og, year: y };
  return undefined;
}

/** Periode kualifikasi (absolute week): minggu 18 (awal Mei) tahun sebelumnya s/d minggu 17 (akhir April) tahun Olimpiade. */
export const qualificationWindow = (ogYear: number) => ({ from: (ogYear - 1) * 52 + 18, to: ogYear * 52 + 17 });

/**
 * Ranking Olimpiade: hanya poin turnamen dalam periode kualifikasi, dihitung sampai minggu ini (atau akhir periode).
 * Sebelum periode dimulai = ranking dunia saat ini (`projected`), sebagai perkiraan.
 */
export function olympicRanking(state: SeasonState, rs: Ruleset, d: Discipline, ogYear: number) {
  const w = qualificationWindow(ogYear);
  const now = absWeek(state.date);
  if (now < w.from) return { rows: computeRanking(state.results, d, now, rs), projected: true };
  const at = Math.min(now, w.to);
  return { rows: computeRanking(state.results.filter((r) => { const a = absWeek(r); return a >= w.from && a <= at; }), d, at, rs), projected: false };
}

export interface OlympicPlace extends Candidate { via: 'rank' | 'continent' | 'host' }

/** Peserta Olimpiade satu nomor menurut ranking Olimpiade & kuota (atlet cedera/pensiun/keluar pelatnas dilewati). */
export function olympicField(state: SeasonState, rs: Ruleset, d: Discipline, ogYear: number, world?: World): OlympicPlace[] {
  const og = rs.calendar.find((e) => e.tierId === 'OG');
  const size = rs.tiers.find((x) => x.id === 'OG')?.drawSize[d] ?? 0;
  if (!og || !size) return [];
  const doubles = isDoubles(d);
  const top = doubles ? 8 : 16, contMin = doubles ? 1 : 2, contRank = doubles ? 50 : 250;
  const out = new Set(state.players.filter((p) => p.injury || p.retired !== undefined || p.released !== undefined).map((p) => p.id));
  const country = new Map(entrantsFor(state, d).filter((e) => !e.playerIds.some((id) => out.has(id))).map((e) => [e.id, e.countryId]));
  const ranking = olympicRanking(state, rs, d, ogYear).rows.filter((r) => country.has(r.entrantId))
    .map((r) => ({ id: r.entrantId, countryId: country.get(r.entrantId)!, rank: r.rank }));
  const host = world?.cities.find((c) => c.id === hostCityId(og, ogYear))?.countryId;
  const hostPlace = !doubles && host ? 1 : 0; // tempat tuan rumah hanya di tunggal

  const picked: OlympicPlace[] = [];
  const has = (id: string) => picked.some((p) => p.id === id);
  const nocOk = (c: Candidate) => {
    const same = picked.filter((p) => p.countryId === c.countryId);
    return same.length === 0 || (same.length === 1 && same[0].rank! <= top && c.rank! <= top);
  };
  for (const c of ranking) {
    if (picked.length >= size - hostPlace) break;
    if (nocOk(c)) picked.push({ ...c, via: 'rank' });
  }
  if (world) {
    // Wakil benua: benua yang kurang mendapat atlet terbaiknya; yang keluar = tempat ranking terbawah dari benua lain yang berlebih.
    const conf = new Map(world.countries.map((c) => [c.id, c.confederation]));
    const count = (cf: string) => picked.filter((p) => conf.get(p.countryId) === cf).length;
    for (const cf of [...new Set(world.countries.map((c) => c.confederation))]) {
      while (count(cf) < contMin) {
        const cand = ranking.find((c) => conf.get(c.countryId) === cf && c.rank <= contRank && !has(c.id) && nocOk(c));
        const drop = [...picked].reverse().find((p) => p.via === 'rank' && conf.get(p.countryId) !== cf && count(conf.get(p.countryId)!) > contMin);
        if (!cand || !drop) break;
        picked.splice(picked.indexOf(drop), 1);
        picked.push({ ...cand, via: 'continent' });
      }
    }
  }
  if (hostPlace) {
    const best = picked.some((p) => p.countryId === host) ? undefined : ranking.find((c) => c.countryId === host);
    const next = best ? { ...best, via: 'host' as const } : ranking.filter((c) => !has(c.id) && nocOk(c)).map((c) => ({ ...c, via: 'rank' as const }))[0];
    if (next) picked.push(next);
  }
  return picked.sort((a, b) => a.rank! - b.rank!);
}
