# Pencarian Bakat & Perkembangan yang Terlihat — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pencarian bakat junior punya keputusan nyata (fokus, kapan merekrut, membaca catatan pemandu bakat), dan perkembangan atlet terlihat oleh manajer (faktor pengalaman, sifat terungkap, laporan kuartal).

**Architecture:** Mesin di `src/engine/scouting.ts` (kandidat, fokus, catatan, rentang menyempit, rekrut bertahap) dan helper kecil di `src/engine/development.ts` (faktor pengalaman, sifat terlihat, laporan kuartal dihitung dari `caDelta` yang sudah ada). UI di kartu pencarian bakat (`src/ui/Career.tsx` `ScoutingCard`), Dashboard (`Career.tsx` `Dashboard`), dan profil atlet (`src/ui/Squad.tsx`). Semua field baru opsional — save lama dimuat tanpa migrasi.

**Tech Stack:** TypeScript, React (Vite), Vitest (`npx vitest run`), typecheck `npx tsc --noEmit -p .`, build `npm run build`.

## Global Constraints

- Game tetap ringan: tidak ada tab/layar baru; tambahan masuk ke kartu yang sudah ada.
- Field state/atlet baru wajib opsional (`?`); save lama berjalan tanpa migrasi.
- Pencarian bakat hanya untuk negara manajer; negara lain tetap menerima `newJuniors` langsung.
- Perkiraan potensi yang ditampilkan selalu memuat `potentialStars(p, …)` (tes lama `scouting.test.ts` tetap lulus).
- `rng` hanya dari parameter (deterministik per seed); jangan `Math.random()`.
- Teks UI di `src/i18n/index.ts` (id) dan `src/i18n/en.ts` (en); `i18n.test.ts` memeriksa kunci sama.
- Angka kalibrasi baru dicatat di `docs/ASUMSI.md`.
- Commit per task, pesan berbahasa Indonesia seperti riwayat repo.
- Di luar cakupan: fokus latihan (rencana terpisah), sumber morale (lihat `2026-10-25-morale-perkembangan.md`).

## Peta file

| File | Tanggung jawab |
|---|---|
| `src/engine/scouting.ts` | `ScoutFocus`, `styleOf`, kandidat menurut fokus, catatan pemandu, `starRangeAt`, `recruitSome`, kandidat mundur |
| `src/engine/scouting.test.ts` | Tes semua perilaku di atas |
| `src/engine/generator.ts` | `Player.hometown` diisi saat atlet dibuat |
| `src/engine/types.ts` | `Player.hometown?` |
| `src/engine/season.ts` | `SeasonState.scoutFocus?`, panggil kandidat mundur & batas minggu |
| `src/engine/development.ts` | `experienceFactor`, `traitVisible`, `quarterReport` |
| `src/engine/development.test.ts` | Tes helper perkembangan |
| `src/ui/Career.tsx` | `ScoutingCard` (fokus, gaya, asal, catatan, rentang menyempit, rekrut bertahap), kartu Laporan kuartal |
| `src/ui/Squad.tsx` | Profil atlet: asal, gaya, faktor pengalaman, sifat |
| `src/i18n/index.ts`, `src/i18n/en.ts` | Teks baru |
| `docs/ASUMSI.md`, `docs/RENCANA.md` | Kalibrasi & status |

---

### Task 1: Profil kandidat — gaya bermain & kota asal

**Files:** Modify `src/engine/types.ts` (`Player`), `src/engine/generator.ts` (`generatePlayer`), `src/engine/scouting.ts`; Test `src/engine/scouting.test.ts`; UI `src/ui/Career.tsx` (`ScoutingCard`), `src/ui/Squad.tsx` (kartu identitas); i18n.

**Interfaces:**
- Produces: `Player.hometown?: string` (cityId); `styleOf(p: Player): [Attr, Attr]` — dua atribut tertinggi (urutan `ATTRS` sebagai pemecah seri).
- `generatePlayer` sudah menerima `country`; kota asal dipilih dari `world.cities` negara itu. `generatePlayer` tidak menerima `world` — tambahkan parameter opsional terakhir `cities?: City[]` (kota negara itu); bila kosong/undefined, `hometown` tidak diisi.

- [ ] **Step 1: Tes gagal**

```ts
import { styleOf } from './scouting';
import { ATTRS, type Player } from './types';

describe('profil kandidat', () => {
  it('styleOf: dua atribut tertinggi', () => {
    const attrs = Object.fromEntries(ATTRS.map((a) => [a, 40])) as Player['attrs'];
    attrs.smash = 70; attrs.net = 65;
    expect(styleOf({ attrs } as Player)).toEqual(['smash', 'net']);
  });

  it('kandidat punya kota asal di negaranya', async () => {
    const state = newSeason(WORLD, BWF_2026, 13, { year: 2026, week: 52 }, 'INA');
    await playWeek(state, BWF_2026, WORLD, makeRng(13));
    const ina = new Set(WORLD.cities.filter((c) => c.countryId === 'INA').map((c) => c.id));
    expect(state.scouting!.candidates.every((p) => p.hometown && ina.has(p.hometown))).toBe(true);
  });
});
```

- [ ] **Step 2:** `npx vitest run src/engine/scouting.test.ts` → FAIL.

- [ ] **Step 3: Implementasi**

`types.ts` di `Player`:

```ts
  /** Kota asal (cityId negaranya); hanya atlet yang dibuat sejak fitur ini. */
  hometown?: string;
```

`generator.ts` — signature `generatePlayer(rng, cfg, country, gender, age, date, id, usedNames?, maxPa = 99, cities?: City[])`; di objek hasil:

```ts
    ...(cities?.length ? { hometown: cities[Math.floor(rng() * cities.length)].id } : {}),
```

> Panggil `rng()` untuk kota **setelah** semua nilai lain dibuat agar urutan acak atlet yang sudah ada tidak bergeser (tes kalibrasi tetap sama). Hanya `makeScouting` dan `newJuniors` yang mengirim `cities`.

`scouting.ts`:

```ts
import { ATTRS, type Attr } from './types';
/** Gaya bermain: dua atribut tertinggi. */
export function styleOf(p: Player): [Attr, Attr] {
  const [a, b] = [...ATTRS].sort((x, y) => p.attrs[y] - p.attrs[x] || ATTRS.indexOf(x) - ATTRS.indexOf(y));
  return [a, b];
}
```

`makeScouting(base, country, gen, date, rng, usedNames?, cities?: City[])` dan `newJuniors(…, usedNames?, cities?)` meneruskan `cities` ke `generatePlayer`. Di `season.ts` `endYear`: `const cities = world.cities.filter((x) => x.countryId === c.id);` lalu kirim ke keduanya.

UI `ScoutingCard`: di bawah nama kandidat, baris kecil:

```tsx
<div className="entry-meta muted-text">
  {styleOf(p).map((a) => t(`attr_${a}` as TextKey)).join(' · ')}
  {p.hometown && <> · {cityName(p.hometown)}</>}
</div>
```

(`attr_*` — cek kunci nama atribut yang sudah ada: `grep -n "speed" src/i18n/index.ts`; `cityName` — cek helper nama kota di `src/ui/game.tsx` atau pakai `world.cities.find(...)?.name` lewat `dataName`.) Squad profil: tambahkan `fact(t('hometown'), …)` bila `p.hometown` ada, dan `fact(t('playStyle'), …)` untuk semua atlet.

i18n: `hometown: 'Asal' / 'Hometown'`, `playStyle: 'Gaya bermain' / 'Playing style'`.

- [ ] **Step 4:** `npx vitest run`, `npx tsc --noEmit -p .` → bersih (semua tes kalibrasi lama tetap lulus — bukti urutan rng tidak bergeser).
- [ ] **Step 5: Commit** — `"Pencarian bakat: kandidat & junior baru punya kota asal; gaya bermain (2 atribut terkuat) tampil di kandidat & profil atlet"`

---

### Task 2: Fokus pencarian

**Files:** Modify `src/engine/scouting.ts`, `src/engine/season.ts` (`SeasonState.scoutFocus?`, `endYear`); UI `ScoutingCard` + Squad tab Junior; i18n; Test `scouting.test.ts`.

**Interfaces:**
- `export type ScoutFocus = 'balanced' | 'singles' | 'doubles' | 'attack' | 'defense' | 'raw' | 'ready';`
- `SeasonState.scoutFocus?: ScoutFocus` (undefined = 'balanced'), berlaku untuk pencarian akhir musim berikutnya.
- `focusScore(p: Player, f: ScoutFocus, date: GameDate): number` — makin tinggi makin cocok.
- `makeScouting(…, focus: ScoutFocus = 'balanced')`: buat **2×** kandidat per gender seperti sekarang lalu simpan `n` teratas menurut `focusScore` + derau kecil (agar tidak selalu sama). `balanced` = perilaku lama persis (tanpa oversampling).

- [ ] **Step 1: Tes gagal**

```ts
import { focusScore, makeScouting } from './scouting';
import { currentAbility } from './generator';

describe('fokus pencarian', () => {
  const ina = WORLD.countries.find((c) => c.id === 'INA')!;
  const date = { year: 2027, week: 1 };
  const base = [] as Player[]; // slot 0 → MIN_CANDIDATES per gender
  const avg = (ps: Player[], f: (p: Player) => number) => ps.reduce((s, p) => s + f(p), 0) / ps.length;
  it('attack → smash+deception rata-rata lebih tinggi dari balanced; ready → CA lebih tinggi; raw → PA−CA lebih besar', () => {
    const run = (f: Parameters<typeof makeScouting>[7]) => makeScouting(base, ina, BWF_2026.generator, date, makeRng(21), undefined, undefined, f).candidates;
    const bal = run('balanced'), att = run('attack'), rdy = run('ready'), raw = run('raw');
    expect(avg(att, (p) => p.attrs.smash + p.attrs.deception)).toBeGreaterThan(avg(bal, (p) => p.attrs.smash + p.attrs.deception));
    expect(avg(rdy, (p) => currentAbility(p.attrs))).toBeGreaterThan(avg(bal, (p) => currentAbility(p.attrs)));
    expect(avg(raw, (p) => p.pa - currentAbility(p.attrs))).toBeGreaterThan(avg(bal, (p) => p.pa - currentAbility(p.attrs)));
    expect(att.length).toBe(bal.length);
  });
});
```

- [ ] **Step 2:** FAIL.

- [ ] **Step 3: Implementasi**

```ts
export type ScoutFocus = 'balanced' | 'singles' | 'doubles' | 'attack' | 'defense' | 'raw' | 'ready';
export const SCOUT_FOCI: ScoutFocus[] = ['balanced', 'singles', 'doubles', 'attack', 'defense', 'raw', 'ready'];

/** Kecocokan kandidat dengan fokus pencarian (skala atribut). ASUMSI: pasangan atribut per fokus, lihat docs/ASUMSI.md. */
export function focusScore(p: Player, f: ScoutFocus, date: GameDate) {
  const a = p.attrs, ca = currentAbility(a);
  switch (f) {
    case 'singles': return a.speed + a.stamina;
    case 'doubles': return a.net + a.serve + a.smash;
    case 'attack': return a.smash + a.deception;
    case 'defense': return a.defense + a.consistency;
    case 'raw': return p.pa - ca - ageAt(p.birth, date); // muda & ruang tumbuh besar
    case 'ready': return ca;
    default: return 0;
  }
}
```

Di `makeScouting`, per gender:

```ts
    const n = Math.max(MIN_CANDIDATES, slots[g] * 2);
    const pool = Array.from({ length: focus === 'balanced' ? n : n * 2 }, (_, i) => {
      const age = gen.juniorAge.min + Math.floor(rng() * (gen.juniorAge.max - gen.juniorAge.min + 1));
      return generatePlayer(rng, gen, country, g, age, date, `${country.id}-${g}${date.year}-s${i + 1}`, usedNames, 99, cities);
    });
    const noisy = new Map(pool.map((p) => [p.id, focusScore(p, focus, date) + rng() * 10])); // derau: fokus mengarahkan, tidak memastikan
    const chosen = focus === 'balanced' ? pool : [...pool].sort((x, y) => noisy.get(y)! - noisy.get(x)!).slice(0, n);
    for (const p of chosen) { /* starRange seperti sekarang */ candidates.push(p); }
```

> Kandidat yang tidak terpilih memakai nama di `usedNames`; itu tidak masalah (pool nama besar).

`season.ts` `endYear`: `makeScouting(juniors, c, rs.generator, next, rng, usedNames, cities, state.scoutFocus ?? 'balanced')`.

UI: pilihan fokus di dua tempat yang sama-sama memanggil `state.scoutFocus = v; changed(); void saveGame(game);`:
1. `ScoutingCard` — di bawah daftar kandidat: `<label>{t('scoutFocusNext')} <select …>{SCOUT_FOCI.map(f => <option value={f}>{t(`scoutFocus_${f}`)}</option>)}</select></label>`.
2. Squad tab Junior (cari `grep -n "promote" src/ui/Squad.tsx` untuk lokasi tab Junior) — baris yang sama di atas tabel, supaya bisa diatur saat tidak ada pencarian berjalan.

i18n (id / en): `scoutFocusNext: 'Fokus pencarian akhir musim' / 'Scouting focus (end of season)'`, `scoutFocus_balanced: 'Seimbang' / 'Balanced'`, `scoutFocus_singles: 'Tunggal (cepat & tahan lama)' / 'Singles (speed & stamina)'`, `scoutFocus_doubles: 'Ganda (net, servis, smash)' / 'Doubles (net, serve, smash)'`, `scoutFocus_attack: 'Penyerang' / 'Attacker'`, `scoutFocus_defense: 'Bertahan' / 'Defender'`, `scoutFocus_raw: 'Mentah, potensi besar' / 'Raw, high ceiling'`, `scoutFocus_ready: 'Siap pakai' / 'Ready now'`.

- [ ] **Step 4:** `npx vitest run src/engine/scouting.test.ts` + seluruh tes → PASS (tes lama memakai fokus default = perilaku lama).
- [ ] **Step 5: Commit** — `"Pencarian bakat: fokus pencarian (tunggal, ganda, penyerang, bertahan, mentah, siap pakai) mengarahkan kandidat akhir musim"`

---

### Task 3: Catatan pemandu bakat (petunjuk sifat, kadang meleset)

**Files:** Modify `src/engine/scouting.ts` (`Scouting.notes?`, `makeScouting`); UI `ScoutingCard`; i18n; Test `scouting.test.ts`.

**Interfaces:**
- `export type ScoutNote = 'lateBloomer' | 'mayStall' | 'bigMatch' | 'fragile';`
- `Scouting.notes?: Record<string /*playerId*/, ScoutNote[]>`
- `scoutNotes(p: Player, rng: Rng): ScoutNote[]` — ASUMSI akurasi:
  - `trait === 'late'` → `lateBloomer` 75 %; selain itu `lateBloomer` 8 % (salah).
  - `trait === 'stagnant'` → `mayStall` 75 %; selain itu 8 %.
  - `attrs.mental` ≥ CA + 8 → `bigMatch` 80 %; ≤ CA − 8 → `fragile` 80 %.

- [ ] **Step 1: Tes gagal**

```ts
import { scoutNotes } from './scouting';
describe('catatan pemandu', () => {
  const mk = (trait: Player['trait'], mental: number) => {
    const attrs = Object.fromEntries(ATTRS.map((a) => [a, 40])) as Player['attrs'];
    attrs.mental = mental;
    return { trait, attrs } as Player;
  };
  const rate = (p: Player, note: string) => { const rng = makeRng(5); let n = 0; for (let i = 0; i < 2000; i++) if (scoutNotes(p, rng).includes(note as never)) n++; return n / 2000; };
  it('benar sebagian besar, kadang meleset', () => {
    expect(rate(mk('late', 40), 'lateBloomer')).toBeGreaterThan(0.65);
    expect(rate(mk(undefined, 40), 'lateBloomer')).toBeLessThan(0.15);
    expect(rate(mk(undefined, 40), 'lateBloomer')).toBeGreaterThan(0.02);
    expect(rate(mk(undefined, 60), 'bigMatch')).toBeGreaterThan(0.7);
    expect(rate(mk(undefined, 20), 'fragile')).toBeGreaterThan(0.7);
  });
});
```

- [ ] **Step 2:** FAIL.

- [ ] **Step 3: Implementasi**

```ts
export type ScoutNote = 'lateBloomer' | 'mayStall' | 'bigMatch' | 'fragile';
/** Catatan pemandu bakat: petunjuk sifat tersembunyi yang kadang meleset (ASUMSI: 75/8 %, mental 80 %). */
export function scoutNotes(p: Player, rng: Rng): ScoutNote[] {
  const out: ScoutNote[] = [];
  if (rng() < (p.trait === 'late' ? 0.75 : 0.08)) out.push('lateBloomer');
  if (rng() < (p.trait === 'stagnant' ? 0.75 : 0.08)) out.push('mayStall');
  const gap = p.attrs.mental - currentAbility(p.attrs);
  if (gap >= 8 && rng() < 0.8) out.push('bigMatch');
  if (gap <= -8 && rng() < 0.8) out.push('fragile');
  return out;
}
```

Di `makeScouting`, setelah kandidat dipilih: `notes[p.id] = scoutNotes(p, rng)`; kembalikan `{ …, notes }`. (Rng dipakai setelah semua kandidat dibuat, jadi tidak menggeser atlet.)

UI `ScoutingCard`: di `.entry-meta` tiap kandidat, `{(s.notes?.[p.id] ?? []).map((n) => <span key={n} className="tag muted-tag">{t(`scoutNote_${n}` as TextKey)}</span>)}`; hint kartu ditambah kalimat "Catatan pemandu bakat bisa meleset."

i18n: `scoutNote_lateBloomer: 'Berkembang lambat?' / 'Late bloomer?'`, `scoutNote_mayStall: 'Bisa mandek' / 'May stall'`, `scoutNote_bigMatch: 'Mental juara' / 'Big-match temperament'`, `scoutNote_fragile: 'Mental rapuh' / 'Fragile under pressure'`.

- [ ] **Step 4:** seluruh tes → PASS.
- [ ] **Step 5: Commit** — `"Pencarian bakat: catatan pemandu bakat (berkembang lambat, bisa mandek, mental juara/rapuh) dari sifat tersembunyi, kadang meleset"`

---

### Task 4: Rentang potensi menyempit, rekrut bertahap, kandidat bisa mundur

**Files:** Modify `src/engine/scouting.ts`, `src/engine/season.ts` (`playWeek` awal minggu); UI `ScoutingCard`; i18n; Test `scouting.test.ts`.

**Interfaces:**
- `starRangeAt(s: Scouting, p: Player, week: number): [number, number]` — lebar `max(0.5, 2 − 0.5 × (week − 1))` (minggu 1: 2 bintang … minggu 4: 0,5), tetap memuat `potentialStars(p, {year: s.year, week: 1}, 0)`, kelipatan 0,5, dalam 0,5–5. Posisi perkiraan di dalam rentang mengikuti rentang awal: `f = (est − lo0) / 2`, `lo = est − round2(f × w)`.
- `recruitSome(state, ids: string[])` — atlet terpilih langsung masuk `state.players`, keluar dari `candidates`, `s.recruited = (s.recruited ?? 0) + ids.length`; pencarian tetap terbuka.
- `recruit(state, ids)` (yang lama) tetap: menutup pencarian; tanpa pilihan & `!s.recruited` → `autoPick`; sudah pernah rekrut bertahap & `ids` kosong → tutup tanpa menambah.
- `withdrawCandidates(s: Scouting, rng: Rng)` — dipanggil awal minggu 2–4: per gender, peluang 50 % satu kandidat acak mundur (dilirik klub/universitas), tapi jumlah kandidat tidak turun di bawah sisa kursi gender itu.
- `Scouting.recruited?: number`, `Scouting.withdrawn?: string[]` (nama, untuk pesan di kartu).

- [ ] **Step 1: Tes gagal**

```ts
import { recruitSome, starRangeAt, withdrawCandidates } from './scouting';
describe('waktu merekrut', () => {
  it('rentang menyempit tiap minggu dan tetap memuat perkiraan', async () => {
    const state = newSeason(WORLD, BWF_2026, 14, { year: 2026, week: 52 }, 'INA');
    await playWeek(state, BWF_2026, WORLD, makeRng(14));
    const s = state.scouting!;
    for (const p of s.candidates) {
      const est = potentialStars(p, { year: s.year, week: 1 }, 0);
      const widths = [1, 2, 3, 4].map((w) => { const [lo, hi] = starRangeAt(s, p, w); expect(est >= lo && est <= hi).toBe(true); return hi - lo; });
      expect(widths).toEqual([2, 1.5, 1, 0.5]);
    }
  });
  it('rekrut bertahap: pencarian tetap terbuka, batas minggu tidak mengisi otomatis lagi', async () => {
    const state = newSeason(WORLD, BWF_2026, 15, { year: 2026, week: 52 }, 'INA');
    const rng = makeRng(15);
    await playWeek(state, BWF_2026, WORLD, rng);
    const first = state.scouting!.candidates[0];
    const before = state.players.length;
    recruitSome(state, [first.id]);
    expect(state.players.length).toBe(before + 1);
    expect(state.scouting!.candidates.includes(first)).toBe(false);
    while (state.date.week <= 5) await playWeek(state, BWF_2026, WORLD, rng);
    expect(state.scouting).toBeUndefined();
    expect(state.players.length).toBe(before + 1);
  });
  it('kandidat mundur tidak membuat kandidat < sisa kursi', () => {
    const s = { year: 2027, slots: { M: 5, F: 5 }, candidates: Array.from({ length: 5 }, (_, i) => ({ id: `m${i}`, gender: 'M', name: `M${i}` })), starRange: {} } as unknown as Scouting;
    for (let i = 0; i < 10; i++) withdrawCandidates(s, makeRng(i));
    expect(s.candidates.length).toBe(5);
  });
});
```

(`Scouting` diimpor sebagai tipe dari `./scouting`.)

- [ ] **Step 2:** FAIL.

- [ ] **Step 3: Implementasi**

```ts
const half = (x: number) => Math.round(x * 2) / 2;
export function starRangeAt(s: Scouting, p: Player, week: number): [number, number] {
  const est = potentialStars(p, { year: s.year, week: 1 }, 0);
  const w = Math.max(0.5, 2 - 0.5 * (Math.max(1, week) - 1));
  const f = (est - s.starRange[p.id][0]) / 2;
  let lo = est - half(f * w);
  lo = Math.min(Math.max(lo, 0.5), 5 - w);
  return [lo, lo + w];
}

export function recruitSome(state: { players: Player[]; scouting?: Scouting }, ids: string[]) {
  const s = state.scouting;
  if (!s || !ids.length) return;
  const set = new Set(ids);
  const picked = s.candidates.filter((p) => set.has(p.id));
  state.players.push(...picked);
  for (const p of picked) s.slots[p.gender] = Math.max(0, s.slots[p.gender] - 1);
  s.candidates = s.candidates.filter((p) => !set.has(p.id));
  s.recruited = (s.recruited ?? 0) + picked.length;
}

/** Awal minggu 2–4: kandidat bisa mundur (ASUMSI 50 % per gender per minggu), tidak di bawah sisa kursi. */
export function withdrawCandidates(s: Scouting, rng: Rng) {
  for (const g of ['M', 'F'] as const) {
    const pool = s.candidates.filter((p) => p.gender === g);
    if (pool.length <= s.slots[g] || rng() >= 0.5) continue;
    const out = pool[Math.floor(rng() * pool.length)];
    s.candidates = s.candidates.filter((p) => p !== out);
    (s.withdrawn ??= []).push(out.name);
  }
}
```

`recruit` lama: ganti `const chosen = new Set(ids.length ? ids : autoPick(s));` dengan `const chosen = new Set(ids.length || s.recruited ? ids : autoPick(s));`.

`season.ts` `playWeek`, tepat sebelum baris `if (state.scouting && week > SCOUTING_DEADLINE_WEEK) recruit(state, []);`:

```ts
  if (state.scouting && week >= 2 && week <= SCOUTING_DEADLINE_WEEK) withdrawCandidates(state.scouting, rng);
```

> Ini menambah panggilan `rng()` di minggu 2–4 bila ada pencarian (hanya save dengan negara manajer). Bila tes ber-seed lain bergeser, perbaiki pemilihan atlet di tes agar deterministik (contoh commit `aed71a7`), jangan hapus tes.

UI `ScoutingCard`:
- Kolom potensi pakai `starRangeAt(s, p, state.date.year === s.year ? state.date.week : 1)`.
- Tombol `recruit` diganti dua tombol: **Rekrut terpilih** (`recruitSome(state, picked); setPicked([]); changed(); save`) dan **Selesai** (`recruit(state, picked)`).
- Bila `s.withdrawn?.length`: `<p className="hint">{t('scoutWithdrawn', { names: s.withdrawn.join(', ') })}</p>`.
- Status kartu menyebut sisa kursi `s.slots` (sudah) dan `s.recruited`.

i18n: `scoutRecruitSome: 'Rekrut terpilih' / 'Recruit selected'`, `scoutFinish: 'Selesai' / 'Finish'`, `scoutWithdrawn: 'Mundur (dilirik pihak lain): {names}' / 'Withdrew (other offers): {names}'`; ubah `scoutingHint` (id & en) menjadi: "Ketuk kandidat untuk memilih. Rentang potensi menyempit tiap minggu sampai minggu {week}, tetapi kandidat bisa mundur bila menunggu. Rekrut terpilih = langsung masuk pelatnas, pencarian tetap terbuka. Catatan pemandu bakat bisa meleset." (sesuaikan pemanggilan `t('scoutingHint', { week: SCOUTING_DEADLINE_WEEK })`).

- [ ] **Step 4:** seluruh tes + build → bersih.
- [ ] **Step 5: Commit** — `"Pencarian bakat: rentang potensi menyempit tiap minggu, rekrut bertahap, kandidat bisa mundur bila menunggu"`

---

### Task 5: Faktor pengalaman terlihat

**Files:** Modify `src/engine/development.ts`; UI `src/ui/Squad.tsx` (kartu identitas); i18n; Test `development.test.ts`.

**Interfaces:**
- `experienceFactor(cfg: DevelopmentConfig, weighted: number): number` = `min(e.max, e.base + e.perMatch × weighted)`; `developQuarter` memakainya (perilaku sama persis).

- [ ] **Step 1: Tes gagal**

```ts
import { experienceFactor } from './development';
it('faktor pengalaman: base, naik per laga, dibatasi max', () => {
  const e = BWF_2026.development.experience;
  expect(experienceFactor(BWF_2026.development, 0)).toBeCloseTo(e.base);
  expect(experienceFactor(BWF_2026.development, 4)).toBeCloseTo(e.base + 4 * e.perMatch);
  expect(experienceFactor(BWF_2026.development, 1000)).toBe(e.max);
});
```

- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Implementasi**

```ts
/** Pengali pertumbuhan dari laga berbobot kuartal ini (berlaku s/d usia `experience.untilAge`). */
export const experienceFactor = (cfg: DevelopmentConfig, weighted: number) =>
  Math.min(cfg.experience.max, cfg.experience.base + cfg.experience.perMatch * weighted);
```

Di `developQuarter`: `rate *= experienceFactor(cfg, ctx.experience.get(p.id) ?? 0);` (ganti dua baris lama).

Squad profil, bila `p.retired === undefined && ageAt(p.birth, state.date) <= ruleset.development.experience.untilAge`:

```tsx
{fact(t('expFactor'), <span title={t('expFactorHint')}>×{experienceFactor(ruleset.development, state.experience[p.id] ?? 0).toFixed(2)} · {t('expMatches', { n: Math.round(state.experience[p.id] ?? 0) })}</span>)}
```

i18n: `expFactor: 'Pengalaman kuartal ini' / 'Experience this quarter'`, `expMatches: '{n} laga berbobot' / '{n} weighted matches'`, `expFactorHint: 'Pengali perkembangan di akhir kuartal: makin banyak laga (menang & turnamen besar bernilai lebih), makin cepat berkembang. Di bawah ×1 = kurang jam terbang.' / 'Growth multiplier at quarter end: more matches (wins and big events count more) mean faster growth. Below ×1 = not enough match time.'`

- [ ] **Step 4:** seluruh tes → PASS (perilaku `developQuarter` tidak berubah).
- [ ] **Step 5: Commit** — `"Perkembangan: faktor pengalaman kuartal berjalan tampil di profil atlet muda"`

---

### Task 6: Sifat tersembunyi terungkap

**Files:** Modify `src/engine/development.ts`; UI `src/ui/Squad.tsx` (profil + tabel skuad); i18n; Test `development.test.ts`.

**Interfaces:**
- `traitVisible(p: Player): boolean` — `true` bila `p.trait` ada **dan** `p.attrHistory.length >= 2` (sudah melewati dua akhir musim tercatat). Tanpa state baru.

- [ ] **Step 1: Tes gagal**

```ts
import { traitVisible } from './development';
it('sifat terlihat setelah dua musim tercatat', () => {
  const p = { trait: 'late', attrHistory: [{}] } as unknown as Player;
  expect(traitVisible(p)).toBe(false);
  p.attrHistory.push({} as never);
  expect(traitVisible(p)).toBe(true);
  expect(traitVisible({ attrHistory: [{}, {}] } as unknown as Player)).toBe(false);
});
```

- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Implementasi**

```ts
/** Sifat perkembangan (late bloomer / stagnan) baru terbaca setelah dua akhir musim tercatat. */
export const traitVisible = (p: Player) => !!p.trait && p.attrHistory.length >= 2;
```

UI: profil atlet & baris tabel skuad (di samping nama, pola `tag muted-tag` yang sama dengan Development): `{traitVisible(p) && <span className="tag" title={t(`trait_${p.trait}Hint` as TextKey)}>{t(`trait_${p.trait}` as TextKey)}</span>}`.

i18n: `trait_late: 'Late bloomer' / 'Late bloomer'`, `trait_lateHint: 'Puncaknya datang lebih lambat: berkembang pelan di usia muda, tetap naik di usia 20-an.' / 'Peaks later: slow as a teen, keeps improving into the mid-20s.'`, `trait_stagnant: 'Mandek' / 'Stalling'`, `trait_stagnantHint: 'Berkembang lebih lambat dari potensinya.' / 'Develops more slowly than the potential suggests.'`. (Cek dulu `grep -n "trait_" src/i18n/index.ts` — jika kunci serupa sudah ada, pakai yang ada.)

- [ ] **Step 4:** seluruh tes → PASS.
- [ ] **Step 5: Commit** — `"Perkembangan: sifat late bloomer / mandek terungkap setelah dua musim dan tampil di skuad & profil"`

---

### Task 7: Laporan kuartal di Dashboard

**Files:** Modify `src/engine/development.ts` (`quarterReport`); UI `src/ui/Career.tsx` (`Dashboard`, kartu baru di grid `.dash`); i18n; Test `development.test.ts`.

**Interfaces:**
- `quarterReport(players: Player[], countryId: string, date: GameDate): { risers: Player[]; stalled: Player[]; declining: Player[]; revealed: Player[] }`
  - Dasar: atlet aktif negara itu (`retired === undefined && released === undefined`) dengan `caDelta` terdefinisi.
  - `risers`: `caDelta > 0`, urut turun, maks 3.
  - `stalled`: usia ≤ 21 dan `caDelta <= 0`, maks 3.
  - `declining`: usia ≥ 27 dan `caDelta < 0`, urut naik, maks 3.
  - `revealed`: `traitVisible(p) && p.attrHistory.length === 2` (baru terungkap musim ini), maks 3.

- [ ] **Step 1: Tes gagal**

```ts
import { quarterReport } from './development';
it('laporan kuartal: naik, mandek (muda), menurun (senior)', () => {
  const d = { year: 2027, week: 14 };
  const mk = (id: string, age: number, caDelta: number) => ({ id, countryId: 'INA', birth: { year: 2027 - age, week: 1 }, caDelta, attrHistory: [] }) as unknown as Player;
  const ps = [mk('a', 18, 3), mk('b', 19, 0), mk('c', 29, -2), mk('d', 24, 1), { ...mk('x', 20, 5), countryId: 'MAS' } as Player];
  const r = quarterReport(ps, 'INA', d);
  expect(r.risers.map((p) => p.id)).toEqual(['a', 'd']);
  expect(r.stalled.map((p) => p.id)).toEqual(['b']);
  expect(r.declining.map((p) => p.id)).toEqual(['c']);
});
```

- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Implementasi**

```ts
/** Ringkasan perkembangan kuartal terakhir untuk Dashboard (dari `caDelta`, tanpa data baru di save). */
export function quarterReport(players: Player[], countryId: string, date: GameDate) {
  const own = players.filter((p) => p.countryId === countryId && p.retired === undefined && p.released === undefined && p.caDelta !== undefined);
  const age = (p: Player) => ageAt(p.birth, date);
  return {
    risers: own.filter((p) => p.caDelta! > 0).sort((a, b) => b.caDelta! - a.caDelta!).slice(0, 3),
    stalled: own.filter((p) => age(p) <= 21 && p.caDelta! <= 0).slice(0, 3),
    declining: own.filter((p) => age(p) >= 27 && p.caDelta! < 0).sort((a, b) => a.caDelta! - b.caDelta!).slice(0, 3),
    revealed: own.filter((p) => traitVisible(p) && p.attrHistory.length === 2).slice(0, 3),
  };
}
```

UI `Dashboard` (setelah kartu target, `managed` saja), tampil hanya pada 4 minggu setelah akhir kuartal (`(state.date.week - 1) % 13 < 4`) agar tidak memenuhi Dashboard:

```tsx
{managed && (state.date.week - 1) % 13 < 4 && (() => {
  const r = quarterReport(state.players, managed, state.date);
  const rows: [TextKey, Player[]][] = [['qrRisers', r.risers], ['qrStalled', r.stalled], ['qrDeclining', r.declining], ['qrRevealed', r.revealed]];
  if (rows.every(([, ps]) => !ps.length)) return null;
  return (
    <section className="card">
      <h3>{t('quarterReport')}</h3>
      {rows.filter(([, ps]) => ps.length).map(([k, ps]) => (
        <p key={k}><b>{t(k)}:</b> {ps.map((p, i) => <span key={p.id}>{i ? ', ' : ''}<a onClick={() => onOpen(p.id)}>{p.name}</a> {arrow(p.caDelta)}</span>)}</p>
      ))}
    </section>
  );
})()}
```

(`arrow` — helper panah naik/turun di `Squad.tsx`; ekspor dan impor, atau salin pola `caDelta > 0 ? '▲' : '▼'` sesuai yang ada.)

i18n: `quarterReport: 'Laporan perkembangan kuartal' / 'Quarterly development report'`, `qrRisers: 'Paling berkembang' / 'Biggest risers'`, `qrStalled: 'Junior mandek' / 'Stalled juniors'`, `qrDeclining: 'Mulai menurun' / 'Declining'`, `qrRevealed: 'Sifat terungkap' / 'Trait revealed'`.

- [ ] **Step 4:** `npx vitest run`, `npx tsc --noEmit -p .`, `npm run build` → bersih.
- [ ] **Step 5: Commit** — `"Dashboard: laporan perkembangan kuartal (paling berkembang, junior mandek, mulai menurun, sifat terungkap)"`

---

### Task 8: Dokumentasi & cek akhir

**Files:** `docs/ASUMSI.md`, `docs/RENCANA.md`, teks bantuan pencarian bakat (i18n).

- [ ] **Step 1:** `docs/ASUMSI.md` — bagian "Pencarian bakat & perkembangan terlihat": pasangan atribut per fokus + derau 0–10, oversampling 2×, akurasi catatan (75/8 %, mental ±8 → 80 %), lebar rentang per minggu, peluang mundur 50 %/gender/minggu, sifat terlihat setelah 2 musim, jendela laporan kuartal 4 minggu.
- [ ] **Step 2:** `docs/RENCANA.md` — blok "Fitur berikutnya (disetujui 2026-10-25): pencarian bakat & perkembangan" dengan centang Task 1–7.
- [ ] **Step 3:** Coba manual dengan skill `run` (atau `npm run dev` + Playwright): mulai karier INA, majukan ke minggu 52, buka kartu pencarian bakat — cek gaya/asal/catatan tampil, rentang menyempit setelah "Maju 1 minggu", tombol Rekrut terpilih & Selesai bekerja, kandidat mundur muncul di pesan; buka profil junior — faktor pengalaman tampil; minggu 14 — kartu laporan kuartal tampil. Ambil screenshot lebar HP (390 px).
- [ ] **Step 4:** `npx vitest run`, `npx tsc --noEmit -p .`, `npm run build` → bersih.
- [ ] **Step 5: Commit** — `"Pencarian bakat & perkembangan: ASUMSI, RENCANA, teks bantuan"`

---

## Self-review

- Cakupan ide pencarian bakat: fokus (T2), rentang menyempit + keputusan waktu (T4), catatan sifat (T3), profil gaya & asal (T1). Perkembangan: laporan kuartal (T7), sifat terungkap (T6), faktor pengalaman terlihat (T5). Dokumen & uji manual (T8).
- Nama konsisten: `styleOf`, `ScoutFocus`/`SCOUT_FOCI`/`focusScore`, `ScoutNote`/`scoutNotes`, `starRangeAt`, `recruitSome`, `withdrawCandidates`, `experienceFactor`, `traitVisible`, `quarterReport`, `Player.hometown`, `SeasonState.scoutFocus`, `Scouting.notes/recruited/withdrawn`.
- Urutan parameter `makeScouting(base, country, gen, date, rng, usedNames?, cities?, focus?)` dipakai sama di T1, T2 dan tes T2.
