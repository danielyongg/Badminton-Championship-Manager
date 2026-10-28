# Rencana & daftar pekerjaan

Daftar fitur yang belum dibuat. Fase 1–10 sudah selesai (lihat `git log`); asumsi aturan ada di `docs/ASUMSI.md`.

## Fase 11 — Bahasa & simulasi lancar
- [x] Teks bahasa Inggris: kamus `src/i18n/en.ts` (semua teks UI & pesan engine), pilihan bahasa di menu utama & header.
- [x] Simulasi beberapa minggu tidak membekukan UI: jeda antar minggu + indikator "Menyimulasikan minggu X…" + tombol Berhenti. (Web worker tidak diperlukan untuk saat ini.)
- [x] Nama data bawaan (negara, kota, event) tampil dalam bahasa Inggris di mode Inggris: `DATA_EN` di `src/i18n/en.ts`, dicocokkan per teks persis sehingga nama yang diubah lewat Editor tetap apa adanya. Editor tetap menampilkan nama asli.
- [x] Tampilan responsif dasar (HP): pengaturan header terlipat di layar sempit, menu tab satu baris geser & melekat di atas, tabel lebar digeser di tempat, tombol & isian ramah jari. Penyempurnaan visual tetap di tahap akhir.
- [x] Deploy GitHub Pages otomatis tiap push ke `main` (`.github/workflows/pages.yml`: test → build → deploy).

## Sisa spesifikasi awal
- [x] Bagan turnamen di mode karier: halaman turnamen (entry, kualifikasi/grup, undian, bagan) dari Kalender, Dashboard & profil atlet; catatan 2 musim (±2 MB/musim). Spesifikasi: `docs/superpowers/specs/2026-10-12-bagan-turnamen-design.md`.
- [x] Grafik atribut per usia di profil atlet (Kemampuan + satu atribut pilihan; tabel tetap ada).
- [x] Hadiah uang: per atlet per musim (profil: musim ini & karier; Federasi: total negara & pendapatan terbesar).
- [ ] Avatar atlet di Editor (opsional).
- [x] Atlet asli di paket bawaan (2.424 atlet termasuk 536 junior, 47 negara, 931 pasangan termasuk 24 pasangan beda negara; data 2026-10-27); atlet fiktif hanya untuk melengkapi tim beregu (7 senior per gender) & negara tanpa data. Detail: `docs/ASUMSI.md`.

## Fitur tambahan dari diskusi
- [x] **Live drawing** (gaya Football Manager): pilihan header *Mati / Turnamen besar saja / Semua yang diikuti atlet saya*; mangkuk pot + bagan/grup terisi, pengumuman tiap langkah, pemisahan negara menyala; putar ulang dari halaman turnamen & hasil beregu. Undian babak kualifikasi tidak ditampilkan (hanya pembagian seksi acak).
- [x] **Alur turnamen per babak** (spesifikasi `docs/superpowers/specs/2026-10-14-alur-turnamen-per-babak-design.md`): Maju 1 minggu → layar *Turnamen minggu ini* (Mainkan / Lewati semua) → drawing → babak demi babak untuk kelima nomor sekaligus, tiap laga atlet sendiri live (Simulasikan laga ini / sisa babak); beregu: skuad → line-up → partai live. Pengaturan Live, Live drawing, pop-up entry & mode beregu dihapus.
- [x] **Pasangan ganda percobaan**: dibentuk tanpa membubarkan pasangan utama, ranking sendiri, hanya ikut bila didaftarkan manual, bisa dijadikan pasangan utama.
- [x] Pop-up "Daftarkan atlet" sebelum minggu turnamen (pilihan header: Mati / Minggu turnamen besar / Tiap minggu turnamen; bawaan Mati).
- [x] Ganda dadakan khusus beregu: slot ganda di line-up = dua atlet skuad bebas; pasangan khusus beregu tanpa ranking.
- [x] Lab memakai dunia yang sama dengan New Game (atlet asli BWF + pelengkap fiktif dari seed); spesialis ganda tidak masuk uji laga & wizard tunggal.
- [x] Junior tahap 1 — promosi pelatnas pratama → utama (tombol di Skuad → Junior; usia 19 otomatis).
- [x] Junior tahap 2 — turnamen junior individu (Kejuaraan Junior Kontinental ±minggu 28, Kejuaraan Dunia Junior ±minggu 41), ranking junior dunia, pasangan junior otomatis.
- [x] Junior tahap 3 — Suhandinata Cup (beregu campuran U19, ±minggu 40).

## Fitur berikutnya (disetujui & dirancang 2026-10-15)
Prinsip: game tetap ringan — tanpa latihan, anggaran, atau pelatih.
- [x] **Pencarian bakat junior**: manajer ikut memilih junior baru yang masuk pelatnas pratama. Spesifikasi: `docs/superpowers/specs/2026-10-15-pencarian-bakat-junior-design.md`.
- [x] **Ringkasan rencana musim**: satu layar yang memperlihatkan siapa main di turnamen mana untuk beberapa minggu ke depan. Spesifikasi: `docs/superpowers/specs/2026-10-15-ringkasan-rencana-musim-design.md`.

## Fitur berikutnya (disetujui 2026-10-22)
Prinsip tetap: ringan — menambah kenyamanan/informasi, tanpa sistem manajemen baru. Urutan kerja yang disarankan: 1 → 2 → 4 → 3 → 5.
- [x] **1. Ekspor/impor save karier**: unduh save sebagai file & buka di perangkat lain (web app iOS punya penyimpanan terpisah dari Safari & bisa terhapus).
- [x] **2. Ringkasan turnamen atlet sendiri**: kartu setelah turnamen selesai — babak dicapai, poin ranking didapat, ranking naik/turun, momen terbaik (mis. mengalahkan unggulan 1).
- [x] **3. Berita mingguan** di Dashboard: judul singkat dari data yang ada (kejutan minggu ini, juara beruntun, rekor reli/smash, atlet on fire).
- [x] **4. Kartu pra-laga di Live Match**: H2H, pertemuan terakhir, ranking, kondisi 🔥, saran strategi singkat dari atribut lawan.
- [x] **5. Statistik karier atlet** di profil (dari `Match.stats`): smash tercepat sepanjang karier, total winner, rasio menang di game ketiga, poin beruntun terpanjang. Catatan: `stats` dibuang untuk musim > 2 tahun lalu (`endYear`), jadi statistik karier perlu diakumulasi ke data atlet sebelum dibuang.
- Ide lain (belum disetujui): pencapaian (achievements), skenario saat New Game.

## Tahap akhir — Percantik UI & perbaikan UX (setelah semua fitur selesai)
- [x] Desain visual baru: gaya "Arena" (rapat ala game manajer) + palet hijau "Lapangan", tema terang/gelap dengan pilihan Otomatis/Terang/Gelap, huruf Barlow, bendera 47 negara, bagan bertema, papan skor Live Match ala TV. Spesifikasi: `docs/superpowers/specs/2026-10-13-percantik-ui-design.md`.
- [x] Perbaikan UX: dikerjakan terus-menerus dari temuan user, satu commit per perbaikan (rinciannya di riwayat git sejak 2026-10-13). Temuan baru langsung dikerjakan, tidak perlu dikumpulkan dulu di sini. Contoh:
  - [x] Header karier satu baris; pengaturan karier pindah ke tab sendiri (satu pengaturan per baris).
  - [x] Dashboard: turnamen mendatang per minggu, kartu Hasil turnamen bisa dimaju-mundurkan per minggu (juara disorot emas), kartu Cedera bergaya baris, Ranking BWF 10 besar dunia per nomor (atlet negara sendiri disorot, poin ranking), target musim bertumpuk.
  - [x] Pop-up detail laga (skor per game, statistik poin) dari bagan, dashboard & profil; detail beregu per partai (save lama direkonstruksi).
  - [x] Halaman turnamen: tab Juara & Riwayat juara semua tahun.
  - [x] Skuad: Pasangan digabung ke Skuad (sub-tab Semua · Single · Pairs), tabel bisa diurutkan, kolom Sektor & BWF rank (semua peringkat), atur sektor langsung dari tabel.
  - [x] Maju 4 minggu / sampai akhir musim serba otomatis (tanpa pop-up entry, Live Match, beregu & live drawing).
  - [x] Mobile: header ringkas, kolom nama menempel saat tabel digeser, line-up turun baris, tabel pop-up penuh, live drawing menggulir otomatis & kontrol menempel, papan skor Live Match muat selebar HP.
  - [x] Perbaikan: jadwal beregu kontinental tidak lagi ikut menampilkan Suhandinata; partai beregu tidak muncul sebagai hasil individu.
  - [x] Spesialis ganda tidak lagi muncul di nomor tunggal di mana pun (skuad/line-up beregu, entry, ranking awal) — disaring sekali di `entrantsFor`.
  - [x] Prioritas tier entry otomatis per atlet tunggal & pasangan (Skuad → Single/Pairs; tombol ringkas yang membuka panel tier). Spesifikasi: `docs/superpowers/specs/2026-10-15-prioritas-tier-entry-otomatis-design.md`.
  - [x] Favicon (kok putih di kotak hijau).
  - [x] Tabel Pairs di HP: sektor & status pindah ke sel nama, tombol Promote ke kolom aksi.
  - [x] Lepas dari pelatnas (tombol di profil atlet): atlet tetap bertanding diatur AI, keluar dari tim manajer; bisa dipanggil kembali dari Skuad → Non-pelatnas. Spesifikasi: `docs/superpowers/specs/2026-10-15-lepas-dari-pelatnas-design.md`.
  - [x] Audit tampilan HP (2026-10-15): tombol Live/Lewati di layar babak tidak terpotong, kolom Gender & Kelelahan Skuad disembunyikan di HP, isian 16px di iOS (tanpa zoom otomatis), safe area untuk bilah bawah & pop-up, tombol hapus save merah.
  - [x] Web app (Add to Home Screen): `public/manifest.webmanifest`, ikon PNG 180/192/512, meta iOS. Mode offline (service worker) & cek versi otomatis menyusul 2026-10-21.
- Catatan urutan: tampilan responsif dari Fase 11 sebaiknya dikerjakan bersama tahap ini; deploy GitHub Pages sudah otomatis.

## Fitur berikutnya (disetujui 2026-10-25): morale, perkembangan, sifat, pencarian bakat
Prinsip: tetap tanpa fitur latihan, anggaran, atau pelatih; morale & kemampuan naik lewat keputusan yang sudah ada. Tiga rencana implementasi:
- M = `docs/superpowers/plans/2026-10-25-morale-perkembangan.md` (11 task)
- S = `docs/superpowers/plans/2026-10-25-sifat-atlet.md` (10 task; S7 butuh M1, M3, M4)
- P = `docs/superpowers/plans/2026-10-25-scouting-development.md` (8 task; P3 & P6 digantikan S9 & S2)

Urutan kerja (tiap fase bisa dirilis sendiri; tes & build hijau di akhir fase):
- [x] **Fase 1 — fondasi & yang langsung terasa:** M1 (boosts.ts), M2 (istirahat), M3 (kandang), M7 (target perorangan), P5 (faktor pengalaman terlihat).
- [x] **Fase 2 — sifat atlet inti:** S1 (data & migrasi), S2 (terungkap & badge), S3 (fisik), S4 (awet muda), S5 (mental juara/demam panggung).
- [x] **Fase 3 — morale lanjutan & sifat sisanya:** M4 (skuad), M5 (pasangan), M6 (rekor pribadi), S6 (starter lambat, momentum, konsisten), S7 (sifat morale), S8 (sifat ganda), M11 + S10 (kalibrasi bersama satu musim).
- [x] **Fase 4 — perkembangan:** M8 (kalah tipis), M9 (morale/elite/mentor), M10 (comeback cedera), P7 (laporan kuartal).
- [x] **Fase 5 — pencarian bakat:** P1 (gaya & asal), P2 (fokus), S9 (catatan pemandu), P4 (rentang menyempit & rekrut bertahap), P8 (dokumen & uji manual).

## Koreksi aturan beregu (temuan saat mencari nama resmi)
- [x] Kuota kontinental: Asia & Eropa 4 tim (semifinalis), Pan Am/Afrika/Oseania 1 tim; kursi tim yang sudah lolos (tuan rumah/juara bertahan) jatuh ke tim berikutnya dari benua itu.
- [x] Tuan rumah kontinental 2026: Qingdao, Istanbul, Guatemala City, Gaborone, Auckland.
- [x] Nama resmi kejuaraan kontinental (berbeda di tahun Thomas/Uber dan Sudirman).
- [x] Negara kecil (Afrika, NZL) kini bisa menurunkan tim beregu: generator menjamin minimal 2 pasangan MD & WD bila atletnya cukup.

## Koreksi aturan (dicek terhadap regulasi BWF, 2026-10-27)
- [x] Wildcard Super 1000/750/500 maks 2 per turnamen menurut entri tuan rumah di 32/28 besar (World Tour Regulations 6.4.2); wildcard S1000 kalah di R1 juga 0 poin.
- [x] Tanpa pemisahan negara di undian World Tour (6.4.4).
- [x] Skuad Sudirman & Suhandinata maks 20 (min 2 putra + 2 putri; Major Events Regulations). Thomas/Uber 4–10 sudah sesuai.
- [x] Undian tuan rumah musim depan di awal musim (event dengan kota kandidat), diumumkan di berita.
- [x] Protected ranking untuk atlet 32 besar yang cedera panjang (entry World Tour, bukan unggulan).
- [x] Youth Olympic Games (Dakar 2026; tunggal U17, 8 grup → perempat final).
- [x] Kalibrasi junior baru per musim: populasi U19/≤17 stabil setara data asli 2026 (sebelumnya merosot ±75% dalam 4 musim).
- [x] **Pasangan ganda beda negara** (pemain independen): negara AI melepas atlet di luar 10 besar; AI memasangkan pemain independen lintas negara; hanya turnamen terbuka. Langsung dipasangkan saat manajer melepas atlet. Spesifikasi: `docs/superpowers/specs/2026-10-27-pasangan-beda-negara-design.md`.
- [x] Pop-up line-up beregu lebih ringkas: satu pilihan per partai (pasangan terdaftar / ganda dadakan), info ranking & kemampuan, partai bermasalah ditandai.
- [x] **BWF Player of the Year**: nominasi 3 minggu sebelum WTF, pemenang di minggu WTF (MS, WS, MD, WD, XD, Rising Star); berita, profil, Rekor.
- [x] **Urutan partai beregu** sesuai regulasi BWF (T&U 10.2, Sudirman 13.2): ditentukan wasit dari kedua line-up, bukan dipilih manajer (urutan tetap sebelumnya hanya 10.1.1 / 13.1.5).
- [x] **Kejuaraan U17 kontinental**: Badminton Asia U17 (tiap tahun) & European U17 (tahun ganjil), usia ≤ 16, tanpa poin.
- Belum (opsional): kejuaraan U15 (perlu junior masuk game lebih muda dari 15 tahun).

## Batasan yang bisa ditinjau ulang
- Tier tidak bisa ditambah/dihapus di Editor.
