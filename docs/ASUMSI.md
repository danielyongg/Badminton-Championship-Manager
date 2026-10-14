# Asumsi (aturan BWF yang ambigu / tidak tersedia)

Setiap asumsi juga ditandai `// ASUMSI:` di kode. Semua nilai bisa dikoreksi lewat Editor (Fase 10).

## Fase 1 — Data & preset
- **Hadiah per babak**: tunggal 7.5 / 3.8 / 1.45 / 0.8 / 0.35 %, ganda 7.9 / 3.8 / 1.4 / 0.725 / 0.375 %; R32 ke bawah 0.
- **Hadiah Grade 3**: IC USD 20.000, IS USD 8.000, FS USD 5.000.
- **Bonus poin Super 1000**: berlaku bila hadiah turnamen melebihi hadiah standar tier (USD 1,45 jt) sebesar ≥ 250rb / ≥ 500rb.
- **Kualifikasi**: S1000/S750 tanpa kualifikasi; S500 ke bawah: 4 peserta per 1 slot qualifier (2 babak).
- **Kalender 2026**: minggu & hadiah mendekati HSBC BWF World Tour 2026, plus beberapa turnamen Grade 3 fiktif-generik agar pemain peringkat bawah punya tempat bertanding.
- **Kejuaraan Dunia** digelar tiap tahun kecuali tahun Olimpiade; kota tetap New Delhi (ubah di Editor).
- **Olimpiade**: tunggal 16 grup × 3 (juara grup ke R16), ganda 4 grup × 4 (2 teratas ke QF).
- **Preset 2027**: tabel poin & hadiah sama dengan 2026. Tunggal Super 1000: 48 pemain, 16 grup × 3 → R16. Kejuaraan Dunia: MS 16 grup × 4, nomor lain 16 grup × 3 → R16. Lingshui & Odisha Masters dihapus agar tepat 8 Super 100.
- **Generator**: atlet senior dibagi bergantian fokus tunggal/ganda untuk membentuk pasangan awal; kurva usia awal sederhana (kurva sebenarnya di Fase 6).

## Fase 2 — Mesin pertandingan
- **Model rally**: tiap rally memilih "pola" (serangan smash, adu net, tipuan/drop, reli panjang) dengan peluang sesuai atribut, lalu adu atribut penyerang vs bertahan + kemampuan umum (fungsi logistik). Bobot pola ada di `match.ts`; angka kalibrasi lain di Ruleset (`match`).
- **Kalibrasi**: selisih rata-rata atribut +5 → menang ±75%, +10 → ±90%; laga setara ±50% rubber game.
- **Ganda**: atribut pasangan = rata-rata kedua pemain + bonus chemistry ((chemistry − 50) × 0,15).
- **Energi**: turun tiap rally (lebih sedikit bila Stamina tinggi, lebih banyak di reli panjang), pulih saat interval (+6) dan antar game (+15); energi rendah menurunkan atribut fisik s/d 15%. Kelelahan atlet mengurangi energi awal.
- **Pemanasan**: 8 poin pertama game 1 dipengaruhi atribut Warm-up. **Mental**: lebih menentukan saat skor ≥ 18.
- Cedera/retired di tengah laga ditunda ke Fase 7 (bersama sistem cedera).

## Fase 3 — Entry, kualifikasi, seeding & drawing
- **Jumlah unggulan** dihitung dari jumlah peserta main draw (langsung + wildcard + qualifier): draw 32 → 8, draw 48 → 8, draw 64 → 16.
- **Bagan 48** = bagan 64 dengan 16 bye. Bye pertama untuk unggulan (1, 2, 3, ...); sisanya di lawan posisi unggulan "virtual" berikutnya (posisi 9–16), urutannya mengikuti undian kelompok itu.
- **Nama babak** mengikuti ukuran bagan: babak pertama draw 48 = R64. Pemain yang dapat bye lalu kalah di babak kedua mendapat babak R32 (sesuai aturan walkover/bye).
- **Pemisahan negara**: setelah undian acak, posisi ditukar (hanya sesama kelompok unggulan yang sama, atau sesama non-unggulan/qualifier) sampai tidak ada pertemuan senegara di R1; bila mustahil, jumlahnya diminimalkan dan dicatat di langkah drawing.
- **Kualifikasi**: satu unggulan per seksi (peserta terbaik), sisanya diundi; bye ke unggulan seksi. Qualifier yang kosong (seksi tanpa peserta) menjadi bye di main draw.
- **Wildcard**: otomatis diberikan ke entri terbaik negara tuan rumah yang tidak lolos langsung. Wildcard tak terpakai dikembalikan ke daftar entry.
- **Sementara (sampai Fase 4)**: Wizard memakai urutan kemampuan sebagai "ranking", dan semua atlet/pasangan dianggap mendaftar.

## Fase 4 — Ranking
- **1 tahun game = 52 minggu**; poin kedaluwarsa tepat 52 minggu kemudian (minggu yang sama tahun berikutnya).
- **Kalah di kualifikasi** = 0 poin dan tidak dihitung sebagai turnamen yang dimainkan. Qualifier yang kalah di R1 main draw mendapat poin R1.
- **Entri 0 poin** (wildcard kalah di R1 S500/S750) tetap dihitung sebagai turnamen dimainkan (berpengaruh ke tie-break).
- **Ranking awal dunia fiktif**: tiap peserta diberi 10 hasil "pra-musim" tersebar di 52 minggu sebelum musim pertama, total ≈ 110.000 × 0,985^peringkat (urut kemampuan). Hasil ini kedaluwarsa bertahap.
- **Race to Finals**: hanya tier S1000–S100 dalam tahun kalender musim berjalan; 14 hasil terbaik dengan maks 3 dari Super 100.

## Fase 5 — Musim, WTF, Top Committed, AI entry
- **Undian grup**: sistem pot (pot k = peringkat k·G+1 … (k+1)·G); unggulan 1 → grup A, unggulan 2 → grup B, dst. Pot lain diundi dan ditukar agar pemain senegara sebisa mungkin tidak satu grup.
- **Klasemen grup**: jumlah menang; 2 seri → head-to-head; ≥ 3 seri → selisih game, selisih poin, lalu urutan unggulan.
- **Lolos grup ke babak gugur**: juara grup di posisi unggulan; runner-up di paruh berlawanan dengan juara grupnya (WTF: juara A vs runner-up B di SF). Bila juara grup lebih banyak dari posisi unggulan (16 grup → R16), juara grup 9–16 diundi ke posisi sisa.
- **Poin peserta yang tersingkir di grup**: peringkat (lolos+1) → babak sebelum babak gugur pertama; peringkat lebih bawah → dua babak sebelumnya. WTF: peringkat 3 grup = poin QF, peringkat 4 = poin R16.
- **Juara dunia di WTF** menggantikan peringkat Race terbawah, meski kuota negaranya jadi 3. Di tahun Olimpiade (tanpa Kejuaraan Dunia) tidak ada juara dunia otomatis.
- **Kuota negara**: Kejuaraan Dunia maks 2 per negara, s/d 4 bila semuanya top 8; Olimpiade maks 1, s/d 2 bila semuanya top 16.
- **Top Committed**: snapshot ranking di awal musim (minggu 1). 2 Super 500 wajib dipilih acak per atlet/pasangan di awal musim.
- **AI entry**: tiap minggu tiap peserta memilih turnamen ber-tier tertinggi yang sesuai rentang peringkatnya (Ruleset `ai.rankRange`), dengan peluang ikut per tier dikurangi kelelahan; istirahat bila kelelahan > 45. Turnamen wajib selalu dipilih. Nomor tunggal diproses dulu; turnamen pertama yang dipilih seorang atlet mengikat nomor gandanya (satu turnamen per minggu).
- **Kelelahan**: +5 per laga, +0,6 per 1.000 km perjalanan, −12 per minggu. Hasil kalibrasi: atlet top 30 main ±16–19 turnamen per tahun.

## Fase 6 — Perkembangan, penuaan, pensiun, regenerasi
- **Atribut disimpan sebagai pecahan** (perubahan per kuartal kecil tetap terakumulasi); UI membulatkan.
- **Pertumbuhan per kuartal** = (PA − CA) × ¼ × laju usia × faktor acak 0,6–1,4 × pengalaman × sifat. Pertumbuhan dibagi ke atribut dengan bobot acak.
- **Pengalaman** (s/d 25 th): faktor 0,85 + 0,025 × laga berbobot kuartal itu (menang ×1,5; S500 ke atas / Grade 1 ×1,3), maks 1,2.
- **Penuaan per atribut** (offset = berapa tahun lebih lambat mulai turun): Speed & Stamina bobot 1 (offset 0); Smash, Defensive & Warm-up 0,5–0,7 (offset 1); Net, Serve, Consistency, Deception ±0,3 (offset 2); Mental 0,3 (offset 3), dan Mental masih naik +1/tahun s/d 31 th.
- **Pemain ganda** = atlet yang pasangannya berperingkat lebih baik dari peringkat tunggalnya; usia efektifnya −1,5 tahun untuk perkembangan & penuaan.
- **Late bloomer**: memakai laju usia 3 tahun lebih muda dan ×0,6 sebelum 22 th. **Stagnan**: laju ×0,35.
- **Pensiun** (akhir musim): 30 th 3% → 37 th 60%, pasti di 38 th; top 20 ×0,5, tanpa ranking/di luar 200 ×1,5, turun > 8 dari puncak ×1,5. Atlet ≥ 23 th dengan kemampuan < 35 berhenti 15%/tahun (menjaga populasi). Pasangan dengan anggota pensiun dibubarkan.
- **Junior baru** per gender per negara per musim = 0,3 + tradisi/100 × 1,9 (pembulatan acak). Hasil: populasi stabil ±30% selama 5 musim.
- **AI membentuk pasangan** di akhir musim bila pasangan aktif di bawah target; atlet top 64 dunia tunggal tidak dipasangkan. Chemistry pasangan naik tiap laga bersama sebesar 1% dari sisa jarak ke 100 (makin lambat mendekati 100; ±60 → ±82 dalam satu musim aktif).
- **Hasil kurva** (1.000 atlet, rata-rata): 15 th 40 → 20 th 67 → puncak 29 th 71,5 → 32 th 70 → 35 th 64.

## Fase 7 — Mode karier
- **Cedera**: peluang per laga per atlet = 0,2% + 3% × (kelelahan/100)². 15% cedera berat (6–20 minggu, PA turun 1–4), sisanya ringan (1–3 minggu). Atlet menyelesaikan turnamen yang sedang dijalani; absen mulai minggu berikutnya. Atlet cedera dikecualikan dari pelanggaran Top Committed.
- **Target federasi**: gelar (tier S100 ke atas + Kejuaraan Dunia/Olimpiade/WTF, semua nomor) = gelar musim lalu (musim pertama: 1,5 × jumlah entri top 10); top 10 = pertahankan jumlah saat awal musim. Target beregu: lihat Fase 9.
- **Rapor**: rata-rata pencapaian (maks 150% per target) → A ≥ 100%, B ≥ 80%, C ≥ 60%, D ≥ 40%, E; ≥ 3 pelanggaran turun satu nilai. Reputasi awal 50: A +10, B +5, C 0, D −5, E −10; tiap pelanggaran Top Committed −3.
- **Perkiraan potensi** (bintang ½–5): galat tetap per atlet, simpangan menyusut dari ±15 (usia 15, belum bertanding) ke ±2 poin PA (usia & laga bertambah).
- **Junior** di layar Skuad = usia ≤ 18 (U19).
- **Entry manual**: tanpa keputusan = asisten AI memilih (mematuhi Top Committed). Pilihan manajer tetap tunduk pada aturan entry (peringkat, kuota, kualifikasi/cadangan).
- **Ukuran save**: statistik per laga hanya disimpan 2 musim terakhir (skor & head-to-head tetap selamanya); hasil ranking > 2 tahun dibuang; riwayat peringkat disimpan sebagai snapshot top 300 tiap 4 minggu (peringkat seri ditampilkan berurutan di grafik).
- **Save**: otomatis setelah tiap "Lanjut" dan setiap perubahan entry/pasangan. Tiap save menyimpan salinan ruleset & data dunianya sendiri.

## Fase 8 — Live Match
- **Strategi** (data di Ruleset `match.strategies`): tiap strategi mengubah peluang pola reli yang dimulai sisi itu, bonus saat menyerang dengan pola tertentu, bonus/penalti bertahan, risiko unforced error, dan biaya energi. Dikalibrasi agar **tidak ada strategi dominan** (±2% saat lawan setara) tetapi strategi yang cocok dengan matchup terasa: Tipuan untuk atlet ber-Deception tinggi vs lawan lambat ±+9%, Menyerang vs pertahanan lemah ±+4%, Menyerang ke lawan bertahan kuat ±−2%.
- **Lawan AI & mode Auto** memakai strategi Seimbang.
- **Momentum** (−1..1) bergeser tiap poin (decay 0,8); sisi yang unggul momentum mendapat bonus duel kecil (2 poin atribut).
- **Live otomatis berhenti** di interval 11 poin dan di akhir tiap game agar strategi bisa diganti; strategi juga bisa diganti kapan saja saat dijeda.
- **Pilihan Live di karier**: Mati / SF & Final atlet saya (default) / Semua laga atlet saya; tombol "Auto sisa minggu ini" menyelesaikan minggu tanpa Live lagi.
- Laga Live tercatat sama seperti laga Auto (skor, statistik, H2H, ranking).

## Fase 9 — Beregu (Thomas, Uber, Sudirman Cup)
- **Giliran tahun**: tahun genap Thomas Cup (putra) & Uber Cup (putri) di minggu 18; tahun ganjil Sudirman Cup (campuran) di minggu 18. Kejuaraan beregu kontinental (5 konfederasi) di minggu 7 memainkan format final tahun itu.
- **Tuan rumah tetap**: Thomas & Uber di Horsens (DEN, tuan rumah 2026), Sudirman di Xiamen (CHN, tuan rumah 2025); kontinental memakai tuan rumah 2026: Qingdao (Conson Gymnasium), Istanbul (Başakşehir Sports Complex), Guatemala City, Gaborone (Royal Aria Gymnasium; Botswana ditambahkan ke daftar negara), Auckland (Badminton North Harbour). Aslinya tuan rumah berganti tiap edisi; bisa dikoreksi di Editor.
- **Peserta final (16 tim)**: tuan rumah, juara bertahan, **4 teratas kejuaraan Asia & Eropa** (urutan finis: juara, finalis, dua semifinalis), juara Pan Am, Afrika & Oseania, sisanya menurut kekuatan tim. Tim yang sudah lolos sebagai tuan rumah/juara bertahan dilewati dan kursinya jatuh ke tim berikutnya dari benua yang sama (seperti Sudirman Cup 2025). Musim pertama belum ada juara bertahan → kursinya diisi menurut kekuatan. Jumlah lolosan per kejuaraan kontinental diatur `qualifiers` di Ruleset.
- **Kekuatan tim** = jumlah poin ranking peserta line-up otomatis (mirip ranking beregu BWF). Negara yang tidak bisa menurunkan line-up lengkap (mis. kurang pasangan ganda) tidak ikut; sebagian negara Afrika/Oseania karena itu tidak punya tim Thomas/Uber.
- **Kontinental**: 8 tim terkuat per konfederasi, sistem gugur berunggulan (tanpa grup; aslinya grup + gugur). Bila hanya satu tim di konfederasi yang bisa menurunkan tim lengkap, tim itu menjadi juara tanpa bertanding.
- **Nama resmi kejuaraan kontinental** berbeda menurut tahun: Thomas & Uber (genap) mis. *Badminton Asia Team Championships*, *European Team Championships*, *Pan Am Male & Female Cup*, *Oceania Team Championships*; Sudirman (ganjil) *Badminton Asia Mixed Team Championships*, *European Mixed Team Championships*, *Pan Am Cup*, *Oceania Mixed Team Championships*; Afrika memakai *All Africa Senior Championships* di kedua tahun. Nama turnamen resmi tidak diterjemahkan (sama di bahasa Indonesia & Inggris).
- **Final**: 4 grup × 4 (undian pot menurut kekuatan) → 2 teratas ke perempat final; juara grup tidak bertemu runner-up grupnya sendiri di QF.
- **Pertandingan beregu** = 5 partai. Thomas: MS–MD–MS–MD–MS; Uber: WS–WD–WS–WD–WS; Sudirman: XD–WS–MS–WD–MD (urutan Sudirman aslinya bisa berubah per edisi). Fase grup memainkan kelima partai; babak gugur berhenti begitu satu tim menang 3.
- **Klasemen grup**: kemenangan → head-to-head (2 tim seri) → selisih partai → selisih game → unggulan.
- **Line-up**: tiap atlet maksimal 2 partai dan tidak dua kali di nomor yang sama. Ganda hanya dari pasangan terdaftar. AI mengisi menurut ranking (tunggal 1 = terbaik). Untuk line-up manajer, kewajiban urutan tunggal menurut ranking **tidak** diperiksa.
- **Skuad**: tiap tim mendaftarkan skuad sebelum tiap turnamen beregu (kontinental & final terpisah). Ukuran skuad Thomas/Uber 4–10 atlet, Sudirman 4–12 atlet (ASUMSI). Skuad harus berisi atlet sehat yang cukup untuk mengisi kelima partai. AI memilih atlet line-up terbaiknya, lalu cadangan terbaik tiap nomor sampai batas maksimal.
- **Line-up tiap pertandingan** diambil dari skuad. Manajer memilihnya lewat pop-up sebelum tiap pertandingan; kedua tim menyusun line-up bersamaan (line-up lawan tidak terlihat). Pilihan terakhir menjadi saran untuk pertandingan berikutnya.
- **Mode beregu "Otomatis"** (pilihan di header) atau tombol "Auto sisa minggu ini": tanpa pop-up; dipakai skuad & line-up default dari tab Beregu bila masih sah, selain itu pilihan AI.
- **Ganda beregu** hanya dari pasangan terdaftar yang kedua atletnya ada di skuad (pasangan dadakan belum didukung).
- Dalam satu minggu, Thomas Cup dimainkan sampai selesai sebelum skuad Uber Cup didaftarkan (urutan proses, tidak berpengaruh pada hasil).
- **Tanpa poin ranking**: beregu tidak memberi poin ranking dunia dan tidak dihitung sebagai gelar individu. Partai tetap tercatat sebagai laga biasa (H2H, statistik, Live) dan menambah kelelahan, pengalaman, chemistry, serta risiko cedera.
- **Target federasi beregu** (satu per format tahun itu), dari peringkat kekuatan tim di awal musim: #1 → juara, #2 → final, #3–4 → semifinal, #5–8 → perempat final, #9–16 → lolos ke final. Capaian: 0 tidak lolos, 1 fase grup, 2 QF, 3 SF, 4 final, 5 juara.
- Save lama (sebelum Fase 9) baru mendapat target beregu mulai musim berikutnya.

## Fase 10 — Editor & impor/ekspor
- **Paket data** = ruleset + negara & kota + atlet & pasangan, disimpan di IndexedDB (tabel `packs`) dan diekspor/impor sebagai satu file JSON. Paket bawaan (BWF 2026/2027+) hanya-baca; "Salin untuk diedit" membuat salinan berisi atlet fiktif yang bisa diedit satu per satu.
- **Impor sebagian**: bagian yang tidak ada di file diisi bawaan (ruleset dari preset dengan id sama, atau BWF 2026; negara & kota bawaan); nilai atlet yang kosong diisi (tangan kanan, form 0, kelelahan 0). File yang bermasalah tetap disimpan tetapi tidak bisa dipakai New Game sampai diperbaiki.
- **New Game dengan paket**: negara yang punya atlet di paket memakai atlet itu saja; negara lain diisi generator. Negara paket yang pasangannya kurang dari target dipasangkan otomatis.
- **Id** (negara, kota, turnamen, atlet) tidak bisa diubah setelah dibuat karena dirujuk data lain; hapus lalu buat baru bila perlu. Menghapus data yang masih dirujuk tidak dicegah, tetapi muncul sebagai masalah di daftar validasi.
- **Editor di save berjalan** (tab Editor): perubahan langsung berlaku; tidak ada penghapusan, dan negara/gender atlet terkunci agar riwayat, ranking & pasangan tetap konsisten. "Ekspor JSON" di sana mengekspor dunia save (atlet & pasangan aktif, tanpa kelelahan/cedera) sebagai paket.
- **Tier**: tabel poin, hadiah, ukuran draw & pengaturan bisa diedit; menambah/menghapus tier belum didukung (tier dirujuk banyak aturan lain).
- **Aturan lain** (ranking, AI, match, development, dsb.) diedit sebagai JSON per bagian; kurva perkembangan, penuaan & pensiun punya tabel sendiri. Avatar atlet belum didukung.

## Bagan turnamen di karier
- **Catatan turnamen** (entry, seksi kualifikasi, posisi bagan, unggulan, langkah undian, grup) disimpan untuk 2 musim terakhir, sama seperti statistik laga (±2 MB per musim; save ±10 MB setelah satu musim).
- Turnamen yang dimainkan sebelum pembaruan ini hanya punya daftar laga per babak (tanpa entry, unggulan & bagan).
- Turnamen beregu memakai tampilan hasil beregu (grup + babak gugur).

## Live drawing
- Muncul sebelum laga pertama tiap nomor yang diikuti atlet negara sendiri. "Turnamen besar" = Super 1000, Super 750, Kejuaraan Dunia, Olimpiade, WTF, dan putaran final Thomas/Uber/Sudirman. Kejuaraan beregu kontinental tidak punya undian acak (sistem gugur berunggulan).
- Mangkuk pot bagan gugur: Unggulan 1–2 (posisi tetap), 3–4, 5–8, 9–16, lalu bye, qualifier, non-unggulan, dan pemisahan negara (tukar posisi). Format grup: Pot 1, 2, … sesuai undian pot.
- Tanda wildcard [WC] tidak tampil selama live drawing (hanya di bagan akhir).

## Pasangan percobaan
- Pasangan percobaan aktif bersama pasangan utama; ranking & chemistry sendiri (mulai 0 / rendah). AI tidak pernah mendaftarkannya; hanya ikut bila manajer mendaftarkannya di Kalender & Entry. AI negara lain tidak membentuk pasangan percobaan.
- Satu atlet tetap hanya satu turnamen per minggu dan satu pasangan per nomor: bila pasangan percobaan didaftarkan, pasangan utama atlet itu tidak ikut nomor tersebut minggu itu.
- **Keputusan entry manual diproses lebih dulu** daripada pilihan AI (sebelumnya pilihan AI untuk nomor lain bisa mengikat atlet ke turnamen lain sehingga entry manual gagal). Bila dua keputusan manual bentrok untuk atlet yang sama, yang diproses lebih dulu (urutan nomor MS→XD, lalu urutan pasangan) yang berlaku.
- "Jadikan pasangan utama" membubarkan pasangan utama lama kedua atlet di nomor itu.
- Pasangan percobaan boleh dipakai di line-up beregu bila kedua atletnya ada di skuad.

## Hadiah uang, grafik atribut, generator
- **Hadiah uang** = hadiah turnamen × persentase babak yang dicapai di main draw (tabel `prizeSplit` tier). Ganda: hadiah per pasangan dibagi dua per atlet. Babak kualifikasi & beregu tanpa hadiah. Dicatat per atlet per tahun (tidak dipangkas). Save lama mulai mencatat sejak pembaruan ini.
- **Grafik atribut per usia**: titik = kondisi akhir tiap musim (riwayat) + kondisi sekarang (usia pecahan menurut minggu).
- **Generator**: tiap negara mendapat minimal 2 pasangan MD & WD bila atletnya cukup (negara kecil melengkapi dengan atlet fokus tunggal), agar bisa menurunkan tim beregu. Dunia baru dengan seed yang sama berbeda dari sebelum perubahan ini.

## Pop-up entry & ganda dadakan beregu
- **Pop-up entry** muncul di awal minggu yang punya turnamen individu (setelah pemulihan kelelahan & cedera, sebelum entry diproses). Bawaan **Mati** agar simulasi panjang tidak terganggu; tombol "Tanpa pop-up entry sampai simulasi berhenti" untuk satu kali jalan.
- **Ganda dadakan beregu**: di line-up, slot ganda boleh diisi dua atlet skuad mana pun (gender sesuai nomor). Bila keduanya sudah pasangan aktif (utama/percobaan), pasangan itu yang dipakai; selain itu dibuat pasangan khusus beregu (chemistry awal 25), tanpa ranking, tidak ikut turnamen individu, tidak tampil di tab Pasangan, dan dipakai ulang bila kombinasinya dipilih lagi.
- Syarat skuad tetap memakai pasangan terdaftar (skuad harus bisa mengisi kelima partai dengan pasangan terdaftar); ganda dadakan adalah pilihan tambahan saat menyusun line-up. AI hanya memakai pasangan terdaftar.

## Atlet asli bawaan
- Paket bawaan (BWF 2026 & 2027+) berisi atlet asli dari **ranking dunia & ranking junior BWF** (`src/engine/presets/bwfPlayers.json`, dibuat dengan `scripts/fetch-bwf.mjs`; tanggal pengambilan tercatat di file). Per negara game: senior s/d 24 per gender dan junior s/d 8 per gender, yang poinnya tertinggi dulu. Negara di luar 47 negara game tidak diambil.
- **Nama, negara, gender & tanggal lahir** dari BWF (gender menurut nomor; ganda campuran: pemain pertama putra). Bila tanggal lahir kosong: diperkirakan 25 th (senior) / 17 th (junior) saat data diambil. Tangan: kanan semua (BWF tidak mencantumkan).
- **Level** (≈ kemampuan) = perkiraan dari peringkat BWF: senior 96 − 4,5·ln(peringkat) (#1 ≈ 96, #10 ≈ 86, #100 ≈ 75, #1000 ≈ 65), junior 72 − 4·ln(peringkat); diambil yang tertinggi bila atlet ada di beberapa nomor (nomor itu juga menentukan fokus tunggal/ganda). Potensi: level + 2 per tahun di bawah usia 24.
- **Pasangan ganda**: dari ranking ganda senior (satu pasangan per atlet per nomor, yang peringkatnya terbaik; pasangan beda negara dilewati). Ranking ganda junior bersifat perorangan, jadi junior dipasangkan oleh AI.
- **Pelengkap fiktif**: negara yang punya atlet asli hanya ditambah senior fiktif sampai **7 per gender** (cukup untuk tim beregu: 3 tunggal + 2 pasangan ganda) dan junior fiktif sampai jumlah normal generator. Senior fiktif tambahan tidak lebih kuat dari senior asli terlemah negara itu. Negara tanpa atlet asli diisi generator seperti biasa. Junior baru tiap musim (fiktif) tetap datang ke semua negara. Pasangan tambahan dibentuk AI setelah ranking awal; spesialis tunggal hanya dipasangkan bila perlu untuk minimum tim (2 pasangan MD/WD, 1 XD).
- **Ranking tunggal awal**: pemain yang punya pasangan ganda diberi penalti 10 poin kemampuan, agar spesialis ganda tidak berada di atas spesialis tunggal.

## Sektor atlet (tab Skuad)
- **Sektor** = nomor yang dimainkan: tunggal (kecuali spesialis ganda, `focus: 'D'`) + nomor ganda tempat atlet punya pasangan utama aktif. Pasangan percobaan & ganda dadakan beregu tidak dihitung.
- **Atur sektor**: centang tunggal = ikut didaftarkan otomatis di tunggal (tanpa centang = spesialis ganda; entry manual tetap bisa). Centang nomor ganda = pilih partner (atlet negara sendiri, gender sesuai, belum punya pasangan utama di nomor itu) → pasangan utama baru; hapus centang = bubarkan pasangan utama (konfirmasi).

## Junior: promosi pelatnas (tahap 1 fitur junior)
- **Junior** = usia ≤ 18 (U19), `JUNIOR_MAX_AGE` di `src/engine/generator.ts`.
- Junior negara manajer berstatus **Pratama** (belum dipromosikan) atau **Utama** (`Player.promoted`). Pratama tidak didaftarkan otomatis ke turnamen senior (entry manual tetap bisa, beregu tetap boleh). Usia 19 = otomatis senior.
- Negara AI tidak memakai status ini: junior mereka tetap ikut sirkuit senior menurut peringkat.
- Paket bawaan: atlet dari ranking **senior** BWF yang masih U19 langsung Utama; atlet dari ranking junior & junior fiktif = Pratama.
- Save lama (sebelum fitur ini): sekali saat dimuat, junior yang sudah pernah bermain di turnamen senior dijadikan Utama.

## Junior: turnamen junior individu & ranking junior (tahap 2)
- **Kalender** (2026 & 2027+): minggu 28 Kejuaraan Junior Kontinental — Asia (Surabaya) & Eropa (Brno) tier `JC`; Pan Am (Lima), Afrika (Lagos), Oseania (Sydney) tier `JC2` (poin lebih kecil karena persaingan lebih ringan); minggu 41 BWF World Junior Championships (Guwahati) tier `WJC`. Kota & minggu disederhanakan.
- **Peserta** U19 (usia ≤ 18 saat turnamen), dipilih otomatis per negara: maks 3 tunggal & 2 pasangan (Dunia Junior), 4 & 3 (kontinental). Kontinental hanya negara konfederasinya. Urutan: ranking junior, lalu kemampuan. Junior pratama ikut. Keputusan entry manajer minggu itu (istirahat / turnamen senior) dihormati — atlet itu tidak ikut turnamen junior. Tab Kalender & Entry tidak menampilkan turnamen junior.
- **Undian**: Dunia Junior 128 tunggal / 64 ganda; kontinental 64 / 32; tanpa kualifikasi & wildcard.
- **Bentrok**: atlet yang ikut turnamen junior tidak didaftarkan otomatis ke turnamen senior minggu yang sama.
- **Ganda junior**: pasangan aktif yang kedua atletnya U19 dipakai; sisanya dipasangkan otomatis per negara (pasangan `junior` + `adHoc`: tidak ikut turnamen senior, tidak tampil di daftar pasangan, dipakai ulang bila atletnya sama).
- **Poin** masuk **Ranking Junior Dunia** (`state.juniorResults`, kedaluwarsa 52 minggu), bukan ranking senior; tanpa hadiah uang. Juara (WJC) 10.000, JC 7.000, JC2 4.000.
- **Kalibrasi atlet asli**: level dari ranking junior BWF = 82 − 4,5·ln(peringkat) (sebelumnya 72 − 4·ln; junior #1 ≈ senior #20). Di luar papan atas (level < 86), level dikurangi s/d 8 menurut lemahnya tradisi negara (poin banyak dari turnamen kecil di kawasannya) — berlaku juga untuk senior. Hanya untuk New Game.
- Save lama: tier & event junior ditambahkan dari preset saat dimuat.

## Junior: Suhandinata Cup (tahap 3)
- **BWF World Junior Mixed Team Championships (Suhandinata Cup)**: setiap tahun minggu 40 (Guwahati), seminggu sebelum Kejuaraan Dunia Junior. Format `suhandinata`: beregu campuran 5 partai, urutan seperti Sudirman Cup (XD, WS, MS, WD, MD), skuad 4–12.
- **Peserta**: semua negara yang bisa menurunkan tim junior lengkap, maks **32 tim** (tuan rumah & juara bertahan dulu, lalu terkuat); **8 grup × 4**, 2 teratas ke babak 16 besar. (Kenyataannya ±38 tim dengan grup bervariasi.)
- **Atlet**: hanya U19. Kekuatan tim & urutan pool memakai **ranking junior** (lalu kemampuan). Ganda: pasangan aktif yang kedua atletnya U19; sisanya ganda dadakan junior (juga untuk tim AI). Pasangan dadakan yang terbentuk ditandai `junior` sehingga dipakai ulang di Kejuaraan Dunia Junior.
- Di minggu Suhandinata, semua junior tidak didaftarkan otomatis ke turnamen senior (entry manual tetap bisa).
- Tidak masuk target musim federasi dan tidak dimainkan di kejuaraan beregu kontinental. Skuad & line-up negara manajer lewat pop-up yang sama dengan Thomas/Uber/Sudirman.

## Alur turnamen per babak (gerbang babak)
- Babak global: kualifikasi Q1, Q2, … → grup → R256 … F; nomor tanpa kualifikasi mulai di babak pertamanya. Nomor yang sudah selesai tidak muncul lagi.
- Fase grup (WTF, putaran final beregu) ditampilkan sebagai **satu babak "Grup"** (belum dipecah per hari pertandingan).
- Laga negara lain dan laga di turnamen yang tidak dimainkan disimulasikan langsung. Derbi dua atlet negara sendiri tetap live (sisi kita = sisi pertama).
- Entry bisa diisi & di-submit langsung dari layar minggu (tombol Isi entry) hanya sebelum turnamen pertama minggu itu dimulai; setelah itu entry minggu itu terkunci.
- Tombol Mainkan nonaktif bila entry turnamen individu belum di-submit; junior & World Tour Finals (entry otomatis) serta beregu (skuad dipilih di pop-up) selalu bisa dimainkan.
- Urutan RNG turnamen yang dimainkan berbeda dari jalur otomatis (tetap deterministik); jalur otomatis (Maju 4 minggu / akhir musim / Lewati) tidak berubah.
