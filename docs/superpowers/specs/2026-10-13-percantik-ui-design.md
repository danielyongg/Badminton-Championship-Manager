# Percantik UI — desain visual baru

Tanggal: 2026-10-13. Bagian pertama "Tahap akhir — Percantik UI" di `docs/RENCANA.md`. Mockup yang disetujui ada di `.superpowers/brainstorm/` (tidak di-commit).

## Keputusan gaya
- **Gaya A "Arena"** (rapat ala Football Manager): tab bergaris bawah, judul kartu kecil kapital, tabel rapat, tombol utama penuh kapital.
- **Palet B "Lapangan"**: hijau lapangan sebagai aksen, emas untuk sorotan, merah untuk kalah/turun.
- **Dua tema** terang & gelap + pilihan tema di header: *Otomatis / Terang / Gelap*.
- **Live Match**: papan skor ala TV (opsi A), tanpa lapangan mini.
- **Bendera**: gambar SVG untuk 47 negara game.

## Pendekatan
Token CSS di `src/ui/style.css` + dua komponen kecil (`ThemeToggle`, `Flag`). Markup komponen yang ada hampir tetap; hanya beberapa class baru & warna inline diganti token. Tanpa library UI baru. Logika engine tidak disentuh.

## 1. Fondasi tema
**Token** (nama → terang / gelap):

| Token | Terang | Gelap |
|---|---|---|
| `--bg` | `#f4f6f3` | `#0e1613` |
| `--surface` (kartu, modal, header) | `#ffffff` | `#16241e` |
| `--fg` | `#1d2a24` | `#dce8e1` |
| `--muted` | `#6b7a72` | `#87998f` |
| `--line` | `#e3e8e4` | `#23362d` |
| `--accent` (tombol, tab aktif) | `#0b6b45` | `#2fa874` |
| `--accent-strong` (teks aksen) | `#0b6b45` | `#5fd39e` |
| `--accent-soft` (latar baris saya) | `#e8f5ee` | `#1b3329` |
| `--on-accent` (teks di atas aksen) | `#ffffff` | `#06120d` |
| `--gold` / `--gold-soft` | `#8a6200` / `#fff4d6` | `#f0c35a` / `#3a3016` |
| `--danger` / `--danger-soft` | `#c0392b` / `#fbe9e7` | `#ef6a5b` / `#3a1d1a` |

Token lama dipetakan: `--line` tetap, `--accent` tetap namanya, `--series-1/2` tetap (grafik) dengan nilai per tema.

**Mode tema**: `data-theme="light" | "dark"` di `<html>`; tanpa atribut = otomatis (`prefers-color-scheme`). CSS: token terang di `:root`, token gelap di `@media (prefers-color-scheme: dark) { :root:not([data-theme=light]) {…} }` dan `:root[data-theme=dark] {…}`. `color-scheme` ikut tema agar kontrol bawaan (select, scrollbar) sesuai. Pilihan disimpan di localStorage `bcm-theme` (`auto|light|dark`, dibaca dalam try/catch seperti `bcm-lang`) dan diterapkan sebelum render pertama di `main.tsx` agar tidak berkedip.

**ThemeToggle**: `<select>` Otomatis/Terang/Gelap di menu utama & header karier, di sebelah `LangSelect`. Teks lewat i18n (`theme`, `theme_auto`, `theme_light`, `theme_dark`).

**Huruf**: Barlow via `@fontsource/barlow` (bobot 400/600/800, dibundel → jalan offline & di GitHub Pages). `font-family: Barlow, system-ui, sans-serif`. Angka tabel `font-variant-numeric: tabular-nums`.

**Bendera**: 47 SVG dari `flag-icons` (MIT, 4×3) disalin sekali ke `src/assets/flags/<id>.svg` dengan nama kode game (INA, ENG, SCO, …; ENG/SCO = gb-eng/gb-sct). Sumber & lisensi dicatat di `src/assets/flags/README.md`. Dimuat dengan `import.meta.glob('../assets/flags/*.svg', { eager: true, query: '?url', import: 'default' })`. Komponen `<Flag id>`: `<img>` 14×10 (`alt` = kode negara, sejajar teks); negara tanpa file (dibuat di Editor) → label kode 3 huruf `.tag`. Bukan dependensi runtime.

## 2. Tampilan per layar
- **Body & header**: latar `--bg`; header `.shell` latar `--surface`, judul Barlow 800, tanggal (tahun · minggu) warna `--accent-strong`. Pengaturan tetap di `details.settings`.
- **Tab** (`main > nav.controls` & tab lain yang memakai `aria-pressed`): tombol datar, teks `--muted`; aktif = teks `--fg` + garis bawah 2px `--accent`. Mobile tetap satu baris geser.
- **Tombol**: bawaan datar (latar `--surface`, garis `--line`, radius 4px); tombol utama `.primary` = latar `--accent`, teks `--on-accent`, 800 kapital. `.primary` dipasang pada aksi utama: main minggu/simulasi, mulai/jeda Live Match, konfirmasi di pop-up (skuad, line-up, entry), lanjut setelah drawing/laga. `:disabled` redup. `:focus-visible` cincin `--accent`.
- **Isian** (select/input): latar `--surface`, garis `--line`, radius 4px.
- **Kartu**: latar `--surface`, garis `--line`, radius 6px; `h2/h3` kartu kecil kapital, spasi huruf .06em, warna `--muted`.
- **Tabel**: `th` kecil kapital `--muted`, latar `--surface` (lengket); pemisah baris `--line`; baris saya (`tr.sel`, `tr.mine`) latar `--accent-soft`; `.mine` teks `--accent-strong`.
- **Warna inline di TSX** diganti token: `LiveMatch` bar energi `#1a8f3a` → `var(--accent)`; `Squad` (bintang/kelelahan `#c0392b`, `#d4a017`, `#1a8f3a`) → `--danger`, `--gold`, `--accent`. `.up/.down/.stars/.flash` memakai `--accent-strong/--danger/--gold`.
- **Bendera** ditampilkan di: tabel ranking, skuad & profil (negara), bagan turnamen individu & beregu, papan skor Live Match, tim beregu (kekuatan, grup, hasil), live drawing (mangkuk & bagan). Cara: `entrantLabel` tetap; tampilan memakai `<Flag id={country} />` di depan nama.
- **Bagan** (`.bracket/.round/.match`, individu & beregu): kotak laga = kartu kecil `--surface`; pemenang tebal, kalah `--muted`; laga atlet saya garis kiri 3px `--accent`; judul babak kecil kapital. Tanpa garis penghubung antar-babak.
- **Live Match (opsi A)**: papan skor — poin berjalan di kotak besar (latar `--fg`, teks `--surface`; sisi saya latar `--accent`), skor game sebelumnya `--muted`, titik servis `--gold`, bar energi. Catatan rally: chip jenis poin (poin saya `--accent-soft/--accent-strong`, lawan `--danger-soft/--danger`). Statistik tabel rapat. Momentum: gradien `--danger` → `--line` → `--accent`. Bar mini (`.livebar`) memakai `--surface` & bayangan.
- **Modal & pop-up** (Live Match, live drawing, skuad, line-up, entry): latar `#000a` + `backdrop-filter: blur(2px)`; kartu `--surface`. Live drawing: `.flash` `--gold-soft`, pengumuman Barlow 800.

**Di luar cakupan**: perubahan tata letak/alur (tahap UX berikutnya), avatar atlet, animasi selain transisi warna 150ms, lapangan mini Live Match, garis penghubung bagan.

## Pengujian
- `npx tsc -b` dan `npx vitest run` lolos.
- Tes baru (`src/ui/flags.test.ts`): tiap negara di `WORLD.countries` punya `src/assets/flags/<id>.svg`.
- Cek visual di browser (dev server port 5173): dashboard, ranking, skuad, bagan turnamen, Live Match, live drawing, pop-up line-up — masing-masing tema terang, gelap, dan lebar HP (≈390px). Tema bertahan setelah muat ulang; mode Otomatis ikut pengaturan sistem.
