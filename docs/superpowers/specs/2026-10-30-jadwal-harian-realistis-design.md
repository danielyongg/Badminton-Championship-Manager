# Jadwal harian realistis (order of play, lapangan, kelelahan antar hari)

Tanggal: 2026-10-30 · Status: **dikerjakan (tahap 1–6)** — keputusan di bagian akhir

## Tujuan

Turnamen berjalan **per hari pertandingan**, bukan per babak, dengan order of play per lapangan dan perkiraan jam.
Jadwal ikut memengaruhi permainan: laga panjang, main dua nomor sehari, dan hari beruntun menguras energi;
cedera bisa terjadi di tengah turnamen. Prinsip game ringan tetap dipegang: **semua jadwal dibuat otomatis**,
manajer hanya punya satu keputusan baru yang opsional (mundur dari satu nomor).

## Kondisi kode sekarang (titik ubah)

| Bagian | Sekarang | Dampak |
|---|---|---|
| `engine/gate.ts` `roundGate` | Semua nomor jalan bersama, berhenti di akhir tiap **babak**; babak `G` (grup) = satu kali jalan | Unit jeda diganti **hari**; satu babak bisa dibagi beberapa hari |
| `ui/WeekFlow.tsx` `RoundScreen` | Satu layar per babak, tab per nomor, hasil babak lalu tidak bisa dibuka lagi | Diganti layar **Jadwal per hari** |
| `engine/season.ts` ±baris 994 | Kelelahan (`fatigue.perMatch` = 5) & cedera dihitung **setelah turnamen selesai** | Dipindah ke **per laga/per hari** di dalam turnamen |
| `engine/match.ts` `createMatch` | Energi awal = 100 − kelelahan × 0,4 (kelelahan sebelum turnamen) | Ditambah **kelelahan turnamen** (berjalan) |
| `engine/tournament.ts` `nextDayForm` | Kondisi hari itu terbawa antar **laga** | Dua laga di hari yang sama memakai kondisi yang sama |
| Preset 2027 | S1000 tunggal 48 (16 grup × 3), WC dengan grup | Templat hari harus mendukung **hari-hari grup** & turnamen 11 hari |

## Fakta acuan (dicek 2026-10-30; perlu dicek ulang saat implementasi)

- Super 1000/750 (s/d 2026): R32 Selasa–Rabu, R16 Kamis, QF Jumat, SF Sabtu, F Minggu (6 hari).
- Super 100–500: kualifikasi Selasa, R32 Rabu, lalu sama (6 hari).
- Mulai 2027: Super 1000 berlangsung **11 hari** (dua akhir pekan); tunggal 48 pemain dengan fase grup.
- GCR 11.3 (dikutip regulasi Grade 3 Oceania): atlet berhak **istirahat minimal 60 menit** antar laga.
  Satu babak yang sudah dimulai harus selesai di hari yang sama; QF & SF boleh dibagi dua sesi di hari yang sama.
- Instant Review (Hawk-Eye) aslinya hanya di **lapangan TV**.

## Rancangan

### 1. Templat hari (data, bisa diubah di Editor)

`Tier.schedule?: { days: number; courts: number[]; tvCourts: number }`:
- `days` = jumlah hari (S100–S1000 2026: 6; S1000 2027: 11; WC: 7; WTF: 5; OG: 9).
- `courts[i]` = jumlah lapangan di hari ke-i (mis. 4 di hari awal, 2 mulai QF, 1 di final).
- `tvCourts` = lapangan bersiaran (Hawk-Eye, laga unggulan / tuan rumah).

Penjadwal **otomatis** (`engine/schedule.ts`, fungsi murni):
1. Final di hari terakhir, SF sehari sebelumnya, QF sebelumnya, dst. (mundur).
2. Babak yang laganya melebihi kapasitas hari itu (lapangan × ±9 laga per lapangan per hari) dibagi ke beberapa hari:
   separuh bagan atas di hari pertama, bawah di hari berikutnya (seperti R32 Selasa–Rabu).
3. Fase grup: satu **matchday** per putaran grup (grup 3 = 3 matchday, grup 4 = 3 matchday dengan 2 laga).
4. Tanpa `schedule` di tier → turunan dari jumlah babak (kompatibel dengan ruleset buatan sendiri & save lama).

### 2. Order of play per hari

- Tiap hari: laga dibagi ke lapangan; **lapangan TV** dapat laga unggulan teratas & atlet tuan rumah.
- Urutan dalam sehari mengikuti babak lalu urutan bagan; **atlet yang main dua nomor** diberi jarak ≥ 60 menit
  (aturan GCR 11.3); bila tidak muat, laga keduanya digeser ke akhir hari.
- **Perkiraan jam**: mulai 10.00 (hari besar: sesi siang 10.00 & sesi malam 17.00); durasi laga memakai perkiraan
  yang sudah ada di statistik (`stats.sec`), rata-rata ±50 menit sebelum laga dimainkan.

### 3. Dampak ke permainan (realisme)

1. **Kelelahan turnamen** (baru, per atlet, hanya selama minggu turnamen):
   - Tiap laga menambah kelelahan sebanding **durasi laga** (laga 3 game 80 menit ≫ laga 2 game 30 menit).
   - Laga kedua di hari yang sama: istirahat hanya beberapa jam → pemulihan kecil.
   - Ganti hari: pulih sebagian (tidur), lebih banyak dengan sifat *quickRecovery*.
   - Energi awal laga = 100 − (kelelahan sebelum turnamen + kelelahan turnamen) × faktor.
   - **Kalibrasi**: total kelelahan seminggu dibuat setara `perMatch` = 5 per laga rata-rata agar
     keseimbangan musim (istirahat, entry otomatis AI) tidak bergeser. Tes kalibrasi membandingkan sebaran lama vs baru.
2. **Cedera di tengah turnamen**: peluang per laga (rumus yang sama) dihitung **saat laga itu**, memakai kelelahan
   berjalan. Cedera → atlet **walkover** di laga berikutnya (field `walkover` sudah ada) dan mundur dari nomor lain.
3. **Kondisi hari itu**: satu nilai per atlet per **hari** (dua nomor sehari = kondisi sama); "on fire" tetap terbawa antar hari.
4. **Hawk-Eye hanya di lapangan TV** pada hari-hari awal; mulai QF semua lapangan (yang tersisa) lapangan TV.
   Live Match menampilkan "Court 1 (TV) · ±14.30".

### 4. Keputusan manajer (opsional, satu saja)

- **Mundur dari satu nomor** (mis. lepas XD agar fokus MD) saat atlet main dua nomor atau kelelahan turnamennya tinggi.
  Asisten memberi saran ("Fajar main 2 laga hari ini, energi awal laga kedua ±62") — tidak wajib ditanggapi.
- Selain itu tidak ada pengaturan baru; jadwal, lapangan & jam sepenuhnya otomatis.

### 5. Tampilan

- **Tab Jadwal**: strip hari (Sel 3 · Rab 4 · … · Min 8) — hari ini disorot, hari lalu bisa dibuka (hasil), hari depan
  menampilkan jadwal sementara. Isi hari: daftar per lapangan dengan jam, filter nomor (Semua/MS/…/XD) & **Atlet saya**,
  laga atlet sendiri disorot, ikon ⚡ untuk atlet dengan laga kedua hari itu.
- **Alur main**: tombol *Mainkan hari ini* → laga diputar urut jam; laga atlet sendiri Live (seperti sekarang,
  tombol Live/Skip per laga & semua tetap ada); selesai → *Hari berikutnya*. *Simulasikan sisa turnamen* tetap ada.
- **Live Match**: panel kondisi menambah "kelelahan turnamen" & "laga ke-2 hari ini"; judul memuat lapangan & jam.

### 6. Beregu

Satu **tie per hari** (Thomas/Uber/Sudirman: grup 3 hari, lalu QF/SF/F), partai dalam tie mengikuti urutan line-up.
Kelelahan berlaku per atlet (atlet yang main tunggal & ganda di satu tie terdampak). Dikerjakan terakhir.

## Tahapan (tiap tahap bisa di-deploy sendiri)

| Tahap | Isi | Mengubah hasil laga? |
|---|---|---|
| 1 | `engine/schedule.ts`: templat hari, pembagian babak/grup ke hari, lapangan, order of play, perkiraan jam + tes | Tidak |
| 2 | Gerbang per hari (`gate.ts`) + layar **Jadwal per hari** menggantikan `RoundScreen` (strip hari, riwayat) | Tidak |
| 3 | Kelelahan turnamen, energi awal, dua nomor sehari, kondisi per hari, cedera di tengah turnamen + walkover; **kalibrasi** + `docs/ASUMSI.md` | **Ya** |
| 4 | Lapangan TV: Hawk-Eye hanya di lapangan TV, info lapangan/jam di Live Match | Sedikit |
| 5 | Mundur dari satu nomor + saran asisten | Ya (keputusan manajer) |
| 6 | Beregu per hari | Ya |

Tahap 1–2 = tampilan realistis tanpa risiko keseimbangan; tahap 3 = inti realisme dan butuh penyetelan.

## Risiko

- **Keseimbangan musim** (tahap 3): kelelahan & cedera yang lebih "nyata" bisa membuat atlet top lebih sering absen.
  Mitigasi: kalibrasi total mingguan setara aturan lama, tes sebaran, angka di ruleset (bisa disetel di Editor).
- **Kecepatan simulasi**: penjadwal berjalan untuk semua turnamen (juga yang tidak dimainkan); harus O(jumlah laga).
- **Save lama**: semua field baru opsional; turnamen tidak disimpan di tengah minggu, jadi tidak perlu migrasi state.

## Keputusan (2026-10-30)

1. Mundur dari nomor: **tombol** (panel "main 2 nomor hari ini" di layar hari, 💡 saran = nomor laga keduanya).
2. Cedera: **juga retired di tengah laga** (lalu walkover di sisa laga semua nomor).
3. Jadwal: **urutan & lapangan saja**, tanpa jam.
4. Turnamen otomatis: **ikut kelelahan per hari**.

## Yang dikerjakan vs rancangan

- Kondisi hari itu tetap per laga (bukan per hari): MD & XD adalah peserta berbeda, jadi efeknya kecil.
- Laga siaran (📺, Hawk-Eye) = QF ke atas, unggulan 1–4, atau atlet tuan rumah — tanpa batas 1–2 lapangan TV.
- Tombol mundur hanya untuk atlet dengan dua laga hari itu (bukan berdasarkan angka kelelahan).
- Beregu: satu babak / satu matchday grup = satu hari (tanpa templat hari & lapangan).
- Angka kalibrasi & asumsi: `docs/ASUMSI.md` bagian "Jadwal harian".
