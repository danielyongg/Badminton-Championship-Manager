# Alur turnamen per babak & live match (gaya Badminton Championship Manager)

Tanggal: 2026-10-14 · Status: disetujui (pendekatan 1 — gerbang babak)

## Tujuan

Mengganti alur minggu turnamen agar mirip game aslinya: tiap minggu manajer melihat turnamen yang berlangsung,
memilih mana yang dimainkan, menonton drawing, lalu turnamen berjalan **per babak** (semua nomor sekaligus) dengan
**live match untuk setiap laga atlet negara sendiri**.

## Keputusan (dari diskusi)

| # | Pertanyaan | Keputusan |
|---|---|---|
| 1 | Seberapa sering live match | **Setiap laga atlet/pasangan negara kita** muncul satu per satu, dengan tombol "Simulasikan laga ini" & "Simulasikan sisa babak". |
| 2 | Beberapa turnamen di satu minggu | **Bisa memainkan lebih dari satu**, satu per satu; kembali ke daftar minggu setelah selesai. Yang tidak dipilih tetap berjalan otomatis. |
| 3 | Maju 4 minggu / sampai akhir musim & pengaturan lama | Tetap **serba otomatis**. Pengaturan Live Match, Live drawing, pop-up entry mingguan & mode beregu Otomatis/Manual **dihapus**. |
| 4 | Turnamen beregu | Pop-up **line-up**, lalu **kelima partai live** satu per satu (tombol simulasi yang sama). |
| — | Pendekatan engine | **Gerbang babak**: nomor-nomor satu turnamen berjalan bersamaan dan menunggu satu sama lain di akhir tiap babak. Logika undian/kualifikasi/grup/knockout tidak diubah. |

## Alur pengguna

1. **Maju 1 minggu** → layar **Turnamen minggu ini** (pop-up penuh):
   - Daftar turnamen individu & beregu minggu itu: nama, tier, kota, status entry (Entry dikirim / Belum diisi / Otomatis untuk junior & WTF).
   - Tombol **Mainkan** per turnamen. Nonaktif (abu-abu, dengan keterangan) bila entry turnamen itu belum di-submit
     (`state.entriesSubmitted["tahun:eventId"]`). Turnamen junior & WTF (entry otomatis) boleh dimainkan.
   - Tombol **Lewati semua / Lewati sisanya**: semua turnamen yang belum dimainkan disimulasikan otomatis, minggu selesai.
   - Turnamen yang sudah dimainkan ditandai ✓ dan tidak bisa dipilih lagi.
2. **Mainkan turnamen individu**:
   1. **Drawing**: live drawing tiap nomor (komponen `LiveDraw` yang ada), dengan tombol "Lewati drawing" (lewati semua nomor sekaligus).
   2. **Layar babak**: judul `Turnamen · Babak` (mis. "Kualifikasi R1", "Grup", "R32", "R16", "QF", "SF", "F"); daftar laga babak itu
      dikelompokkan per nomor (MS/WS/MD/WD/XD), laga negara kita disorot. Sebelum dimainkan: pasangan laga tanpa skor + tombol **Mainkan babak**.
   3. Saat **Mainkan babak**: laga negara kita muncul satu per satu sebagai **Live Match** (urut nomor lalu urutan bagan).
      Tombol: **Simulasikan laga ini** (laga itu langsung selesai) & **Simulasikan sisa babak** (semua laga kita yang tersisa di babak ini
      disimulasikan tanpa pop-up). Laga negara lain langsung disimulasikan.
   4. Setelah semua laga babak selesai: skor tampil di layar babak + tombol **Babak berikutnya** (atau **Selesai** setelah final →
      ringkasan juara kelima nomor → kembali ke daftar minggu).
   - Nomor yang sudah selesai (bagan lebih kecil) tidak muncul lagi di babak berikutnya; nomor yang belum mulai (mis. tanpa kualifikasi)
     muncul mulai babak pertamanya.
   - Laga dua atlet negara kita (derbi) tetap live; sisi "kita" = sisi pertama.
3. **Mainkan turnamen beregu**: drawing grup (komponen yang ada) → per babak (Grup hari 1/2/3, QF, SF, F) dengan skor semua tim.
   Untuk pertandingan negara kita: pop-up **line-up** (komponen `TieLineupModal` yang ada), lalu kelima partai live satu per satu
   dengan tombol simulasi yang sama.
4. **Maju 4 minggu / Sampai akhir musim**: tanpa layar apa pun (perilaku saat ini).

## Desain engine

### Gerbang babak (`RoundGate`)

- Hook baru di `WeekHooks`:
  - `chooseEvent?: (req: { week; events: { id; kind: 'individual' | 'team' }[]; played: string[] }) => Promise<string | null>` —
    dipanggil berulang; mengembalikan id turnamen yang dimainkan, atau `null` = simulasikan sisanya.
  - `round?: (req: RoundShow) => Promise<void>` — dipanggil **sebelum** (fase `pending`, pasangan laga) dan **sesudah** (fase `done`, skor)
    tiap babak turnamen yang sedang dimainkan.
- `playWeek` dipecah: (a) persiapan minggu (kelelahan, entry, junior) tetap; (b) loop `chooseEvent` — turnamen terpilih dijalankan
  **interaktif** (hook `draw`, `round`, `live` aktif), sisanya **otomatis** (semua hook mati) setelah `null` atau semua dimainkan;
  (c) urutan hasil (`results`, `eventRecords`, hadiah, juara, kelelahan) sama seperti sekarang.
- Turnamen interaktif: kelima `runEvent` dijalankan **bersamaan** (`Promise.all`). Fungsi `play` yang diberikan ke tiap nomor dibungkus
  sehingga laga dikumpulkan per babak: setiap nomor menunggu di gerbang sampai semua nomor yang masih aktif mencapai akhir babak yang sama
  (urutan babak global: kualifikasi R1.., grup, R64, R32, R16, QF, SF, F). Gerbang lalu memanggil hook `round` (pending → main → done).
  Drawing kelima nomor terjadi sebelum babak pertama (hook `draw` diantrekan satu per satu).
- Live match hanya dipanggil untuk laga yang melibatkan negara manajer, dengan status "lewati" per babak (Simulasikan sisa babak).
- Determinisme: urutan pemanggilan RNG berubah untuk turnamen interaktif, tetapi tetap deterministik untuk input yang sama.
  Turnamen otomatis tetap memakai jalur lama (nomor berurutan) → test yang ada tidak berubah.
- Beregu: `playTeamWeek` menerima opsi interaktif yang sama; babak = hari grup / babak gugur; hook `team.lineup` & `live` per partai.

### Data

- Tidak ada perubahan format save. `entriesSubmitted` sudah ada.
- Pengaturan yang dihapus: state UI `liveMode`, `drawMode`, `entryMode`, dan `state.teamAuto` (diabaikan bila ada di save lama).

## Komponen UI

- `WeekScreen` (baru): daftar turnamen minggu ini + tombol Mainkan / Lewati.
- `RoundScreen` (baru): laga satu babak dikelompokkan per nomor; tombol Mainkan babak / Babak berikutnya / Selesai.
- `LiveMatch` (ada): tambah tombol **Simulasikan laga ini** & **Simulasikan sisa babak** (menggantikan "Auto sisa minggu").
- `LiveDraw` (ada): tombol **Lewati drawing**.
- `TieLineupModal` (ada): dipakai apa adanya.
- Career: tombol Maju 1 minggu memakai alur baru; Maju 4 minggu & Sampai akhir musim tanpa hook; tab Pengaturan tanpa 3 pengaturan lama.
- Mobile: semua layar baru mengikuti pola yang ada (modal penuh di HP, tombol ≥ 36px, bilah aksi di bawah).

## Pengujian

- Test engine baru:
  - Turnamen interaktif dengan hook `round` mencatat urutan babak: tiap babak muncul sekali, berurutan, mencakup semua nomor yang aktif;
    hasil (juara, `eventRecords`, `results`) sah dan lengkap untuk kelima nomor.
  - `chooseEvent` → `null` langsung: hasil minggu setara dengan jalur otomatis (jumlah laga, juara per nomor ada).
  - Hook `live` hanya dipanggil untuk laga negara manajer; "Simulasikan sisa babak" menghentikan pop-up sampai babak berikutnya.
  - Beregu interaktif: line-up diminta untuk tiap pertandingan negara kita; skor pertandingan sah.
- Test yang ada (140) tetap lolos.
- UI dicek lewat screenshot mobile (390×844) dengan Playwright: layar minggu, drawing, babak (pending & done), live match, beregu.

## Di luar cakupan

- Mengubah logika undian, kualifikasi, grup, knockout, atau simulasi laga.
- Menonton laga negara lain secara live.
