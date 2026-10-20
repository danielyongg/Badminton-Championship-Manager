# Tampilan laptop (desktop) — rancangan

Tanggal: 2026-10-20 · Status: disetujui user

## Tujuan
Tampilan di browser laptop rapi dan enak dimainkan. Selama ini fokus ke HP & web app iOS; tampilan HP (≤700px) **tidak boleh berubah**.

## Masalah yang terlihat (lebar ±1100–1440px)
- Tidak ada lebar maksimum: tabel Kalender melebar kosong, tabel ranking World sempit di kiri, kotak pilihan melebar penuh.
- Skuad terpotong di kanan (kolom "Atur sektor" & tombol Lepas).
- Dashboard berlubang (kartu tak sama tinggi → ruang kosong).
- Bilah atas padat tanpa hierarki; menu tab kecil.
- Menu utama rata kiri dengan ruang kosong besar.

## Keputusan
- Navigasi laptop: **menu samping** (gaya game manajer).
- Sub-tab tiap halaman tetap **baris tab di atas isi** (tidak bertingkat di menu samping).
- Pendekatan: **tata letak CSS di atas markup yang ada** + satu pembungkus isi halaman. Tidak ada komponen kerangka terpisah untuk desktop (satu sumber navigasi).

## A. Kerangka

### ≥1024px
- **Bilah atas** (`header.shell`) penuh lebar, menempel di atas:
  - Kiri: bendera + negara, tahun · minggu, reputasi, status simpan.
  - Kanan: **Maju 1 minggu** (primer), Maju 4 minggu, Sampai akhir musim; indikator "Mensimulasikan…" + Berhenti di sini juga.
- **Menu samping** (`nav.maintabs`) lebar ±200px, menempel di bawah bilah atas, tinggi penuh layar:
  - Halaman utama tersusun vertikal; item aktif ditandai garis hijau di kiri + latar lembut.
  - Item 🏸 Live (saat turnamen berjalan) di paling atas.
  - Tombol **Menu utama** tampil di bawah menu samping. Markup tidak dipindah (tetap di header); pada ≥1024px CSS menempatkannya `position: fixed` di kiri bawah, selebar menu samping. HP/tablet tidak terpengaruh.
- **Isi halaman** dibungkus `<div className="page">` (bilah "Kembali ke turnamen" + konten tab/profil/turnamen/hub): maksimal ±1200px, rata tengah di area kanan, jarak tepi 24px.
- `main` memakai CSS grid: kolom 1 menu samping, kolom 2 isi; header membentang dua kolom. Pop-up (Live Match, skuad, line-up) tetap overlay seperti sekarang.

### 701–1023px (tablet)
Menu tab tetap di atas seperti sekarang; `.page` ikut dibatasi lebarnya dan rata tengah.

### ≤700px (HP / web app)
Tidak berubah: bilah maju tetap di bawah layar, menu tab geser di atas, tombol Menu utama di header.

## B. Perbaikan per halaman (≥1024px)
- **Dashboard (`.dash`)**: kartu dalam kolom yang mengalir ke bawah — 3 kolom pada ≥1280px, 2 kolom pada 1024–1279px (CSS multi-column dengan `break-inside: avoid`), sehingga tidak ada lubang. Urutan baca menjadi per kolom (atas → bawah), dapat diterima untuk dashboard.
- **Skuad**: kolom nama menempel di kiri (`position: sticky`); bila tabel tetap lebih lebar dari isi halaman, tabel bergeser di dalam wadahnya (bukan halaman). Kolom "Atur sektor" diringkas agar tombol Lepas tidak terpotong.
- **Tabel lain** (Kalender & Entry, World → Ranking, daftar entry): lebar mengikuti isi halaman; kotak pilihan (Jenis, Per minggu, dll.) tidak melebar penuh (lebar wajar, mis. maks 320px).
- **Menu utama (layar awal, `.menu`)**: rata tengah, lebar ±900px, judul lebih besar; form game baru & daftar save tersusun rapi.
- **Halaman turnamen, layar babak (`.hub`), Live Match**: rata tengah, mengikuti lebar maksimum yang sama.

## C. Pengecekan
- Browser: 1280×800, 1440×900, 1920×1080 — Dashboard, Skuad, Kalender & Entry, World (Ranking/Kalender/Negara), Federasi, halaman turnamen, layar babak & Live Match, menu utama.
- HP 390px: tampilan sama seperti sebelum perubahan (bandingkan tangkapan layar sebelum/sesudah).
- Tes otomatis (`npx vitest run`) tetap lolos; typecheck (`npx tsc -b`) bersih.

## Di luar cakupan
- Tema warna/tipografi baru (tetap gaya "Arena" + warna "Lapangan").
- Perubahan alur permainan atau fitur.
- Tampilan HP & web app.
