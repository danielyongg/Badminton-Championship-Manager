# Junior bagian 1 — Pencarian bakat & rekrutmen: rencana implementasi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kandidat pencarian bakat lebih beragam (permata & tipe), dinilai lewat daftar ringkas + panel detail (laporan pemandu, "mirip X", atribut), dan punya cerita (berita permata, asal-usul di profil).

**Architecture:** Logika murni di `src/engine/scouting.ts` (pembuatan kandidat, laporan, kemiripan, asal-usul) dan `src/engine/news.ts` (berita `gem`). Kartu pencarian dipindah dari `Career.tsx` ke file baru `src/ui/Scouting.tsx` (daftar + panel). Profil atlet (`Squad.tsx`) menampilkan asal-usul.

**Tech Stack:** TypeScript, React 19, Vitest, Vite.

**Spesifikasi:** `docs/superpowers/specs/2026-10-29-junior-scouting-promosi-design.md` bagian 1.

## Global Constraints
- Game ringan: tanpa latihan, anggaran, pelatih; tidak menambah tombol wajib.
- Jumlah kandidat & kursi tidak berubah (`max(MIN_CANDIDATES, 2 × kursi)`); batas minggu 4, rentang ★ menyempit, kandidat mundur, rekrut bertahap tetap.
- Hanya negara manajer; negara AI tetap memakai `newJuniors`.
- Save lama tetap jalan: field baru opsional (`Scouting.types`, `Scouting.gems`, `Player.scouted`).
- Semua teks UI lewat `t()` dengan kunci di `src/i18n/index.ts` (id) **dan** `src/i18n/en.ts` (TS memaksa lengkap).
- Komentar & nama mengikuti gaya kode sekitar (bahasa Indonesia, `ASUMSI:` untuk angka asumsi, catat di `docs/ASUMSI.md`).
- Perintah: tes `npx vitest run <file>`, semua `npx vitest run`, tipe `npx tsc --noEmit -p .`, build `npm run build`.

---

### Task 1: Permata & tipe kandidat (engine)

**Files:**
- Modify: `src/engine/scouting.ts` (interface `Scouting`, `makeScouting`, konstanta & helper baru)
- Test: `src/engine/scouting.test.ts`

**Interfaces:**
- Produces: `type ScoutType = 'doubles' | 'attack' | 'defense' | 'worker' | 'ready' | 'raw'`, `SCOUT_TYPES`, `gemLine(country, gen): number`, `GEM_SECOND = 0.4`, `GEM_FLAG = 0.9`, `FALSE_GEM = 0.1`, `Scouting.types?: Record<string, ScoutType>`, `Scouting.gems?: string[]` (id yang **ditandai** ⭐), `Scouting.trueGems?: string[]` (permata asli, untuk tes & asal-usul).

- [ ] **Step 1: Tulis tes yang gagal** — tambahkan di akhir `describe('pencarian bakat junior', …)` di `src/engine/scouting.test.ts` (impor `gemLine`, `SCOUT_TYPES` dari `./scouting`, `ageAt` dari `./generator`):

```ts
  it('permata & tipe: jumlah kandidat tetap, permata di atas ambang, sisanya di bawah, CA ≤ PA', () => {
    const rs = BWF_2026, gen = rs.generator, ina = WORLD.countries.find((c) => c.id === 'INA')!;
    const line = gemLine(ina, gen);
    expect(line).toBe(Math.round(35 + 95 * 0.4 + 1.5 * 12)); // 91
    let flagged = 0, real = 0, twoGems = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const base = Array.from({ length: 9 }, (_, i) => ({ gender: i % 2 ? 'F' : 'M' }) as Player);
      const s = makeScouting(base, ina, gen, { year: 2027, week: 1 }, makeRng(seed));
      for (const g of ['M', 'F'] as const) {
        const pool = s.candidates.filter((p) => p.gender === g);
        expect(pool.length).toBe(Math.max(5, s.slots[g] * 2));
        const gems = pool.filter((p) => s.trueGems!.includes(p.id));
        expect(gems.length === 1 || gems.length === 2).toBe(true);
        if (gems.length === 2) twoGems++;
        for (const p of gems) expect(p.pa).toBeGreaterThanOrEqual(line);
        for (const p of pool.filter((x) => !gems.includes(x))) expect(p.pa).toBeLessThan(line);
      }
      for (const p of s.candidates) {
        expect(currentAbility(p.attrs)).toBeLessThanOrEqual(p.pa);
        expect(SCOUT_TYPES).toContain(s.types![p.id]);
        if (s.types![p.id] === 'doubles') expect(p.focus).toBe('D');
      }
      real += s.trueGems!.length;
      flagged += s.gems!.filter((id) => s.trueGems!.includes(id)).length;
    }
    expect(flagged / real).toBeGreaterThan(0.8); // ±90 % permata asli ditandai
    expect(twoGems).toBeGreaterThan(10); // ±40 % gender-angkatan punya 2 permata
  });

  it('tipe menggeser atribut: penyerang punya smash+deception di atas rata-rata atributnya', () => {
    const rs = BWF_2026, ina = WORLD.countries.find((c) => c.id === 'INA')!;
    const base = Array.from({ length: 9 }, (_, i) => ({ gender: i % 2 ? 'F' : 'M' }) as Player);
    let n = 0, above = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const s = makeScouting(base, ina, rs.generator, { year: 2027, week: 1 }, makeRng(seed));
      for (const p of s.candidates.filter((x) => s.types![x.id] === 'attack')) {
        n++;
        if ((p.attrs.smash + p.attrs.deception) / 2 > currentAbility(p.attrs)) above++;
      }
    }
    expect(above / n).toBeGreaterThan(0.85);
  });
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx vitest run src/engine/scouting.test.ts`
Expected: FAIL — `gemLine` / `SCOUT_TYPES` tidak diekspor.

- [ ] **Step 3: Implementasi** di `src/engine/scouting.ts`:

Impor tambahan: `import { capToPa } from './development';`

Di interface `Scouting` tambahkan:

```ts
  /** Tipe kandidat (gaya yang menonjol). Tidak ada di pencarian dari save lama. */
  types?: Record<string, ScoutType>;
  /** Kandidat yang ditandai ⭐ Bakat langka oleh pemandu (±90 % tepat, kadang permata palsu). */
  gems?: string[];
  /** Permata asli (PA ≥ ambang), tidak ditampilkan. */
  trueGems?: string[];
```

Konstanta & helper (letakkan di bawah `SCOUT_FOCI`):

```ts
export type ScoutType = 'doubles' | 'attack' | 'defense' | 'worker' | 'ready' | 'raw';
export const SCOUT_TYPES: ScoutType[] = ['doubles', 'attack', 'defense', 'worker', 'ready', 'raw'];
/** Atribut yang dinaikkan per tipe; atribut lain diturunkan sama rata agar kemampuan kira-kira tetap. ASUMSI. */
const TYPE_ATTRS: Partial<Record<ScoutType, Attr[]>> = {
  doubles: ['net', 'serve', 'smash'], attack: ['smash', 'deception'], defense: ['defense', 'consistency'], worker: ['speed', 'stamina'],
};
const TYPE_BOOST = 6;
/** Peluang angkatan per gender punya 2 permata; peluang permata ditandai; peluang ada satu permata palsu. ASUMSI. */
export const GEM_SECOND = 0.4, GEM_FLAG = 0.9, FALSE_GEM = 0.1;
/** Ambang permata: rata-rata PA negara + 1,5 sd (Indonesia ≈ 91). */
export const gemLine = (country: Country, gen: GeneratorConfig) =>
  Math.round(gen.potential.base + country.traditionStrength * gen.potential.perTradition + 1.5 * gen.potential.sd);

/** Geser atribut kandidat sesuai tipenya (siap pakai: semua naik, mentah: semua turun), lalu jaga CA ≤ PA. */
function shapeType(p: Player, type: ScoutType) {
  const up = TYPE_ATTRS[type];
  if (up) {
    const down = (TYPE_BOOST * up.length) / (ATTRS.length - up.length);
    for (const a of ATTRS) p.attrs[a] += up.includes(a) ? TYPE_BOOST : -down;
  } else for (const a of ATTRS) p.attrs[a] += type === 'ready' ? 5 : -4;
  if (type === 'doubles') p.focus = 'D';
  capToPa(p);
  for (const a of ATTRS) p.attrs[a] = Math.round(p.attrs[a]);
  p.attrHistory = [{ year: p.attrHistory[0]?.year ?? 0, attrs: { ...p.attrs } }];
}
```

Ganti isi loop per gender di `makeScouting` (bagian pembuatan `pool` s/d `for (const p of chosen)`) menjadi:

```ts
  const types: Record<string, ScoutType> = {};
  const trueGems: string[] = [], gems: string[] = [];
  const line = gemLine(country, gen);
  for (const g of ['M', 'F'] as const) {
    const n = Math.max(MIN_CANDIDATES, slots[g] * 2);
    // Tipe diundi dulu: mentah = usia termuda, siap pakai = usia tertua, lainnya acak.
    const pool = Array.from({ length: focus === 'balanced' ? n : n * 2 }, (_, i) => {
      const type = SCOUT_TYPES[Math.floor(rng() * SCOUT_TYPES.length)];
      const age = type === 'raw' ? gen.juniorAge.min : type === 'ready' ? gen.juniorAge.max
        : gen.juniorAge.min + Math.floor(rng() * (gen.juniorAge.max - gen.juniorAge.min + 1));
      const p = generatePlayer(rng, gen, country, g, age, date, `${country.id}-${g}${date.year}-s${i + 1}`, usedNames, 99, cities);
      types[p.id] = type;
      return p;
    });
    pool.forEach((p) => shapeType(p, types[p.id]));
    // Fokus: dibuat 2× lalu disaring menurut kecocokan + derau (fokus mengarahkan, tidak memastikan).
    const noisy = new Map(pool.map((p) => [p.id, focusScore(p, focus, date) + rng() * 10]));
    const chosen = focus === 'balanced' ? pool : [...pool].sort((x, y) => noisy.get(y.id)! - noisy.get(x.id)!).slice(0, n);
    // Permata: 1 (40 %: 2) kandidat PA tertinggi, sebisa mungkin usia ≤ 16, dinaikkan ke atas ambang; sisanya di bawah ambang.
    const k = rng() < GEM_SECOND ? 2 : 1;
    const young = chosen.filter((p) => ageAt(p.birth, date) <= 16);
    const byPa = (xs: Player[]) => [...xs].sort((a, b) => b.pa - a.pa);
    const picks = [...byPa(young), ...byPa(chosen.filter((p) => !young.includes(p)))].slice(0, k);
    for (const p of chosen) {
      if (picks.includes(p)) { p.pa = Math.min(99, Math.max(p.pa, line + Math.round(rng() * gen.potential.sd * 0.7))); trueGems.push(p.id); }
      else { p.pa = Math.min(p.pa, line - 1); capToPa(p); }
    }
    for (const p of picks) if (rng() < GEM_FLAG) gems.push(p.id);
    const rest = byPa(chosen.filter((p) => !picks.includes(p)));
    if (rest.length && rng() < FALSE_GEM) gems.push(rest[0].id); // permata palsu: kandidat biasa terbaik
    for (const p of chosen) {
      const s = potentialStars(p, date, 0);
      let lo = s - Math.floor(rng() * 5) * 0.5; // posisi perkiraan di dalam rentang diacak
      lo = Math.min(Math.max(lo, 0.5), 3);
      starRange[p.id] = [lo, lo + 2];
      candidates.push(p);
    }
  }
```

dan ubah `return` menjadi:

```ts
  const kept = new Set(candidates.map((p) => p.id));
  return { year: date.year, slots, candidates, starRange, notes,
    types: Object.fromEntries(Object.entries(types).filter(([id]) => kept.has(id))), gems, trueGems };
```

(`notes` tetap dihitung seperti sekarang sebelum `return`.)

- [ ] **Step 4: Jalankan tes scouting & seluruh tes**

Run: `npx vitest run src/engine/scouting.test.ts` → PASS. Lalu `npx vitest run` → semua PASS (tes kalibrasi populasi tidak terpengaruh karena hanya negara manajer). Bila tes lama yang memakai seed tertentu gagal hanya karena urutan acak bergeser (bukan perilaku), sesuaikan angka yang diharapkan dan sebutkan di pesan commit.

- [ ] **Step 5: Commit**

```bash
git add src/engine/scouting.ts src/engine/scouting.test.ts
git commit -m "Pencarian bakat: permata (ambang relatif tradisi, 1–2 per gender, ditandai ±90 %, kadang palsu) & tipe kandidat (ganda, penyerang, bertahan, pekerja keras, siap pakai, mentah)"
```

---

### Task 2: Laporan pemandu, saran nomor, mirip atlet (engine)

**Files:**
- Modify: `src/engine/scouting.ts`
- Test: `src/engine/scouting.test.ts`

**Interfaces:**
- Consumes: `ScoutType` (Task 1).
- Produces: `scoutReport(p: Player): { strong: [Attr, Attr]; weak: Attr }`, `suggestedEvent(p: Player, type?: ScoutType): Discipline`, `similarTo(p: Player, pool: Player[]): Player | undefined`, `similarPool(state: { players: Player[]; pairs: Pair[]; results: SeasonState['results']; date: GameDate }, rs: Ruleset, d: Discipline, gender: 'M' | 'F'): Player[]`.

- [ ] **Step 1: Tes yang gagal**

```ts
  it('laporan pemandu, saran nomor & mirip atlet', () => {
    const p = { gender: 'M', focus: undefined, attrs: { speed: 70, stamina: 66, serve: 40, warmup: 50, consistency: 50, net: 45, defense: 50, smash: 52, deception: 48, mental: 30 } } as unknown as Player;
    expect(scoutReport(p)).toEqual({ strong: ['speed', 'stamina'], weak: 'mental' });
    expect(suggestedEvent(p)).toBe('MS');
    expect(suggestedEvent({ ...p, gender: 'F' } as Player, 'doubles')).toBe('WD');
    const twin = { ...p, id: 'a', attrs: { ...p.attrs, speed: 80, stamina: 76 } } as Player; // profil sama, lebih kuat
    const other = { ...p, id: 'b', attrs: { ...p.attrs, speed: 40, smash: 80 } } as Player;
    expect(similarTo(p, [other, twin])?.id).toBe('a');
    expect(similarTo(p, [])).toBeUndefined();
  });

  it('similarPool: top 100 senior aktif segender di nomor itu', () => {
    const rs = BWF_2026;
    const state = newSeason(WORLD, rs, 3, { year: 2026, week: 1 }, 'INA');
    const ms = similarPool(state, rs, 'MS', 'M');
    expect(ms.length).toBe(100);
    expect(ms.every((x) => x.gender === 'M' && x.retired === undefined)).toBe(true);
    const md = similarPool(state, rs, 'MD', 'M');
    expect(md.length).toBeGreaterThan(50);
    expect(md.every((x) => x.gender === 'M')).toBe(true);
  });
```

(Impor `scoutReport, suggestedEvent, similarTo, similarPool` dari `./scouting`.)

- [ ] **Step 2: Jalankan, pastikan gagal** — `npx vitest run src/engine/scouting.test.ts` → FAIL (fungsi belum ada).

- [ ] **Step 3: Implementasi** di `src/engine/scouting.ts` (impor `computeRanking`, `absWeek` dari `./ranking`; tipe `Discipline`, `Pair`, `Ruleset` dari `./types`; `type SeasonState` dari `./season` sebagai `import type` agar tidak melingkar):

```ts
/** Laporan pemandu: dua atribut terkuat & satu terlemah (urutan ATTRS memecah seri). Selalu benar. */
export function scoutReport(p: Player): { strong: [Attr, Attr]; weak: Attr } {
  const s = [...ATTRS].sort((x, y) => p.attrs[y] - p.attrs[x] || ATTRS.indexOf(x) - ATTRS.indexOf(y));
  return { strong: [s[0], s[1]], weak: s[s.length - 1] };
}

/** Saran nomor: ganda bila tipe/fokus ganda atau rata-rata net+serve+smash jauh di atas speed+stamina. */
export function suggestedEvent(p: Player, type?: ScoutType): Discipline {
  const a = p.attrs;
  const doubles = type === 'doubles' || p.focus === 'D' || (a.net + a.serve + a.smash) / 3 > (a.speed + a.stamina) / 2 + 2;
  return doubles ? (p.gender === 'M' ? 'MD' : 'WD') : p.gender === 'M' ? 'MS' : 'WS';
}

/** Atlet di `pool` yang profil atributnya (selisih dari rata-rata sendiri) paling mirip — kemiripan kosinus. */
export function similarTo(p: Player, pool: Player[]): Player | undefined {
  const vec = (x: Player) => { const m = ATTRS.reduce((s, k) => s + x.attrs[k], 0) / ATTRS.length; return ATTRS.map((k) => x.attrs[k] - m); };
  const pv = vec(p), pn = Math.hypot(...pv) || 1;
  let best: Player | undefined, score = -Infinity;
  for (const q of pool) {
    const qv = vec(q), c = qv.reduce((s, x, i) => s + x * pv[i], 0) / ((Math.hypot(...qv) || 1) * pn);
    if (c > score) { score = c; best = q; }
  }
  return best;
}

/** Pembanding "gayanya mirip": atlet senior aktif segender di top 100 nomor itu (ganda: atlet di pasangan top 100). */
export function similarPool(state: Pick<SeasonState, 'players' | 'pairs' | 'results' | 'date'>, rs: Ruleset, d: Discipline, gender: 'M' | 'F') {
  const byId = new Map(state.players.map((p) => [p.id, p]));
  const pairs = new Map(state.pairs.map((p) => [p.id, p]));
  const ids = computeRanking(state.results, d, absWeek(state.date), rs).slice(0, 100)
    .flatMap((r) => pairs.get(r.entrantId)?.playerIds ?? [r.entrantId]);
  return [...new Set(ids)].map((id) => byId.get(id)).filter((p): p is Player => !!p && p.gender === gender && p.retired === undefined);
}
```

- [ ] **Step 4: Jalankan** — `npx vitest run src/engine/scouting.test.ts` → PASS; `npx tsc --noEmit -p .` → tanpa error.

- [ ] **Step 5: Commit**

```bash
git add src/engine/scouting.ts src/engine/scouting.test.ts
git commit -m "Pencarian bakat: laporan pemandu (2 kekuatan, 1 kelemahan), saran nomor, pembanding gaya atlet top 100"
```

---

### Task 3: Asal-usul atlet & berita permata (engine)

**Files:**
- Modify: `src/engine/types.ts` (`Player.scouted`), `src/engine/scouting.ts` (`recruit`, `recruitSome`, `scoutVerdict`), `src/engine/news.ts` (`NewsItem` `gem`)
- Test: `src/engine/scouting.test.ts`, `src/engine/news.test.ts`

**Interfaces:**
- Consumes: `Scouting.gems`, `Scouting.trueGems` (Task 1), `starRangeAt` (sudah ada).
- Produces: `Player.scouted?: { year: number; cityId?: string; stars: [number, number]; gem: boolean }`, `scoutVerdict(p: Player, now: number): 'above' | 'match' | 'below' | undefined` (`now` = bintang potensi sekarang), `NewsItem { kind: 'gem'; ids: string[] }`. `recruit`/`recruitSome` kini menerima state dengan `date: GameDate`.

- [ ] **Step 1: Tes yang gagal** — di `scouting.test.ts`:

```ts
  it('rekrut mencatat asal-usul: tahun, kota, rentang ★ minggu itu, permata', () => {
    const rs = BWF_2026, ina = WORLD.countries.find((c) => c.id === 'INA')!;
    const base = Array.from({ length: 4 }, (_, i) => ({ gender: i % 2 ? 'F' : 'M' }) as Player);
    const s = makeScouting(base, ina, rs.generator, { year: 2027, week: 1 }, makeRng(5), undefined, WORLD.cities);
    const state = { players: [] as Player[], scouting: s, date: { year: 2027, week: 3 } };
    const gem = s.candidates.find((p) => s.trueGems!.includes(p.id))!;
    const range = starRangeAt(s, gem, 3);
    recruitSome(state, [gem.id]);
    expect(state.players[0].scouted).toEqual({ year: 2027, cityId: gem.hometown, stars: range, gem: true });
    recruit(state, []); // sisanya diisi otomatis, juga tercatat
    expect(state.players.every((p) => p.scouted?.year === 2027)).toBe(true);
    expect(scoutVerdict(state.players[0], range[1] + 0.5)).toBe('above');
    expect(scoutVerdict(state.players[0], range[0])).toBe('match');
    expect(scoutVerdict(state.players[0], range[0] - 0.5)).toBe('below');
    expect(scoutVerdict({ ...state.players[0], scouted: undefined }, 3)).toBeUndefined();
  });
```

Di `news.test.ts` (ikuti pola setup tes di file itu; contoh mandiri):

```ts
  it('berita permata selama pencarian terbuka', () => {
    const rs = BWF_2026;
    const state = newSeason(WORLD, rs, 9, { year: 2027, week: 2 }, 'INA');
    const ina = WORLD.countries.find((c) => c.id === 'INA')!;
    const base = Array.from({ length: 4 }, (_, i) => ({ gender: i % 2 ? 'F' : 'M' }) as Player);
    state.scouting = makeScouting(base, ina, rs.generator, { year: 2027, week: 1 }, makeRng(2), undefined, WORLD.cities);
    state.scouting.gems = [state.scouting.candidates[0].id];
    expect(weeklyNews(state, rs).find((n) => n.kind === 'gem')).toEqual({ kind: 'gem', ids: [state.scouting.candidates[0].id] });
    state.date.week = 5;
    expect(weeklyNews(state, rs).some((n) => n.kind === 'gem')).toBe(false);
  });
```

- [ ] **Step 2: Jalankan, pastikan gagal** — `npx vitest run src/engine/scouting.test.ts src/engine/news.test.ts` → FAIL.

- [ ] **Step 3: Implementasi**

`src/engine/types.ts`, di `Player` setelah `hometown`:

```ts
  /** Asal-usul dari pencarian bakat negara manajer: tahun, kota, rentang ★ saat direkrut, ditandai permata. */
  scouted?: { year: number; cityId?: string; stars: [number, number]; gem: boolean };
```

`src/engine/scouting.ts`:

```ts
/** Catat asal-usul kandidat yang direkrut (rentang ★ yang terlihat minggu itu). */
function markScouted(s: Scouting, p: Player, week: number) {
  p.scouted = { year: s.year, cityId: p.hometown, stars: starRangeAt(s, p, week), gem: !!s.trueGems?.includes(p.id) };
}

/** Perbandingan perkiraan saat direkrut dengan bintang potensi sekarang. */
export function scoutVerdict(p: Player, now: number): 'above' | 'match' | 'below' | undefined {
  if (!p.scouted) return undefined;
  const [lo, hi] = p.scouted.stars;
  return now > hi ? 'above' : now < lo ? 'below' : 'match';
}
```

Ubah `recruit` & `recruitSome` agar state bertipe `{ players: Player[]; scouting?: Scouting; date: GameDate }` dan memanggil `markScouted` sebelum `push`:

```ts
export function recruit(state: { players: Player[]; scouting?: Scouting; date: GameDate }, ids: string[]) {
  const s = state.scouting;
  if (!s) return;
  const chosen = new Set(ids.length || s.recruited ? ids : autoPick(s)); // sudah rekrut bertahap: tidak diisi otomatis lagi
  const week = state.date.year === s.year ? state.date.week : 1;
  const picked = s.candidates.filter((p) => chosen.has(p.id));
  picked.forEach((p) => markScouted(s, p, week));
  state.players.push(...picked);
  delete state.scouting;
}
```

```ts
export function recruitSome(state: { players: Player[]; scouting?: Scouting; date: GameDate }, ids: string[]) {
  const s = state.scouting;
  if (!s || !ids.length) return;
  const set = new Set(ids);
  const week = state.date.year === s.year ? state.date.week : 1;
  const picked = s.candidates.filter((p) => set.has(p.id));
  picked.forEach((p) => markScouted(s, p, week));
  state.players.push(...picked);
  for (const p of picked) s.slots[p.gender] = Math.max(0, s.slots[p.gender] - 1);
  s.candidates = s.candidates.filter((p) => !set.has(p.id));
  s.recruited = (s.recruited ?? 0) + picked.length;
}
```

Catatan: di `season.ts` `recruit(state, [])` dipanggil saat `state.date` sudah tahun baru — benar, tidak perlu diubah. Pemanggilan lain di tes lama yang memberi objek tanpa `date` harus ditambah `date`.

`src/engine/news.ts`: tambahkan varian `| { kind: 'gem'; ids: string[] }` ke `NewsItem`, impor `SCOUTING_DEADLINE_WEEK` dari `./scouting`, dan setelah baris `const hosts: NewsItem[] = …`:

```ts
  // Pencarian bakat terbuka: kandidat ⭐ yang masih ada (belum direkrut / mundur) diberitakan.
  const sc = state.scouting;
  const gemIds = sc && sc.year === year && week <= SCOUTING_DEADLINE_WEEK ? (sc.gems ?? []).filter((id) => sc.candidates.some((c) => c.id === id)) : [];
  if (gemIds.length) hosts.push({ kind: 'gem', ids: gemIds });
```

- [ ] **Step 4: Jalankan** — `npx vitest run src/engine/scouting.test.ts src/engine/news.test.ts` → PASS; `npx tsc --noEmit -p .` → error hanya di UI yang memakai `NewsItem` secara exhaustive (`row()` di `Career.tsx`); tambahkan sementara `case 'gem': return ['', null, null];` lalu jalankan `npx vitest run` → semua PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/types.ts src/engine/scouting.ts src/engine/news.ts src/engine/scouting.test.ts src/engine/news.test.ts src/ui/Career.tsx
git commit -m "Pencarian bakat: asal-usul atlet saat direkrut (tahun, kota, rentang ★, permata) & berita permata selama pencarian terbuka"
```

---

### Task 4: Kartu pencarian bakat — daftar ringkas + panel detail (UI)

**Files:**
- Create: `src/ui/Scouting.tsx` (pindahan `ScoutingCard` dari `src/ui/Career.tsx` + panel)
- Modify: `src/ui/Career.tsx` (hapus `ScoutingCard` lama, impor dari `./Scouting`; baris berita `gem`), `src/i18n/index.ts`, `src/i18n/en.ts`, `src/ui/style.css`

**Interfaces:**
- Consumes: `scoutReport`, `suggestedEvent`, `similarTo`, `similarPool` (Task 2), `Scouting.types/gems` (Task 1), `NewsItem gem` (Task 3), `ScoutFocusSelect` & `TraitTags`-style tag dari `./Squad`.
- Produces: `export function ScoutingCard()` dari `src/ui/Scouting.tsx`.

- [ ] **Step 1: Kunci teks** — tambahkan ke `src/i18n/index.ts` (id) dan `src/i18n/en.ts` (en), di baris yang sama dengan `scoutingHint`:

id:
```ts
  scoutGem: 'Bakat langka', scoutGemHint: 'Pemandu menilai potensinya luar biasa (biasanya tepat, kadang meleset).', scoutEvent: 'Saran nomor',
  scoutReportTitle: 'Laporan pemandu', scoutLooksLike: 'Gayanya mirip', scoutPick: 'Pilih kandidat untuk melihat laporan pemandu.',
  scoutReportText: '{a} dan {b} menonjol; {w} masih perlu diasah.',
  scoutType_doubles: 'Spesialis ganda', scoutType_attack: 'Penyerang', scoutType_defense: 'Bertahan', scoutType_worker: 'Pekerja keras', scoutType_ready: 'Siap pakai', scoutType_raw: 'Mentah',
  newsGemTag: 'Bakat', newsGem: 'Pemandu menemukan talenta luar biasa dari {city}',
```
en:
```ts
  scoutGem: 'Rare talent', scoutGemHint: 'Scouts rate the potential as exceptional (usually right, sometimes wrong).', scoutEvent: 'Suggested event',
  scoutReportTitle: 'Scout report', scoutLooksLike: 'Plays like', scoutPick: 'Select a candidate to read the scout report.',
  scoutReportText: '{a} and {b} stand out; {w} still needs work.',
  scoutType_doubles: 'Doubles specialist', scoutType_attack: 'Attacker', scoutType_defense: 'Defender', scoutType_worker: 'Workhorse', scoutType_ready: 'Ready now', scoutType_raw: 'Raw',
  newsGemTag: 'Talent', newsGem: 'Scouts discover an exceptional talent from {city}',
```

- [ ] **Step 2: Buat `src/ui/Scouting.tsx`** — pindahkan `ScoutingCard` dari `Career.tsx` (fungsi di bawah komentar "Pencarian bakat junior: pilih kandidat…") dan ubah menjadi daftar + panel:

```tsx
import { useMemo, useState } from 'react';
import { ageAt, currentAbility } from '../engine/generator';
import { autoPick, recruit, recruitSome, SCOUTING_DEADLINE_WEEK, scoutReport, similarPool, similarTo, starRangeAt, styleOf, suggestedEvent } from '../engine/scouting';
import { ATTRS, type Player } from '../engine/types';
import { dataName, t, type TextKey } from '../i18n';
import { saveGame, useGame } from './game';
import { ScoutFocusSelect } from './Squad';

/** Pencarian bakat junior: daftar ringkas kandidat (centang untuk memilih), panel laporan pemandu untuk kandidat yang diketuk. */
export function ScoutingCard() {
  const { game, changed } = useGame();
  const { state, ruleset } = game;
  const s = state.scouting!;
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [shown, setShown] = useState<string>();
  const count = (g: 'M' | 'F') => s.candidates.filter((p) => p.gender === g && picked.includes(p.id)).length;
  const toggle = (id: string) => setPicked(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]);
  const done = () => { recruit(state, picked); changed(); void saveGame(game); };
  const some = () => { recruitSome(state, picked); setPicked([]); setShown(undefined); changed(); void saveGame(game); };
  const week = state.date.year === s.year ? state.date.week : 1; // rentang potensi menyempit tiap minggu
  const city = (id?: string) => (id ? dataName(game.world.cities.find((c) => c.id === id)?.name) : undefined);
  const half = (n: number) => `${Math.floor(n) || ''}${n % 1 ? '½' : ''}`; // 2.5 → "2½"
  const gem = (p: Player) => s.gems?.includes(p.id);
  const status = t(s.recruited ? 'scoutingStatusPartial' : 'scoutingStatus', { m: count('M'), f: count('F'), sm: s.slots.M, sf: s.slots.F, week: SCOUTING_DEADLINE_WEEK, n: s.recruited ?? 0 });
  const sel = s.candidates.find((p) => p.id === shown);
  return (
    <section className="card" style={open ? { gridColumn: '1 / -1' } : undefined}>
      <h3>{t('scouting')} {s.year}</h3>
      <p>{status}</p>
      {!open ? <button className="primary" onClick={() => setOpen(true)}>{t('scoutingOpen')}</button> : (
        <>
          <p className="hint">{t('scoutingHint', { week: SCOUTING_DEADLINE_WEEK })}</p>
          {!!s.withdrawn?.length && <p className="hint">{t('scoutWithdrawn', { names: s.withdrawn.join(', ') })}</p>}
          <div className="split">
            <div>
              {(['M', 'F'] as const).filter((g) => s.candidates.some((p) => p.gender === g)).map((g) => (
                <div key={g} className="scroll">
                  <h4>{t(g === 'M' ? 'men' : 'women')} · {count(g)}</h4>
                  <table className="fit scoutlist">
                    <thead><tr><th></th><th>{t('name')}</th><th className="num">{t('age')}</th><th className="num">{t('ability')}</th><th>{t('potential')}</th><th>{t('scoutEvent')}</th></tr></thead>
                    <tbody>{s.candidates.filter((p) => p.gender === g).map((p) => {
                      const [lo, hi] = starRangeAt(s, p, week);
                      return (
                        <tr key={p.id} className={[picked.includes(p.id) && 'sel', shown === p.id && 'focus'].filter(Boolean).join(' ') || undefined} onClick={() => setShown(p.id)} style={{ cursor: 'pointer' }}>
                          <td onClick={(e) => { e.stopPropagation(); toggle(p.id); }}><input type="checkbox" checked={picked.includes(p.id)} readOnly aria-label={p.name} /></td>
                          <td>{gem(p) && <span className="gem" title={t('scoutGemHint')}>⭐ </span>}{p.name}</td>
                          <td className="num">{ageAt(p.birth, state.date)}</td>
                          <td className="num">{currentAbility(p.attrs)}</td>
                          <td className="stars">{half(lo)}–{half(hi)} ★</td>
                          <td><span className="chip">{suggestedEvent(p, s.types?.[p.id])}</span></td>
                        </tr>
                      );
                    })}</tbody>
                  </table>
                </div>
              ))}
            </div>
            <aside className="sidepanel">
              {sel ? <ScoutPanel p={sel} gemmed={!!gem(sel)} city={city(sel.hometown)} /> : <p className="hint">{t('scoutPick')}</p>}
            </aside>
          </div>
          <p className="controls scout-actions">
            <button onClick={() => setPicked(autoPick(s, picked))}>{t('autoPick')}</button>
            <button disabled={!picked.length} onClick={some}>{t('scoutRecruitSome')} ({picked.length})</button>
            <button className="primary" disabled={!picked.length && !s.recruited} onClick={done}>{t('scoutFinish')}{picked.length ? ` (${picked.length})` : ''}</button>
          </p>
          <ScoutFocusSelect />
        </>
      )}
    </section>
  );

  /** Panel kandidat: identitas, permata & tipe, laporan pemandu, gaya mirip, catatan sifat, batang atribut. */
  function ScoutPanel({ p, gemmed, city }: { p: Player; gemmed: boolean; city?: string }) {
    const type = s.types?.[p.id];
    const d = suggestedEvent(p, type);
    const pool = useMemo(() => similarPool(state, ruleset, d, p.gender), [d, p.gender]);
    const twin = similarTo(p, pool);
    const r = scoutReport(p);
    return (
      <>
        <h3>{p.name}</h3>
        <p className="muted-text">{[city, `${ageAt(p.birth, state.date)} ${t('yearsShort')}`, ...styleOf(p).map((a) => t(a))].filter(Boolean).join(' · ')}</p>
        <p>{gemmed && <span className="tag gold-tag" title={t('scoutGemHint')}>⭐ {t('scoutGem')}</span>} {type && <span className="tag">{t(`scoutType_${type}` as TextKey)}</span>} <span className="chip">{d}</span></p>
        <h4>{t('scoutReportTitle')}</h4>
        <p>“{t('scoutReportText', { a: t(r.strong[0]), b: t(r.strong[1]), w: t(r.weak) })}”</p>
        {twin && <p><span className="muted-text">{t('scoutLooksLike')}:</span> <b>{twin.name}</b></p>}
        {!!s.notes?.[p.id]?.length && <p>{s.notes[p.id].map((n) => <span key={n} className="tag muted-tag" title={t(`traitHint_${n}` as TextKey)}>{t(`trait_${n}` as TextKey)}?</span>)}</p>}
        <div className="attrlist" role="list">
          {ATTRS.map((a) => (
            <div key={a} role="listitem" className="attrrow">
              <span className="name">{t(a)}</span><span className="meter"><span style={{ width: `${Math.round(p.attrs[a])}%` }} /></span><b className="val">{Math.round(p.attrs[a])}</b><span className="delta" />
            </div>
          ))}
        </div>
      </>
    );
  }
}
```

Catatan: cek bahwa kunci `yearsShort` ada (`grep -n "yearsShort" src/i18n/index.ts`); bila tidak ada, pakai kunci usia yang dipakai `Squad.tsx` untuk "23 y" dan sesuaikan.

- [ ] **Step 3: `Career.tsx`** — hapus fungsi `ScoutingCard` lama beserta impor yang tidak terpakai lagi (`autoPick, recruit, recruitSome, starRangeAt, styleOf` bila tidak dipakai di tempat lain — cek dengan `grep`), tambahkan `import { ScoutingCard } from './Scouting';`. Ganti sementara `case 'gem'` dari Task 3 dengan:

```tsx
      case 'gem': return [t('newsGemTag'), <>{n.ids.map((id, i) => {
        const p = state.scouting?.candidates.find((c) => c.id === id);
        return <span key={id}>{i > 0 && ' · '}{t('newsGem', { city: dataName(game.world.cities.find((c) => c.id === p?.hometown)?.name) ?? '—' })}</span>;
      })}</>, null];
```

- [ ] **Step 4: CSS** — tambahkan di `src/ui/style.css` dekat aturan `.news .badge.news-hosts`:

```css
.news .badge.news-gem { background: var(--gold-soft); color: var(--gold); }
/* Pencarian bakat: baris yang panelnya terbuka diberi garis aksen; tanda permata & tag emas. */
.scoutlist tr.focus td { box-shadow: inset 0 -2px 0 var(--accent); }
.scoutlist td:first-child { width: 2em; }
.gem { color: var(--gold); }
.tag.gold-tag { background: var(--gold-soft); color: var(--gold); font-weight: 700; }
```

- [ ] **Step 5: Verifikasi** — `npx tsc --noEmit -p .` tanpa error; `npx vitest run` semua PASS; `npm run build` berhasil. Uji di browser (lihat `browser-testing-notes`): buat New Game Indonesia atau maju ke akhir musim pada save uji sampai kartu Pencarian bakat muncul; buka kartu → klik kandidat → panel tampil di samping (laptop) / di bawah daftar (HP, iframe 390 px); centang kotak tetap memilih; ⭐ muncul di 1–2 kandidat per gender; Berita menampilkan "Bakat". Periksa tema gelap.

- [ ] **Step 6: Commit**

```bash
git add src/ui/Scouting.tsx src/ui/Career.tsx src/ui/style.css src/i18n/index.ts src/i18n/en.ts
git commit -m "Pencarian bakat: daftar ringkas (⭐, saran nomor) + panel kandidat (laporan pemandu, tipe, gaya mirip atlet top 100, catatan sifat, atribut) & berita Bakat"
```

---

### Task 5: Asal-usul di profil, dokumentasi

**Files:**
- Modify: `src/ui/Squad.tsx` (fakta di kepala profil, dekat baris `fact(t('potential'), …)`), `src/i18n/index.ts`, `src/i18n/en.ts`, `docs/ASUMSI.md`, `docs/RENCANA.md`

**Interfaces:**
- Consumes: `Player.scouted`, `scoutVerdict` (Task 3), `potentialStars` (sudah ada di `Squad.tsx`).

- [ ] **Step 1: Kunci teks**

id: `scoutedFact: 'Asal-usul', scoutedText: 'Pencarian bakat {y}{city} · perkiraan {lo}–{hi} ★', scoutVerdict_above: 'melampaui perkiraan', scoutVerdict_match: 'sesuai perkiraan', scoutVerdict_below: 'di bawah perkiraan',`
en: `scoutedFact: 'Origin', scoutedText: 'Talent search {y}{city} · estimated {lo}–{hi} ★', scoutVerdict_above: 'beyond estimate', scoutVerdict_match: 'as estimated', scoutVerdict_below: 'below estimate',`

- [ ] **Step 2: Profil** — di `src/ui/Squad.tsx`, impor `scoutVerdict` dari `../engine/scouting`, lalu tepat setelah baris `{fact(t('potential'), …)}` (±baris 425):

```tsx
          {p.scouted && (() => {
            const now = potentialStars(p, state.date, counts.get(p.id) ?? 0);
            const v = scoutVerdict(p, now)!;
            const c = dataName(game.world.cities.find((x) => x.id === p.scouted!.cityId)?.name);
            return fact(t('scoutedFact'), <>{p.scouted.gem && '⭐ '}{t('scoutedText', { y: p.scouted.year, city: c ? ` · ${c}` : '', lo: p.scouted.stars[0], hi: p.scouted.stars[1] })}
              {' '}<span className={v === 'above' ? 'up' : v === 'below' ? 'down' : 'muted-text'}>({t(`scoutVerdict_${v}` as TextKey)})</span></>);
          })()}
```

(Pastikan `dataName`, `game`, `TextKey` sudah tersedia di scope `Profile`; tambahkan impor bila belum.)

- [ ] **Step 3: Dokumentasi** — di `docs/ASUMSI.md` bagian "Pencarian bakat (Fase 5…)" tambahkan butir:

```md
- **Permata & tipe** (2026-10-29): ambang permata = rata-rata PA negara + 1,5 sd (Indonesia ≈ 91); per gender 1 permata (40 %: 2), dipilih dari kandidat PA tertinggi usia ≤ 16 bila ada, PA dinaikkan ke ambang + 0–0,7 sd (maks 99); kandidat lain dibatasi PA ≤ ambang − 1. Penanda ⭐: permata asli 90 %, 10 % ada satu permata palsu (kandidat biasa terbaik). Tipe diundi rata: spesialis ganda (net/serve/smash +6, fokus ganda), penyerang (smash/deception +6), bertahan (defense/consistency +6), pekerja keras (speed/stamina +6), siap pakai (usia 17, semua +5), mentah (usia 15, semua −4); atribut lain diturunkan sama rata, CA ≤ PA.
- **Laporan pemandu** = dua atribut terkuat & satu terlemah (selalu benar); "gayanya mirip" = atlet top 100 senior segender di nomor saran dengan profil atribut paling mirip (kosinus). Saran nomor ganda bila tipe ganda atau rata-rata net+serve+smash > speed+stamina + 2.
- **Asal-usul** dicatat saat direkrut (tahun, kota, rentang ★ minggu itu, permata asli); profil membandingkan dengan ★ sekarang.
```

Di `docs/RENCANA.md` tambahkan bagian baru di bawah "Koreksi aturan (dicek terhadap regulasi BWF, 2026-10-27)":

```md
## Perbaikan junior (disetujui 2026-10-29)
Spesifikasi: `docs/superpowers/specs/2026-10-29-junior-scouting-promosi-design.md`.
- [x] **Bagian 1 — Pencarian bakat**: permata & tipe, daftar + panel (laporan pemandu, gaya mirip), berita Bakat, asal-usul di profil.
- [ ] **Bagian 2 — Promosi**: ⬆ siap promosi, terlalu cepat / terlambat.
- [ ] **Bagian 3 — Kabar**: berita terobosan, prediksi puncak.
- [ ] **Bagian 4 — Turnamen junior**: target junior, chip Junior, Pratama top ke grade 3 senior, kuota BWF.
```

- [ ] **Step 4: Verifikasi** — `npx tsc --noEmit -p .`; `npx vitest run`; `npm run build`; di browser rekrut satu kandidat lalu buka profilnya → baris Asal-usul tampil.

- [ ] **Step 5: Commit**

```bash
git add src/ui/Squad.tsx src/i18n/index.ts src/i18n/en.ts docs/ASUMSI.md docs/RENCANA.md
git commit -m "Profil: asal-usul dari pencarian bakat (tahun, kota, perkiraan ★ vs sekarang); ASUMSI & RENCANA junior bagian 1"
```
