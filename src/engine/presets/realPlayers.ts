import { ATTRS, type Attrs, type Pair, type Player } from '../types';
import { JUNIOR_MAX_AGE } from '../generator';
import data from './bwfPlayers.json';
import { WORLD } from './world';

// Atlet asli bawaan (paket BWF 2026 / 2027+) dari ranking dunia & junior BWF, diambil dengan `scripts/fetch-bwf.mjs`.
// Per negara game: senior s/d 24 per gender & junior s/d 8 per gender, terbaik dulu. Negara yang kurang dilengkapi
// atlet fiktif oleh generator.
// ASUMSI: "level" (≈ kemampuan) dihitung dari peringkat BWF (lihat docs/ASUMSI.md); bukan data resmi.
// Tanggal lahir dari profil BWF; bila kosong diperkirakan (senior 25 th, junior 17 th saat data diambil). Tangan: kanan.

// [bwfId, nama, negara, gender, lahir YYYY-MM-DD | null, fokus tunggal/ganda, level, junior 0/1]
type Row = [number, string, string, 'M' | 'F', string | null, 'S' | 'D', number, number];
const ROWS = (data.players as Row[]).map((r): Row => [r[0], r[1].replace(/\s+/g, ' ').trim(), ...r.slice(2)] as Row); // BWF kadang memakai spasi ganda
const PAIRS = data.pairs as [Pair['discipline'], number, number][];
const FETCHED_YEAR = Number(data.fetched.slice(0, 4));

// Gaya bermain menurut fokus: tunggal lebih cepat & tahan lama, ganda lebih kuat smash/net/servis.
const SHAPE: Record<'S' | 'D', Partial<Attrs>> = {
  S: { speed: 4, stamina: 5, consistency: 3, deception: 2, smash: -2, net: -3, serve: -5, warmup: -2 },
  D: { smash: 4, net: 4, serve: 3, defense: 2, stamina: -4, consistency: -3, deception: -3, warmup: -2 },
};
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

function birthOf(dob: string | null, junior: number) {
  if (!dob) return { year: FETCHED_YEAR - (junior ? 17 : 25), week: 26 };
  const d = new Date(dob);
  const dayOfYear = (d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000;
  return { year: d.getUTCFullYear(), week: Math.min(52, Math.floor(dayOfYear / 7) + 1) };
}

// File lama memakai rumus junior 72 − 4·ln(peringkat) (junior elit jauh di bawah remaja negara kecil di ranking senior);
// rumus sekarang 82 − 4,5·ln(peringkat) → konversi: 82 − 1,125·(72 − level).
const JUNIOR_V1 = !('juniorLevel' in data);
const TRADITION = new Map(WORLD.countries.map((c) => [c.id, c.traditionStrength]));

// ASUMSI: ruang tumbuh (PA − level) atlet muda ikut lingkungan latihan negaranya: tradisi 100 → penuh, tradisi 0 → GROWTH_MIN.
const JUNIOR_CUT = 20, GROWTH_MIN = 0.3;
const growthOf = (tradition: number) => GROWTH_MIN + (1 - GROWTH_MIN) * tradition / 100;

/** Level & PA bawaan atlet asli. `v1` = kalibrasi sebelum koreksi junior 2026-10-23 (untuk menyesuaikan save lama). */
function levelPa([, , countryId, , dob, , level, junior]: Row, startYear: number, v1 = false) {
  if (junior && JUNIOR_V1) level = Math.round(82 - 1.125 * (72 - level));
  // ASUMSI: di luar papan atas, peringkat pemain negara bertradisi lemah banyak dari turnamen kecil di kawasannya →
  // level dikurangi s/d 8 (tradisi 0) secara bertahap di bawah level 86; negara kuat hampir tidak berubah.
  // U19 (ranking junior, atau remaja di ranking senior negara kecil) dikurangi s/d JUNIOR_CUT: lapangan junior kawasan lebih tipis lagi.
  const tradition = TRADITION.get(countryId) ?? 50;
  const birth = birthOf(dob, junior);
  const age = startYear - birth.year;
  const cut = !v1 && (junior || age <= JUNIOR_MAX_AGE) ? JUNIOR_CUT : 8;
  level -= Math.round((1 - tradition / 100) * cut * Math.min(1, Math.max(0, (86 - level) / 10)));
  const growth = Math.max(1, (24 - age) * 2 * (v1 ? 1 : growthOf(tradition)));
  return { level, pa: Math.min(99, level + Math.round(growth)), birth };
}

function toPlayer(row: Row, startYear: number): Player {
  const [bwfId, name, countryId, gender, , focus, , junior] = row;
  const { level, pa, birth } = levelPa(row, startYear);
  // Variasi kecil per atlet (tetap sama tiap New Game), lalu digeser agar rata-rata = level.
  const raw = ATTRS.map((a) => level + (SHAPE[focus][a] ?? 0) + (hash(name + a) % 7) - 3);
  const shift = level - raw.reduce((s, x) => s + x, 0) / raw.length;
  const attrs = Object.fromEntries(ATTRS.map((a, i) => [a, Math.max(1, Math.min(100, Math.round(raw[i] + shift)))])) as Attrs;
  return {
    id: `${countryId}-r-${bwfId}`, name, countryId, gender, hand: 'R', birth,
    attrs, pa, form: 0, fatigue: 0, ...(focus === 'D' && { focus }),
    ...(!junior && { promoted: true }), // atlet ranking senior BWF: sudah di sirkuit senior walau masih U19
    attrHistory: [{ year: startYear - 1, attrs: { ...attrs } }],
  };
}

/** Save sebelum koreksi junior: selisih (lama − baru) level & PA atlet asli yang terkena, per id atlet. */
export function juniorRecalibration(startYear: number) {
  const out = new Map<string, { level: number; pa: number }>();
  for (const row of ROWS) {
    const before = levelPa(row, startYear, true), after = levelPa(row, startYear);
    if (before.level !== after.level || before.pa !== after.pa)
      out.set(`${row[2]}-r-${row[0]}`, { level: before.level - after.level, pa: before.pa - after.pa });
  }
  return out;
}

/** Atlet & pasangan asli untuk paket bawaan. */
export function realRoster(startYear: number): { players: Player[]; pairs: Pair[] } {
  const players = ROWS.map((r) => toPlayer(r, startYear));
  const idOf = new Map(ROWS.map((r) => [r[0], `${r[2]}-r-${r[0]}`]));
  const count = new Map<string, number>();
  const pairs = PAIRS.map(([discipline, a, b]): Pair => {
    const pa = idOf.get(a)!, pb = idOf.get(b)!;
    const key = `${pa.split('-')[0]}-${discipline}`;
    count.set(key, (count.get(key) ?? 0) + 1);
    return {
      id: `${pa.split('-')[0]}-r-${discipline}${count.get(key)}`, discipline, playerIds: [pa, pb],
      chemistry: 80, matchesTogether: 100, formed: { year: startYear - 2, week: 1 },
    };
  });
  // Atlet tunggal tanpa pasangan asli: hanya sektor Single (tidak muncul di form bentuk pasangan).
  const paired = new Set(pairs.flatMap((x) => x.playerIds));
  ROWS.forEach((r, i) => { if (r[5] === 'S' && !paired.has(players[i].id)) players[i].focus = 'S'; });
  return { players, pairs };
}
