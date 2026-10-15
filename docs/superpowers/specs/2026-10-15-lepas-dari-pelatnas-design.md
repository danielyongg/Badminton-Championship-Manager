# Lepas dari pelatnas

Disetujui user 2026-10-15.

- Tombol **Lepas dari pelatnas** di profil atlet negara manajer (aktif, belum dilepas), dengan konfirmasi.
  Profil menampilkan "Keluar pelatnas {tahun}".
- **Panggil kembali** (revisi 2026-10-15): sub-tab **Non-pelatnas** di Skuad (keempat, setelah Pairs) mendaftar atlet
  yang dilepas (senior & junior) dengan tombol Panggil kembali; tombol yang sama di profil. Pasangan bentukan AI
  selama di luar pelatnas dibubarkan (`recallPlayer`).
- Data: `Player.released?: number` (tahun). Atlet tetap aktif & berkebangsaan sama.
- Bagi manajer: tidak muncul di Skuad (Single/Pairs/form pasangan), entry mingguan, Rencana musim, kartu Cedera,
  ringkasan Federasi, dan skuad/line-up beregu. Entry manual & prioritas tier diabaikan (`isManaged` di
  `src/engine/season.ts`).
- Bagi dunia: AI mendaftarkannya ke turnamen seperti atlet negara lain (rentang ranking & peluang ikut).
  Ranking, hasil & gelarnya tetap tercatat; pelanggaran Top Committed-nya tidak mengurangi reputasi manajer.
- Pasangan: saat dilepas, pasangan dengan anggota pelatnas dibubarkan (`releasePlayer` di `src/engine/career.ts`).
  `formPairs` di akhir musim memasangkan sesama atlet yang dilepas (negara manajer), tidak dengan anggota pelatnas.
- Target federasi (gelar, top 10) tidak menghitung atlet yang dilepas.
