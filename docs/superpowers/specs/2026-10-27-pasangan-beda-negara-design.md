# Pasangan ganda beda negara — desain

Tanggal: 2026-10-27 · Status: menunggu tinjauan user

## Latar

Di dunia nyata, pasangan ganda beda negara dibentuk oleh pemain profesional yang tidak lagi di bawah federasi. Game sudah punya konsep ini untuk negara manajer: atlet yang **dilepas dari pelatnas** (`Player.released`) tetap bertanding sebagai pemain independen yang diatur AI (`docs/ASUMSI.md`, "Lepas dari pelatnas"). Fitur ini memperluas konsep itu ke semua negara dan mengizinkan pemain independen berpasangan lintas negara.

Tidak ada halaman atau tombol baru: manajer tidak memasangkan atlet beda negara secara langsung. Pengaruh manajer tidak langsung — atlet ganda yang dilepas bisa berpasangan dengan pemain negara lain.

## 1. Siapa yang menjadi pemain independen

### 1a. Negara AI melepas atlet (akhir musim)

Dicek di akhir musim, per negara AI, per gender. Atlet yang termasuk **10 besar negaranya per gender** (menurut kemampuan/CA) tidak pernah dilepas; junior pratama (U19) juga tidak.

| Kandidat | Peluang dilepas per musim |
|---|---|
| Usia ≥ 24 | 25% |
| Usia 19–23, PA < CA atlet ke-10 negaranya | 25% |
| Usia 19–23, PA ≥ CA atlet ke-10 negaranya | 5% |

- Pelepasan diproses **sesudah** pensiun (termasuk aturan junior lemah < 55 berhenti 50%), jadi atlet yang sangat lemah sebagian besar pensiun, bukan menjadi independen.
- Memakai kolom `released` yang sudah ada (diisi tahun pelepasan). Efeknya sama dengan atlet yang dilepas manajer: tidak ikut tim beregu, Olimpiade, kuota Kejuaraan Dunia (`contingent.ts`, `olympics.ts`), maupun target federasi.
- Atlet independen negara AI tidak kembali ke pelatnas. Manajer tetap bisa memanggil kembali atlet negaranya sendiri (`recallPlayer`), seperti sekarang.
- Pasangan federasi yang anggotanya dilepas dibubarkan (perilaku `releasePlayer` sekarang: pasangan tetap utuh hanya bila kedua atletnya independen). Fungsi pelepasan AI memakai `releasePlayer` yang sama.
- Angka (10 besar, 25%/5%, usia 24) disimpan di ruleset agar bisa dikalibrasi.

### 1b. Pasangan beda negara dari data asli (opsi C)

- `scripts/fetch-bwf.mjs` saat ini membuang pasangan beda negara (baris 87 dan 115). Diubah: pasangan beda negara disimpan bila kedua atlet terpilih; kedua atletnya ditandai independen di data (kolom baru di baris atlet, mis. `independent: 1`).
- `realRoster` menerapkan tanda itu (`released = startYear`) dan memuat pasangannya.
- Menjalankan ulang skrip memperbarui **seluruh** data atlet ke ranking terbaru (cache `.bwf-cache/` tidak ada di repo). Dari container, API BWF memberi 403 untuk `curl`; skrip memakai Playwright sehingga akan dicoba. Bila terblokir, bagian ini menunggu user menjalankan `node scripts/fetch-bwf.mjs` di komputernya. Bagian lain tidak bergantung pada 1b.
- Hanya untuk New Game; save berjalan tidak ditambahi pasangan dari data asli.

## 2. AI membentuk pasangan pemain independen

Satu fungsi, `pairIndependents(state, rs, world, rng, onlyIds?)`, dipanggil:
1. **di akhir musim**, sesudah pelepasan AI (semua independen);
2. **langsung saat manajer melepas atlet** (`onlyIds` = atlet itu) — atlet yang dilepas tidak menunggu akhir tahun.

Aturan per atlet independen, per nomor ganda (MD/WD/XD sesuai gender), bila belum punya pasangan utama aktif di nomor itu dan bukan spesialis tunggal (`focus === 'S'`) atau top 64 tunggal dunia (sama dengan `formPairs`):
1. cari pasangan dari independen **senegara**;
2. bila tidak ada, dari independen negara lain di **konfederasi yang sama**;
3. bila tidak ada, dari independen **konfederasi mana pun**.

Di tiap tahap hanya kandidat dengan selisih kemampuan (CA) ≤ 5 yang dipertimbangkan; yang terdekat dipilih. Atlet tanpa calon tetap tanpa pasangan (tetap bisa main tunggal bila bukan spesialis ganda) dan dicoba lagi di pemanggilan berikutnya.

- Chemistry awal sama dengan pasangan AI biasa (30–49).
- `formPairs` diubah: negara AI hanya memasangkan atlet **federasi** (`released === undefined`); pasangan independen seluruhnya lewat `pairIndependents`. Untuk negara manajer perilakunya sekarang (AI memasangkan sesama atlet yang dilepas) digantikan oleh `pairIndependents`.
- ID pasangan beda negara memakai negara atlet pertama, format sama (`{negara}-{nomor}{tahun}-{n}`).
- Pasangan baru tanpa poin ranking: ikut turnamen yang daftar entry-nya belum terbit dan biasanya tier rendah dulu (perilaku entry yang ada).

## 3. Event yang boleh diikuti & tampilan

**Boleh:** turnamen individu terbuka — World Tour (S1000–S100) dan International Challenge/Series.

**Tidak boleh:** Kejuaraan Dunia, Olimpiade, kejuaraan kontinental, semua beregu, turnamen junior, Youth Olympic Games. Pengecualian diterapkan di satu tempat — penyusunan kandidat entry — dengan predikat `isCrossNation(pair)`. Event berkuota negara sudah melewatkan atlet `released`, jadi ikut tertutup.

**Ranking:** masuk ranking ganda dunia seperti pasangan lain.

**Negara peserta:** `Entrant.countryId` tetap dari atlet pertama. Kolom ini hanya berpengaruh pada aturan pemisahan atlet senegara di undian, yang tidak berlaku di World Tour; dampaknya diabaikan.

**Tampilan:** nama pasangan dengan dua bendera (🇩🇰 A / 🇬🇧 B) di ranking, draw, hasil, dan profil — diubah di `entrantLabel` agar semua layar ikut. Tab Pasangan manajer tidak berubah (atlet yang dilepas sudah tidak tampil di sana).

## 4. Data lama & validasi paket

- **Save lama:** tanpa migrasi. Pelepasan AI dan pasangan beda negara mulai di akhir musim berikutnya (atau saat manajer melepas atlet).
- **Validasi paket** (`src/engine/pack.ts:141`): pasangan beda negara diterima bila kedua atletnya independen; selain itu tetap ditolak dengan pesan yang ada.
- **Editor / ekspor JSON:** tanda independen ikut diekspor-impor agar paket hasil ekspor tetap valid.

## 5. Pengujian

Tes tetap:
1. Pelepasan AI: atlet 10 besar negara & junior pratama tidak pernah dilepas; atlet muda ber-PA tinggi jauh lebih jarang dilepas daripada yang ber-PA rendah.
2. `pairIndependents`: hanya atlet independen; urutan senegara → sekonfederasi → bebas; selisih CA ≤ 5; tidak memasangkan spesialis tunggal.
3. Melepas atlet ganda manajer langsung menghasilkan pasangan baru bila ada calon.
4. Pasangan beda negara tidak pernah menjadi kandidat Kejuaraan Dunia, Olimpiade, kontinental, beregu, junior, atau YOG; bisa untuk World Tour dan IC/IS.
5. Validasi paket menerima pasangan beda negara yang independen dan menolak yang bukan.

Kalibrasi (file sementara `src/engine/_*.test.ts`, dihapus setelahnya): simulasi 3 musim — jumlah independen per negara, jumlah pasangan beda negara (target 20–60 di seluruh dunia), dan tim beregu negara AI tetap lengkap.

`docs/ASUMSI.md` dan `docs/RENCANA.md` diperbarui.

## Di luar cakupan

- Manajer membentuk pasangan beda negara secara langsung.
- Atlet independen negara AI kembali ke pelatnas.
- Pemasangan ulang di tengah musim selain saat manajer melepas atlet (mis. pasangan independen bubar karena cedera parah → dicoba lagi di akhir musim).
