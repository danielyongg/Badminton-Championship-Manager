# Morale & Perkembangan (tanpa latihan) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Morale dan kemampuan atlet bisa naik lewat keputusan manajer yang sudah ada (entry, skuad, pasangan, istirahat) dan peristiwa karier — tanpa fitur latihan.

**Architecture:** Semua angka kalibrasi baru di satu modul `src/engine/boosts.ts` (konstanta bertanda ASUMSI + helper kecil), dipanggil dari titik yang sudah ada: `updateMorale`, `playWeek`, `applyEventLoad`, `endQuarter`/`developQuarter`, `updateRankWeeks`, `dissolvePair`, `playTeamEvent`. State baru hanya field opsional (save lama tetap jalan tanpa migrasi). Satu UI baru: pilihan target per atlet di form entry.

**Tech Stack:** TypeScript, React (Vite), Vitest (`npx vitest run`), typecheck `npx tsc --noEmit -p .`.

## Global Constraints

- Game tetap ringan: tidak ada menu/layar manajemen baru selain kolom Target di form entry.
- Morale (`Player.form`) selalu dijepit −10..+10 lewat `bumpForm`.
- CA tidak pernah melampaui PA: setiap perubahan atribut diakhiri `capToPa(p)`.
- Field state/atlet baru wajib opsional (`?`) — save lama dimuat tanpa migrasi.
- Atlet AI mendapat aturan yang sama (dunia adil), kecuali "dicoret" (khusus negara manajer).
- Kalibrasi: setelah semua task, tes `morale.test.ts` "mayoritas atlet Normal" (> 60 %) tetap lulus.
- Teks UI dalam dua bahasa: `src/i18n/index.ts` (id) dan `src/i18n/en.ts` (en); `i18n.test.ts` memeriksa kunci sama.
- Setiap angka baru dicatat di `docs/ASUMSI.md`.
- Commit per task, pesan berbahasa Indonesia seperti riwayat repo.

## Peta file

| File | Tanggung jawab |
|---|---|
| `src/engine/boosts.ts` (baru) | Konstanta ASUMSI, `bumpForm`, `hitTarget`, `isCloseLoss`, `mentorsOf`, `eliteCounts` |
| `src/engine/boosts.test.ts` (baru) | Tes unit helper + tes integrasi kecil per fitur |
| `src/engine/season.ts` | Titik panggil: morale mingguan, istirahat, kandang, rekor, target, pengalaman, kuartal, comeback |
| `src/engine/development.ts` | `developQuarter`: faktor morale, lingkungan elite, mentor |
| `src/engine/career.ts` | `dissolvePair(…, byManager)`, `setTarget` |
| `src/engine/types.ts` | `Pair.winStreak?`, `Player.beatTop10?` |
| `src/ui/Entries.tsx`, `src/ui/Pairs.tsx` | Kolom Target; bubarkan pasangan oleh manajer |
| `src/i18n/index.ts`, `src/i18n/en.ts` | Teks Target & bantuan |
| `docs/ASUMSI.md`, `docs/RENCANA.md` | Catatan kalibrasi & status |

---

### Task 1: Modul `boosts.ts` + `bumpForm` dipakai `updateMorale`

**Files:**
- Create: `src/engine/boosts.ts`, `src/engine/boosts.test.ts`
- Modify: `src/engine/season.ts:506-524` (`updateMorale`)

**Interfaces:**
- Produces: `bumpForm(p: Player, d: number): void`; semua konstanta di bawah (dipakai Task 2–11).

- [ ] **Step 1: Tes gagal**

```ts
// src/engine/boosts.test.ts
import { describe, expect, it } from 'vitest';
import { bumpForm } from './boosts';
import type { Player } from './types';

const p = (form: number) => ({ form }) as Player;

describe('bumpForm', () => {
  it('menambah dan menjepit −10..+10', () => {
    const a = p(9); bumpForm(a, 3); expect(a.form).toBe(10);
    const b = p(-9); bumpForm(b, -3); expect(b.form).toBe(-10);
    const c = p(0); bumpForm(c, 1.5); expect(c.form).toBe(1.5);
  });
});
```

- [ ] **Step 2:** `npx vitest run src/engine/boosts.test.ts` → FAIL (modul tidak ada).

- [ ] **Step 3: Implementasi**

```ts
// src/engine/boosts.ts
import type { Player } from './types';

// Sumber morale & perkembangan di luar hasil laga (tanpa fitur latihan). Semua angka: ASUMSI, lihat docs/ASUMSI.md.

/** Morale: target perorangan tercapai / meleset ≥ 2 babak. */
export const TARGET_HIT = 1.5, TARGET_MISS = 1;
/** Morale: dipanggil ke skuad beregu / kontingen multi-event; dicoret padahal layak (negara manajer). */
export const SELECT_BONUS = 1, SNUB_PENALTY = 0.5;
/** Minggu tanpa bertanding: morale negatif pulih lebih cepat (dikali ini, bukan hanya weeklyDecay). */
export const REST_RECOVERY = 0.6;
/** Morale saat turnamen di negara sendiri dimulai. */
export const HOME_BONUS = 1;
/** Pasangan: mulai menang beruntun ke-n, tiap kemenangan menambah morale; dibubarkan manajer. */
export const PAIR_STREAK_FROM = 3, PAIR_STREAK_BONUS = 0.3, DISSOLVE_PENALTY = 1.5;
/** Rekor pribadi (sekali): gelar pertama, menang pertama atas top 10, ranking terbaik karier (≤ 100). */
export const FIRST_TITLE_BONUS = 2, FIRST_TOP10_WIN_BONUS = 1.5, CAREER_HIGH_BONUS = 0.5;
/** Pengalaman: kalah tipis dari lawan ≥ CLOSE_LOSS_GAP lebih kuat bernilai seperti ini (menang 1,5; kalah biasa 1). */
export const CLOSE_LOSS_EXP = 1.4, CLOSE_LOSS_GAP = 5;
/** Perkembangan: ±MORALE_GROWTH pada morale ±10. */
export const MORALE_GROWTH = 0.1;
/** Lingkungan pelatnas: +ELITE_PER per atlet top 20 senegara, maks ELITE_MAX, untuk usia ≤ ELITE_AGE. */
export const ELITE_PER = 0.02, ELITE_MAX = 0.1, ELITE_AGE = 23;
/** Mentor: pasangan aktif berusia ≥ 25 dan CA ≥ +10 dari atlet ≤ 21 → mental +MENTOR_MENTAL/tahun, faktor pertumbuhan +MENTOR_GROWTH. */
export const MENTOR_MENTAL = 1, MENTOR_GROWTH = 0.05;
/** Sembuh dari cedera berat: peluang mental naik COMEBACK_MENTAL. */
export const COMEBACK_CHANCE = 0.3, COMEBACK_MENTAL = 2;

export const bumpForm = (p: Player, d: number) => { p.form = Math.max(-10, Math.min(10, p.form + d)); };
```

Di `season.ts` `updateMorale`, ganti helper lokal:

```ts
const add = (ps: Player[], d: number) => { for (const p of ps) bumpForm(p, d); };
```

dan tambahkan `import { bumpForm } from './boosts';`.

- [ ] **Step 4:** `npx vitest run src/engine/boosts.test.ts src/engine/morale.test.ts` → PASS; `npx tsc --noEmit -p .` bersih.

- [ ] **Step 5: Commit** — `git add src/engine/boosts.ts src/engine/boosts.test.ts src/engine/season.ts && git commit -m "Morale: modul boosts (konstanta ASUMSI & bumpForm) untuk sumber morale/perkembangan baru"`

---

### Task 2: Istirahat memulihkan morale negatif

**Files:** Modify `src/engine/season.ts` (akhir `playWeek`, setelah `updateMorale(...)` di ±baris 637); Test `src/engine/boosts.test.ts`.

**Interfaces:** Consumes `REST_RECOVERY`.

- [ ] **Step 1: Tes gagal** (tambahkan ke `boosts.test.ts`)

```ts
import { BWF_2026 as rs } from './presets/bwf2026';
import { WORLD } from './presets/world';
import { makeRng } from './rng';
import { newSeason, playWeek } from './season';

describe('istirahat', () => {
  it('atlet yang tidak bertanding: morale negatif pulih lebih cepat dari weeklyDecay', async () => {
    const state = newSeason(WORLD, rs, 7, undefined, 'INA');
    const idle = state.players.find((p) => p.retired === undefined)!;
    idle.injury = { weeksLeft: 5, level: 'moderate', type: 'ankle' }; // cedera → pasti tidak bertanding
    idle.form = -6;
    await playWeek(state, rs, WORLD, makeRng(7));
    expect(idle.form).toBeGreaterThan(-6 * rs.match.morale.weeklyDecay * 0.99);
    expect(idle.form).toBeCloseTo(-6 * rs.match.morale.weeklyDecay * 0.6, 5);
  }, 60000);
});
```

- [ ] **Step 2:** jalankan → FAIL (nilai = −6 × 0,88).

- [ ] **Step 3: Implementasi** — setelah `updateMorale(state, rs, weekMatches, weekChampions);`:

```ts
  // Istirahat: atlet yang tidak bertanding minggu ini memulihkan morale negatif lebih cepat.
  const busy = new Set(state.matches.slice(weekMatches).flatMap((m) => m.sides.flatMap((s) => pairs.get(s)?.playerIds ?? [s])));
  for (const p of state.players) if (p.form < 0 && !busy.has(p.id)) p.form *= REST_RECOVERY;
```

(Import `REST_RECOVERY` dari `./boosts`.)

- [ ] **Step 4:** tes Task 2 + `morale.test.ts` → PASS.
- [ ] **Step 5: Commit** — `"Morale: minggu tanpa bertanding memulihkan morale negatif lebih cepat"`

---

### Task 3: Bonus main di kandang

**Files:** Modify `src/engine/season.ts` di `playEvent` (sebelum `const runs = await each(...)`, ±baris 600); Test `boosts.test.ts`.

**Interfaces:** Consumes `HOME_BONUS`, `bumpForm`. Variabel yang sudah ada di scope: `entries`, `event`, `city`, `players`, `pairs`, `ds`.

- [ ] **Step 1: Tes gagal**

```ts
import { hostCityId, weekOf, isHeld } from './season';

describe('kandang', () => {
  it('atlet tuan rumah yang ikut turnamen mendapat HOME_BONUS di awal turnamen', async () => {
    const state = newSeason(WORLD, rs, 8, undefined, 'INA');
    const rng = makeRng(8);
    const ev = rs.calendar.find((e) => isHeld(e, 2026) && WORLD.cities.find((c) => c.id === hostCityId(e, 2026))?.countryId === 'INA' && !rs.tiers.find((t) => t.id === e.tierId)?.junior)!;
    while (state.date.week < weekOf(ev, 2026)) await playWeek(state, rs, WORLD, rng);
    const ina = state.players.filter((p) => p.countryId === 'INA' && p.retired === undefined);
    for (const p of ina) p.form = 0;
    const before = state.matches.length;
    await playWeek(state, rs, WORLD, rng);
    const played = new Set(state.matches.slice(before).filter((m) => m.tournamentId === ev.id)
      .flatMap((m) => m.sides.flatMap((s) => state.pairs.find((x) => x.id === s)?.playerIds ?? [s])));
    // Tanpa bonus, rata-rata morale atlet INA yang main ≈ 0 (naik-turun karena hasil); dengan bonus jelas positif.
    const avg = ina.filter((p) => played.has(p.id)).reduce((s, p) => s + p.form, 0) / played.size;
    expect(avg).toBeGreaterThan(0.4);
  }, 120000);
});
```

> Catatan: jika `hostCityId` tidak menerima `(e, year)`, lihat signature di `season.ts` dan sesuaikan; ekspor sudah ada (`season.test.ts:8`).

- [ ] **Step 2:** jalankan → FAIL.

- [ ] **Step 3: Implementasi** (di `playEvent`, sebelum undian dimainkan)

```ts
    // Main di kandang: atlet tuan rumah yang ikut turnamen ini mendapat dorongan morale.
    const home = new Set(ds.flatMap((d) => entries.get(event.id)!.get(d)!).flatMap((c) => pairs.get(c.id)?.playerIds ?? [c.id]));
    for (const id of home) { const p = players.get(id)!; if (p.countryId === city.countryId) bumpForm(p, HOME_BONUS); }
```

- [ ] **Step 4:** tes → PASS; `morale.test.ts` PASS.
- [ ] **Step 5: Commit** — `"Morale: atlet tuan rumah mendapat dorongan morale di awal turnamen kandang"`

---

### Task 4: Dipanggil ke skuad / dicoret

**Files:**
- Modify: `src/engine/season.ts` — `playTeamEvent` (setelah loop `for (const c of teams)` yang mengisi `squads`, ±baris 915) dan `playEvent` untuk multi-event (`event.countries`).
- Modify: `src/engine/boosts.ts` — tambah `snubbed`.
- Test: `boosts.test.ts`.

**Interfaces:**
- Produces: `snubbed(selected: Player[], candidates: Player[], bestRank: (p: Player) => number): Player[]` — kandidat sehat, tidak terpilih, gender sama, yang ranking terbaiknya lebih baik dari ranking terburuk atlet terpilih bergender sama.

- [ ] **Step 1: Tes gagal (unit)**

```ts
import { snubbed } from './boosts';

describe('snubbed', () => {
  const pl = (id: string, gender: 'M' | 'F', injury = false) => ({ id, gender, injury: injury ? { weeksLeft: 1 } : undefined }) as unknown as Player;
  it('hanya yang lebih baik dari terpilih terburuk segender, sehat, dan tidak terpilih', () => {
    const a = pl('a', 'M'), b = pl('b', 'M'), c = pl('c', 'M'), d = pl('d', 'M', true), w = pl('w', 'F');
    const rank: Record<string, number> = { a: 5, b: 30, c: 10, d: 2, w: 1 };
    expect(snubbed([a, b], [a, b, c, d, w], (p) => rank[p.id]).map((p) => p.id)).toEqual(['c']);
  });
});
```

- [ ] **Step 2:** FAIL.

- [ ] **Step 3: Implementasi**

```ts
// boosts.ts
export function snubbed(selected: Player[], candidates: Player[], bestRank: (p: Player) => number) {
  const ids = new Set(selected.map((p) => p.id));
  return candidates.filter((p) => {
    if (ids.has(p.id) || p.injury) return false;
    const same = selected.filter((s) => s.gender === p.gender);
    return same.length > 0 && bestRank(p) < Math.max(...same.map(bestRank));
  });
}
```

Di `season.ts`, helper peringkat terbaik (tunggal atau pasangan aktif) — tambahkan dekat `rankMap` dipakai:

```ts
/** Peringkat senior terbaik atlet di nomor mana pun (pasangan aktif ikut dihitung); 9999 = tanpa ranking. */
function bestRankOf(state: SeasonState, ranks: Map<Discipline, Map<string, number>>) {
  return (p: Player) => Math.min(9999, ...DISCIPLINES.flatMap((d) => [
    ranks.get(d)!.get(p.id) ?? 9999,
    ...state.pairs.filter((x) => !x.dissolved && x.discipline === d && x.playerIds.includes(p.id)).map((x) => ranks.get(d)!.get(x.id) ?? 9999),
  ]));
}
```

Di `playTeamEvent`, setelah semua `squads[c]` terisi:

```ts
    // Dipanggil ke skuad: morale naik; negara manajer: atlet layak yang dicoret sedikit turun.
    const byId = new Map(state.players.map((p) => [p.id, p]));
    for (const [c, squad] of Object.entries(squads)) {
      const chosen = squad.map((id) => byId.get(id)!).filter(Boolean);
      for (const p of chosen) bumpForm(p, SELECT_BONUS);
      if (c !== state.managedCountryId) continue;
      const pool = state.players.filter((p) => p.countryId === c && p.retired === undefined && p.released === undefined && !isJunior(p, state.date));
      for (const p of snubbed(chosen, pool, bestRankOf(state, teamRanks))) bumpForm(p, -SNUB_PENALTY);
    }
```

`teamRanks`: hitung `new Map(DISCIPLINES.map((d) => [d, rankMap(computeRanking(state.results, d, absWeek(state.date), rs))]))` jika belum ada di scope. `isJunior`: pakai fungsi junior di `generator.ts` (`ageAt(p.birth, date)` / `JUNIOR_MAX_AGE`; cek nama ekspor tepatnya dengan `grep -n "export" src/engine/generator.ts`). Untuk kejuaraan beregu junior (Suhandinata), lewati blok snub (`if (format === 'suhandinata') continue;` — cek nama format di `TeamFormat`).

Di `playEvent` untuk multi-event (`event.countries` ada): kontingen tahun itu `state.contingents?.[`${year}:${event.id}`]` → semua id atlet di dalamnya `bumpForm(p, SELECT_BONUS)` sekali, tepat sebelum undian; snub dengan pola yang sama untuk negara manajer saja (pool = atlet senior negara manajer).

- [ ] **Step 4: Tes integrasi** — tambahkan:

```ts
describe('skuad beregu', () => {
  it('anggota skuad negara manajer mendapat SELECT_BONUS', async () => {
    // Pakai pola team.test.ts: majukan musim sampai minggu final beregu tahun genap (Thomas/Uber), set form 0 untuk semua INA,
    // mainkan minggu itu, lalu cek rata-rata form anggota state.teamSquads.thomas > rata-rata atlet INA yang tidak dipilih.
  });
});
```

Isi tes mengikuti `src/engine/team.test.ts:280-300` (sudah memajukan ke minggu Thomas Cup dan membaca `state.teamSquads.thomas`). Assertion: `avg(squad) - avg(notSelected) > 0.5`.

Jalankan `npx vitest run src/engine/boosts.test.ts src/engine/team.test.ts src/engine/contingent.test.ts` → PASS.

- [ ] **Step 5: Commit** — `"Morale: dipanggil ke skuad beregu/kontingen menaikkan morale; atlet layak yang dicoret manajer sedikit turun"`

---

### Task 5: Pasangan kompak & dibubarkan manajer

**Files:** Modify `src/engine/types.ts` (`Pair`), `src/engine/season.ts` (`updateMorale`), `src/engine/career.ts:307-310`, `src/ui/Pairs.tsx:122`; Test `boosts.test.ts`.

**Interfaces:**
- Produces: `Pair.winStreak?: number`; `dissolvePair(state, pairId, byManager = false)`.

- [ ] **Step 1: Tes gagal**

```ts
import { dissolvePair } from './career';

describe('pasangan', () => {
  it('dibubarkan manajer: kedua atlet −DISSOLVE_PENALTY; dibubarkan sistem: tidak', () => {
    const state = newSeason(WORLD, rs, 9, undefined, 'INA');
    const [x, y] = state.pairs.filter((p) => !p.dissolved).slice(0, 2);
    const ps = (pr: typeof x) => pr.playerIds.map((id) => state.players.find((p) => p.id === id)!);
    for (const p of [...ps(x), ...ps(y)]) p.form = 0;
    dissolvePair(state, x.id, true);
    dissolvePair(state, y.id);
    expect(ps(x).map((p) => p.form)).toEqual([-1.5, -1.5]);
    expect(ps(y).map((p) => p.form)).toEqual([0, 0]);
  });
});
```

- [ ] **Step 2:** FAIL.

- [ ] **Step 3: Implementasi**

`types.ts`, di `Pair`:

```ts
  /** Kemenangan beruntun bersama (morale pasangan kompak). Save lama: tidak ada = 0. */
  winStreak?: number;
```

`career.ts`:

```ts
/** `byManager`: keputusan manajer (bukan pensiun/cedera) — kedua atlet kecewa. */
export function dissolvePair(state: SeasonState, pairId: string, byManager = false) {
  const pair = state.pairs.find((p) => p.id === pairId);
  if (!pair || pair.dissolved) return;
  pair.dissolved = { ...state.date };
  if (byManager) for (const id of pair.playerIds) { const p = state.players.find((x) => x.id === id); if (p) bumpForm(p, -DISSOLVE_PENALTY); }
}
```

`Pairs.tsx:122`: `dissolvePair(state, p.id, !p.trial);` (pasangan percobaan tidak dihitung). `Squad.tsx:217` tetap tanpa argumen (pembersihan otomatis).

`updateMorale`, di dalam loop laga setelah `add(sides[1], -d);`:

```ts
    // Pasangan kompak: menang beruntun bersama menambah morale keduanya.
    const wp = pairs.get(m.sides[m.winner]), lp = pairs.get(m.sides[1 - m.winner]);
    if (wp) { wp.winStreak = (wp.winStreak ?? 0) + 1; if (wp.winStreak >= PAIR_STREAK_FROM) add(sides[m.winner], PAIR_STREAK_BONUS); }
    if (lp) lp.winStreak = 0;
```

- [ ] **Step 4:** tambah tes streak: buat `Match` palsu tiga kali untuk satu pasangan lalu panggil `playWeek` tidak praktis — cukup uji lewat satu musim: setelah 12 minggu, `state.pairs.some((p) => (p.winStreak ?? 0) >= 3)` dan tidak ada atlet dengan form di luar −10..10. Jalankan tes + `morale.test.ts` → PASS.
- [ ] **Step 5: Commit** — `"Morale: pasangan menang beruntun ≥ 3 menambah morale; pasangan yang dibubarkan manajer kecewa"`

---

### Task 6: Rekor pribadi (gelar pertama, menang pertama atas top 10, ranking terbaik karier)

**Files:** Modify `src/engine/types.ts` (`Player.beatTop10?`), `src/engine/season.ts` (`updateMorale` diberi peta ranking sebelum minggu; `updateRankWeeks`); Test `boosts.test.ts`.

**Interfaces:**
- `updateMorale(state, rs, fromMatch, fromChampion, ranks)` — `ranks` = peta ranking senior per nomor yang sudah dihitung di awal `playWeek` (variabel `ranks`, ±baris 540).

- [ ] **Step 1: Tes gagal**

```ts
describe('rekor pribadi', () => {
  it('gelar pertama memberi bonus ekstra dibanding juara yang sudah pernah juara', async () => {
    const state = newSeason(WORLD, rs, 10, undefined, 'INA');
    const rng = makeRng(10);
    let checked = 0;
    while (state.date.week < 20 && !checked) {
      const fromC = state.champions.length;
      const prior = new Set(state.champions.map((c) => c.winner));
      for (const p of state.players) p.form = 0;
      await playWeek(state, rs, WORLD, rng);
      const members = (id: string) => (state.pairs.find((x) => x.id === id)?.playerIds ?? [id]).map((x) => state.players.find((p) => p.id === x)!);
      const fresh = state.champions.slice(fromC).filter((c) => !prior.has(c.winner) && !state.champions.slice(0, fromC).some((x) => x.winner === c.winner));
      for (const c of fresh) for (const p of members(c.winner)) { expect(p.form).toBeGreaterThanOrEqual(2); checked++; }
    }
    expect(checked).toBeGreaterThan(0);
  }, 180000);
});
```

- [ ] **Step 2:** FAIL (juara baru ≈ +1 titleBonus saja, bisa < 2).

- [ ] **Step 3: Implementasi**

`types.ts`, di `Player`:

```ts
  /** Pernah mengalahkan atlet/pasangan top 10 (bonus morale sekali). */
  beatTop10?: true;
```

`updateMorale` (tambahkan parameter `ranks: Map<Discipline, Map<string, number>>`), di loop laga:

```ts
    // Menang pertama atas top 10 (ranking sebelum minggu ini).
    if ((ranks.get(m.discipline)?.get(m.sides[1 - m.winner]) ?? 9999) <= 10)
      for (const p of sides[m.winner]) if (!p.beatTop10) { p.beatTop10 = true; bumpForm(p, FIRST_TOP10_WIN_BONUS); }
```

dan untuk juara:

```ts
  const earlier = new Set(state.champions.slice(0, fromChampion).map((c) => c.winner));
  for (const c of state.champions.slice(fromChampion)) {
    add(members(c.winner), cfg.titleBonus);
    if (!earlier.has(c.winner)) { add(members(c.winner), FIRST_TITLE_BONUS); earlier.add(c.winner); }
  }
```

Panggilan: `updateMorale(state, rs, weekMatches, weekChampions, ranks);`.

> Juara beregu/junior: `state.champions` hanya berisi turnamen individu (lihat `playEvent`); turnamen junior ikut — itu disengaja (gelar junior pertama juga momen besar).

`updateRankWeeks` (`season.ts:1000`), di dalam `for (const r of ranked)` sebelum `addRankWeeks`:

```ts
      // Ranking terbaik karier (≤ 100): bonus kecil bila lebih baik dari semua peringkat yang pernah tercatat.
      const prev = byId[r.entrantId];
      const best = prev ? Math.min(9999, ...Object.keys(prev.at).map(Number)) : 9999;
      if (prev && r.rank <= RANK_WEEKS_TOP && r.rank < best) for (const id of state.pairs.find((x) => x.id === r.entrantId)?.playerIds ?? [r.entrantId]) {
        const p = state.players.find((x) => x.id === id); if (p) bumpForm(p, CAREER_HIGH_BONUS);
      }
```

(`prev` wajib ada: entrant baru pertama kali masuk daftar tidak memicu bonus, mencegah ledakan bonus di minggu pertama save.)

- [ ] **Step 4:** tes + `morale.test.ts` + `news.test.ts` → PASS.
- [ ] **Step 5: Commit** — `"Morale: rekor pribadi (gelar pertama, menang pertama atas top 10, ranking terbaik karier) memberi bonus sekali"`

---

### Task 7: Target perorangan dari manajer

**Files:**
- Modify: `src/engine/season.ts` (`SeasonState.targets?`, panggil `applyTargets` di `playEvent` `ds.forEach`), `src/engine/career.ts` (`setTarget`), `src/engine/boosts.ts` (`hitTarget`).
- Modify UI: `src/ui/Entries.tsx` (`EntryRow` + `EntryTable`), i18n.
- Test: `boosts.test.ts`.

**Interfaces:**
- `SeasonState.targets?: Record<string /* "tahun:eventId" */, Record<EntrantId, Round>>`
- `setTarget(state, year, eventId, entrantId, round?: Round): void` (undefined = hapus)
- `hitTarget(reached: Round | undefined, target: Round): 'hit' | 'miss' | 'none'` — `ROUNDS` berurutan W, F, SF, QF, R16, …; hit bila indeks reached ≤ indeks target; miss bila ≥ target + 2; `undefined` (tidak masuk babak utama) = miss bila target ≤ R32, selain itu none.

- [ ] **Step 1: Tes gagal**

```ts
import { hitTarget } from './boosts';

describe('hitTarget', () => {
  it('babak dicapai vs target', () => {
    expect(hitTarget('SF', 'QF')).toBe('hit');
    expect(hitTarget('QF', 'QF')).toBe('hit');
    expect(hitTarget('R16', 'QF')).toBe('none');
    expect(hitTarget('R32', 'QF')).toBe('miss');
    expect(hitTarget(undefined, 'QF')).toBe('miss');
    expect(hitTarget(undefined, 'R64')).toBe('none');
  });
});
```

- [ ] **Step 2:** FAIL.

- [ ] **Step 3: Implementasi**

```ts
// boosts.ts
import { ROUNDS, type Round } from './types';
export function hitTarget(reached: Round | undefined, target: Round): 'hit' | 'miss' | 'none' {
  const t = ROUNDS.indexOf(target);
  if (reached === undefined) return t <= ROUNDS.indexOf('R32') ? 'miss' : 'none';
  const r = ROUNDS.indexOf(reached);
  return r <= t ? 'hit' : r >= t + 2 ? 'miss' : 'none';
}
```

```ts
// career.ts
export function setTarget(state: SeasonState, year: number, eventId: string, entrantId: string, round?: Round) {
  const k = `${year}:${eventId}`;
  const map = ((state.targets ??= {})[k] ??= {});
  if (round) map[entrantId] = round; else delete map[entrantId];
}
```

`season.ts` di `ds.forEach((d, i) => { ... })` setelah `awardPrizes(...)`:

```ts
      // Target manajer: tercapai → morale naik, meleset ≥ 2 babak → turun.
      for (const [id, target] of Object.entries(state.targets?.[`${year}:${event.id}`] ?? {})) {
        if (!entries.get(event.id)!.get(d)!.some((c) => c.id === id)) continue; // bukan nomor ini / tidak masuk entry
        const res = hitTarget(run.main.reached.get(id) as Round | undefined, target);
        const ps = (pairs.get(id)?.playerIds ?? [id]).map((x) => players.get(x)!);
        if (res !== 'none') for (const p of ps) bumpForm(p, res === 'hit' ? TARGET_HIT : -TARGET_MISS);
      }
```

Tes integrasi: set target 'W' untuk atlet INA terlemah di turnamen minggu 2 lalu mainkan; form-nya turun ≥ TARGET_MISS relatif dibanding tanpa target (pakai dua `newSeason` dengan seed sama, satu dengan target satu tanpa — selisih form atlet itu = −1 ± 1e-9).

UI (`Entries.tsx`): `EntryRow` mendapat prop `target?: Round` dan `onTarget?: (r?: Round) => void`; tampilkan di `.entry-meta` hanya bila baris dicentang:

```tsx
{onTarget && checked && (
  <select className="mini" value={target ?? ''} onChange={(x) => onTarget((x.target.value || undefined) as Round | undefined)} title={t('targetHint')}>
    <option value="">{t('targetNone')}</option>
    {(['W', 'F', 'SF', 'QF', 'R16', 'R32'] as const).map((r) => <option key={r} value={r}>{t(`target_${r}` as TextKey)}</option>)}
  </select>
)}
```

`EntryTable` meneruskan `target={state.targets?.[`${year}:${eventId}`]?.[e.id]}` dan `onTarget={(r) => { setTarget(state, year, eventId, e.id, r); changed(); void saveGame(game); }}`.

i18n (id / en), tambahkan kunci: `targetNone: 'Target: —' / 'Target: —'`, `targetHint: 'Target babak: tercapai → morale naik; meleset ≥ 2 babak → turun' / 'Round target: reached → morale up; missed by 2+ rounds → down'`, `target_W: 'Target: juara' / 'Target: win'`, `target_F: 'Target: final' / 'Target: final'`, `target_SF: 'Target: semifinal' / 'Target: semi-final'`, `target_QF: 'Target: perempat final' / 'Target: quarter-final'`, `target_R16: 'Target: 16 besar' / 'Target: last 16'`, `target_R32: 'Target: 32 besar' / 'Target: last 32'`.

- [ ] **Step 4:** `npx vitest run` (semua, termasuk `i18n.test.ts`), `npx tsc --noEmit -p .`, `npm run build` → bersih.
- [ ] **Step 5: Commit** — `"Target perorangan: manajer memilih target babak per atlet di form entry; tercapai menaikkan morale, meleset ≥ 2 babak menurunkan"`

---

### Task 8: Kalah tipis dari lawan kuat = pengalaman

**Files:** Modify `src/engine/boosts.ts` (`isCloseLoss`), `src/engine/season.ts:691` (`applyEventLoad`); Test `boosts.test.ts`.

**Interfaces:** `isCloseLoss(scores: [number, number][], loserSide: 0 | 1): boolean` — tiga game, atau setiap game kalah selisih ≤ 3.

- [ ] **Step 1: Tes gagal**

```ts
import { isCloseLoss } from './boosts';
describe('isCloseLoss', () => {
  it('rubber game atau setiap game selisih ≤ 3', () => {
    expect(isCloseLoss([[21, 19], [19, 21], [21, 15]], 1)).toBe(true);
    expect(isCloseLoss([[21, 19], [22, 20]], 1)).toBe(true);
    expect(isCloseLoss([[21, 12], [21, 19]], 1)).toBe(false);
  });
});
```

- [ ] **Step 2:** FAIL.

- [ ] **Step 3: Implementasi**

```ts
export const isCloseLoss = (scores: [number, number][], loser: 0 | 1) =>
  scores.length >= 3 || scores.every((g) => g[1 - loser] - g[loser] <= 3);
```

`applyEventLoad`, ganti baris pengalaman:

```ts
        const ab = (s: string) => (pairs.get(s)?.playerIds ?? [s]).reduce((t, x) => t + currentAbility(players.get(x)!.attrs), 0) / (pairs.get(s) ? 2 : 1);
        const close = m.winner !== i && !m.walkover && ab(m.sides[1 - i]) - ab(side) >= CLOSE_LOSS_GAP && isCloseLoss(m.scores, i as 0 | 1);
        state.experience[id] = (state.experience[id] ?? 0) + (m.winner === i ? 1.5 : close ? CLOSE_LOSS_EXP : 1) * (big ? 1.3 : 1);
```

(`currentAbility` dari `./generator`, sudah diimpor di `season.ts` — cek.) Hitung `ab` sekali per laga di luar loop `for (const id …)`.

- [ ] **Step 4:** tes unit + `development.test.ts` + `season.test.ts` → PASS.
- [ ] **Step 5: Commit** — `"Perkembangan: kalah tipis dari lawan yang jauh lebih kuat dihitung pengalaman lebih besar"`

---

### Task 9: Morale, lingkungan elite & mentor memengaruhi perkembangan kuartal

**Files:** Modify `src/engine/development.ts` (`QuarterContext`, `developQuarter`), `src/engine/boosts.ts` (`eliteCounts`, `mentorsOf`), `src/engine/season.ts` (`endQuarter`); Test `src/engine/development.test.ts`.

**Interfaces:**
- `QuarterContext` tambah `elite?: Map<string /*countryId*/, number>`, `mentored?: Set<string /*playerId*/>` (opsional: tes lama tetap jalan).
- `eliteCounts(state: SeasonState, rs: Ruleset): Map<string, number>` — atlet unik per negara yang ada di top 20 nomor mana pun (pasangan → kedua atlet).
- `mentorsOf(state: SeasonState, date: GameDate): Set<string>` — atlet ≤ 21 th yang punya pasangan aktif (bukan `adHoc`) berusia ≥ 25 dengan CA ≥ CA-nya + 10.

- [ ] **Step 1: Tes gagal** (di `development.test.ts`, pola tes yang sudah ada memakai `developQuarter` dengan `cfg` & `makeRng`)

```ts
it('morale tinggi → tumbuh lebih banyak dari morale rendah (rng sama)', () => {
  const mk = (form: number) => ({ ...structuredClone(young), form });
  const hi = mk(10), lo = mk(-10);
  const ctx = { date: d, experience: new Map(), doublesPlayers: new Set<string>() };
  developQuarter(hi, cfg, ctx, makeRng(1));
  developQuarter(lo, cfg, ctx, makeRng(1));
  expect(currentAbility(hi.attrs)).toBeGreaterThan(currentAbility(lo.attrs));
});
it('lingkungan elite & mentor menambah pertumbuhan dan mental', () => {
  const a = structuredClone(young), b = structuredClone(young);
  const base = { date: d, experience: new Map(), doublesPlayers: new Set<string>() };
  developQuarter(a, cfg, base, makeRng(2));
  developQuarter(b, cfg, { ...base, elite: new Map([[b.countryId, 5]]), mentored: new Set([b.id]) }, makeRng(2));
  expect(b.attrs.mental).toBeGreaterThan(a.attrs.mental);
  expect(currentAbility(b.attrs)).toBeGreaterThanOrEqual(currentAbility(a.attrs));
});
```

(`young` = atlet usia 17 dengan PA jauh di atas CA; buat dengan `generatePlayer` seperti tes lain di file itu, `d` = tanggal tes yang sudah ada.)

- [ ] **Step 2:** FAIL.

- [ ] **Step 3: Implementasi** — di `developQuarter`, setelah `if (p.trait === 'stagnant') …`:

```ts
  rate *= 1 + MORALE_GROWTH * (p.form / 10);
  if (realAge <= ELITE_AGE) rate *= 1 + Math.min(ELITE_MAX, ELITE_PER * (ctx.elite?.get(p.countryId) ?? 0));
  const mentored = ctx.mentored?.has(p.id);
  if (mentored) rate *= 1 + MENTOR_GROWTH;
```

dan setelah langkah mental (2):

```ts
  if (mentored) p.attrs.mental += MENTOR_MENTAL / 4;
```

`boosts.ts`:

```ts
export function eliteCounts(state: SeasonState, rs: Ruleset) {
  const now = absWeek(state.date);
  const pairOf = new Map(state.pairs.map((p) => [p.id, p]));
  const country = new Map(state.players.map((p) => [p.id, p.countryId]));
  const ids = new Set(DISCIPLINES.flatMap((d) => computeRanking(state.results, d, now, rs).slice(0, 20)
    .flatMap((r) => pairOf.get(r.entrantId)?.playerIds ?? [r.entrantId])));
  const out = new Map<string, number>();
  for (const id of ids) { const c = country.get(id); if (c) out.set(c, (out.get(c) ?? 0) + 1); }
  return out;
}

export function mentorsOf(state: SeasonState, date: GameDate) {
  const byId = new Map(state.players.map((p) => [p.id, p]));
  const out = new Set<string>();
  for (const pair of state.pairs) {
    if (pair.dissolved || pair.adHoc) continue;
    const [a, b] = pair.playerIds.map((id) => byId.get(id)!);
    for (const [y, o] of [[a, b], [b, a]] as const)
      if (y && o && ageAt(y.birth, date) <= 21 && ageAt(o.birth, date) >= 25 && currentAbility(o.attrs) >= currentAbility(y.attrs) + 10) out.add(y.id);
  }
  return out;
}
```

(Import tipe `SeasonState` dari `./season` dengan `import type` agar tidak terjadi impor melingkar saat runtime.)

`endQuarter`:

```ts
  const ctx = { date: state.date, experience: new Map(Object.entries(state.experience)), doublesPlayers: doublesPlayers(state, rs),
    elite: eliteCounts(state, rs), mentored: mentorsOf(state, state.date) };
```

- [ ] **Step 4:** `npx vitest run` penuh → PASS. Tambahan cek kalibrasi: tes junior di `generator.test.ts`/`development.test.ts` ("15–20 dari 20 junior terkuat dari negara tradisi ≥ 60") tetap lulus; jika gagal, turunkan `ELITE_PER` ke 0.01 dan catat di ASUMSI.
- [ ] **Step 5: Commit** — `"Perkembangan: morale (±10%), lingkungan pelatnas (atlet top 20 senegara) dan mentor (pasangan senior jauh lebih kuat) memengaruhi pertumbuhan kuartal"`

---

### Task 10: Kembali lebih kuat setelah cedera berat

**Files:** Modify `src/engine/season.ts:542-546` (loop pemulihan mingguan di `playWeek`); Test `boosts.test.ts`.

**Interfaces:** Consumes `COMEBACK_CHANCE`, `COMEBACK_MENTAL`, `capToPa` (dari `./development`).

- [ ] **Step 1: Tes gagal**

```ts
describe('comeback', () => {
  it('sebagian atlet yang sembuh dari cedera berat naik mental', async () => {
    let up = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const state = newSeason(WORLD, rs, seed, undefined, 'INA');
      const p = state.players.find((x) => x.retired === undefined && x.pa - x.attrs.mental > 5)!;
      p.injury = { weeksLeft: 1, level: 'severe', type: 'knee' };
      const before = p.attrs.mental;
      await playWeek(state, rs, WORLD, makeRng(seed));
      if (p.attrs.mental > before + 1) up++;
    }
    expect(up).toBeGreaterThan(1);
    expect(up).toBeLessThan(15);
  }, 300000);
});
```

- [ ] **Step 2:** FAIL (up = 0).

- [ ] **Step 3: Implementasi** — ganti baris pemulihan cedera:

```ts
    if (p.injury && --p.injury.weeksLeft <= 0) {
      // Kembali lebih kuat: sembuh dari cedera berat kadang menaikkan mental.
      if (p.injury.level === 'severe' && rng() < COMEBACK_CHANCE) { p.attrs.mental += COMEBACK_MENTAL; capToPa(p); }
      p.injury = undefined;
    }
```

> Ini menambah satu panggilan `rng()` hanya saat cedera berat sembuh; tes yang bergantung seed bisa bergeser. Bila ada yang gagal karena pilihan atlet acak, perbaiki tesnya agar memilih atlet secara deterministik (contoh: commit `aed71a7` pada `season.test.ts`), jangan menghapus tes.

- [ ] **Step 4:** `npx vitest run` penuh → PASS.
- [ ] **Step 5: Commit** — `"Perkembangan: sembuh dari cedera berat berpeluang 30% menaikkan mental (kembali lebih kuat)"`

---

### Task 11: Kalibrasi menyeluruh & dokumentasi

**Files:** `docs/ASUMSI.md`, `docs/RENCANA.md`, teks bantuan morale di i18n (cari `grep -n "morale" src/i18n/index.ts`), `src/engine/morale.test.ts`.

- [ ] **Step 1: Tes kalibrasi** — tambahkan ke `morale.test.ts`:

```ts
it('sepanjang musim penuh: mayoritas tetap Normal, tidak ada yang menempel di +10', async () => {
  const state = newSeason(WORLD, rs, 11, undefined, 'INA');
  const rng = makeRng(11);
  while (state.date.week < 52) await playWeek(state, rs, WORLD, rng);
  const active = state.players.filter((p) => p.retired === undefined);
  expect(active.filter((p) => moraleTier(p.form) === 'normal').length / active.length).toBeGreaterThan(0.55);
  expect(active.filter((p) => p.form >= 9.5).length / active.length).toBeLessThan(0.02);
}, 600000);
```

- [ ] **Step 2:** Jalankan. Bila gagal, kecilkan bonus terbesar dulu (`HOME_BONUS`, `SELECT_BONUS` → 0.5) sampai lulus; catat angka akhir.
- [ ] **Step 3: Dokumentasi** — `docs/ASUMSI.md`: bagian baru "Sumber morale & perkembangan (tanpa latihan)" berisi tabel semua konstanta `boosts.ts` dengan nilai akhir dan alasan singkat. `docs/RENCANA.md`: blok "Fitur berikutnya (disetujui 2026-10-25)" dengan centang tiap task. Teks bantuan morale di i18n (id & en): satu kalimat yang menyebut target, kandang, skuad, istirahat, pasangan kompak, rekor pribadi.
- [ ] **Step 4:** `npx vitest run`, `npx tsc --noEmit -p .`, `npm run build` → semua bersih.
- [ ] **Step 5: Commit** — `"Morale & perkembangan: kalibrasi satu musim, ASUMSI & RENCANA diperbarui, teks bantuan morale"`

---

## Self-review

- Cakupan ide: target (T7), dipanggil/dicoret (T4), istirahat (T2), kandang (T3), pasangan kompak/dibubarkan (T5), rekor pribadi (T6), kalah tipis vs kuat (T8), mentor + morale→perkembangan + lingkungan pelatnas (T9), comeback cedera (T10). Kalibrasi & dokumen (T11).
- Nama konsisten: `bumpForm`, `snubbed`, `hitTarget`, `isCloseLoss`, `eliteCounts`, `mentorsOf`, `setTarget`, `dissolvePair(…, byManager)`, `Pair.winStreak`, `Player.beatTop10`, `SeasonState.targets`.
- Di luar cakupan (sengaja): fokus latihan, perbaikan scouting, laporan kuartal — rencana terpisah bila disetujui.
