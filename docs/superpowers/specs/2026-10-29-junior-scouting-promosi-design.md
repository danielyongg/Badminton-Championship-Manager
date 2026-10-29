# Perbaikan sistem junior: pencarian bakat, promosi, kabar, turnamen

Disetujui user 2026-10-29. Prinsip tetap: game ringan (tanpa latihan, anggaran, pelatih); tiap bagian menambah informasi,
cerita, atau satu keputusan sederhana. Dikerjakan & di-commit per bagian (1 → 4); tes & build hijau di akhir tiap bagian.

## Bagian 1 — Pencarian bakat & rekrutmen (`src/engine/scouting.ts`, `ScoutingCard` di `src/ui/Career.tsx`)

Masalah yang dijawab: pilihan terasa tidak penting, kurang cerita, info kurang jelas. Jumlah kandidat & kursi tidak diubah.

### 1a. Kandidat beragam
- **Permata**: per gender per angkatan 1 kandidat, peluang 40 % jadi 2. PA diundi 84–94 (± ★4–5); kandidat ini
  menggantikan kandidat biasa (jumlah kandidat tetap). Usia 15–16 agar ada waktu tumbuh. ASUMSI: hanya negara manajer,
  negara AI tetap memakai `newJuniors` biasa — negara manajer sedikit lebih kuat dari sekarang.
- **Tipe** untuk kandidat lain (diundi rata): `doubles` (Spesialis ganda: `focus: 'D'`, net/serve/smash +6),
  `attack` (smash/deception +6), `defense` (defense/consistency +6), `worker` (speed/stamina +6), `ready` (CA dekat PA,
  PA biasa), `raw` (usia 15, CA rendah, PA biasa sampai tinggi). Atribut yang dinaikkan diimbangi penurunan atribut lain
  sehingga CA kira-kira tetap, lalu `capToPa`. Disimpan `Scouting.types[id]`.
- Fokus pencarian tetap bekerja (penyaringan sesudah pembuatan, permata tidak ikut disaring).

### 1b. Penanda ⭐ Bakat langka
- `Scouting.gems: string[]` = kandidat yang **ditandai** pemandu: tiap permata asli ditandai 90 %; peluang 10 % per
  angkatan per gender ada satu kandidat biasa (PA tertinggi di antara non-permata) ditandai keliru ("permata palsu").

### 1c. Daftar ringkas + panel detail
- Tabel: nama (+ ⭐ bila ditandai), usia, kemampuan, rentang ★ (seperti sekarang), **saran nomor** (tunggal/ganda: tipe
  `doubles` atau skor ganda > skor tunggal dari `focusScore` → MD/WD/XD, selain itu MS/WS).
- Klik baris = pilih kandidat untuk panel (centang tetap di kotak centang). Layar lebar: panel menempel di samping (pola
  `sidepanel` yang sudah ada, `d358681`); HP: pop-up.
- Isi panel: nama · kota · usia, ⭐ & saran nomor, **laporan pemandu** (1–2 kalimat dari dua atribut tertinggi & satu
  terendah, selalu benar; kalimat per atribut di i18n), catatan sifat (yang sudah ada, bisa meleset), **"Gayanya mirip:
  X"** (atlet senior aktif top 100 segender di nomor tunggal/ganda sesuai saran; jarak = cosinus profil atribut yang
  dinormalkan ke rata-rata), grafik batang atribut (nilai asli, dibulatkan).
- Laporan pemandu & "mirip X" dihitung saat ditampilkan (tidak disimpan) → langsung jalan di save lama.

### 1d. Cerita
- Berita mingguan jenis baru `gem` di minggu 1: "Pemandu menemukan talenta luar biasa dari {kota}" per kandidat ⭐.
- `Player.scouted = { year, cityId?, stars: [lo, hi], gem: boolean }` diisi saat direkrut (rentang ★ pada minggu
  direkrut). Profil (Ringkasan): "Ditemukan di pencarian bakat {tahun} · {kota} · perkiraan ★lo–hi" + perbandingan
  dengan ★ sekarang: *sesuai perkiraan* (di dalam rentang), *melampaui*, *di bawah perkiraan*.
- Save lama: pencarian yang sedang berjalan tanpa `types`/`gems` (tidak ada permata/tipe); atlet lama tanpa `scouted`.

## Bagian 2 — Promosi Pratama → Utama (`src/engine/career.ts`, `development.ts`, Skuad)

- **Siap promosi** (`readyForPromotion(state, rs, p)`): junior Pratama negara manajer dengan kemampuan ≥ kemampuan atlet
  peringkat 200 senior di nomor utamanya (tunggal; spesialis ganda: rata-rata pasangan peringkat 100 ganda), **atau**
  peringkat ranking junior ≤ 10 di nomor mana pun. Tanda **⬆ Siap promosi** di Skuad → Junior & profil; berita `ready`
  sekali per atlet (`Player.readySince` = minggu absolut pertama kali siap).
- **Terlalu cepat**: dipromosikan saat kemampuan < ambang − 5 → `Player.earlyPromo = absWeek + 26`; selama itu kekalahan
  di turnamen senior memberi efek morale ×1,5 (di jalur morale berbasis hasil yang sudah ada).
- **Terlambat**: `readySince` lebih dari 26 minggu dan masih Pratama → faktor pertumbuhan kuartal ×0,9; laporan kuartal
  menampilkan kelompok baru "⏸ Tertahan di junior".
- Tetap: tombol Promote, usia 19 otomatis senior, entry manual Pratama ke senior boleh, negara AI tanpa status ini.

## Bagian 3 — Kabar perkembangan

- Berita `breakthrough` (badge "Terobosan"), atlet negara manajer ≤ 21 th:
  - *lonjakan*: kemampuan naik ≥ 4 dalam satu kuartal (dibandingkan sebelum/sesudah `endQuarter`; disimpan sebagai daftar
    di state untuk minggu berikutnya),
  - *kemenangan pertama atas top 50 senior* (dari laga minggu lalu, peringkat lawan saat itu; sekali per atlet,
    `Player.firstTop50`).
- **Prediksi puncak** di profil atlet ≤ 21 th: "Perkiraan puncak (±usia 25): setara peringkat a–b dunia". Dari perkiraan
  potensi yang sama dengan `potentialStars` (est ± sd, tidak membocorkan PA), dipetakan ke peringkat dengan kebalikan
  rumus level senior (`rank = exp((96 − level) / 4,5)`), dibulatkan ke angka bulat (1, 3, 5, 10, 20, 30, 50, 100, 200…).
  Spesialis ganda: usia puncak +1.

## Bagian 4 — Turnamen junior

- **Target federasi junior** (di `goals` musim, bukan tantangan): *Medali Kejuaraan Dunia Junior: N* (N dari junior
  negara manajer yang realistis meraih semifinal, pola `suggestJuniorTargets`; tanpa target bila 0) dan *Suhandinata Cup:
  babak X* (pola target `team` dari kekuatan tim junior). Bobot reputasi sama dengan target lain. Tantangan
  `juniorWorld` tetap.
- **Sorotan**: chip **Junior** pada turnamen junior di kartu Hasil turnamen & Turnamen mendatang.
- **Junior main di senior**: junior Pratama negara manajer dengan ranking junior ≤ 10 atau ⬆ siap promosi didaftarkan
  asisten AI ke turnamen senior grade 3 (IC/IS/FS) di minggu tanpa turnamen junior yang ia ikuti, dengan aturan peluang
  ikut & istirahat yang sama dengan atlet AI. Entry yang sudah di-submit manajer tetap dihormati.
- **Kuota BWF**: cek ulang kuota per negara & ukuran bagan Kejuaraan Dunia Junior, kejuaraan junior kontinental, dan
  Junior International Series/Challenge/Grand Prix terhadap regulasi BWF terbaru; perbaiki selisih di preset & catat di
  `docs/ASUMSI.md`.

## Pengujian
- Tes unit per bagian: permata & tipe (jumlah kandidat tetap, PA permata 84–94, tipe menggeser atribut, CA ≤ PA),
  akurasi penanda (simulasi banyak angkatan ±90 %), `scouted` terisi saat rekrut, `readyForPromotion`, efek terlambat,
  pemetaan prediksi puncak, target junior, entry grade 3 untuk Pratama top.
- Simulasi populasi 2026–2031 tetap stabil (tes kalibrasi junior yang sudah ada).
- Uji manual di browser (laptop & HP) untuk panel kandidat, berita, profil.
