# Pasangan Beda Negara + Line-up Sederhana — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pemain independen (dilepas federasi) di semua negara, pasangan ganda beda negara di antara mereka, dan pop-up line-up beregu yang lebih ringkas.

**Architecture:** Modul baru `src/engine/independents.ts` berisi pelepasan atlet AI (`releaseAthletes`) dan pemasangan independen (`pairIndependents`). `endYear` memanggil keduanya; `releasePlayer` (manajer) memanggil `pairIndependents` untuk atlet itu. `chooseEntries` membatasi pasangan beda negara ke turnamen terbuka. Tampilan dua bendera lewat `entrantLabel` (`country` = `"DEN/ENG"`) + `Flag` yang memecah `/`. `LineupPicker` ditulis ulang: satu dropdown per partai.

**Tech Stack:** TypeScript, React, Vitest.

## Global Constraints

- Balasan & komentar kode dalam Bahasa Indonesia, gaya file sekitar.
- Save lama tanpa migrasi; ruleset di save lama tidak punya field baru → angka pelepasan sebagai konstanta ekspor di `independents.ts` (bukan ruleset).
- Turnamen terbuka = tier di `rs.race.tiers` (S1000–S100), `WTF`, dan tier grade 3 non-junior (IC/IS/FS).
- Tanya user sebelum commit/push/deploy.

---

### Task 1: `independents.ts` — pelepasan AI & pemasangan independen

**Files:**
- Create: `src/engine/independents.ts`
- Test: `src/engine/independents.test.ts`

**Interfaces — Produces:**
- `RELEASE_KEEP = 10`, `RELEASE_AGE = 24`, `RELEASE_CHANCE = 0.25`, `RELEASE_CHANCE_YOUNG = 0.05`, `PAIR_GAP = 5`
- `releaseAthletes(state: SeasonState, rng: Rng): string[]` — negara selain `state.managedCountryId`; mengembalikan id yang dilepas.
- `pairIndependents(state: SeasonState, rs: Ruleset, world: World, rng: Rng, onlyIds?: string[]): Pair[]`
- `isCrossNation(playerIds: string[], countryOf: (id: string) => string | undefined): boolean`

Aturan (spesifikasi §1a, §2): top 10 per gender (non-junior U19, menurut CA) aman; negara dengan < 10 atlet senior per gender tidak melepas. Kandidat usia ≥ 24: 25%; 19–23: 25% bila PA < CA atlet ke-10, selain itu 5%. Pelepasan: `released = year`; pasangan aktif dengan atlet non-independen dibubarkan.
Pemasangan: independen aktif, bukan junior U19, usia ≥ 17, `focus !== 'S'`, bukan top 64 tunggal; per nomor tanpa pasangan utama aktif; tahap senegara → sekonfederasi → bebas; |ΔCA| ≤ 5, terdekat dulu; chemistry 30–49; id `{negara A}-{nomor}{tahun}-i{n}`.

Tes: (1) top 10 & junior tak pernah dilepas, PA tinggi vs rendah; (2) urutan tahap & selisih CA; (3) spesialis tunggal tidak dipasangkan; (4) `onlyIds` hanya memasangkan atlet itu.

### Task 2: Integrasi musim & entry

**Files:** `src/engine/season.ts` (`endYear`, `formPairs`, `chooseEntries`), `src/engine/career.ts` (`releasePlayer`), `src/ui/Squad.tsx` (2 pemanggil), tes di `src/engine/independents.test.ts`.

- `formPairs`: `member = p.countryId === c.id && p.released === undefined`; negara manajer dilewati (pasangan independennya lewat `pairIndependents`).
- `endYear`: sesudah pembubaran pasangan pensiun → `releaseAthletes`; sesudah `formPairs` → `pairIndependents`.
- `releasePlayer(state, id, ctx?: { rs, world, rng })`: bila `ctx`, panggil `pairIndependents(..., [id])`. UI meneruskan `{ rs: ruleset, world, rng: game.rng }`.
- `chooseEntries` `options`: entrant beda negara hanya ke turnamen terbuka.

Tes: pasangan beda negara tidak punya opsi WC/CC/MSG, punya S1000/IC; satu musim `advanceWeek` sampai akhir tahun menghasilkan independen di negara AI.

### Task 3: Data asli & validasi paket

**Files:** `scripts/fetch-bwf.mjs`, `src/engine/presets/realPlayers.ts`, `src/engine/pack.ts`, tes `src/engine/pack.test.ts`.

- Skrip menyimpan pasangan beda negara (hapus syarat negara sama di baris 87 & 115).
- `realRoster`: pasangan beda negara → kedua atlet `released = startYear`.
- `validatePack`: beda negara diterima bila kedua atlet `released !== undefined`.
- Coba jalankan skrip; bila terblokir, laporkan ke user.

### Task 4: Dua bendera

**Files:** `src/ui/game.tsx` (`entrantLabel`), `src/ui/Flag.tsx`.

- `entrantLabel`: `country` = negara unik dipisah `/` (`"DEN/ENG"`).
- `Flag`: `id` berisi `/` → beberapa `<img>`.

### Task 5: Line-up sederhana

**Files:** `src/ui/Team.tsx` (`LineupPicker`, `TieLineupModal`), `src/i18n/index.ts` + `en.ts`, CSS bila perlu.

- Ganda: satu `<select>` berisi pasangan terdaftar skuad + opsi `adhoc` "Ganda dadakan…"; dua dropdown atlet hanya bila dadakan.
- Teks opsi: `Nama · #rank · CA` + ` ⚠` bila cedera/lelah > `rs.ai.restAbove`.
- Petunjuk satu baris + ⓘ (title = petunjuk lama).
- Baris bermasalah (atlet > maks partai atau dobel nomor) diberi kelas `bad`.
- Verifikasi screenshot desktop & HP.

### Task 6: Dokumen & kalibrasi

- Kalibrasi 3 musim (`src/engine/_cross.test.ts`, dihapus): jumlah independen & pasangan beda negara (target 20–60), tim beregu AI tetap lengkap.
- Perbarui `docs/ASUMSI.md`, `docs/RENCANA.md`.
- `npx tsc -b`, `npx vitest run`, `npm run build`.
