# Pencarian bakat junior

Disetujui user 2026-10-15. Prinsip: tetap ringan — satu keputusan per musim, bisa diserahkan ke "Pilih otomatis".

## Alur

1. Akhir musim (`endYear` di `src/engine/season.ts`, tempat `newJuniors` dipanggil): negara lain tetap menerima
   junior otomatis seperti sekarang. Negara manajer **tidak** langsung menerima junior; sebagai gantinya dibuat
   daftar kandidat.
2. Kursi per gender = jumlah yang biasanya dihasilkan `newJuniors` untuk negara itu (tradisi). Kandidat per gender =
   2 × kursi (minimal 2 bila kursi 1). Kandidat dibuat dengan `generatePlayer` yang sama (usia 15–17).
3. Minggu 1–4 musim baru: kartu **Pencarian bakat** di Dashboard (di sebelah laporan akhir musim) — status
   "Belum dipilih (Putra 0/3 · Putri 0/3)" → membuka layar kandidat.
4. Layar kandidat: dua daftar (Putra, Putri). Kolom: nama, usia, kemampuan, gaya (tunggal/ganda), potensi
   (rentang bintang). Tombol pilih/batal per kandidat (tidak bisa melebihi kursi), **Pilih otomatis**, **Rekrut**.
   Rekrut = kandidat terpilih masuk `state.players` (pelatnas pratama seperti junior biasa), sisanya dibuang.
5. Tidak dipilih sampai minggu 4 lewat, atau saat "Maju 4 minggu" / "Sampai akhir musim": kursi diisi otomatis
   (urut nilai tengah rentang bintang, lalu kemampuan). Junior tidak pernah hilang.

## Rentang bintang

- Bintang asli = `potentialStars` yang sama dengan di Skuad (dihitung dari PA).
- Tampilan = rentang selebar 2 bintang (mis. ★★★–★★★★★) yang selalu memuat nilai asli; posisi nilai asli di
  dalam rentang diacak saat kandidat dibuat dan disimpan (tidak berubah bila layar dibuka ulang).
  Dibatasi ke ½–5 bintang.
- Setelah direkrut: potensi tampil seperti atlet lain.

## Data

- `SeasonState.scouting?: { year: number; slots: { M: number; F: number }; candidates: Player[];
  starRange: Record<string, [number, number]> }`. Tidak ada = tidak ada pencarian aktif (save lama aman).
- Dihapus setelah Rekrut / pengisian otomatis.

## Test

Engine: akhir musim membuat kandidat (2× kursi) untuk negara manajer saja; pengisian otomatis mengisi tepat sejumlah
kursi; rentang bintang selalu memuat nilai asli.

## i18n

Teks baru id + en: judul kartu & layar, status, tombol (Pilih otomatis, Rekrut), keterangan rentang bintang.
