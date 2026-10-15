# Ringkasan rencana musim

Disetujui user 2026-10-15.

## Tempat

Tab **Kalender & Entry** mendapat sub-tab: **Kalender** (daftar yang sudah ada, tetap bawaan) · **Rencana musim** (baru).
Gaya sub-tab sama dengan Semua · Single · Pairs di Skuad.

## Tabel

- Baris: atlet tunggal & pasangan negara manajer (sama dengan baris entry mingguan `EntryTable`), dikelompokkan per
  nomor MS→XD, urut ranking. Kolom nama (dengan chip nomor) menempel saat digeser.
- Kolom: minggu dari minggu ini sampai akhir musim yang punya turnamen individu senior yang bisa diatur manajer
  (tanpa WTF & junior — sama dengan `EntryTable`). Kepala: "M21 · S500" (tier tertinggi minggu itu).
- Isi sel, urutan prioritas:
  1. Cedera pada minggu itu (minggu ini + `injury.weeksLeft`): 🩹.
  2. Keputusan manual (`state.manualEntries`): tegas — tier + nama singkat, atau "Istirahat".
  3. Turnamen wajib (Top Committed, `state.commitments`): ⭐ + tier.
  4. Selain itu **"Otomatis"** (samar): AI memilih saat minggu itu tiba. (Revisi 2026-10-15: perkiraan AI "~" tidak
     ditampilkan atas permintaan user.)

## Mengubah

Ketuk sel → `<select>` dengan pilihan yang sama dengan entry mingguan (Otomatis / turnamen minggu itu yang membuka
nomornya / Istirahat). Disimpan ke `state.manualEntries` (kunci minggu yang sama) — layar entry mingguan & rencana
selalu sinkron. Sel cedera tidak bisa diubah.

## Bentrok

Bila keputusan manual satu atlet di minggu yang sama menunjuk turnamen berbeda (mis. MS di A, XD di B): kedua sel
bergaris merah dengan keterangan "bentrok". Tidak diblokir (sama seperti entry mingguan).

## Kode

- `planWeek` (engine, fungsi murni) di `src/engine/plan.ts`:
  masukan state, ruleset, minggu → peta entrantId → { eventId | 'rest' | null, kind: 'manual'|'required'|'auto', conflict? }.
- UI: komponen `SeasonPlan` di `src/ui/Entries.tsx`.

## Test

Engine: urutan manual → wajib → otomatis; pengikatan satu turnamen per minggu; bentrok manual.

## i18n

Teks baru id + en: nama sub-tab, keterangan sel, "bentrok".
