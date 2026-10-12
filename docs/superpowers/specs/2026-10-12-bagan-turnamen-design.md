# Bagan turnamen di mode karier — desain

Disetujui user 2026-10-12 (opsi C isi, opsi B akses).

## Tujuan
Dari mode karier, buka halaman turnamen yang sudah/sedang dimainkan: daftar entry, bagan kualifikasi, langkah undian (atau undian pot + klasemen grup), dan bagan utama dengan unggulan, negara, skor & juara.

## Data
- `EventRecord` (engine, `src/engine/tournament.ts`): `tournamentId, year, discipline, entry (EntryList), qualRounds, steps, slots, rounds, groups?`. Dibuat dari `EventRun` oleh `toRecord()` setelah tiap `runEvent` di `playWeek`; disimpan di `SeasonState.eventRecords`.
- Skor tidak diduplikasi: diambil dari `state.matches` (tournamentId + year + discipline).
- Disimpan 2 musim terakhir (dipangkas di akhir musim, seperti statistik laga).
- Langkah undian disimpan terstruktur (`DrawStep = { key, vars, pos?, entrant? }`), teks dibentuk saat ditampilkan → ikut bahasa terpilih & dipakai ulang oleh live drawing.
- Save lama: `eventRecords` diisi `[]`; halaman menampilkan daftar laga per babak dengan keterangan data terbatas.

## UI
- Komponen tampilan bersama (`src/ui/EventViews.tsx`): Entry, Kualifikasi, Grup, Undian, Bagan — dipakai Wizard (Lab) dan halaman turnamen karier.
- Halaman turnamen (`TournamentView`): judul (tier, kota, minggu, hadiah), tombol nomor, bagian Entry / Kualifikasi atau Grup / Undian / Bagan (bawaan Bagan). Atlet negara sendiri disorot; klik nama → profil.
- Event beregu → hasil beregu (grup + babak gugur) yang sudah ada.
- Tautan: Dunia → Kalender & juara (nama turnamen), Dashboard → Hasil minggu lalu, Profil atlet → Laga terakhir.

## Tes
- Tiap turnamen × nomor yang dimainkan punya catatan.
- Pasangan babak pertama bagan = laga yang dimainkan; juara bagan = juara resmi.
- Catatan > 2 musim terhapus.
- Ukuran tambahan save per musim diukur & dibatasi.
