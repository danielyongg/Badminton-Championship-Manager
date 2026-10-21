# Kejuaraan kontinental: badge & kejuaraan individu senior

Disetujui user 2026-10-21.

## Tujuan
1. Kejuaraan beregu kontinental tidak lagi berbadge "Grade 1 Major" (bukan Major Events BWF) → badge teal "Continental / Team".
2. Tambah kejuaraan individu senior kontinental (Asia, Eropa, Pan Am, Afrika, Oseania) dengan badge "Continental / Individual".

## Rancangan
- **Tier** (pola seperti JC/JC2): `CCA` Asia (poin Super 1000, hadiah US$550.000), `CCE` Eropa (Super 500), `CCP` Pan Am (Super 300), `CCI` Afrika & Oseania (International Challenge). Grade 2 internal, tanpa kualifikasi & wildcard, `countryQuota` maks 4 per negara.
- **Kalender**: Asia/Eropa/Pan Am minggu 15 (2027: 14); Afrika/Oseania minggu 8. Field `confederation` membatasi peserta.
- **Mesin**: `chooseEntries` & `plannableEvents`/`planWeek` menyaring event berdasarkan konfederasi negara; `scheduleYear` tidak menggeser minggu kejuaraan kontinental. Race WTF tidak berubah (tier baru tidak termasuk `race.tiers`).
- **UI**: `tierGroup` → kelompok `cont` (beregu ber-`confederation` atau tier CC*); `TierBadge` label "Continental" + "Team"/"Individual"; `tierLabel` → "Continental"; nama tier diterjemahkan.
- **Save lama** (`gameFromBlob`): tambah tier, turnamen (musim ini bila minggunya belum lewat), kota Ningbo & Huelva, `ai.rankRange`/`playProb` yang belum ada.

## Tes
- Musim penuh: peserta hanya dari konfederasi, maks 4 per negara, poin masuk ranking (juara Asia 12.000), tier tidak di race WTF.
- Save lama mendapat tier/turnamen/kota; event yang minggunya sudah lewat mulai musim depan.
