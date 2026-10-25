# Sifat Atlet — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Setiap atlet punya 0–2 sifat (fisik, mental, morale, ganda) di samping sifat perkembangan yang sudah ada, dengan efek nyata di mesin game; sifat tersembunyi dan terungkap seiring waktu, dengan petunjuk dari pemandu bakat.

**Architecture:** Modul baru `src/engine/traits.ts` berisi daftar sifat, pengacakan deterministik per atlet (dari hash id — tidak menggeser urutan `rng` game), `hasTrait`, dan aturan terungkap. Efek dipasang di titik yang sudah ada: `applyEventLoad` & pemulihan mingguan (`season.ts`), `developQuarter` (`development.ts`), `sideAttrs`/`createMatch`/`playRally` (`match.ts`), `simPlay` (`tournament.ts`), `updateMorale` & `boosts.ts` (dari rencana morale). Save lama: sifat diacak sekali saat dimuat (deterministik).

**Tech Stack:** TypeScript, React (Vite), Vitest (`npx vitest run`), typecheck `npx tsc --noEmit -p .`, build `npm run build`.

## Prasyarat & hubungan dengan rencana lain

- **Wajib selesai dulu:** `docs/superpowers/plans/2026-10-25-morale-perkembangan.md` Task 1 (`boosts.ts`, `bumpForm`), Task 3 (`HOME_BONUS`), Task 4 (bonus skuad).
- **Menggantikan** Task 3 (catatan pemandu) dan Task 6 (sifat terungkap) di `docs/superpowers/plans/2026-10-25-scouting-development.md`. Lewati kedua task itu bila rencana ini dijalankan; Task 7 rencana itu (laporan kuartal, baris "Sifat terungkap") memakai `revealedTraits` dari Task 2 rencana ini.

## Global Constraints

- Sifat lama `Player.trait` ('late' | 'stagnant') tetap seperti sekarang (perilaku & peluang tidak berubah). Sifat baru di field terpisah `Player.traits?: TraitId[]`.
- Jumlah sifat baru per atlet: 0 (60 %), 1 (30 %), 2 (10 %). Pasangan yang bertentangan tidak boleh bersamaan: `ironBody`↔`injuryProne`, `clutch`↔`choker`, `idealPartner`↔`awkwardPartner`.
- Pengacakan sifat **tidak memakai `rng` game**: memakai `makeRng(hash(player.id))` agar urutan acak dunia/tes lama tidak bergeser.
- Atlet AI dan atlet asli BWF mendapat sifat dengan aturan yang sama.
- Setiap efek dijepit: morale −10..+10 (`bumpForm`), atribut 1–100, CA ≤ PA (`capToPa`).
- Field baru opsional; save lama dimuat lewat `ensureTraits` sekali (`state.traitsRolled?: true`).
- Teks UI di `src/i18n/index.ts` (id) dan `src/i18n/en.ts` (en); `i18n.test.ts` memeriksa kunci sama.
- Semua angka di `traits.ts` bertanda ASUMSI dan dicatat di `docs/ASUMSI.md`.
- Commit per task, pesan berbahasa Indonesia seperti riwayat repo.

## Daftar sifat

| Id | Nama (id / en) | Kelompok | Efek (ASUMSI) | Terungkap |
|---|---|---|---|---|
| `ironBody` | Tubuh baja / Iron body | fisik | peluang cedera ×0,5 | 2 musim |
| `injuryProne` | Rawan cedera / Injury-prone | fisik | peluang cedera ×1,8; tingkat cedera = yang terburuk dari 2 undian | 2 musim |
| `quickRecovery` | Cepat pulih / Quick recovery | fisik | pemulihan kelelahan mingguan ×1,5 | 2 musim |
| `ageless` | Awet muda / Ageless | fisik | penurunan usia dihitung seolah 2 tahun lebih muda | 2 musim |
| `traveler` | Musafir / Seasoned traveler | fisik | kelelahan perjalanan ×0,5 | 2 musim |
| `clutch` | Mental juara / Clutch | mental | +8 mental di poin kritis; +1 semua atribut di SF/F & turnamen besar | 30 laga |
| `choker` | Demam panggung / Big-stage nerves | mental | −8 mental di poin kritis; −1,5 semua atribut di SF/F & turnamen besar | 30 laga |
| `slowStarter` | Starter lambat / Slow starter | mental | penalti pemanasan ×1,5; +1,5 semua atribut di rubber game | 30 laga |
| `momentumRider` | Pemburu momentum / Momentum rider | mental | bobot momentum ×1,5 saat momentum memihaknya | 30 laga |
| `consistent` | Konsisten / Consistent | mental | kondisi hari itu ×0,5 (jarang sangat buruk/bagus) | 30 laga |
| `fragileMorale` | Mudah goyah / Fragile confidence | morale | penurunan morale ×1,5 | 30 laga |
| `homeHero` | Jagoan kandang / Home hero | morale | tambahan +1,5 morale saat turnamen kandang | 30 laga |
| `leader` | Pemimpin / Leader | morale | pasangannya +0,3 morale tiap menang; skuad beregu yang memuatnya +0,5 morale | 30 laga |
| `idealPartner` | Pasangan ideal / Ideal partner | ganda | kenaikan chemistry ×2 | 30 laga |
| `awkwardPartner` | Sulit cocok / Awkward partner | ganda | kenaikan chemistry ×0,5 | 30 laga |

Sifat lama `late`/`stagnant` terungkap setelah 2 musim (aturan sama dengan kelompok fisik).

## Peta file

| File | Tanggung jawab |
|---|---|
| `src/engine/traits.ts` (baru) | `TRAITS`, `TraitId`, konstanta efek, `rollTraits`, `ensureTraits`, `hasTrait`, `traitShare`, `visibleTraits`, `revealedTraits`, `traitHints` |
| `src/engine/traits.test.ts` (baru) | Tes semua sifat |
| `src/engine/types.ts` | `Player.traits?` |
| `src/engine/season.ts` | `SeasonState.traitsRolled?`, `newSeason`/`endYear` panggil `ensureTraits`; efek cedera, pemulihan, perjalanan, chemistry, morale; flag turnamen besar ke `simPlay` |
| `src/engine/match.ts` | `SideInput.big?`; efek mental & pertandingan |
| `src/engine/tournament.ts` | `simPlay` meneruskan `big` (opsi + babak SF/F) |
| `src/engine/development.ts` | `ageless` |
| `src/engine/boosts.ts` | `homeHero`, `leader`, `fragileMorale` |
| `src/engine/scouting.ts` | catatan pemandu (petunjuk sifat) |
| `src/ui/game.tsx` | `ensureTraits` saat save dimuat |
| `src/ui/Squad.tsx`, `src/ui/Career.tsx` | Badge sifat terungkap, catatan pemandu |
| `src/i18n/index.ts`, `src/i18n/en.ts` | Nama & penjelasan sifat |
| `docs/ASUMSI.md`, `docs/RENCANA.md` | Kalibrasi & status |

---

### Task 1: Model data, pengacakan deterministik, migrasi save

**Files:** Create `src/engine/traits.ts`, `src/engine/traits.test.ts`; Modify `src/engine/types.ts`, `src/engine/season.ts` (`SeasonState`, `newSeason`, `endYear`), `src/ui/game.tsx` (`gameFromBlob`).

**Interfaces:**
- Produces: `TraitId`, `TRAITS: readonly TraitId[]`, `rollTraits(id: string): TraitId[]`, `ensureTraits(players: Player[]): void` (hanya mengisi atlet yang `traits === undefined`), `hasTrait(p: Player, t: TraitId): boolean`, `traitShare(ps: Player[], t: TraitId): number` (bagian atlet di sisi itu yang punya sifat t, 0–1; ganda: 0 / 0,5 / 1).

- [ ] **Step 1: Tes gagal**

```ts
// src/engine/traits.test.ts
import { describe, expect, it } from 'vitest';
import { ensureTraits, hasTrait, rollTraits, traitShare, TRAITS } from './traits';
import type { Player } from './types';

describe('sifat: pengacakan', () => {
  it('deterministik per id, 0–2 sifat, tanpa pasangan bertentangan', () => {
    expect(rollTraits('INA-M1')).toEqual(rollTraits('INA-M1'));
    const all = Array.from({ length: 5000 }, (_, i) => rollTraits(`X-${i}`));
    expect(all.every((t) => t.length <= 2 && new Set(t).size === t.length && t.every((x) => TRAITS.includes(x)))).toBe(true);
    const bad = [['ironBody', 'injuryProne'], ['clutch', 'choker'], ['idealPartner', 'awkwardPartner']];
    expect(all.some((t) => bad.some(([a, b]) => t.includes(a as never) && t.includes(b as never)))).toBe(false);
    const share = (n: number) => all.filter((t) => t.length === n).length / all.length;
    expect(share(0)).toBeGreaterThan(0.55); expect(share(0)).toBeLessThan(0.65);
    expect(share(2)).toBeGreaterThan(0.07); expect(share(2)).toBeLessThan(0.13);
  });
  it('ensureTraits hanya mengisi yang belum punya; traitShare', () => {
    const a = { id: 'a' } as Player, b = { id: 'b', traits: ['clutch'] } as Player;
    ensureTraits([a, b]);
    expect(a.traits).toEqual(rollTraits('a'));
    expect(b.traits).toEqual(['clutch']);
    expect(hasTrait(b, 'clutch')).toBe(true);
    expect(traitShare([b, { id: 'c', traits: [] } as unknown as Player], 'clutch')).toBe(0.5);
  });
});
```

- [ ] **Step 2:** `npx vitest run src/engine/traits.test.ts` → FAIL.

- [ ] **Step 3: Implementasi**

```ts
// src/engine/traits.ts
import { makeRng } from './rng';
import type { Player } from './types';

// Sifat atlet (selain sifat perkembangan lama `Player.trait`). Semua angka: ASUMSI, lihat docs/ASUMSI.md.

export const TRAITS = [
  'ironBody', 'injuryProne', 'quickRecovery', 'ageless', 'traveler',
  'clutch', 'choker', 'slowStarter', 'momentumRider', 'consistent',
  'fragileMorale', 'homeHero', 'leader', 'idealPartner', 'awkwardPartner',
] as const;
export type TraitId = (typeof TRAITS)[number];

const CONFLICTS: [TraitId, TraitId][] = [['ironBody', 'injuryProne'], ['clutch', 'choker'], ['idealPartner', 'awkwardPartner']];
/** Peluang jumlah sifat: 0 / 1 / 2. */
const COUNT_CHANCE = [0.6, 0.3, 0.1];

const hash = (s: string) => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };

/** Sifat dari id atlet (deterministik, tidak memakai rng game). */
export function rollTraits(id: string): TraitId[] {
  const rng = makeRng(hash(`traits:${id}`));
  const r = rng();
  const n = r < COUNT_CHANCE[0] ? 0 : r < COUNT_CHANCE[0] + COUNT_CHANCE[1] ? 1 : 2;
  const out: TraitId[] = [];
  while (out.length < n) {
    const t = TRAITS[Math.floor(rng() * TRAITS.length)];
    if (out.includes(t) || CONFLICTS.some(([a, b]) => (t === a && out.includes(b)) || (t === b && out.includes(a)))) continue;
    out.push(t);
  }
  return out;
}

export function ensureTraits(players: Player[]) { for (const p of players) p.traits ??= rollTraits(p.id); }
export const hasTrait = (p: Player, t: TraitId) => !!p.traits?.includes(t);
export const traitShare = (ps: Player[], t: TraitId) => ps.filter((p) => hasTrait(p, t)).length / Math.max(1, ps.length);
```

> Cek dulu signature `makeRng` di `src/engine/rng.ts` (menerima seed number). Bila seed 0 bermasalah, pakai `hash(...) || 1`.

`types.ts` di `Player`:

```ts
  /** Sifat atlet (lihat traits.ts); undefined = belum diacak (save lama), diisi `ensureTraits`. */
  traits?: TraitId[];
```

(`import type { TraitId } from './traits';` — import tipe saja.)

`season.ts`: `SeasonState.traitsRolled?: true;`. Di `newSeason` setelah semua atlet dibuat: `ensureTraits(state.players); state.traitsRolled = true;` (tambahkan `traitsRolled: true` ke objek awal yang memuat `juniorPromotion: true, …` di ±baris 298). Di `endYear` setelah junior baru & kandidat dibuat: `ensureTraits(state.players); if (state.scouting) ensureTraits(state.scouting.candidates);`.

`game.tsx` `gameFromBlob` (pola migrasi seperti `hostsSpread`):

```ts
  if (!blob.state.traitsRolled) {
    ensureTraits(blob.state.players);
    if (blob.state.scouting) ensureTraits(blob.state.scouting.candidates);
    blob.state.traitsRolled = true;
  }
```

- [ ] **Step 4:** `npx vitest run` (semua; tes lama harus lulus tanpa perubahan karena rng game tidak tersentuh), `npx tsc --noEmit -p .` → bersih.
- [ ] **Step 5: Commit** — `"Sifat atlet: 15 sifat baru (0–2 per atlet, tanpa pasangan bertentangan), diacak deterministik dari id; save lama diisi saat dimuat"`

---

### Task 2: Sifat terungkap & tampil di UI

**Files:** Modify `src/engine/traits.ts`; UI `src/ui/Squad.tsx` (tabel skuad + profil), i18n; Test `traits.test.ts`.

**Interfaces:**
- `TRAIT_GROUP: Record<TraitId, 'physical' | 'mental' | 'morale' | 'doubles'>`
- `visibleTraits(p: Player, matchesPlayed: number): (TraitId | 'late' | 'stagnant')[]` — kelompok `physical` + `late`/`stagnant`: `p.attrHistory.length >= 2`; kelompok lain: `matchesPlayed >= 30`.
- `revealedTraits(p: Player, matchesPlayed: number, prevMatches: number): …[]` — yang terlihat sekarang tapi belum terlihat dengan `prevMatches` / `attrHistory.length - 1` (untuk laporan kuartal & berita).
- Jumlah laga: UI profil sudah punya `counts.get(p.id)` (lihat `Squad.tsx` `potentialStars(p, state.date, counts.get(p.id) ?? 0)`) — pakai yang sama.

- [ ] **Step 1: Tes gagal**

```ts
import { visibleTraits } from './traits';
describe('sifat terungkap', () => {
  it('fisik setelah 2 musim, mental/morale/ganda setelah 30 laga', () => {
    const p = { traits: ['ironBody', 'clutch'], trait: 'late', attrHistory: [{}] } as unknown as Player;
    expect(visibleTraits(p, 10)).toEqual([]);
    expect(visibleTraits(p, 30)).toEqual(['clutch']);
    p.attrHistory.push({} as never);
    expect(visibleTraits(p, 30).sort()).toEqual(['clutch', 'ironBody', 'late'].sort());
  });
});
```

- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Implementasi**

```ts
export const TRAIT_GROUP: Record<TraitId, 'physical' | 'mental' | 'morale' | 'doubles'> = {
  ironBody: 'physical', injuryProne: 'physical', quickRecovery: 'physical', ageless: 'physical', traveler: 'physical',
  clutch: 'mental', choker: 'mental', slowStarter: 'mental', momentumRider: 'mental', consistent: 'mental',
  fragileMorale: 'morale', homeHero: 'morale', leader: 'morale', idealPartner: 'doubles', awkwardPartner: 'doubles',
};
/** ASUMSI: sifat fisik/perkembangan terbaca setelah 2 akhir musim tercatat; lainnya setelah 30 laga. */
export const REVEAL_SEASONS = 2, REVEAL_MATCHES = 30;

export function visibleTraits(p: Player, matchesPlayed: number, seasons = p.attrHistory.length) {
  const out: (TraitId | 'late' | 'stagnant')[] = [];
  if (p.trait && seasons >= REVEAL_SEASONS) out.push(p.trait);
  for (const t of p.traits ?? []) if (TRAIT_GROUP[t] === 'physical' ? seasons >= REVEAL_SEASONS : matchesPlayed >= REVEAL_MATCHES) out.push(t);
  return out;
}
export function revealedTraits(p: Player, matchesPlayed: number, prevMatches: number) {
  const before = new Set(visibleTraits(p, prevMatches, p.attrHistory.length - 1));
  return visibleTraits(p, matchesPlayed).filter((t) => !before.has(t));
}
```

UI: komponen kecil di `Squad.tsx` (dipakai di baris tabel skuad & kartu profil):

```tsx
export function TraitTags({ p, matches }: { p: Player; matches: number }) {
  return <>{visibleTraits(p, matches).map((x) => <span key={x} className="tag" title={t(`traitHint_${x}` as TextKey)}>{t(`trait_${x}` as TextKey)}</span>)}</>;
}
```

Profil: `fact(t('traits'), <TraitTags p={p} matches={counts.get(p.id) ?? 0} />)` — bila kosong tampilkan `t('traitsUnknown')`. Tabel skuad: badge di `.entry-meta` di bawah nama (pola badge Development yang sudah ada).

i18n (id / en): `traits: 'Sifat' / 'Traits'`, `traitsUnknown: 'Belum terbaca' / 'Not yet known'`, lalu untuk setiap id di tabel "Daftar sifat" + `late`, `stagnant`: `trait_<id>` = nama, `traitHint_<id>` = kolom Efek dalam kalimat (contoh `traitHint_clutch: 'Lebih tajam di poin kritis dan di semifinal/final turnamen besar.' / 'Sharper on big points and in semis/finals of big events.'`; `trait_late: 'Late bloomer'`, `traitHint_late: 'Puncaknya datang lebih lambat: pelan di usia muda, tetap naik di usia 20-an.'`; `trait_stagnant: 'Mandek' / 'Stalling'`, `traitHint_stagnant: 'Berkembang jauh lebih lambat dari potensinya.' / 'Develops far more slowly than the potential suggests.'`). Tulis ke-17 pasang lengkap.

- [ ] **Step 4:** seluruh tes + build → bersih.
- [ ] **Step 5: Commit** — `"Sifat atlet: terungkap setelah 2 musim (fisik/perkembangan) atau 30 laga (mental/morale/ganda); badge & penjelasan di skuad dan profil"`

---

### Task 3: Sifat fisik — cedera, pemulihan, perjalanan

**Files:** Modify `src/engine/traits.ts` (konstanta), `src/engine/season.ts` (`applyEventLoad` ±baris 680–715; pemulihan mingguan di `playWeek` ±baris 542); Test `traits.test.ts`.

**Interfaces:** Consumes `hasTrait`. Produces konstanta `IRON_INJURY = 0.5, PRONE_INJURY = 1.8, QUICK_RECOVERY = 1.5, TRAVELER_FATIGUE = 0.5`, helper `injuryMult(p: Player): number`.

- [ ] **Step 1: Tes gagal**

```ts
import { BWF_2026 as rs } from './presets/bwf2026';
import { WORLD } from './presets/world';
import { makeRng } from './rng';
import { newSeason, playWeek } from './season';
import { injuryMult } from './traits';

describe('sifat fisik', () => {
  it('pengali cedera', () => {
    expect(injuryMult({ traits: ['ironBody'] } as unknown as Player)).toBe(0.5);
    expect(injuryMult({ traits: ['injuryProne'] } as unknown as Player)).toBe(1.8);
    expect(injuryMult({ traits: [] } as unknown as Player)).toBe(1);
  });
  it('cepat pulih: kelelahan turun 1,5× lebih banyak dalam seminggu tanpa main', async () => {
    const state = newSeason(WORLD, rs, 31, undefined, 'INA');
    const [a, b] = state.players.filter((p) => p.retired === undefined).slice(0, 2);
    for (const p of [a, b]) { p.fatigue = 60; p.injury = { weeksLeft: 3, level: 'moderate', type: 'ankle' }; }
    a.traits = ['quickRecovery']; b.traits = [];
    await playWeek(state, rs, WORLD, makeRng(31));
    expect(60 - a.fatigue).toBeCloseTo((60 - b.fatigue) * 1.5, 5);
  }, 60000);
});
```

- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Implementasi**

`traits.ts`:

```ts
export const IRON_INJURY = 0.5, PRONE_INJURY = 1.8, QUICK_RECOVERY = 1.5, TRAVELER_FATIGUE = 0.5;
export const injuryMult = (p: Player) => (hasTrait(p, 'ironBody') ? IRON_INJURY : hasTrait(p, 'injuryProne') ? PRONE_INJURY : 1);
```

`season.ts` pemulihan mingguan:

```ts
    p.fatigue = Math.max(0, p.fatigue - rs.fatigue.recoveryPerWeek * (hasTrait(p, 'quickRecovery') ? QUICK_RECOVERY : 1));
```

`applyEventLoad` — peluang cedera:

```ts
        if (p.injury || rng() >= (inj.base + inj.fatigueFactor * (p.fatigue / 100) ** 2) * injuryMult(p)) continue;
        let r = rollInjury(inj, rng);
        if (hasTrait(p, 'injuryProne')) { // tingkat = yang terburuk dari dua undian
          const r2 = rollInjury(inj, rng);
          const order = ['minor', 'moderate', 'severe', 'critical'];
          if (order.indexOf(r2.injury.level) > order.indexOf(r.injury.level)) r = r2;
        }
```

perjalanan:

```ts
    if (from) p.fatigue += (distanceKm(from, city) / 1000) * rs.fatigue.per1000Km * (hasTrait(p, 'traveler') ? TRAVELER_FATIGUE : 1);
```

> Tambahan `rollInjury` kedua hanya untuk atlet `injuryProne` yang cedera → urutan `rng` bergeser di musim yang memuat kejadian itu. Bila tes ber-seed gagal karena atlet acak berbeda, perbaiki pemilihan atlet di tes agar deterministik (pola commit `aed71a7`), jangan hapus tes.

Tambah tes statistik: 400 atlet palsu `ironBody` vs `injuryProne` lewat helper kecil yang meniru baris peluang (tanpa `playWeek`) tidak perlu — `injuryMult` sudah teruji; cukup satu tes integrasi musim: setelah 26 minggu, rasio `injuryHistory` per atlet `injuryProne` > `ironBody` (set `traits` manual ke 100 atlet masing-masing di awal musim, seed 32).

- [ ] **Step 4:** seluruh tes → PASS.
- [ ] **Step 5: Commit** — `"Sifat fisik: tubuh baja/rawan cedera (peluang & tingkat cedera), cepat pulih (kelelahan), musafir (kelelahan perjalanan)"`

---

### Task 4: Awet muda

**Files:** Modify `src/engine/development.ts` (`developQuarter` langkah 3 penuaan), `src/engine/traits.ts` (`AGELESS_YEARS = 2`); Test `src/engine/development.test.ts`.

- [ ] **Step 1: Tes gagal**

```ts
import { hasTrait } from './traits';
it('awet muda: atlet 32 tahun menurun lebih sedikit (rng sama)', () => {
  const vet = (traits: string[]) => ({ ...structuredClone(veteran), traits }) as Player; // veteran: usia 32, CA ≈ PA
  const a = vet([]), b = vet(['ageless']);
  const ctx = { date: d, experience: new Map(), doublesPlayers: new Set<string>() };
  developQuarter(a, cfg, ctx, makeRng(4));
  developQuarter(b, cfg, ctx, makeRng(4));
  expect(currentAbility(b.attrs)).toBeGreaterThan(currentAbility(a.attrs));
});
```

(`veteran` dibuat dengan `generatePlayer(..., age 32, ...)` seperti fixture lain di file itu.)

- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Implementasi** — di langkah penuaan:

```ts
  const declineAge = age - (hasTrait(p, 'ageless') ? AGELESS_YEARS : 0);
  for (const a of ATTRS) {
    const { weight, startOffset } = cfg.attrDecline[a];
    const d = between(rng, band(cfg.declineByAge, declineAge - startOffset));
    p.attrs[a] -= (d * weight) / 4;
  }
```

- [ ] **Step 4:** seluruh tes → PASS.
- [ ] **Step 5: Commit** — `"Sifat fisik: awet muda (penurunan usia mulai 2 tahun lebih lambat)"`

---

### Task 5: Mental juara & demam panggung (butuh flag turnamen besar)

**Files:** Modify `src/engine/match.ts` (`SideInput.big?`, `SideState.clutch`, `sideAttrs`, `playRally` baris pressure ±206), `src/engine/tournament.ts` (`simPlay` opsi `big?` ±baris 157–179), `src/engine/season.ts` (panggilan `simPlay` di `playEvent` ±605), `src/engine/traits.ts` (konstanta); Test `traits.test.ts`.

**Interfaces:**
- `SideInput.big?: boolean` — laga besar: babak SF/F, atau turnamen besar (grade 1 / poin juara ≥ 9000, sama dengan `big` di `applyEventLoad`).
- `simPlay(opts)` menerima `big?: boolean` (turnamen besar) dan menyetel `big: opts.big || round === 'SF' || round === 'F'` di kedua `SideInput`.
- Konstanta: `CLUTCH_MENTAL = 8, CLUTCH_BIG = 1, CHOKER_MENTAL = 8, CHOKER_BIG = 1.5`.
- `SideState` tambah `clutch: number` (bonus mental di poin kritis = `CLUTCH_MENTAL × share(clutch) − CHOKER_MENTAL × share(choker)`).

- [ ] **Step 1: Tes gagal**

```ts
import { matchConfigFor, simulateMatch } from './match';
import { ATTRS } from './types';

const pl = (v: number, traits: string[] = []) => ({ id: Math.random().toString(), attrs: Object.fromEntries(ATTRS.map((a) => [a, v])), form: 0, fatigue: 0, traits }) as unknown as Player;
const winRate = (a: Player, b: Player, big: boolean, n = 1500) => {
  const cfg = matchConfigFor(rs.match, 2026), rng = makeRng(3);
  let w = 0;
  for (let i = 0; i < n; i++) if (simulateMatch([{ players: [a], big }, { players: [b], big }], cfg, rng).winner === 0) w++;
  return w / n;
};
describe('mental juara & demam panggung', () => {
  it('clutch menang lebih sering melawan atlet setara; efeknya lebih besar di laga besar', () => {
    const normal = winRate(pl(80, ['clutch']), pl(80), false);
    const big = winRate(pl(80, ['clutch']), pl(80), true);
    expect(normal).toBeGreaterThan(0.53);
    expect(big).toBeGreaterThan(normal);
  }, 120000);
  it('choker kalah lebih sering di laga besar', () => {
    expect(winRate(pl(80, ['choker']), pl(80), true)).toBeLessThan(0.45);
  }, 120000);
});
```

- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Implementasi**

`match.ts`:

```ts
export interface SideInput {
  players: Player[];
  chemistry?: number;
  day?: number;
  /** Laga besar (SF/F atau turnamen besar): sifat mental juara/demam panggung berlaku penuh. */
  big?: boolean;
}
```

Di `sideAttrs`, tambahkan ke `form`:

```ts
  const stage = side.big ? CLUTCH_BIG * traitShare(ps, 'clutch') - CHOKER_BIG * traitShare(ps, 'choker') : 0;
  const form = ps.reduce((s, p) => s + moraleEffect(p.form, cfg), 0) / ps.length + day + stage;
```

Di `createMatch` objek tiap sisi: `clutch: CLUTCH_MENTAL * traitShare(sides[i].players, 'clutch') - CHOKER_MENTAL * traitShare(sides[i].players, 'choker')` (tambahkan field `clutch: number` di `SideState`).

Di `playRally`:

```ts
    if (Math.max(...st.score) >= cfg.pressure.fromScore)
      diff += cfg.pressure.weight * ((st.sides[x].attrs.mental + st.sides[x].clutch) - (st.sides[y].attrs.mental + st.sides[y].clutch));
```

`tournament.ts` `simPlay`: tambahkan `big?: boolean` ke tipe opsi; di pembentukan `sides`:

```ts
    const big = opts.big || round === 'SF' || round === 'F';
    // … { players, chemistry, day, big } dan { players: [...], day, big }
```

(Jika `sides` dibentuk sebelum `round` diketahui, pindahkan pembentukan ke dalam fungsi `(a, b, round) => …` yang sudah menerima `round`.)

`season.ts` `playEvent`: `simPlay({ …, big: tier.grade === 1 || tier.points[0] >= 9000 })`. Laga beregu (`season.ts` ±954) cukup mendapat `big` dari babak (tidak perlu opsi).

> Live Match (`LiveMatch.tsx`) membentuk `SideInput` dari hook `live` — teruskan `big` yang sama dari `sides` (sudah ikut di objek `sides` yang dikirim ke `opts.live`).

- [ ] **Step 4:** `npx vitest run` (termasuk `match.test.ts`, `morale.test.ts` — atlet tanpa sifat tidak berubah: `traitShare` = 0) → PASS.
- [ ] **Step 5: Commit** — `"Sifat mental: mental juara/demam panggung di poin kritis dan laga besar (SF/F, turnamen besar)"`

---

### Task 6: Starter lambat, pemburu momentum, konsisten

**Files:** Modify `src/engine/match.ts` (`createMatch`, `eff` ±baris 115–125, `playRally` ±210, `sideAttrs`), `src/engine/traits.ts`; Test `traits.test.ts`.

**Interfaces:** Konstanta `SLOW_WARMUP = 1.5, SLOW_RUBBER = 1.5, MOMENTUM_RIDER = 1.5, CONSISTENT_DAY = 0.5`. `SideState` tambah `slow: number` (share slowStarter) dan `rider: number` (share momentumRider).

- [ ] **Step 1: Tes gagal**

```ts
describe('sifat pertandingan', () => {
  it('konsisten: sebaran kondisi hari itu lebih kecil', () => {
    // Pakai sideAttrs lewat createMatch: bandingkan simpangan baku atribut awal 500 laga.
    const cfg = matchConfigFor(rs.match, 2026), rng = makeRng(8);
    const sd = (traits: string[]) => {
      const xs = Array.from({ length: 500 }, () => createMatch([{ players: [pl(80, traits)] }, { players: [pl(80)] }], cfg, rng).sides[0].attrs.speed);
      const m = xs.reduce((s, x) => s + x, 0) / xs.length;
      return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length);
    };
    expect(sd(['consistent'])).toBeLessThan(sd([]) * 0.6);
  });
  it('starter lambat: lebih sering kalah game 1, lebih sering menang rubber game', () => {
    const cfg = matchConfigFor(rs.match, 2026), rng = makeRng(9);
    let g1 = 0, rubbers = 0, rubberWins = 0;
    for (let i = 0; i < 1500; i++) {
      const r = simulateMatch([{ players: [pl(80, ['slowStarter'])] }, { players: [pl(80)] }], cfg, rng);
      if (r.scores[0][0] > r.scores[0][1]) g1++;
      if (r.scores.length === 3) { rubbers++; if (r.winner === 0) rubberWins++; }
    }
    expect(g1 / 1500).toBeLessThan(0.48);
    expect(rubberWins / rubbers).toBeGreaterThan(0.52);
  }, 120000);
});
```

(Ekspor `createMatch` dari `match.ts` bila belum; cek `grep -n "function createMatch" src/engine/match.ts`. Cek nama field skor di `MatchResult` — sesuaikan `r.scores`.)

- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Implementasi**

`sideAttrs` — kondisi hari itu diperkecil:

```ts
  const dayScale = 1 - (1 - CONSISTENT_DAY) * traitShare(ps, 'consistent');
  const form = ps.reduce((s, p) => s + moraleEffect(p.form, cfg), 0) / ps.length + day * dayScale + stage;
```

`createMatch`: `slow: traitShare(sides[i].players, 'slowStarter'), rider: traitShare(sides[i].players, 'momentumRider')`.

`eff` (baris pemanasan ±119):

```ts
  if (st.games.length === 0 && pointsPlayed < cfg.warmup.points) v -= cfg.warmup.maxPenalty * (1 - s.attrs.warmup / 100) * (1 + (SLOW_WARMUP - 1) * s.slow);
  if (st.games.length === 2) v += SLOW_RUBBER * s.slow;
```

`playRally` momentum:

```ts
    const mom = x === 0 ? st.momentum : -st.momentum; // >0: momentum memihak x
    const side = mom > 0 ? st.sides[x] : st.sides[y];
    diff += cfg.momentum.weight * mom * (1 + (MOMENTUM_RIDER - 1) * side.rider);
```

- [ ] **Step 4:** `npx vitest run` → PASS (tes kalibrasi `match.test.ts`/`morale.test.ts` tetap lulus karena share = 0 untuk atlet tanpa sifat).
- [ ] **Step 5: Commit** — `"Sifat pertandingan: starter lambat (pemanasan berat, kuat di rubber game), pemburu momentum, konsisten (kondisi harian stabil)"`

---

### Task 7: Sifat morale — mudah goyah, jagoan kandang, pemimpin

**Prasyarat:** rencana morale Task 1, 3, 4 sudah selesai.

**Files:** Modify `src/engine/season.ts` (`updateMorale`, blok kandang di `playEvent`, blok skuad di `playTeamEvent`), `src/engine/traits.ts`; Test `traits.test.ts`.

**Interfaces:** Konstanta `FRAGILE_DOWN = 1.5, HOME_HERO_BONUS = 1.5, LEADER_PARTNER = 0.3, LEADER_SQUAD = 0.5`.

- [ ] **Step 1: Tes gagal**

```ts
describe('sifat morale', () => {
  it('mudah goyah: kekalahan menurunkan morale 1,5×', async () => {
    // Dua save seed sama; satu atlet INA yang kalah di minggu 2 diberi fragileMorale di save kedua.
    const run = async (fragile: boolean) => {
      const state = newSeason(WORLD, rs, 41, undefined, 'INA');
      const rng = makeRng(41);
      await playWeek(state, rs, WORLD, rng);
      const target = state.players.filter((p) => p.countryId === 'INA' && p.retired === undefined)
        .sort((a, b) => a.id.localeCompare(b.id))[0];
      target.traits = fragile ? ['fragileMorale'] : [];
      target.form = 0;
      const before = state.matches.length;
      await playWeek(state, rs, WORLD, rng);
      return { form: target.form, lost: state.matches.slice(before).some((m) => m.sides[1 - m.winner] === target.id) };
    };
    const a = await run(false), b = await run(true);
    if (a.form < 0) expect(b.form).toBeLessThan(a.form);
  }, 120000);
});
```

> Tes integrasi ini bergantung pada atlet target bertanding & kalah; bila di seed ini ia tidak bermain, ganti seed sampai `a.lost` true dan tulis seed itu tetap di tes (deterministik).

- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Implementasi**

`updateMorale` — helper `add` menjadi sadar sifat:

```ts
  const add = (ps: Player[], d: number) => { for (const p of ps) bumpForm(p, d < 0 && hasTrait(p, 'fragileMorale') ? d * FRAGILE_DOWN : d); };
```

dan di loop laga setelah delta hasil:

```ts
    // Pemimpin: pasangannya ikut terangkat saat menang.
    const ws = sides[m.winner];
    if (ws.length > 1) for (const p of ws) if (ws.some((o) => o !== p && hasTrait(o, 'leader'))) bumpForm(p, LEADER_PARTNER);
```

Blok kandang di `playEvent` (dari rencana morale Task 3):

```ts
    for (const id of home) { const p = players.get(id)!; if (p.countryId === city.countryId) bumpForm(p, HOME_BONUS + (hasTrait(p, 'homeHero') ? HOME_HERO_BONUS : 0)); }
```

Blok skuad di `playTeamEvent` (dari rencana morale Task 4), setelah `SELECT_BONUS`:

```ts
      if (chosen.some((p) => hasTrait(p, 'leader'))) for (const p of chosen) if (!hasTrait(p, 'leader')) bumpForm(p, LEADER_SQUAD);
```

- [ ] **Step 4:** seluruh tes → PASS; `morale.test.ts` "mayoritas Normal" tetap lulus.
- [ ] **Step 5: Commit** — `"Sifat morale: mudah goyah (turun 1,5×), jagoan kandang (+1,5 di kandang), pemimpin (pasangan & skuad beregu ikut terangkat)"`

---

### Task 8: Pasangan ideal & sulit cocok

**Files:** Modify `src/engine/season.ts:687` (chemistry di `applyEventLoad`), `src/engine/traits.ts` (`chemistryMult`); Test `traits.test.ts`.

**Interfaces:** `chemistryMult(ps: Player[]): number` — `2` per atlet `idealPartner`, `0.5` per atlet `awkwardPartner`, dikalikan (ideal + sulit = 1).

- [ ] **Step 1: Tes gagal**

```ts
import { chemistryMult } from './traits';
it('pengali chemistry', () => {
  const p = (traits: string[]) => ({ traits }) as unknown as Player;
  expect(chemistryMult([p(['idealPartner']), p([])])).toBe(2);
  expect(chemistryMult([p(['idealPartner']), p(['idealPartner'])])).toBe(4);
  expect(chemistryMult([p(['awkwardPartner']), p(['idealPartner'])])).toBe(1);
  expect(chemistryMult([p([]), p([])])).toBe(1);
});
```

- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Implementasi**

```ts
export const IDEAL_CHEM = 2, AWKWARD_CHEM = 0.5;
export const chemistryMult = (ps: Player[]) => ps.reduce((m, p) => m * (hasTrait(p, 'idealPartner') ? IDEAL_CHEM : hasTrait(p, 'awkwardPartner') ? AWKWARD_CHEM : 1), 1);
```

`applyEventLoad`:

```ts
      if (pair) {
        pair.matchesTogether++;
        const rate = Math.min(0.05, 0.01 * chemistryMult(pair.playerIds.map((x) => players.get(x)!))); // ASUMSI: maks 5 %/laga
        pair.chemistry += (100 - pair.chemistry) * rate;
      }
```

- [ ] **Step 4:** seluruh tes → PASS.
- [ ] **Step 5: Commit** — `"Sifat ganda: pasangan ideal (chemistry naik 2×) dan sulit cocok (0,5×)"`

---

### Task 9: Catatan pemandu bakat = petunjuk sifat

**Files:** Modify `src/engine/scouting.ts` (`Scouting.notes?`, `traitHints`, `makeScouting`), `src/engine/traits.ts`; UI `ScoutingCard` (`src/ui/Career.tsx`); i18n; Test `src/engine/scouting.test.ts`.

**Interfaces:**
- `traitHints(p: Player, rng: Rng): (TraitId | 'late' | 'stagnant')[]` — per sifat yang dimiliki: tercatat dengan peluang `HINT_TRUE = 0.6`; ditambah satu petunjuk salah dengan peluang `HINT_FALSE = 0.15` (sifat acak yang tidak dimiliki dan tidak bertentangan). Maks 3 catatan.
- `Scouting.notes?: Record<string, (TraitId | 'late' | 'stagnant')[]>`.
- Catatan memakai `rng` game **setelah** semua kandidat dibuat (tidak menggeser atlet).

- [ ] **Step 1: Tes gagal**

```ts
import { traitHints } from './traits';
describe('catatan pemandu', () => {
  it('sifat asli sering tercatat, petunjuk salah jarang', () => {
    const p = { traits: ['clutch'], trait: 'late' } as unknown as Player;
    const rng = makeRng(5);
    let hitClutch = 0, falseOnes = 0;
    for (let i = 0; i < 2000; i++) {
      const h = traitHints(p, rng);
      if (h.includes('clutch')) hitClutch++;
      falseOnes += h.filter((x) => x !== 'clutch' && x !== 'late').length;
      expect(h.length).toBeLessThanOrEqual(3);
    }
    expect(hitClutch / 2000).toBeGreaterThan(0.5);
    expect(falseOnes / 2000).toBeLessThan(0.2);
    expect(falseOnes).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Implementasi**

```ts
export const HINT_TRUE = 0.6, HINT_FALSE = 0.15;
/** Catatan pemandu bakat: sifat asli tercatat 60 %, kadang ada petunjuk salah (15 %). */
export function traitHints(p: Player, rng: Rng) {
  const own: (TraitId | 'late' | 'stagnant')[] = [...(p.trait ? [p.trait] : []), ...(p.traits ?? [])];
  const out = own.filter(() => rng() < HINT_TRUE);
  if (rng() < HINT_FALSE) {
    const pool = TRAITS.filter((t) => !own.includes(t) && !CONFLICTS.some(([a, b]) => (t === a && own.includes(b)) || (t === b && own.includes(a))));
    out.push(pool[Math.floor(rng() * pool.length)]);
  }
  return out.slice(0, 3);
}
```

(`import type { Rng } from './rng';`)

`makeScouting`: setelah semua kandidat dibuat, `ensureTraits(candidates)` lalu `notes[p.id] = traitHints(p, rng)`; kembalikan `notes`.

UI `ScoutingCard`, di bawah nama kandidat: `{(s.notes?.[p.id] ?? []).map((n) => <span key={n} className="tag muted-tag" title={t(`traitHint_${n}` as TextKey)}>{t(`trait_${n}` as TextKey)}?</span>)}`; `scoutingHint` (id & en) ditambah kalimat "Catatan pemandu bakat (bertanda ?) bisa meleset."

- [ ] **Step 4:** seluruh tes + build → bersih.
- [ ] **Step 5: Commit** — `"Pencarian bakat: catatan pemandu bakat menebak sifat kandidat (benar 60 %, kadang meleset)"`

---

### Task 10: Kalibrasi, dokumentasi, uji manual

**Files:** `src/engine/traits.test.ts`, `docs/ASUMSI.md`, `docs/RENCANA.md`.

- [ ] **Step 1: Tes kalibrasi satu musim**

```ts
describe('kalibrasi sifat', () => {
  it('satu musim: morale mayoritas Normal; juara tidak didominasi satu sifat', async () => {
    const state = newSeason(WORLD, rs, 51, undefined, 'INA');
    const rng = makeRng(51);
    while (state.date.week < 52) await playWeek(state, rs, WORLD, rng);
    const active = state.players.filter((p) => p.retired === undefined);
    expect(active.filter((p) => Math.abs(p.form) < 3).length / active.length).toBeGreaterThan(0.55);
    const champs = state.champions.flatMap((c) => state.pairs.find((x) => x.id === c.winner)?.playerIds ?? [c.winner]);
    const withClutch = champs.filter((id) => hasTrait(state.players.find((p) => p.id === id)!, 'clutch')).length / champs.length;
    expect(withClutch).toBeLessThan(0.35); // ± 2× frekuensi dasar (≈ 1/15 × 1,3 sifat rata-rata ≈ 9 %)
  }, 600000);
});
```

- [ ] **Step 2:** Jalankan. Bila gagal: turunkan efek terbesar (`CLUTCH_MENTAL` 8 → 5, `CHOKER_BIG` 1,5 → 1) dan ulangi; catat nilai akhir.
- [ ] **Step 3:** `docs/ASUMSI.md` — bagian "Sifat atlet": tabel "Daftar sifat" dengan nilai akhir, peluang jumlah sifat, pasangan bertentangan, aturan terungkap, akurasi catatan pemandu. `docs/RENCANA.md` — blok "Fitur berikutnya (disetujui 2026-10-25): sifat atlet" dengan centang Task 1–9; tandai Task 3 & 6 rencana pencarian bakat "digantikan rencana sifat atlet".
- [ ] **Step 4:** Uji manual (skill `run` atau `npm run dev` + Playwright, lebar 390 px): profil atlet senior dengan > 30 laga menampilkan badge sifat + tooltip; junior baru "Belum terbaca"; kartu pencarian bakat menampilkan catatan bertanda "?". Ambil screenshot.
- [ ] **Step 5:** `npx vitest run`, `npx tsc --noEmit -p .`, `npm run build` → bersih. Commit — `"Sifat atlet: kalibrasi satu musim, ASUMSI & RENCANA"`

---

## Self-review

- Cakupan: 15 sifat baru — fisik (T3: ironBody, injuryProne, quickRecovery, traveler; T4: ageless), mental/pertandingan (T5: clutch, choker; T6: slowStarter, momentumRider, consistent), morale (T7: fragileMorale, homeHero, leader), ganda (T8: idealPartner, awkwardPartner). Model & migrasi (T1), terungkap & UI (T2), catatan pemandu (T9), kalibrasi & dokumen (T10).
- Nama konsisten: `TraitId`, `TRAITS`, `rollTraits`, `ensureTraits`, `hasTrait`, `traitShare`, `TRAIT_GROUP`, `visibleTraits`, `revealedTraits`, `injuryMult`, `chemistryMult`, `traitHints`, `SideInput.big`, `SideState.clutch/slow/rider`, `Player.traits`, `SeasonState.traitsRolled`, `Scouting.notes`.
- Ketergantungan: T7 butuh rencana morale T1/T3/T4; T9 menggantikan Task 3 rencana pencarian bakat; T2 menggantikan Task 6-nya.
