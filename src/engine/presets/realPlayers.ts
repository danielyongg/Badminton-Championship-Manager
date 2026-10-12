import { ATTRS, type Attrs, type Pair, type Player } from '../types';
import data from './bwfPlayers.json';

// Atlet asli bawaan (paket BWF 2026 / 2027+) dari ranking dunia & junior BWF, diambil dengan `scripts/fetch-bwf.mjs`.
// Per negara game: senior s/d 24 per gender & junior s/d 8 per gender, terbaik dulu. Negara yang kurang dilengkapi
// atlet fiktif oleh generator.
// ASUMSI: "level" (≈ kemampuan) dihitung dari poin ranking relatif terhadap peringkat 1 nomornya; bukan data resmi.
// Tanggal lahir dari profil BWF; bila kosong diperkirakan (senior 25 th, junior 17 th saat data diambil). Tangan: kanan.

// [bwfId, nama, negara, gender, lahir YYYY-MM-DD | null, fokus tunggal/ganda, level, junior 0/1]
type Row = [number, string, string, 'M' | 'F', string | null, 'S' | 'D', number, number];
const ROWS = data.players as Row[];
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

function toPlayer([bwfId, name, countryId, gender, dob, focus, level, junior]: Row, startYear: number): Player {
  // Variasi kecil per atlet (tetap sama tiap New Game), lalu digeser agar rata-rata = level.
  const raw = ATTRS.map((a) => level + (SHAPE[focus][a] ?? 0) + (hash(name + a) % 7) - 3);
  const shift = level - raw.reduce((s, x) => s + x, 0) / raw.length;
  const attrs = Object.fromEntries(ATTRS.map((a, i) => [a, Math.max(1, Math.min(100, Math.round(raw[i] + shift)))])) as Attrs;
  const birth = birthOf(dob, junior);
  const age = startYear - birth.year;
  return {
    id: `${countryId}-r-${bwfId}`, name, countryId, gender, hand: 'R', birth,
    attrs, pa: Math.min(99, level + Math.max(1, (24 - age) * 2)), form: 0, fatigue: 0,
    attrHistory: [{ year: startYear - 1, attrs: { ...attrs } }],
  };
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
  return { players, pairs };
}
