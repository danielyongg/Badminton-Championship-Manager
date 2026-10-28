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
- **Preset 2027**: tabel poin & hadiah sama dengan 2026. Tunggal Super 1000: 48 pemain, 16 grup × 3 → R16. Kejuaraan Dunia: MS 16 grup × 4, nomor lain 16 grup × 3 → R16. Super 100 yang tidak ada lagi di kalender 2027 (Ruichang, Baoji, Lingshui, Korea Masters, Guwahati, Odisha) berhenti setelah 2026 (`years.to`).
- **Kalender resmi BWF**: World Tour 2026–2028 dan Continental Circuit 2026 mengikuti kalender BWF (hanya turnamen di negara yang ada di game). Continental Circuit 2027 baru sebagian diumumkan BWF (per 20 Okt 2026): yang sudah diumumkan memakai minggu resmi 2027, termasuk 5 event baru (kota TBC: Indonesia → Jakarta, Korea → Suwon & Iksan); sisanya, dan seluruh 2028 (belum ada event di negara game), mengikuti minggu 2026 ±1. Singapore IC 2027 (minggu 31) dianggap edisi kedua 2026.
- **Sebaran turnamen senegara** (2027+): turnamen tanpa jadwal resmi tahun itu (Super 300 ke bawah, grade 3, junior internasional) digeser ke minggu terdekat yang berjarak ≥ 4 minggu (`HOST_GAP`) dari turnamen lain di negara yang sama, termasuk event beregu, dan sebisa mungkin tidak sepekan dengan turnamen tier yang sama (mis. dua IC) serta berjarak ≥ 8 minggu (`CITY_GAP`) dari event lain di kota yang sama. Prioritas bila mustahil: (1) turnamen World Tour tidak sepekan dengan World Tour lain, (2) kota yang sama berjarak ≥ 4 minggu (sejak 2026-10-27; sebelumnya kalah dari bentrok tier sehingga mis. Indonesia IC bisa 3 minggu dari Indonesia Masters di Jakarta), (3) tier yang sama tidak sepekan, (4) jarak senegara, (5) jarak sekota ≥ 8 minggu. Super 500+ yang ±1 minggunya penuh mencari minggu bebas terdekat (±2–4) dan menghindari minggu dekat event lain di negaranya (mis. tuan rumah beregu hasil undian). Kejuaraan kontinental antarbenua tetap boleh sepekan (pesertanya tidak bisa tumpang-tindih), begitu pula bagian beregu & perorangan satu multi-event / kejuaraan kontinental di kota yang sama. Jadwal resmi BWF, Super 500+, multi-event & kejuaraan kontinental tidak digeser, jadi dua jadwal resmi bisa tetap berdekatan (mis. Indonesia 2028 minggu 48 & 49). Turnamen World Tour (Super 1000–100) yang jadwal resminya sepekan atau sesudah World Tour Finals (mis. Indonesia Super 100 2028 minggu 48 & 49) dipindah ke sebelum Finals, agar Finals selalu penutup World Tour. Musim pertama (2026) tetap kalender asli. Save lama: sisa musim berjalan disebar saat dimuat (turnamen yang sudah di-submit tidak digeser).
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
- **Pemisahan negara**: setelah undian acak, posisi ditukar (hanya sesama kelompok unggulan yang sama, atau sesama non-unggulan/qualifier) sampai tidak ada pertemuan senegara di R1; bila mustahil, jumlahnya diminimalkan dan dicatat di langkah drawing. **Tidak berlaku di World Tour** (Super 1000–100; World Tour Regulations 6.4.4: tanpa pemisahan negara GCR 11.11 di turnamen Grade 2); tetap berlaku di Kejuaraan Dunia, Olimpiade, kejuaraan kontinental, grade 3 & junior.
- **Kualifikasi**: satu unggulan per seksi (peserta terbaik), sisanya diundi; bye ke unggulan seksi. Qualifier yang kosong (seksi tanpa peserta) menjadi bye di main draw.
- **Wildcard**: diberikan ke entri terbaik negara tuan rumah yang tidak lolos langsung. Wildcard tak terpakai dikembalikan ke daftar entry. **Super 1000/750/500** (World Tour Regulations 6.4.2, Level 2–4): maks 2 wildcard untuk *seluruh turnamen*, hanya bila tuan rumah tidak punya entri di 32 besar (S1000/S750) atau 28 besar (S500) semua nomor; satu entri → 1 wildcard, dua atau lebih → tidak ada. Maksimal satu per nomor; ASUMSI: tuan rumah memilih nomor dengan wakil (di luar 32/28 besar) berperingkat terbaik. Wildcard tidak mendapat poin kecuali menang satu laga. **Grade 3, S300 & S100** (GCR 7.11, Level 5–6): satu per nomor, hanya bila tuan rumah tidak punya wakil di bagan utama nomor itu, dan wildcard yang kalah di babak pertama tidak mendapat poin.
- **Sementara (sampai Fase 4)**: Wizard memakai urutan kemampuan sebagai "ranking", dan semua atlet/pasangan dianggap mendaftar.

## Fase 4 — Ranking
- **1 tahun game = 52 minggu**; poin kedaluwarsa tepat 52 minggu kemudian (minggu yang sama tahun berikutnya).
- **Kalah di kualifikasi** = 0 poin dan tidak dihitung sebagai turnamen yang dimainkan. Qualifier yang kalah di R1 main draw mendapat poin R1.
- **Entri 0 poin** (wildcard kalah di R1 World Tour & grade 3) tetap dihitung sebagai turnamen dimainkan (berpengaruh ke tie-break).
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
- **AI entry**: tiap minggu tiap peserta memilih turnamen ber-tier tertinggi yang sesuai rentang peringkatnya (Ruleset `ai.rankRange`; mis. S1000/S750 1–64, S500 1–100, S300 11–160, S100 21–260: pemain top 10 tidak turun di S300 & top 20 tidak di S100 — perilaku, bukan aturan BWF; manajer tetap boleh mendaftarkan siapa pun; tombol Saran memakai rentang yang sama), dengan peluang ikut per tier dikurangi kelelahan; istirahat bila kelelahan > 45. Turnamen wajib selalu dipilih. Nomor tunggal diproses dulu; turnamen pertama yang dipilih seorang atlet mengikat nomor gandanya (satu turnamen per minggu).
- **Kelelahan**: +5 per laga, +0,6 per 1.000 km perjalanan, −12 per minggu. Hasil kalibrasi: atlet top 30 main ±16–19 turnamen per tahun.

## Fase 6 — Perkembangan, penuaan, pensiun, regenerasi
- **Atribut disimpan sebagai pecahan** (perubahan per kuartal kecil tetap terakumulasi); UI membulatkan.
- **Pertumbuhan per kuartal** = (PA − CA) × ¼ × laju usia × faktor acak 0,6–1,4 × pengalaman × sifat. Pertumbuhan dibagi ke atribut dengan bobot acak.
- **Pengalaman** (s/d 25 th): faktor 0,85 + 0,025 × laga berbobot kuartal itu (menang ×1,5; S500 ke atas / Grade 1 ×1,3), maks 1,2.
- **Penuaan per atribut** (offset = berapa tahun lebih lambat mulai turun): Speed & Stamina bobot 1 (offset 0); Smash, Defensive & Warm-up 0,5–0,7 (offset 1); Net, Serve, Consistency, Deception ±0,3 (offset 2); Mental 0,3 (offset 3), dan Mental masih naik +1/tahun s/d 31 th.
- **Pemain ganda** = atlet yang pasangannya berperingkat lebih baik dari peringkat tunggalnya; usia efektifnya −1,5 tahun untuk perkembangan & penuaan.
- **Late bloomer**: memakai laju usia 3 tahun lebih muda dan ×0,6 sebelum 22 th. **Stagnan**: laju ×0,35.
- **Pensiun** (akhir musim): 30 th 3% → 37 th 60%, pasti di 38 th; top 20 ×0,5 (peringkat terbaik di semua nomor; ganda = peringkat pasangannya), tanpa ranking/di luar 200 ×1,5, turun > 8 dari puncak ×1,5. Atlet ≥ 19 th dengan kemampuan < 55 berhenti 50%/tahun (sebagian besar junior lemah tidak lanjut ke senior; menjaga populasi senior ±3.000). Pasangan dengan anggota pensiun dibubarkan.
- **Junior baru** per gender per negara per musim = 1,5 + tradisi/100 × 8 (pembulatan acak; ±218 per gender per musim). Dikalibrasi (simulasi 2026–2034, atlet asli) agar jumlah junior setara data asli 2026: U19 stabil ±430 per gender, atlet tunggal ≤ 17 tahun ±210 per gender dari 46–48 negara (Youth Olympic Games selalu penuh 32), Kejuaraan Dunia Junior penuh (128/64). Senior tumbuh dari ±1.650 (2026) lalu mendatar di ±3.000; total atlet aktif ±3.900. Nilai lama (0,3–2,2) membuat U19 turun ke ±110 per gender di 2030.
- **AI membentuk pasangan** di akhir musim bila pasangan aktif di bawah target; atlet top 64 dunia tunggal tidak dipasangkan. Chemistry pasangan naik tiap laga bersama sebesar 1% dari sisa jarak ke 100 (makin lambat mendekati 100; ±60 → ±82 dalam satu musim aktif).
- **Hasil kurva** (1.000 atlet, rata-rata): 15 th 40 → 20 th 67 → puncak 29 th 71,5 → 32 th 70 → 35 th 64.

## Fase 7 — Mode karier
- **Cedera**: peluang per laga per atlet = 0,2% + 3% × (kelelahan/100)². 15% cedera berat (6–20 minggu, PA turun 1–4), sisanya ringan (1–3 minggu). Atlet menyelesaikan turnamen yang sedang dijalani; absen mulai minggu berikutnya. Atlet cedera dikecualikan dari pelanggaran Top Committed.
- **Target federasi**: gelar (tier S100 ke atas + Kejuaraan Dunia/Olimpiade/WTF, semua nomor) = gelar musim lalu (musim pertama: 1,5 × jumlah entri top 10); top 10 = pertahankan jumlah saat awal musim. Target beregu: lihat Fase 9.
- **Rapor**: rata-rata pencapaian (maks 150% per target) → A ≥ 100%, B ≥ 80%, C ≥ 60%, D ≥ 40%, E; ≥ 3 pelanggaran turun satu nilai. Reputasi awal 50: A +10, B +5, C 0, D −5, E −10; tiap pelanggaran Top Committed −3.
- **Perkiraan potensi** (bintang ½–5): galat tetap per atlet, simpangan menyusut dari ±15 (usia 15, belum bertanding) ke ±2 poin PA (usia & laga bertambah).
- **Junior** di layar Skuad = U19 menurut tahun kalender (tahun − tahun lahir ≤ 18), lihat di bawah.
- **Entry manual**: tanpa keputusan = asisten AI memilih (mematuhi Top Committed). Pilihan manajer tetap tunduk pada aturan entry (peringkat, kuota, kualifikasi/cadangan).
- **Ukuran save**: statistik per laga hanya disimpan 2 musim terakhir (skor & head-to-head tetap selamanya); hasil ranking > 2 tahun dibuang; riwayat peringkat disimpan sebagai snapshot top 300 tiap 4 minggu (peringkat seri ditampilkan berurutan di grafik).
- **Save**: otomatis setelah tiap "Lanjut" dan setiap perubahan entry/pasangan. Tiap save menyimpan salinan ruleset & data dunianya sendiri.

## Fase 8 — Live Match
- **Statistik laga** (`Match.stats`, sejak 2026-10-22): poin saat servis/menerima, poin beruntun terbanyak, game/match point (dipegang & diselamatkan), winner per pukulan (smash, net, drop, clear, servis), unforced error (salah sendiri yang menentukan reli), forced error (poin duel yang kalah karena tertekan), kesalahan servis, area winner (depan = net+drop, tengah = smash, belakang = clear). Perkiraan (mesin tidak memodelkan pukulan satu per satu; acak terpisah agar hasil laga tidak berubah): panjang reli per pola (smash 3–10, net 3–9, tipuan 4–11, reli panjang 10–25, salah sendiri 2–9 pukulan), durasi = 1,2 detik/pukulan + 20 detik antar reli + 60 detik interval + 120 detik antar game (±52 menit skor 21, ±38 menit skor 3×15), smash = 360 (putra/campuran) atau 300 (putri) km/jam + 2,5 per poin Smash di atas 70 ± 12. Save lama: hanya jenis poin.
- **Kondisi hari itu & on fire** (`match.dayForm`): tiap laga tiap sisi mendapat bonus/penalti acak semua atribut (simpangan baku 2). Di turnamen karier kondisi **terbawa antar laga dalam minggu yang sama**: kondisi berikutnya = 60% kondisi laga sebelumnya + acak baru (sebaran tetap ±2), ditambah +0,5 per kemenangan di turnamen itu (maks +2; di sistem gugur kedua sisi biasanya sama, jadi terasa di fase grup & bagi atlet yang lolos kualifikasi). Diganti baru tiap minggu (antar minggu sudah ada morale). Tanda 🔥 di papan skor Live Match bila kondisi laga itu ≥ +2. Kalibrasi (3.000 turnamen 32 peserta, ability 88→72): unggulan 1 juara 20%→18,5%, juara dari luar 8 besar 11%→14%, kejutan babak 1 tetap ±21%; 43% juara sedang 'hot' (acak: 31%). Lab memakai kondisi acak per laga seperti sebelumnya.
- **Strategi** (data di Ruleset `match.strategies`): tiap strategi mengubah peluang pola reli yang dimulai sisi itu, bonus saat menyerang dengan pola tertentu, bonus/penalti bertahan, risiko unforced error, dan biaya energi. **Unforced error menentukan reli** (sejak 2026-10-22; sebelumnya hanya label statistik): tiap reli selain poin servis, tiap sisi kehilangan poin langsung dengan peluang (`ownError.base` 0,02 + risiko strategi) × (150 − Consistency efektif)/100 — Menyerang +0,006, Cepat & Tipuan +0,012, Bertahan −0,006. Dikalibrasi ulang (simulasi 4.000 laga per sel, skor 3×15 & 21) agar **tidak ada strategi dominan** (±2–4% dari Seimbang saat lawan setara; Menyerang paling berisiko di skor 21) tetapi strategi yang cocok dengan matchup terasa: Tipuan (Deception 90 vs Speed lawan 55) ±+4–5%, Menyerang vs Defense lawan 55 ±+3–4%, Cepat vs Net lawan lemah ±+4%, Bertahan vs lawan bertahan kuat ±+2%; Menyerang ke lawan bertahan kuat ±−1–2%. Save lama yang masih memakai nilai strategi bawaan lama diganti nilai baru saat dimuat.
- **Lawan AI & mode Auto** memakai strategi Seimbang.
- **Momentum** (−1..1) bergeser tiap poin (decay 0,8); sisi yang unggul momentum mendapat bonus duel kecil (2 poin atribut).
- **Live otomatis berhenti** di interval 11 poin dan di akhir tiap game agar strategi bisa diganti; strategi juga bisa diganti kapan saja saat dijeda.
- **Pilihan Live di karier**: Mati / SF & Final atlet saya (default) / Semua laga atlet saya; tombol "Auto sisa minggu ini" menyelesaikan minggu tanpa Live lagi.
- Laga Live tercatat sama seperti laga Auto (skor, statistik, H2H, ranking).

## Fase 9 — Beregu (Thomas, Uber, Sudirman Cup)
- **Giliran tahun**: tahun genap Thomas Cup (putra) & Uber Cup (putri) di minggu 18; tahun ganjil Sudirman Cup (campuran) di minggu 18. Kejuaraan beregu kontinental (5 konfederasi) di minggu 7 memainkan format final tahun itu.
- **Tuan rumah**: tuan rumah resmi per tahun (`hosts`): Thomas & Uber 2026 Horsens, Sudirman 2025 Xiamen & 2027 Beijing; kontinental 2026: Qingdao (Conson Gymnasium), Istanbul (Başakşehir Sports Complex), Guatemala City, Gaborone (Royal Aria Gymnasium; Botswana ditambahkan ke daftar negara), Auckland (Badminton North Harbour). Tahun yang belum diumumkan **diundi** (lihat *Undian tuan rumah*).
- **Undian tuan rumah**: event dengan daftar kota kandidat (`rotation`: Kejuaraan Dunia, Olimpiade, multi-event, beregu & kejuaraan kontinental, junior) yang belum punya tuan rumah resmi diundi di awal musim untuk **musim depan** (diumumkan di Berita minggu ini selama 4 minggu pertama). ASUMSI: undian acak di antara kandidat, bukan negara tuan rumah edisi sebelumnya (bila mustahil: bukan kotanya); hasilnya dipatok ke `hosts`. Save lama: musim berjalan yang belum diundi diundi saat pergantian musim.
- **Peserta final (16 tim)**: tuan rumah, juara bertahan, **4 teratas kejuaraan Asia & Eropa** (urutan finis: juara, finalis, dua semifinalis), juara Pan Am, Afrika & Oseania, sisanya menurut kekuatan tim. Tim yang sudah lolos sebagai tuan rumah/juara bertahan dilewati dan kursinya jatuh ke tim berikutnya dari benua yang sama (seperti Sudirman Cup 2025). Musim pertama belum ada juara bertahan → kursinya diisi menurut kekuatan. Jumlah lolosan per kejuaraan kontinental diatur `qualifiers` di Ruleset.
- **Kekuatan tim** = jumlah poin ranking peserta line-up otomatis (mirip ranking beregu BWF). Negara yang tidak bisa menurunkan line-up lengkap (mis. kurang pasangan ganda) tidak ikut; sebagian negara Afrika/Oseania karena itu tidak punya tim Thomas/Uber.
- **Kontinental**: 8 tim terkuat per konfederasi, sistem gugur berunggulan (tanpa grup; aslinya grup + gugur). Bila hanya satu tim di konfederasi yang bisa menurunkan tim lengkap, tim itu menjadi juara tanpa bertanding.
- **Nama resmi kejuaraan kontinental** berbeda menurut tahun: Thomas & Uber (genap) mis. *Badminton Asia Team Championships*, *European Team Championships*, *Pan Am Male & Female Cup*, *Oceania Team Championships*; Sudirman (ganjil) *Badminton Asia Mixed Team Championships*, *European Mixed Team Championships*, *Pan Am Cup*, *Oceania Mixed Team Championships*; Afrika memakai *All Africa Senior Championships* di kedua tahun. Nama turnamen resmi tidak diterjemahkan (sama di bahasa Indonesia & Inggris).
- **Final**: 4 grup × 4 (undian pot menurut kekuatan) → 2 teratas ke perempat final; juara grup tidak bertemu runner-up grupnya sendiri di QF.
- **Pertandingan beregu** = 5 partai. Thomas: MS–MD–MS–MD–MS; Uber: WS–WD–WS–WD–WS; Sudirman: XD–WS–MS–WD–MD (urutan Sudirman aslinya bisa berubah per edisi). Fase grup memainkan kelima partai; babak gugur berhenti begitu satu tim menang 3.
- **Klasemen grup**: kemenangan → head-to-head (2 tim seri) → selisih partai → selisih game → unggulan.
- **Line-up**: tiap atlet maksimal 2 partai dan tidak dua kali di nomor yang sama. Ganda hanya dari pasangan terdaftar. AI mengisi menurut ranking (tunggal 1 = terbaik). Untuk line-up manajer, kewajiban urutan tunggal menurut ranking **tidak** diperiksa.
- **Skuad**: tiap tim mendaftarkan skuad sebelum tiap turnamen beregu (kontinental & final terpisah). Ukuran skuad (Major Events Regulations): Thomas/Uber 4–10 atlet; Sudirman & Suhandinata minimal 2 putra + 2 putri, maks 20 (minimal 2+2 sudah dijamin syarat kelima partai bisa diisi). Skuad harus berisi atlet sehat yang cukup untuk mengisi kelima partai. AI memilih atlet line-up terbaiknya, lalu cadangan terbaik tiap nomor sampai batas maksimal.
- **Urutan partai** ditentukan dari line-up kedua tim (`playOrder`, `src/engine/team.ts`). Thomas & Uber Cup (Regulations 10.1–10.2): 8 urutan sah dicoba berurutan; dipakai yang pertama tanpa atlet main di dua partai berturut-turut atau main ganda sebelum tunggalnya; bila tidak ada, 10.1.5 (S1-S2-S3-D1-D2). Tanpa atlet rangkap selalu 10.1.1 (S1-D1-S2-D2-S3). Sudirman Cup (Regulations 13.1–13.2, 7 urutan, cadangan 13.1.2 MS-WS-MD-WD-XD): **ASUMSI** seperti Sudirman Cup 2025, wasit memilih di antara urutan yang sah (dinilai dari daya tarik laga, dimodelkan acak). Suhandinata memakai aturan Sudirman. Manajer tidak memilih urutan; label line-up memakai MS1/MD1/MS2… (tunggal/ganda pertama dst.).
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
- **Junior** = U19 menurut tahun kalender seperti BWF Junior Tournament Regulations (tetap di bawah 19 sepanjang tahun turnamen): tahun − tahun lahir ≤ 18, `isJuniorAge` di `src/engine/generator.ts`. Status junior/senior hanya berganti di awal tahun, tidak saat ulang tahun (sebelum 2026-10-23: usia ≤ 18 pada hari itu, sehingga pasangan junior bisa pindah ke Senior di tengah musim).
- Junior negara manajer berstatus **Pratama** (belum dipromosikan) atau **Utama** (`Player.promoted`). Pratama tidak didaftarkan otomatis ke turnamen senior (entry manual tetap bisa, beregu tetap boleh). Usia 19 = otomatis senior.
- Negara AI tidak memakai status ini: junior mereka tetap ikut sirkuit senior menurut peringkat.
- Paket bawaan: atlet dari ranking **senior** BWF yang masih U19 langsung Utama; atlet dari ranking junior & junior fiktif = Pratama.
- Save lama (sebelum fitur ini): sekali saat dimuat, junior yang sudah pernah bermain di turnamen senior dijadikan Utama.

## Junior: turnamen junior individu & ranking junior (tahap 2)
- **Kalender** (2026 & 2027+): minggu 28 Kejuaraan Junior Kontinental — Asia (Surabaya) & Eropa (Brno) tier `JC`; Pan Am (Lima), Afrika (Lagos), Oseania (Sydney) tier `JC2` (poin lebih kecil karena persaingan lebih ringan); minggu 41 BWF World Junior Championships (Guwahati) tier `WJC`. Kota & minggu disederhanakan.
- **Peserta** U19 (tahun − tahun lahir ≤ 18), dipilih otomatis per negara: maks 3 tunggal & 2 pasangan (Dunia Junior), 4 & 3 (kontinental). Kontinental hanya negara konfederasinya. Urutan: ranking junior, lalu kemampuan. Junior pratama ikut. Keputusan entry manajer minggu itu (istirahat / turnamen senior) dihormati — atlet itu tidak ikut turnamen junior. Tab Kalender & Entry tidak menampilkan turnamen junior.
- **Undian**: Dunia Junior 128 tunggal / 64 ganda; kontinental 64 / 32; tanpa kualifikasi & wildcard.
- **Bentrok**: atlet yang ikut turnamen junior tidak didaftarkan otomatis ke turnamen senior minggu yang sama.
- **Ganda junior**: pasangan aktif yang kedua atletnya U19 dipakai; sisanya dipasangkan otomatis per negara (pasangan `junior` + `adHoc`: tidak ikut turnamen senior, tidak tampil di daftar pasangan, dipakai ulang bila atletnya sama). **Negara manajer** (sejak 2026-10-22): tanpa pasangan junior otomatis — ganda junior hanya dari pasangan yang dibentuk manajer, sama seperti senior; pasangan dadakan lama di save diakhiri saat dimuat (riwayat tetap).
- **Poin** masuk **Ranking Junior Dunia** (`state.juniorResults`, kedaluwarsa 52 minggu), bukan ranking senior; tanpa hadiah uang. Juara (WJC) 10.000, JC 7.000, JC2 4.000.
- **Kalibrasi atlet asli**: level dari ranking junior BWF = 82 − 4,5·ln(peringkat) (sebelumnya 72 − 4·ln; junior #1 ≈ senior #20). Di luar papan atas (level < 86), level dikurangi s/d 8 menurut lemahnya tradisi negara (poin banyak dari turnamen kecil di kawasannya) — berlaku juga untuk senior. Atlet U19 (ranking junior, atau remaja di ranking senior seperti NZL/MEX/BRA yang mengumpulkan poin di turnamen kecil kawasannya) dikurangi s/d 20. Ruang tumbuh atlet muda (PA − level = (24 − usia) × 2) dikali 0,3 + 0,7 × tradisi/100 (lingkungan latihan). Hasil uji 3 musim: 15–20 dari 20 junior terkuat per gender dari negara bertradisi ≥ 60 (sebelumnya turun ke 6/20 di musim ketiga). Save lama disesuaikan sekali saat dimuat: atlet asli yang terkena diturunkan sebesar selisih level & PA versi lama − baru (riwayat atribut ikut), lalu CA dijepit ke PA.
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

## Prioritas tier, rencana musim & pencarian bakat junior (2026-10-15)
- Prioritas tier (negara manajer): tier tertinggi yang dicentang selalu didaftarkan bila ada minggu itu, tanpa rentang ranking & peluang ikut; tetap tidak didaftarkan bila cedera atau kelelahan > `ai.restAbove`.
- Rencana musim: hanya menampilkan yang sudah pasti (pilihan manual, turnamen wajib); sisanya "Otomatis" tanpa perkiraan.
- Pencarian bakat: kursi = jumlah junior yang biasanya didapat negara manajer (tradisi) dan hanya menjadi saran — manajer boleh merekrut berapa pun dari kandidat (2× kursi per gender, minimal 5). Rentang potensi lebar 2 bintang dan selalu memuat perkiraan potensi yang tampil di Skuad. Batas memilih minggu 4; pada awal minggu 5 (atau akhir musim berikutnya) kursi diisi otomatis menurut nilai tengah rentang, lalu kemampuan.
- Lepas dari pelatnas: atlet tetap bertanding sebagai pemain independen (diatur AI) dengan kebangsaan sama; tidak dihitung untuk target federasi (termasuk gelar yang diraih sebelum dilepas di musim yang sama) dan tidak bisa dipilih untuk tim beregu.
- Cedera 4 tingkat (atas permintaan user): ringan 1–3 mg (67%), sedang 4–12 mg (21%), berat 13–26 mg (10%), parah 27–104 mg (2%). ASUMSI: berat menurunkan PA 1× `severeInjuryPaLoss`, parah 2×; cedera parah 30% langsung pensiun (pasangannya bubar). Jenis cedera hanya keterangan (4 per tingkat, acak). Cedera di save lama: berat → "berat", ringan → "ringan".
- **Entry yang sudah di-submit** (manual): atlet/pasangan sendiri yang tidak dicentang tidak diisi asisten AI ke turnamen itu; atlet wajib (Top Committed) tetap ikut kecuali centangnya dilepas. Turnamen yang tidak di-submit, di-skip, atau diserahkan lewat tombol Otomatis (AI) tetap diisi asisten AI. Atlet yang dilepas dari pelatnas selalu diatur AI. Save lama: turnamen mendatang yang ter-submit tanpa satu pun centang dianggap Otomatis (AI).
- **Dua turnamen grade 3 di minggu yang sama** (mis. Mexican IC & Peru FS di benua Amerika): atlet AI yang cocok untuk keduanya memilih acak di antaranya (sebelumnya selalu tier tertinggi, sehingga FS kosong). Saran entry & rencana musim tetap memilih tier tertinggi.
- Entry grade 3 sesuai GCR (Nov 2023): pemain tanpa ranking diurutkan bergiliran per negara (12.6; nomor 1 nasional = kemampuan tertinggi, semua negara diundi, lalu nomor 2, dst.) — berlaku di semua tier; di kualifikasi grade 3 dua entri teratas tiap negara di seksi berbeda dan sesama negara sebisa mungkin tidak bertemu di babak pertama (12.4). Ukuran bagan grade 3 tetap (IC MS 64/lain 32, IS & FS 32, kualifikasi 4 per slot) walau aslinya ditentukan tiap konfederasi.
- Super 100 tunggal putra: bagan 48 = 40 langsung + 8 qualifier (`qualifierSlots` per nomor; nomor lain 28 + 4 menurut rasio 1:8).

## Kejuaraan kontinental (2026-10-21)
- **Badge**: kejuaraan beregu kontinental = "Continental / Team", individu = "Continental / Individual" (teal). Bukan Grade 1 Major: diselenggarakan konfederasi, bukan Major Events BWF.
- **Kejuaraan individu senior** (tier `CCA`/`CCE`/`CCP`/`CCI`): poin = tabel tier setara menurut halaman tiap kejuaraan 2026 — Asia = Super 1000, Eropa = Super 500, Pan Am = Super 300, Afrika & Oseania = International Challenge. Masuk ranking BWF (dan ranking Olimpiade), tidak masuk race WTF.
- **Kalender**: Asia (Ningbo), Eropa (Huelva), Pan Am (Aguascalientes) minggu 15; 2027 minggu 14 (minggu 15 ada Philippine Open). Afrika (Gaborone) & Oseania (Auckland) minggu 8 — aslinya pekan yang sama dengan beregunya (minggu 7), di game satu atlet satu event per minggu. Kota tetap kota 2026; minggu tidak digeser acak tiap tahun.
- **Peserta**: hanya negara konfederasinya; tanpa kualifikasi & wildcard; diterima menurut ranking sampai bagan penuh; maks 4 per negara per nomor (ASUMSI). Bagan: Asia 32, Eropa 48 tunggal / 32 ganda, lainnya 32. AI mengirim atlet terbaiknya (peluang ikut 0,9, tanpa batas ranking).
- **Hadiah**: hanya Asia (US$550.000, pembagian standar); lainnya tanpa hadiah.
- **Save lama**: tier & turnamen ditambahkan saat dimuat — musim ini bila minggunya belum lewat, selain itu mulai musim depan.

## Sumber morale & perkembangan (Fase 1, `src/engine/boosts.ts`)
- **Istirahat**: atlet yang tidak bertanding seminggu → morale negatif dikali 0,6 (di samping peluruhan mingguan biasa). Morale positif tidak terpengaruh.
- **Kandang**: atlet yang ikut turnamen di negaranya sendiri mendapat morale +1 di awal turnamen (berlaku juga untuk AI).
- **Target perorangan**: manajer memilih target babak (juara … 32 besar) di form entry. Tercapai atau lebih → morale +1,5; meleset ≥ 2 babak (atau tidak masuk babak utama dengan target ≤ 32 besar) → −1; meleset 1 babak → tidak berubah.
- **Target otomatis** (tanpa tombol; chip 🎯 di form entry, ketuk untuk mengubah — manual ditandai ✎, bisa juga "Tanpa target"): berlaku untuk semua atlet negara manajer bila tidak diatur manual, dihitung saat turnamen dimainkan. Turnamen junior: perkiraan peserta = atlet U19 sehat negara lain (konfederasi turnamen; turnamen lokal: benua tuan rumah), tiap negara maks kuota tunggal/ganda atlet terkuat (ganda dipasangkan berurutan menurut kemampuan, campuran putra ke-i + putri ke-i), kekuatan = rata-rata kemampuan; pemetaan posisi → target sama dengan senior. Perkiraan peserta = entrant negara lain yang menurut rentang ranking AI per tier memilih turnamen ini (tanpa unsur acak & peluang ikut) + atlet manajer yang dicentang, diurutkan menurut kemampuan (ganda: termasuk chemistry). Posisi 1–2 → final (posisi 1 unggul ≥ 5 atas posisi 2 → juara), 3–4 → semifinal, 5–8 → perempat final, 9–16 → 16 besar, 17–32 → 32 besar, di luar itu tanpa target.
- **Faktor pengalaman**: rumus lama (base + perMatch × laga berbobot, maks `max`) kini tampil di profil atlet sampai usia `experience.untilAge`; perilakunya tidak berubah.

## Sifat atlet (Fase 2, `src/engine/traits.ts`)
- **Jumlah**: 0 sifat (60 %), 1 (30 %), 2 (10 %) per atlet, diacak dari id atlet (tidak menggeser urutan acak game). Tidak bersamaan: tubuh baja↔rawan cedera, mental juara↔demam panggung, pasangan ideal↔sulit cocok. Save lama: diacak sekali saat dimuat.
- **Terungkap**: sifat fisik & sifat perkembangan lama (late bloomer/mandek) setelah 2 akhir musim tercatat; sifat mental/morale/ganda setelah 30 laga.
- **Tubuh baja / rawan cedera**: peluang cedera ×0,5 / ×1,8; rawan cedera: tingkat cedera = yang terburuk dari dua undian.
- **Cepat pulih**: pemulihan kelelahan mingguan ×1,5. **Musafir**: kelelahan perjalanan ×0,5. **Awet muda**: penurunan usia dihitung 2 tahun lebih muda.
- **Mental juara / demam panggung**: ±8 mental di poin kritis; di laga besar (SF/F, atau semua laga turnamen grade 1 / poin juara ≥ 9000) semua atribut +1 / −1,5. Efek di atlet setara: menang ±52 % (laga biasa).

## Morale lanjutan & sisa sifat (Fase 3)
- **Dipanggil ke skuad beregu**: semua anggota skuad +1 morale. Negara manajer: atlet sehat di pool yang posisinya lebih baik dari anggota terpilih terburuk segender tetapi tidak dipanggil −0,5. Kontingen multi-event individu tidak diberi bonus terpisah (skuad beregunya sudah).
- **Pasangan kompak**: mulai kemenangan beruntun ke-3, tiap kemenangan +0,3 untuk keduanya; kalah = rentetan direset. **Dibubarkan manajer** (bukan pasangan percobaan): kedua atlet −1,5.
- **Rekor pribadi** (sekali): gelar pertama +2 (di samping bonus juara biasa), menang pertama atas top 10 (ranking sebelum minggu itu) +1,5, ranking terbaik karier dalam 100 besar +0,5 tiap kali membaik.
- **Starter lambat**: penalti pemanasan awal game 1 ×3, +2 semua atribut di rubber game (setara: game 1 menang ±48 %, rubber ±58 %). **Pemburu momentum**: bobot momentum ×1,5 saat momentum memihaknya. **Konsisten**: kondisi hari itu ×0,5.
- **Mudah goyah**: penurunan morale ×1,5. **Jagoan kandang**: tambahan +1,5 morale di turnamen kandang. **Pemimpin**: pasangannya +0,3 tiap menang; rekan skuad beregu +0,5.
- **Pasangan ideal / sulit cocok**: laju kenaikan chemistry ×2 / ×0,5 per atlet (dikalikan, maks 5 %/laga).
- **Kalibrasi satu musim** (seed 11): > 55 % atlet aktif tetap Normal, < 2 % di ≥ 9,5.

## Perkembangan (Fase 4)
- **Kalah tipis = pengalaman**: kalah rubber game, atau setiap game selisih ≤ 3, dari lawan dengan CA ≥ 5 lebih tinggi → laga bernilai 1,4 (menang 1,5; kalah biasa 1; ×1,3 di turnamen besar).
- **Morale**: laju pertumbuhan kuartal ×(1 + 0,1 × morale/10), yaitu ±10 % pada morale ±10.
- **Lingkungan pelatnas**: atlet ≤ 23 th mendapat +2 % pertumbuhan per atlet top 20 (nomor mana pun) dari negaranya, maks +10 %.
- **Mentor**: atlet ≤ 21 th yang berpasangan (aktif, bukan dadakan) dengan atlet ≥ 25 th ber-CA ≥ +10: mental +1/tahun dan pertumbuhan +5 %.
- **Kembali lebih kuat**: sembuh dari cedera berat → 30 % peluang mental +2 (CA tetap ≤ PA).
- **Laporan kuartal** (Dashboard, 4 minggu setelah akhir kuartal): 3 atlet paling berkembang, junior ≤ 21 th yang mandek, senior ≥ 27 th yang menurun, dan sifat fisik/perkembangan yang baru terbaca musim ini.

## Pencarian bakat (Fase 5, `src/engine/scouting.ts`)
- **Profil kandidat**: kota asal diacak dari kota negaranya (atlet yang dibuat sejak fitur ini, termasuk junior AI); gaya bermain = dua atribut tertinggi.
- **Fokus pencarian** (berlaku akhir musim berikutnya): kandidat dibuat 2× lalu disaring menurut skor + derau 0–10. Tunggal = speed + stamina; ganda = net + serve + smash; penyerang = smash + deception; bertahan = defense + consistency; mentah = PA − CA − usia; siap pakai = CA. Seimbang = perilaku lama (tanpa penyaringan).
- **Catatan pemandu bakat**: tiap sifat asli (termasuk late bloomer/mandek) tercatat 60 %; 15 % ada satu petunjuk salah (sifat yang tidak dimiliki & tidak bertentangan); maks 3 catatan, bertanda "?".
- **Rentang potensi menyempit**: lebar 2 bintang di minggu 1, −0,5 per minggu sampai 0,5 di minggu 4; tetap memuat perkiraan potensi.
- **Rekrut bertahap & kandidat mundur**: "Rekrut terpilih" langsung memasukkan atlet dan mengurangi kursi; pencarian ditutup lewat "Selesai" atau batas minggu (tidak diisi otomatis lagi bila sudah pernah merekrut bertahap). Awal minggu 2–4, per gender 50 % satu kandidat acak mundur, tanpa membuat kandidat kurang dari sisa kursi.

## Instruksi interval (Live Match, `src/engine/match.ts`)
- Dipilih manajer sebelum laga, di interval, dan antar game; berlaku sampai jeda berikutnya lalu kembali ke "Tanpa instruksi". Hanya untuk laga yang ditonton; laga simulasi & lawan AI tanpa instruksi.
- Tenangkan diri: efek momentum lawan ×0,4, salah sendiri −0,4 %/reli. Tekan servis lawan: +3 duel saat menerima servis, energi ×1,05, salah sendiri +0,3 %. Hemat tenaga: −2 duel, energi ×0,65. Habis-habisan: +5 duel, energi ×1,6, salah sendiri +0,4 % (skala duel: strategi memberi ±5–7).
- Kalibrasi (atlet setara, instruksi sepanjang laga): tanpa instruksi menang 49 % (sisa energi 49); habis-habisan 63 % (sisa 8); hemat tenaga 45 % (sisa 80).
- Saran instruksi: energi < 35 dan lebih rendah dari lawan → hemat tenaga; momentum lawan > 0,35 → tenangkan diri; game penentu dengan energi ≥ 45 → habis-habisan; servis lawan ≥ 3 lebih rendah → tekan servis.

## Batas entry & mundur (aturan BWF)
- **Batas entry** (minggu sebelum minggu turnamen; dari prospektus/regulasi BWF, dibulatkan): Super 1000/750 6 minggu (±42 hari), Super 500/300 5 minggu (±35 hari), Super 100, grade 3 (IC/IS/FS) & kejuaraan kontinental 4 minggu, Kejuaraan Dunia 2 minggu; junior: Kejuaraan Dunia Junior 3 minggu, lainnya 4 minggu; nominasi skuad beregu 2 minggu (14 hari, regulasi Thomas & Uber Cup). WTF, Olimpiade & multi-event tanpa batas entry (kualifikasi / kontingen).
- Entry bisa diubah sampai minggu batas entry; di akhir minggu itu (sesudah turnamen minggu itu selesai, jadi entry masih bisa di-submit sesudah main turnamen) **daftar entry terbit** (negara AI & turnamen yang tidak di-submit diisi asisten AI saat itu, dengan ranking saat itu & kondisi atlet di awal minggu: cedera/lelah dari turnamen minggu itu tidak dihitung). Penerimaan langsung / kualifikasi / cadangan dihitung dari daftar ini. Turnamen awal Januari: batas entry paling awal minggu 1 tahun itu (kalender tahun berikutnya baru dibuat saat tahun berganti).
- **Setelah terbit** hanya bisa mundur: tanpa penalti sampai 2 minggu sebelum turnamen; minggu terakhir (±setelah batas mundur BWF) reputasi −1 per atlet/pasangan, kecuali cedera; atlet wajib (Top Committed) yang mundur tetap dihitung pelanggaran. Tempat kosong diisi cadangan berikutnya. Atlet yang cedera saat turnamen otomatis mundur; atlet AI yang terlalu lelah mundur tanpa penalti (kecuali turnamen wajibnya).
- **Skuad beregu**: dinominasikan lewat form entry sebelum batas; sesudahnya terkunci (tanpa pop-up saat turnamen). Tanpa nominasi → skuad otomatis; skuad yang tidak lagi sah (mis. cedera) → otomatis. Line-up tiap pertandingan tetap dipilih saat turnamen.
- Save lama: turnamen yang batasnya sudah lewat tetap bisa diisi sampai daftar entry terbit di minggu berikutnya.

## Protected ranking (BWF Player Commitment Regulations, daftar BWF 3 Jun 2026)
- Atlet tunggal/pasangan **32 besar** yang cedera ≥ 13 minggu (tingkat berat & kritis; tidak pensiun) otomatis mendapat protected ranking: poin ranking saat cedera dibekukan.
- Harus dipakai pertama kali (debut) paling lambat **52 minggu** setelah cedera; sejak debut berlaku **26 minggu** (182 hari). Debut = turnamen World Tour pertama yang di-entry memakai protected ranking.
- Hanya untuk **penerimaan entry World Tour** (Super 1000–100): peringkat entry = posisi poin yang dibekukan di ranking saat ini bila lebih baik dari peringkat sebenarnya. **Tidak untuk unggulan** (unggulan tetap dari ranking sebenarnya) dan tidak untuk turnamen lain. Daftar entry menampilkan "PR #n".
- AI memilih turnamen menurut peringkat terlindung itu. ASUMSI: pasangan memakai poin pasangan itu sendiri; aturan "poin terlindung + poin pasangan baru" untuk pasangan baru tidak dimodelkan. Pratinjau penerimaan entry di form entry belum memperhitungkannya.

## Youth Olympic Games (Regulations for Badminton Competition Dakar 2026)
- Tiap 4 tahun (2026 Dakar, minggu 45; badminton 1–5 Nov). Hanya **tunggal putra & putri**, masing-masing 32 peserta, usia ≤ 17 (tahun − tahun lahir).
- **8 unggulan** dari ranking junior; **8 grup × 4**, juara grup ke perempat final. ASUMSI: undian grup memakai sistem pot yang sama dengan turnamen bergrup lain (aslinya unggulan 1 → grup A, 2 → grup H, 3–4 diundi ke C/F).
- ASUMSI: satu atlet per negara per nomor (kuota NOC), dipilih menurut ranking junior lalu kemampuan; tanpa poin ranking & hadiah; prioritas kuota negara Afrika tidak dimodelkan. Tuan rumah berikutnya diundi di antara kota kandidat (Singapura, Bangkok, São Paulo, Kairo).
- Senegal (Dakar) ditambahkan ke daftar negara (Afrika; save lama mendapatkannya saat dimuat).

## Pemain independen & pasangan beda negara (2026-10-27)
- **Pemain independen** = atlet yang dilepas federasi (`released`): manajer melepas atlet negaranya sendiri; **negara AI** melepas atlet di akhir musim (sesudah pensiun). 10 atlet terkuat per gender (non-U19) tidak pernah dilepas; negara dengan ≤ 10 atlet senior per gender tidak melepas. Usia ≥ 24, atau 19–23 dengan PA di bawah kemampuan atlet ke-10 negaranya: 5%/musim; usia 19–23 lainnya 1%. Junior U19 tidak dilepas. Atlet independen negara AI tidak kembali ke pelatnas.
- ASUMSI: pemain independen di luar 100 besar (peringkat terbaik di semua nomor) **berhenti 35%/musim** di samping pensiun biasa (tanpa dana pelatnas). Kalibrasi (data asli, 7 musim): independen ±17 → ±150 (stabil), pasangan beda negara 4 / 16 / 25 / 41 / 50 / 65 / 82; tim beregu AI tetap lengkap. Angka-angka ini konstanta di `src/engine/independents.ts` (bukan ruleset, agar save lama ikut).
- **Pemasangan** (`pairIndependents`, akhir musim & langsung saat manajer melepas atlet): independen non-U19 usia ≥ 17, bukan spesialis tunggal / top 64 tunggal, tanpa pasangan utama di nomor itu. Calon dengan selisih kemampuan ≤ 5, terdekat dulu: senegara → sekonfederasi → mana pun. Chemistry awal 30–49. `formPairs` kini hanya memasangkan atlet federasi negara AI.
- **Turnamen**: pasangan beda negara hanya ikut turnamen terbuka (World Tour S1000–S100, WTF, IC/IS/FS); tidak Kejuaraan Dunia, Olimpiade, kontinental, multi-event, beregu, junior. Masuk ranking ganda dunia biasa. Negara peserta (undian, kuota WTF) = negara atlet pertama.
- **Tampilan**: dua bendera ("DEN/ENG"); di rekap medali dunia medali dihitung untuk kedua negara.
- **Paket data**: pasangan beda negara sah bila kedua atletnya `released`. Data asli: `realRoster` menandai kedua atlet pasangan beda negara sebagai independen; `scripts/fetch-bwf.mjs` kini menyimpan pasangan itu (negara tiap atlet dari profilnya sendiri) — perlu dijalankan ulang agar data bawaan memuatnya.

## Line-up beregu (2026-10-27)
- Satu pilihan per partai: tunggal = atlet, ganda = pasangan terdaftar di skuad atau "Ganda dadakan…" (dua pilihan atlet). Teks pilihan: nama (pasangan: nama belakang) · #ranking · kemampuan · ⚠ bila cedera/lelah di atas ambang istirahat AI. Partai yang melanggar batas partai / dobel nomor berwarna merah. Petunjuk lengkap di ikon ⓘ.

## BWF Player of the Year (2026-10-27)
- Kategori seperti BWF Player of the Year Awards 2025: Pemain Terbaik Putra (MS) & Putri (WS), Pasangan Terbaik MD/WD/XD, Eddy Choong Rising Star (semua atlet ≤ 21 tahun di tahun itu, nomor mana pun). Players' Player of the Year & para badminton tidak dimodelkan.
- **Nominasi** 3 minggu sebelum World Tour Finals (akhir minggu), 4 per kategori; **pemenang** di akhir minggu WTF, selalu salah satu nominasi. Musim tanpa WTF: tanpa penghargaan.
- ASUMSI skor = poin ranking senior yang diraih tahun itu + bonus gelar (OG/WC +20.000, WTF +10.000, S1000 +5.000, S750 +2.500); pemenang = skor tertinggi setelah ±5% acak. Murni prestise (tanpa efek morale/reputasi).
- Tampil di Berita (nominasi sampai pemenang diumumkan, lalu pemenang sampai akhir musim; atlet negara sendiri ditebalkan), profil atlet/pasangan (penghargaan & nominasi), dan Dunia → Rekor (pemenang per tahun). Save lama: mulai musim berjalan bila minggu nominasi belum lewat.
