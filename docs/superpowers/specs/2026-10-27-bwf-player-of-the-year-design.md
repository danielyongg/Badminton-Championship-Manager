# BWF Player of the Year — desain

Tanggal: 2026-10-27 · Status: disetujui user (versi BWF saja, nominasi ditampilkan sebelum WTF)

## Kategori
Seperti BWF Player of the Year Awards 2025: Pemain Terbaik Putra (MS), Pemain Terbaik Putri (WS), Pasangan Terbaik MD / WD / XD, Eddy Choong Rising Star (atlet/pasangan ≤ 21 tahun, nomor mana pun). Tanpa Players' Player of the Year & para badminton. Tanpa efek ke permainan.

## Jadwal
- Nominasi: akhir minggu WTF − 3, 4 per kategori, dari hasil musim sampai minggu itu.
- Pemenang: akhir minggu WTF, salah satu nominasi, skor dihitung ulang dengan hasil WTF.

## Skor
Poin ranking senior yang diraih tahun itu + bonus gelar (OG/WC +20.000, WTF +10.000, S1000 +5.000, S750 +2.500). Pemenang = skor tertinggi setelah ±5% acak.

## Data
`SeasonState.awards?: AwardYear[]` (`{ year, nominees: Record<cat, EntrantId[]>, winners? }`), dihitung di `updateAwards` (`src/engine/awards.ts`) di akhir tiap minggu.

## Tampilan
- Berita: "Nominasi BWF Player of the Year {tahun}" lalu "Pemenang …" (atlet negara sendiri ditebalkan).
- Profil atlet/pasangan (tab turnamen): daftar penghargaan & nominasi.
- Dunia → Rekor: pemenang per tahun.

## Tes
Nominasi = 4 skor tertinggi; Rising Star ≤ 21 tahun; pemenang ∈ nominasi; satu entri per tahun; `awardsOf` menemukan pemenang.
