# Prompt Claude Code — Game Manajer Badminton (Regulasi BWF)

Saya ingin membuat game web simulasi manajemen badminton, terinspirasi dari "Badminton Championship Manager 2.0" (game PC 2008) dan gaya Basketball GM, tetapi memakai REGULASI BWF TERKINI. Saya bukan programmer berpengalaman: jelaskan setiap langkah dalam Bahasa Indonesia, kerjakan bertahap, minta konfirmasi saya di akhir tiap fase. Jangan menyalin kode/data/gambar dari game asli.

## Stack
React + TypeScript + Vite, Dexie (IndexedDB), multi slot save, sepenuhnya client-side/offline, deploy gratis. Logika di /engine terpisah dari UI, unit test Vitest. Saya pakai Mac Apple Silicon.

## Prinsip: semua aturan BWF = data, bukan hardcode
Simpan seluruh regulasi sebagai "Ruleset" JSON yang bisa diedit di Editor dan dipilih saat New Game. Sediakan 2 preset:
- "BWF 2026" (default)
- "BWF 2027+" (struktur World Tour baru)
Semua nilai di bawah adalah isi default preset.

## 1. Tier & poin ranking (preset BWF 2026)
Kolom: Juara, Final, SF, QF, R16, R32, R64, R128, R256
- World Championships & Olimpiade: 14500,12500,10500,8200,6000,3700,1450,750,300
- World Tour Finals: 14000,12000,10000,7800,5700,3500,1400,720,280
- Super 1000: 12000,10200,8400,6600,4800,3000,1200,600,240
  (bonus: hadiah tambahan USD 250–499rb → 12700,10800,9000,7000,5100,3150,1270,630,250; ≥USD 500rb → 13500,11500,9500,7400,5400,3300,1350,670,270)
- Super 750: 11000,9350,7700,6050,4320,2660,1060,520,210
- Super 500: 9200,7800,6420,5040,3600,2220,880,430,170
- Super 300: 7000,5950,4900,3850,2750,1670,660,320,130
- Super 100: 5500,4680,3850,3030,2110,1290,510,240,100
- International Challenge: 4000,3400,2800,2200,1520,920,360,170,70
- International Series: 2500,2130,1750,1370,920,550,210,100,40
- Future Series: 1700,1420,1170,920,600,350,130,60,20
Tiap tier juga menyimpan: total hadiah (USD) & persentase per babak, ukuran main draw per nomor, ukuran kualifikasi, format (knockout / grup+knockout).

## 2. Mekanisme ranking
- Periode 52 minggu bergulir; poin kedaluwarsa tepat 52 minggu setelah turnamen.
- ≤10 turnamen: semua poin dihitung; ≥11: hanya 10 terbaik.
- Ranking diperbarui mingguan (hari Kamis dalam kalender game).
- Ganda diranking sebagai PASANGAN (pasangan baru mulai dari 0).
- Tie-break: poin sama → yang main lebih banyak turnamen di atas; masih sama → peringkat sama (nomor berikutnya dilewati).
- Walkover R1 lalu kalah R2 → poin R2. Wildcard yang kalah di R1 Super 500/750 → 0 poin.
- Ranking terpisah per nomor (MS, WS, MD, WD, XD). Tampilkan riwayat ranking dan poin yang akan kedaluwarsa.
- Race to Finals: ranking terpisah dari 14 hasil World Tour terbaik dalam musim, maksimal 3 dari Super 100.

## 3. Entry & drawing (GCR BWF)
- Entry diterima berdasarkan world ranking pada tanggal acuan (mis. 4 minggu sebelum turnamen); kelebihan masuk kualifikasi lalu daftar cadangan. Ranking sama → undian.
- Kualifikasi: 1 slot kualifikasi per 8 slot main draw (Grade 3: per 4). Penempatan qualifier di main draw diundi bebas tanpa pemisahan negara.
- Wildcard tuan rumah (jumlah bisa diatur per tier).
- Jumlah unggulan: ≥64 entri → 16; 32–63 → 8; 16–31 → 4; <16 → 2.
- Penempatan: unggulan 1 paling atas, unggulan 2 paling bawah; 3/4 diundi ke kuarter tersisa; 5–8 ke seperdelapan tersisa; 9–16 ke seperenambelas tersisa (unggulan di paruh atas berada di bagian atas seksinya, di paruh bawah berada di bagian bawah seksinya).
- Bye: jika entri bukan pangkat 2, bye di R1 diberikan ke unggulan dulu.
- Pemisahan negara: sebisa mungkin pemain senegara tidak bertemu di R1; untuk Grade 3, dua entri teratas dari negara yang sama diundi ke paruh berbeda.
- Tampilkan proses drawing step-by-step (animasi undian opsional) dan bagan hasilnya.
- Test unit wajib: posisi unggulan benar untuk draw 32, 48 dan 64; tidak ada pertemuan senegara di R1 bila masih memungkinkan.

## 4. Kalender (preset 2026)
Kalender default meniru HSBC BWF World Tour 2026, misalnya: Malaysia Open (S1000, Jan), India Open (S750), Indonesia Masters (S500), Thailand Masters (S300), German Open, All England (S1000, Mar), Swiss Open, Orléans Masters, Thailand Open (S500), Malaysia Masters, Singapore Open (S750), Indonesia Open (S1000, Jun), Australian Open, Macau Open, US Open, Canada Open, Japan Open (S750), China Open (S1000, Jul), Taipei Open, Korea Masters, China Masters (S750), Vietnam Open, Arctic Open, Denmark Open (S750), French Open (S750), Hylo Open, Korea Open, Japan Masters, Hong Kong Open, Syed Modi, World Tour Finals (Des, Hangzhou), ditambah seri Super 100 dan World Championships. Simpan sebagai data JSON (nama, kota, negara, venue, minggu, tier, hadiah) yang bisa saya koreksi di Editor. Preset 2027: 5 Super 1000 (termasuk Denmark Open), 5 S750, 9 S500, 8 S300, 8 S100; Syed Modi turun ke S100.
- Ukuran draw default 2026: S300–S1000 = 32 per nomor; S100 = 48 MS & 32 lainnya. Preset 2027: tunggal Super 1000 = 48 pemain fase grup + knockout; World Championships = grup + knockout.
- Beregu: Thomas & Uber Cup (tahun genap), Sudirman Cup (tahun ganjil) dengan kualifikasi per konfederasi.

## 5. World Tour Finals
8 teratas Race to Finals per nomor, maksimal 2 per negara, juara dunia otomatis lolos (menggantikan peringkat terbawah). Format: 2 grup @4 round-robin, 2 teratas tiap grup ke semifinal (juara grup bertemu runner-up grup lain).

## 6. Top Committed Players
Top 15 tunggal & top 10 ganda (snapshot ranking akhir tahun) wajib ikut semua Super 1000, semua Super 750 dan 2 Super 500 (+ WTF jika lolos). Absen tanpa cedera → peringatan/penalti reputasi untuk federasi. AI juga harus mematuhinya, sehingga pemain top benar-benar hadir di turnamen besar.

## 7. Mekanik pertandingan (dari game asli, ditingkatkan)
- Atribut 1–100: Speed, Stamina, Serve, Warm-up, Consistency, Net Shot, Defensive, Smash, Deception, Mental/Experience + form; cedera & pensiun.
- Rally-point 21, best of 3, deuce sampai 30, interval di 11 dan antar game.
- Simulasi per rally: duel atribut + faktor acak + energi (turun tiap poin, pulih saat interval, dipengaruhi Stamina); jenis poin dicatat: Smash, Net, Clear, Drop, Unforced error, Service.
- Mode Live untuk atlet negara yang dipegang pemain: pilih strategi tiap interval (Attacking, Defensive, Fast & Aggressive, Deceptive), indikator momentum. Mode Auto untuk sisanya. Statistik & head-to-head tersimpan.
- Ganda: pasangan sebagai entitas sendiri dengan chemistry (naik seiring jumlah pertandingan bersama); pasangan bisa dibentuk/diakhiri.

## 8. Mode karier: pilih NEGARA
- Saat New Game, pemain memilih satu negara (mis. Indonesia) dan berperan sebagai pelatih kepala/manajer tim nasional negara itu. Tersedia juga opsi "Mode Pengamat" (tanpa negara, semua Auto) untuk sekadar menyimulasikan dunia.
- Skuad = semua atlet berkewarganegaraan negara tersebut (senior + junior). Tidak ada transfer/rekrut antar negara, tidak ada gaji/kontrak.
- TIDAK ADA fitur latihan. Kemampuan atlet hanya berubah lewat sistem perkembangan & penuaan (bagian 9), pengalaman bertanding, cedera, dan kelelahan.
- Tugas pemain:
  - Memilih turnamen yang diikuti tiap atlet/pasangan (dibatasi aturan entry BWF & Top Committed Players). Negara AI melakukan hal yang sama secara otomatis.
  - Membentuk, mempertahankan, atau membubarkan pasangan ganda (termasuk menduetkan junior dengan senior).
  - Mengatur istirahat: kelelahan menumpuk dari jumlah pertandingan & jarak perjalanan; atlet yang terlalu lelah performanya turun dan risiko cederanya naik. Melewatkan turnamen = istirahat.
  - Menyusun line-up beregu (Thomas/Uber/Sudirman Cup) dan memainkan pertandingan atletnya secara Live bila mau.
- Target federasi per musim (mis. jumlah gelar, atlet di top 10, hasil beregu) dengan rapor akhir musim; bisa dilanjutkan bertahun-tahun.
- Bisa ganti negara di tengah save (opsional, dengan konfirmasi).

## 9. Perkembangan & penuaan atlet
Setiap atlet punya Potensi tersembunyi (PA, 1–100) dan Kemampuan saat ini (CA = gabungan atribut). Di UI, potensi hanya ditampilkan sebagai perkiraan bintang yang makin akurat seiring usia/jumlah pertandingan.
- Diproses per kuartal (tiap 13 minggu) agar perubahan terasa bertahap, dengan panah naik/turun di profil dan riwayat atribut per musim.
- Pertumbuhan = (PA − CA) × laju menurut usia × faktor acak (0,6–1,4), contoh default (bisa diatur di Ruleset):
  - ≤19 th: menutup ±30–40% selisih per tahun
  - 20–22 th: ±20–25%
  - 23–25 th: ±10–15%
  - 26–28 th: puncak, ±0–5% (fluktuasi kecil)
- Semakin besar selisih PA−CA dan semakin muda, semakin cepat naik; atlet yang CA-nya sudah dekat PA hampir tidak naik lagi.
- Bonus kecil pengalaman: atlet muda yang sering bertanding (terutama di tier tinggi dan menang) berkembang sedikit lebih cepat; yang jarang main lebih lambat.
- Penuaan (penurunan) mulai ±29 th, makin cepat seiring usia, contoh default per tahun:
  - 29–30 th: −1 s/d −2 poin pada atribut fisik
  - 31–32 th: −2 s/d −4
  - 33–34 th: −3 s/d −6
  - ≥35 th: −5 s/d −8
- Penurunan per atribut berbeda: Speed & Stamina turun paling awal dan paling cepat; Smash & Defensive menengah; Net Shot, Serve, Consistency, Deception & Mental turun paling lambat (Mental/Experience bahkan masih bisa naik sampai ±31 th). Pemain ganda puncaknya ±1–2 tahun lebih lambat dari tunggal.
- Variasi individu: sebagian kecil atlet "late bloomer" (berkembang telat) atau "stagnan"; cedera berat bisa menurunkan PA sedikit.
- Pensiun: peluang mulai naik dari 30 th, dipengaruhi usia, ranking, dan penurunan kemampuan; hampir pasti pensiun ≤38 th.
- Regenerasi: tiap awal musim setiap negara menghasilkan junior baru (usia 15–17) yang jumlah & kualitas potensinya mengikuti "kekuatan tradisi badminton" negara (dapat diedit; mis. Indonesia/China/Jepang/Korea/Denmark tinggi).
- Unit test wajib: kurva rata-rata (simulasi 1.000 atlet × 20 tahun) menunjukkan puncak di usia 25–29 dan penurunan setelah 30; atlet tidak pernah melampaui PA.

## 10. Editor, data & UI
- Editor: Custom Player (atribut, PA, tanggal lahir, negara, avatar opsional), Pair, Tournament, Tier (tabel poin & hadiah), City (negara, venue, koordinat), Country/Konfederasi (termasuk kekuatan tradisi), Ruleset (termasuk kurva perkembangan/penuaan).
- Import/export JSON untuk seluruh database & ruleset. Database bawaan memakai nama atlet fiktif yang di-generate; data asli bisa dimasukkan sendiri lewat import.
- UI Bahasa Indonesia (siap Inggris): Dashboard negara, Skuad (senior/junior, kelelahan, potensi), Pasangan, Profil atlet (riwayat, H2H, grafik ranking & grafik atribut per usia), Kalender & entry turnamen, Wizard Turnamen (entry → kualifikasi → seeding → drawing → bagan), Live Match, Ranking & Race to Finals, Target federasi, Editor, Save/Load. Responsif laptop & HP.

## Cara kerja
- Mulai dengan plan mode: usulkan struktur folder, TypeScript types (Ruleset, Tier, Tournament, Draw, RankingEntry, Player, Pair, Match, Country, CareerSave), dan rencana fase. Tunggu persetujuan.
- Fase:
  1. Setup + model data + ruleset preset + generator atlet fiktif per negara
  2. Mesin pertandingan + energi + statistik + test
  3. Entry, kualifikasi, seeding & drawing sesuai GCR + test
  4. Ranking 52 minggu, best-10, tie-break, Race to Finals + test
  5. Kalender musim + World Tour Finals + Top Committed + AI entry negara lain
  6. Perkembangan, penuaan, pensiun, regenerasi junior + test kurva
  7. Mode karier pilih negara (skuad, pasangan, istirahat/kelelahan, target federasi)
  8. Live Match
  9. Beregu Thomas/Uber/Sudirman
  10. Editor + import/export
  11. Polish & deploy
- Akhir tiap fase: jalankan test, jelaskan cara mencoba (`npm run dev`), sarankan pesan commit.
- Jika aturan BWF ambigu atau tidak tersedia (mis. diagram posisi bye yang persis, poin babak kualifikasi), pilih pendekatan paling masuk akal, tandai di kode sebagai asumsi, dan beri tahu saya.
