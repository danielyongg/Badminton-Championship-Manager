# Rencana & daftar pekerjaan

Daftar fitur yang belum dibuat. Fase 1–10 sudah selesai (lihat `git log`); asumsi aturan ada di `docs/ASUMSI.md`.

## Fase 11 — Bahasa & simulasi lancar
- [x] Teks bahasa Inggris: kamus `src/i18n/en.ts` (semua teks UI & pesan engine), pilihan bahasa di menu utama & header.
- [x] Simulasi beberapa minggu tidak membekukan UI: jeda antar minggu + indikator "Menyimulasikan minggu X…" + tombol Berhenti. (Web worker tidak diperlukan untuk saat ini.)
- [ ] Nama data bawaan (negara, kota, event seperti "Kejuaraan Beregu Asia", tier "Kejuaraan Dunia") masih bahasa Indonesia di mode Inggris — bisa diganti lewat Editor, atau dibuatkan paket data bahasa Inggris.
- Dipindah ke tahap akhir: tampilan responsif (digabung dengan percantik UI) & deploy GitHub Pages.

## Sisa spesifikasi awal
- [x] Bagan turnamen di mode karier: halaman turnamen (entry, kualifikasi/grup, undian, bagan) dari Kalender, Dashboard & profil atlet; catatan 2 musim (±2 MB/musim). Spesifikasi: `docs/superpowers/specs/2026-10-12-bagan-turnamen-design.md`.
- [x] Grafik atribut per usia di profil atlet (Kemampuan + satu atribut pilihan; tabel tetap ada).
- [x] Hadiah uang: per atlet per musim (profil: musim ini & karier; Federasi: total negara & pendapatan terbesar).
- [ ] Avatar atlet di Editor (opsional).

## Fitur tambahan dari diskusi
- [x] **Live drawing** (gaya Football Manager): pilihan header *Mati / Turnamen besar saja / Semua yang diikuti atlet saya*; mangkuk pot + bagan/grup terisi, pengumuman tiap langkah, pemisahan negara menyala; putar ulang dari halaman turnamen & hasil beregu. Undian babak kualifikasi tidak ditampilkan (hanya pembagian seksi acak).
- [x] **Pasangan ganda percobaan**: dibentuk tanpa membubarkan pasangan utama, ranking sendiri, hanya ikut bila didaftarkan manual, bisa dijadikan pasangan utama.
- [x] Pop-up "Daftarkan atlet" sebelum minggu turnamen (pilihan header: Mati / Minggu turnamen besar / Tiap minggu turnamen; bawaan Mati).
- [x] Ganda dadakan khusus beregu: slot ganda di line-up = dua atlet skuad bebas; pasangan khusus beregu tanpa ranking.

## Tahap akhir — Percantik UI & perbaikan UX (setelah semua fitur selesai)
- [ ] Desain visual baru (warna, tipografi, kartu, ikon, tampilan bagan & Live Match) — gaya dibahas bersama user sebelum dikerjakan.
- [ ] Perbaikan UX: daftar keluhan/temuan user dikumpulkan di sini sebelum tahap ini dimulai.
  - (tambahkan temuan di sini)
- Catatan urutan: tampilan responsif dari Fase 11 sebaiknya dikerjakan bersama tahap ini; deploy GitHub Pages dilakukan sekali di akhir.

## Koreksi aturan beregu (temuan saat mencari nama resmi)
- [x] Kuota kontinental: Asia & Eropa 4 tim (semifinalis), Pan Am/Afrika/Oseania 1 tim; kursi tim yang sudah lolos (tuan rumah/juara bertahan) jatuh ke tim berikutnya dari benua itu.
- [x] Tuan rumah kontinental 2026: Qingdao, Istanbul, Guatemala City, Gaborone, Auckland.
- [x] Nama resmi kejuaraan kontinental (berbeda di tahun Thomas/Uber dan Sudirman).
- [x] Negara kecil (Afrika, NZL) kini bisa menurunkan tim beregu: generator menjamin minimal 2 pasangan MD & WD bila atletnya cukup.

## Batasan yang bisa ditinjau ulang
- Tier tidak bisa ditambah/dihapus di Editor.
- Tuan rumah beregu tetap tiap edisi (Horsens / Xiamen).
- Ukuran skuad beregu (4–10, 4–12) dan urutan partai Sudirman Cup masih asumsi.
