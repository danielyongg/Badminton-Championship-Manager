# Prioritas tier untuk entry otomatis

Disetujui user 2026-10-15.

## Tujuan

Manajer bisa menentukan, per atlet tunggal dan per pasangan ganda, tier turnamen mana saja yang diikuti saat entry
otomatis (AI). Contoh: MS andalan hanya S1000/S750/S500, tidak pernah S300/S100.

## Tempat mengatur (tab Skuad)

- Tampilan **Single**: kolom "Atur sektor" diganti kolom **Prioritas tier** (prioritas tunggal atlet itu).
- Tampilan **Pairs**: kolom **Prioritas tier** ditambahkan sebelum kolom tombol (prioritas pasangan itu).
- Tampilan **Semua**: tetap memakai kolom "Atur sektor" (tempat mengatur Single/Pairs).
- Isi kolom: tombol kecil yang bisa dinyalakan/dimatikan untuk tiap tier yang dipilih AI:
  S1000 · S750 · S500 · S300 · S100 · IC · IS · FS. Semua mati = belum diatur (perilaku AI bawaan).
  Klik di kolom ini tidak membuka profil atlet.

## Data

- `SeasonState.tierPrefs?: Record<EntrantId, TierId[]>`. Kunci = id atlet (tunggal) atau id pasangan (ganda).
  Daftar kosong / tidak ada kunci = belum diatur, sehingga save lama tetap jalan tanpa migrasi.
- Pasangan yang bubar: preferensinya tidak dipakai lagi. Pasangan baru mulai tanpa preferensi.

## Aturan entry otomatis (`chooseEntries` di `src/engine/season.ts`)

Hanya berlaku untuk peserta negara manajer yang punya preferensi dan **tidak** punya keputusan manual minggu itu:

1. Pilihan turnamen dibatasi ke tier yang dicentang.
2. Jika ada turnamen tier tercentang minggu itu → **selalu didaftarkan** ke tier tertinggi di antaranya.
   Rentang rank (`ai.rankRange`) dan peluang ikut (`ai.playProb`) diabaikan.
3. Tetap tidak didaftarkan bila cedera atau kelelahan > `ai.restAbove`.

Yang tidak berubah (didahulukan di atas preferensi):
- Turnamen wajib (Top Committed) tetap diikuti.
- WTF, Kejuaraan Dunia, Olimpiade tetap lewat kualifikasi; turnamen junior tetap otomatis.
- Keputusan manual minggu itu (Main di turnamen X / Istirahat) tetap menang.
- Junior pratama dan pasangan percobaan tetap tidak didaftarkan AI.
- Satu atlet tetap satu turnamen per minggu (pilihan pertama mengikat nomor lainnya, urutan MS→XD).

## Test

Satu test engine: atlet dengan preferensi [S1000, S750, S500] tidak pernah masuk S300/S100 selama satu musim, dan
pada minggu dengan turnamen S500+ (tidak cedera, tidak lelah, tanpa komitmen lain) selalu terdaftar.

## i18n

Teks baru (id + en): judul kolom "Prioritas tier" dan petunjuk singkat (kosong = AI bebas memilih).
