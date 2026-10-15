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
  4. Selain itu perkiraan AI (samar, awalan "~"): prioritas tier (`state.tierPrefs`) → turnamen tier tertinggi yang
     dicentang; tanpa prioritas → turnamen pertama dalam `ai.rankRange` sesuai ranking sekarang; tidak ada → "—".
     Pasangan percobaan: "—".
  Satu atlet satu turnamen per minggu: perkiraan nomor berikutnya (MS→XD) mengikuti turnamen yang sudah diperkirakan
  untuk atlet yang sama bila turnamen itu membuka nomornya.
- Keterangan di bawah tabel: "~ = perkiraan AI; kelelahan & peluang ikut tidak dihitung, bisa meleset untuk atlet
  berstatus Otomatis".

## Mengubah

Ketuk sel → `<select>` dengan pilihan yang sama dengan entry mingguan (Otomatis / turnamen minggu itu yang membuka
nomornya / Istirahat). Disimpan ke `state.manualEntries` (kunci minggu yang sama) — layar entry mingguan & rencana
selalu sinkron. Sel cedera tidak bisa diubah.

## Bentrok

Bila keputusan manual satu atlet di minggu yang sama menunjuk turnamen berbeda (mis. MS di A, XD di B): kedua sel
bergaris merah dengan keterangan "bentrok". Tidak diblokir (sama seperti entry mingguan).

## Kode

- `predictEntry` (engine, fungsi murni) di `src/engine/season.ts` atau berkas baru `src/engine/plan.ts`:
  masukan state, ruleset, minggu → peta entrantId → { eventId | 'rest' | null, kind: 'manual'|'required'|'guess' }.
- UI: komponen `SeasonPlan` di `src/ui/Entries.tsx`.

## Test

Engine: urutan prioritas manual → wajib → prioritas tier → rentang ranking; pengikatan satu turnamen per minggu.

## i18n

Teks baru id + en: nama sub-tab, keterangan "~", "bentrok".
