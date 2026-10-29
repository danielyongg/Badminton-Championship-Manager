# Junior bagian 2 — Promosi Pratama → Utama: rencana implementasi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promosi jadi satu keputusan berakibat: tanda ⬆ Siap promosi (+ berita), promosi terlalu cepat memperbesar turunnya morale saat kalah di senior, terlambat memperlambat pertumbuhan.

**Architecture:** Modul murni baru `src/engine/promotion.ts` (ambang, siap, terlalu cepat, tertahan). `season.ts` memanggil `updateReadiness` di akhir minggu dan memberi `heldBack` ke `developQuarter`; `updateMorale` memperbesar penurunan untuk atlet `earlyPromo`. `career.promoteJunior` mendelegasikan ke `promote`. UI: tanda di Skuad → Junior & profil, berita `ready`, kelompok laporan kuartal "Tertahan di junior".

**Tech Stack:** TypeScript, React 19, Vitest.

**Spesifikasi:** `docs/superpowers/specs/2026-10-29-junior-scouting-promosi-design.md` bagian 2.

## Global Constraints
- Hanya junior Pratama negara manajer; negara AI tidak memakai status ini.
- Tetap: tombol Promote, usia 19 otomatis senior, entry manual Pratama ke senior boleh.
- Field baru opsional (`Player.readySince`, `Player.earlyPromo`) — save lama jalan.
- Teks lewat `t()` di `src/i18n/index.ts` & `src/i18n/en.ts`; angka asumsi dicatat di `docs/ASUMSI.md`.
- Konstanta: siap = CA ≥ CA atlet peringkat 200 tunggal senior segender (spesialis ganda: rata-rata CA pasangan peringkat 100 MD/WD) atau masuk 10 besar ranking junior nomor mana pun; terlalu cepat = CA < ambang − 5 → 26 minggu kekalahan senior ×1,5 penurunan morale; terlambat = siap > 26 minggu masih Pratama → pertumbuhan kuartal ×0,9.

---

### Task 1: Modul promosi (engine)

**Files:** Create `src/engine/promotion.ts`, `src/engine/promotion.test.ts`; Modify `src/engine/types.ts` (Player), `src/engine/career.ts` (`promoteJunior`).

**Interfaces — Produces:** `READY_SENIOR_RANK=200`, `READY_DOUBLES_RANK=100`, `READY_JUNIOR_RANK=10`, `EARLY_GAP=5`, `EARLY_WEEKS=26`, `EARLY_LOSS=1.5`, `LATE_WEEKS=26`, `LATE_GROWTH=0.9`; `interface ReadyLines { M; F; MD; WD: number; juniorTop: Set<string> }`; `readyLines(state, rs): ReadyLines`; `promotionLine(p, l): number`; `isReady(p, l): boolean`; `updateReadiness(state, rs): void`; `promote(state, rs, id): void`; `isEarly(p, now: number): boolean`; `isHeldBack(p, date): boolean`. `Player.readySince?: number` (minggu absolut pertama siap), `Player.earlyPromo?: number` (minggu absolut akhir masa "belum siap"). `promoteJunior(state: SeasonState, playerId, rs?: Ruleset)`.

- [ ] **Step 1: Tes gagal** (`src/engine/promotion.test.ts`):

```ts
import { describe, expect, it } from 'vitest';
import { BWF_2026 } from './presets/bwf2026';
import { WORLD } from './presets/world';
import { newSeason } from './season';
import { currentAbility, isPratama } from './generator';
import { absWeek } from './ranking';
import { EARLY_WEEKS, isEarly, isHeldBack, isReady, LATE_WEEKS, promote, promotionLine, readyLines, updateReadiness } from './promotion';
import { ATTRS } from './types';

describe('promosi junior', () => {
  const rs = BWF_2026;
  const fresh = () => newSeason(WORLD, rs, 4, { year: 2026, week: 10 }, 'INA');
  const pratama = (s: ReturnType<typeof fresh>) => s.players.filter((p) => p.countryId === 'INA' && isPratama(p, s.date) && p.focus !== 'D');

  it('ambang = CA peringkat 200 tunggal segender; siap bila di atasnya', () => {
    const s = fresh(), l = readyLines(s, rs);
    expect(l.M).toBeGreaterThan(40);
    expect(l.M).toBeLessThan(90);
    const p = pratama(s)[0];
    expect(promotionLine(p, l)).toBe(l[p.gender]);
    for (const a of ATTRS) p.attrs[a] = Math.ceil(l[p.gender]) + 1;
    expect(isReady(p, l)).toBe(true);
    for (const a of ATTRS) p.attrs[a] = 10;
    expect(isReady(p, { ...l, juniorTop: new Set() })).toBe(false);
    expect(isReady(p, { ...l, juniorTop: new Set([p.id]) })).toBe(true);
  });

  it('updateReadiness mencatat minggu pertama siap sekali saja', () => {
    const s = fresh(), l = readyLines(s, rs), p = pratama(s)[0];
    for (const a of ATTRS) p.attrs[a] = Math.ceil(l[p.gender]) + 1;
    p.pa = 99;
    updateReadiness(s, rs);
    expect(p.readySince).toBe(absWeek(s.date));
    s.date.week += 1;
    updateReadiness(s, rs);
    expect(p.readySince).toBe(absWeek(s.date) - 1);
  });

  it('promosi terlalu cepat menandai earlyPromo 26 minggu; siap tidak', () => {
    const s = fresh(), l = readyLines(s, rs);
    const [weak, strong] = pratama(s);
    for (const a of ATTRS) weak.attrs[a] = 10;
    for (const a of ATTRS) strong.attrs[a] = Math.ceil(l[strong.gender]) + 1;
    strong.pa = 99;
    promote(s, rs, weak.id);
    promote(s, rs, strong.id);
    expect(weak.promoted && strong.promoted).toBe(true);
    expect(weak.earlyPromo).toBe(absWeek(s.date) + EARLY_WEEKS);
    expect(strong.earlyPromo).toBeUndefined();
    expect(isEarly(weak, absWeek(s.date) + EARLY_WEEKS)).toBe(true);
    expect(isEarly(weak, absWeek(s.date) + EARLY_WEEKS + 1)).toBe(false);
  });

  it('tertahan: siap > 26 minggu dan masih Pratama', () => {
    const s = fresh(), p = pratama(s)[0], now = absWeek(s.date);
    p.readySince = now - LATE_WEEKS;
    expect(isHeldBack(p, s.date)).toBe(false);
    p.readySince = now - LATE_WEEKS - 1;
    expect(isHeldBack(p, s.date)).toBe(true);
    p.promoted = true;
    expect(isHeldBack(p, s.date)).toBe(false);
    expect(currentAbility(p.attrs)).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2:** `npx vitest run src/engine/promotion.test.ts` → FAIL (modul belum ada).
- [ ] **Step 3: Implementasi** — `src/engine/types.ts` (Player, setelah `promoted`):

```ts
  /** Minggu absolut pertama kali junior Pratama dinilai siap promosi (negara manajer). */
  readySince?: number;
  /** Dipromosikan sebelum siap: sampai minggu absolut ini kekalahan di turnamen senior lebih menurunkan morale. */
  earlyPromo?: number;
```

`src/engine/promotion.ts`:

```ts
import { currentAbility, isPratama } from './generator';
import { absWeek, computeRanking } from './ranking';
import type { SeasonState } from './season';
import { DISCIPLINES, type GameDate, type Player, type Ruleset } from './types';

// Promosi junior Pratama → Utama (hanya negara manajer): kapan siap, akibat promosi terlalu cepat atau terlambat. ASUMSI.
export const READY_SENIOR_RANK = 200, READY_DOUBLES_RANK = 100, READY_JUNIOR_RANK = 10;
export const EARLY_GAP = 5, EARLY_WEEKS = 26, EARLY_LOSS = 1.5;
export const LATE_WEEKS = 26, LATE_GROWTH = 0.9;

/** Ambang kemampuan per kelompok + atlet yang ada di 10 besar ranking junior (nomor mana pun). */
export interface ReadyLines { M: number; F: number; MD: number; WD: number; juniorTop: Set<string> }

type State = Pick<SeasonState, 'players' | 'pairs' | 'results' | 'juniorResults' | 'date' | 'managedCountryId'>;

export function readyLines(state: State, rs: Ruleset): ReadyLines {
  const now = absWeek(state.date);
  const players = new Map(state.players.map((p) => [p.id, p]));
  const pairs = new Map(state.pairs.map((p) => [p.id, p]));
  const members = (id: string) => pairs.get(id)?.playerIds ?? [id];
  const ca = (id: string) => {
    const ps = members(id).map((x) => players.get(x)).filter((p): p is Player => !!p);
    return ps.length ? ps.reduce((s, p) => s + currentAbility(p.attrs), 0) / ps.length : Infinity;
  };
  // Peringkat ke-n (atau terakhir bila ranking lebih pendek).
  const at = (d: 'MS' | 'WS' | 'MD' | 'WD', n: number) => { const r = computeRanking(state.results, d, now, rs); const e = r[Math.min(n, r.length) - 1]; return e ? ca(e.entrantId) : Infinity; };
  const juniorTop = new Set<string>();
  for (const d of DISCIPLINES)
    for (const r of computeRanking(state.juniorResults ?? [], d, now, rs).slice(0, READY_JUNIOR_RANK)) members(r.entrantId).forEach((id) => juniorTop.add(id));
  return { M: at('MS', READY_SENIOR_RANK), F: at('WS', READY_SENIOR_RANK), MD: at('MD', READY_DOUBLES_RANK), WD: at('WD', READY_DOUBLES_RANK), juniorTop };
}

export const promotionLine = (p: Player, l: ReadyLines) => (p.focus === 'D' ? (p.gender === 'M' ? l.MD : l.WD) : l[p.gender]);
export const isReady = (p: Player, l: ReadyLines) => currentAbility(p.attrs) >= promotionLine(p, l) || l.juniorTop.has(p.id);

/** Akhir minggu: Pratama negara manajer yang baru siap mendapat `readySince` (berita sekali). */
// ponytail: ranking dihitung ulang tiap minggu selama masih ada Pratama yang belum siap; cache per minggu bila terasa lambat.
export function updateReadiness(state: State, rs: Ruleset) {
  const c = state.managedCountryId;
  if (!c) return;
  const open = state.players.filter((p) => p.countryId === c && p.retired === undefined && p.released === undefined && isPratama(p, state.date) && p.readySince === undefined);
  if (!open.length) return;
  const l = readyLines(state, rs);
  for (const p of open) if (isReady(p, l)) p.readySince = absWeek(state.date);
}

/** Promosi: masa "belum siap" bila kemampuan masih jauh (> EARLY_GAP) di bawah ambang. */
export function promote(state: State, rs: Ruleset, id: string) {
  const p = state.players.find((x) => x.id === id);
  if (!p) return;
  p.promoted = true;
  if (currentAbility(p.attrs) < promotionLine(p, readyLines(state, rs)) - EARLY_GAP) p.earlyPromo = absWeek(state.date) + EARLY_WEEKS;
}

export const isEarly = (p: Player, now: number) => p.earlyPromo !== undefined && now <= p.earlyPromo;
export const isHeldBack = (p: Player, date: GameDate) => p.readySince !== undefined && isPratama(p, date) && absWeek(date) - p.readySince > LATE_WEEKS;
```

`src/engine/career.ts` — ganti `promoteJunior`:

```ts
/** Promosikan junior ke pelatnas utama (ikut didaftarkan otomatis ke turnamen senior); `rs` = catat promosi terlalu cepat. */
export function promoteJunior(state: SeasonState, playerId: string, rs?: Ruleset) {
  if (rs) return promote(state, rs, playerId);
  const p = state.players.find((x) => x.id === playerId);
  if (p) p.promoted = true;
}
```
(impor `promote` dari `./promotion`).

- [ ] **Step 4:** `npx vitest run src/engine/promotion.test.ts` → PASS; `npx tsc --noEmit -p .`.
- [ ] **Step 5:** commit "Promosi junior: ambang siap (peringkat 200 senior / 10 besar junior), catatan terlalu cepat & tertahan".

### Task 2: Efek di mesin musim

**Files:** Modify `src/engine/season.ts` (`updateMorale`, akhir minggu, `endQuarter`), `src/engine/development.ts` (`QuarterContext.heldBack`, `developQuarter`, `quarterReport`). Test: `src/engine/promotion.test.ts`.

- [ ] **Step 1: Tes gagal** (tambahkan ke `promotion.test.ts`; impor `developQuarter`, `quarterReport` dari `./development`, `makeRng` dari `./rng`):

```ts
  it('tertahan memperlambat pertumbuhan kuartal ×0,9 & tampil di laporan kuartal', () => {
    const s = fresh(), p = pratama(s)[0];
    const twin = structuredClone(p);
    const ctx = { date: s.date, experience: new Map<string, number>(), doublesPlayers: new Set<string>() };
    developQuarter(p, rs.development, { ...ctx, heldBack: new Set([p.id]) }, makeRng(1));
    developQuarter(twin, rs.development, ctx, makeRng(1));
    expect(currentAbility(p.attrs)).toBeLessThanOrEqual(currentAbility(twin.attrs));
    p.readySince = absWeek(s.date) - LATE_WEEKS - 1;
    p.caDelta = 0;
    expect(quarterReport(s.players, 'INA', s.date).heldBack).toContain(p);
  });
```

- [ ] **Step 2:** jalankan → FAIL.
- [ ] **Step 3: Implementasi**
  - `development.ts`: `QuarterContext` tambah `heldBack?: Set<string>;` (komentar: "Junior Pratama yang tertahan (siap promosi > 26 minggu)."); di `developQuarter` setelah baris mentor: `if (ctx.heldBack?.has(p.id)) rate *= LATE_GROWTH;` (impor `LATE_GROWTH`, `isHeldBack` dari `./promotion`); `quarterReport` tambah `heldBack: own.filter((p) => isHeldBack(p, date)).slice(0, 3),`.
  - `season.ts` `endQuarter`: ctx tambah `heldBack: new Set(state.players.filter((p) => isHeldBack(p, state.date)).map((p) => p.id))`.
  - `season.ts` akhir minggu: tepat setelah `updateMorale(state, rs, weekMatches, weekChampions, ranks);` tambah `updateReadiness(state, rs);`.
  - `season.ts` `updateMorale`: ubah `add` menjadi `const add = (ps: Player[], d: number, senior = false) => { for (const p of ps) { let x = d < 0 && hasTrait(p, 'fragileMorale') ? d * FRAGILE_DOWN : d; if (x < 0 && senior && isEarly(p, now)) x *= EARLY_LOSS; bumpForm(p, x); } };` dengan `const now = absWeek(state.date);` dan `const juniorEv = new Set(rs.calendar.filter((e) => rs.tiers.find((x) => x.id === e.tierId)?.junior).map((e) => e.id));` di awal fungsi; di loop laga `const senior = !juniorEv.has(m.tournamentId);` lalu `add(sides[0], d, senior); add(sides[1], -d, senior);`. (ponytail: laga beregu junior dihitung senior — kecil, atlet "belum siap" jarang di Suhandinata.)
- [ ] **Step 4:** `npx vitest run` → semua PASS.
- [ ] **Step 5:** commit "Promosi junior: efek terlalu cepat (morale kalah senior ×1,5 selama 26 minggu) & tertahan (pertumbuhan ×0,9, laporan kuartal); siap dicatat tiap akhir minggu".

### Task 3: UI, berita, dokumentasi

**Files:** Modify `src/engine/news.ts` (`{ kind: 'ready'; ids: string[] }`), `src/ui/Career.tsx` (baris berita, `QuarterReportCard`), `src/ui/Squad.tsx` (tanda di baris junior & profil, Promote memakai `rs`), `src/ui/Pairs.tsx` (Promote memakai `rs`), i18n, `docs/ASUMSI.md`, `docs/RENCANA.md`. Test: `src/engine/news.test.ts`.

- [ ] **Step 1: Tes berita** (`news.test.ts`): set `p.readySince = absWeek(last week)` untuk satu Pratama INA → `weeklyNews` memuat `{ kind: 'ready', ids: [p.id] }`; minggu berikutnya tidak.
- [ ] **Step 2: Implementasi**
  - `news.ts` prelude (setelah berita permata): `const ready = state.players.filter((p) => p.countryId === state.managedCountryId && p.readySince === lastAbs).map((p) => p.id); if (ready.length) hosts.push({ kind: 'ready', ids: ready });` — `lastAbs` dihitung sebelum prelude (pindahkan deklarasinya ke atas).
  - Career `row()`: `case 'ready': return [t('newsReadyTag'), <>{n.ids.map((id, i) => <span key={id}>{i > 0 && ', '}{who(id)}</span>)}</>, <small className="muted-text">{t('newsReady')}</small>];`; CSS `.news .badge.news-ready { background: var(--accent-soft); color: var(--accent-strong); }`.
  - `QuarterReportCard` rows: tambah `['qrHeldBack', '⏳', r.heldBack]`.
  - Squad baris junior: sebelum tombol Promote, `{isPratama(p, state.date) && p.readySince !== undefined && <span className="tag up-tag">⬆ {t('readyPromo')}</span>}`; tombol Promote `onClick={() => { promoteJunior(state, p.id, game.ruleset); commit(); }}` dengan `title` = `t('promoteEarlyHint')` bila belum siap (pakai `readyLines` sekali per render via `useMemo` di komponen tabel: `const lines = useMemo(() => readyLines(state, game.ruleset), [version])`, belum siap = `currentAbility(p.attrs) < promotionLine(p, lines) - EARLY_GAP`).
  - Profil: setelah fakta Potensi, `{isPratama(p, state.date) && p.readySince !== undefined && fact(t('promotion'), <span className="tag up-tag">⬆ {t('readyPromo')}</span>)}`.
  - Pairs.tsx Promote: `promoteJunior(state, id, game.ruleset)` (sesuaikan variabel `game` di scope).
  - i18n id: `readyPromo: 'Siap promosi', promotion: 'Promosi', promoteEarlyHint: 'Belum siap: selama 26 minggu kekalahan di turnamen senior lebih menurunkan morale.', newsReadyTag: 'Siap naik', newsReady: 'siap naik ke pelatnas utama', qrHeldBack: 'Tertahan di junior (siap promosi > 26 minggu)',`; en: `readyPromo: 'Ready for promotion', promotion: 'Promotion', promoteEarlyHint: 'Not ready: for 26 weeks, senior losses hit morale harder.', newsReadyTag: 'Ready', newsReady: 'ready to join the senior squad', qrHeldBack: 'Held back in juniors (ready > 26 weeks)',`. CSS `.tag.up-tag { background: var(--accent-soft); color: var(--accent-strong); font-weight: 700; }`.
  - ASUMSI: bagian baru "Promosi junior (2026-10-29)" dengan konstanta di Global Constraints. RENCANA: centang bagian 2.
- [ ] **Step 3:** `npx tsc --noEmit -p .`, `npx vitest run`, `npm run build`; uji browser (Skuad → Junior: tanda ⬆; profil; tombol Promote title).
- [ ] **Step 4:** commit "Promosi junior: tanda ⬆ Siap promosi (Skuad & profil), berita Siap naik, peringatan promosi terlalu cepat, laporan kuartal Tertahan di junior; ASUMSI & RENCANA".
