# Junior bagian 3 — Kabar perkembangan: rencana implementasi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Berita "Terobosan" (lonjakan kemampuan sekuartal, kemenangan pertama atas top 50 senior) untuk atlet negara manajer ≤ 21 th, dan prediksi puncak di profil.

**Architecture:** Lonjakan dibaca dari `Player.caDelta` (sudah diisi `developQuarter`) di minggu sesudah akhir kuartal — tanpa state baru. Kemenangan top 50 dicatat sekali di `updateMorale` (`Player.firstTop50`). Prediksi puncak: `potentialEstimate` (dipisah dari `potentialStars`, rumus sama) → peringkat lewat kemampuan atlet aktif segender sekarang.

**Spesifikasi:** `docs/superpowers/specs/2026-10-29-junior-scouting-promosi-design.md` bagian 3.

## Global Constraints
- Hanya atlet negara manajer, usia ≤ 21 (`BREAKTHROUGH_AGE = 21`); lonjakan = `caDelta ≥ 4` (`SURGE_MIN`).
- Prediksi puncak tidak membocorkan PA: memakai perkiraan yang sama dengan bintang ★ (est ± sd).
- Peringkat prediksi dibulatkan ke 1, 3, 5, 10, 20, 30, 50, 100, 200, 300, 500 (lebih buruk → "500+").
- Usia puncak ±25 (spesialis ganda ±26). Teks lewat i18n id & en; asumsi di `docs/ASUMSI.md`.

---

### Task 1: Berita terobosan (engine + UI)

**Files:** `src/engine/types.ts` (`Player.firstTop50?: { w: number; opp: string; rank: number }`), `src/engine/season.ts` (`updateMorale`), `src/engine/news.ts` (`{ kind: 'breakthrough'; id: string; surge?: number; opp?: string; rank?: number }`), `src/ui/Career.tsx` (baris berita), i18n, CSS. Test: `src/engine/news.test.ts`.

- [ ] Tes (news.test.ts):

```ts
it('berita terobosan: lonjakan sesudah akhir kuartal & kemenangan pertama atas top 50', () => {
  const rs = BWF_2026;
  const state = newSeason(WORLD, rs, 9, { year: 2026, week: 14 }, 'INA');
  const young = state.players.filter((x) => x.countryId === 'INA' && 2026 - x.birth.year <= 21);
  young[0].caDelta = 5;
  young[1].caDelta = 3;
  young[2].firstTop50 = { w: absWeek({ year: 2026, week: 13 }), opp: 'x', rank: 23 };
  const items = weeklyNews(state, rs).filter((n) => n.kind === 'breakthrough');
  expect(items).toContainEqual({ kind: 'breakthrough', id: young[0].id, surge: 5 });
  expect(items.some((n) => n.kind === 'breakthrough' && n.id === young[1].id)).toBe(false);
  expect(items).toContainEqual({ kind: 'breakthrough', id: young[2].id, opp: 'x', rank: 23 });
  state.date.week = 15; // bukan minggu sesudah kuartal
  expect(weeklyNews(state, rs).some((n) => n.kind === 'breakthrough')).toBe(false);
});
```

- [ ] Implementasi `news.ts` (prelude, sesudah berita `ready`):

```ts
  // Terobosan atlet muda negara manajer: lonjakan kemampuan (minggu sesudah akhir kuartal) & menang pertama atas top 50.
  const young = state.players.filter((p) => p.countryId === state.managedCountryId && p.retired === undefined && ageAt(p.birth, state.date) <= BREAKTHROUGH_AGE);
  if (last.week % 13 === 0)
    for (const p of young.filter((x) => (x.caDelta ?? 0) >= SURGE_MIN).sort((a, b) => b.caDelta! - a.caDelta!).slice(0, 2)) hosts.push({ kind: 'breakthrough', id: p.id, surge: p.caDelta });
  for (const p of young) if (p.firstTop50?.w === lastAbs) hosts.push({ kind: 'breakthrough', id: p.id, opp: p.firstTop50.opp, rank: p.firstTop50.rank });
```
dengan `export const BREAKTHROUGH_AGE = 21, SURGE_MIN = 4;` di news.ts.

- [ ] `season.ts` `updateMorale`, di loop laga sesudah blok `beatTop10`: catat kemenangan pertama atas top 50 senior:

```ts
    const lr = ranks.get(m.discipline)?.get(m.sides[1 - m.winner]) ?? 9999;
    if (senior && lr <= 50)
      for (const p of ws) if (!p.firstTop50 && p.countryId === state.managedCountryId && ageAt(p.birth, state.date) <= 21) p.firstTop50 = { w: now, opp: m.sides[1 - m.winner], rank: lr };
```

- [ ] UI `row()`: `case 'breakthrough': return [t('newsBreakTag'), n.surge !== undefined ? <>{who(n.id)} {t('newsSurge', { n: n.surge })}</> : <>{who(n.id)} {t('newsTop50')} {who(n.opp!)} <span className="muted-text">(#{n.rank})</span></>, <small className="muted-text">{t('ageYears', …)}</small>];` (pakai kunci usia yang ada). CSS `.news .badge.news-breakthrough { background: var(--accent-soft); color: var(--accent-strong); }`.
- [ ] i18n id: `newsBreakTag: 'Terobosan', newsSurge: 'melonjak +{n} kemampuan dalam sekuartal', newsTop50: 'menumbangkan'`; en: `newsBreakTag: 'Breakthrough', newsSurge: 'jumped +{n} ability in a quarter', newsTop50: 'beat'`.
- [ ] `npx vitest run`, commit.

### Task 2: Prediksi puncak (engine + profil)

**Files:** `src/engine/career.ts` (`potentialEstimate`, `peakRange`), `src/ui/Squad.tsx` (fakta profil), i18n. Test: `src/engine/career.test.ts`.

- [ ] Tes:

```ts
it('prediksi puncak: rentang menyempit seiring usia & laga, dibulatkan', () => {
  const pool = Array.from({ length: 300 }, (_, i) => ({ attrs: Object.fromEntries(ATTRS.map((a) => [a, 95 - i * 0.15])) }) as unknown as Player);
  const p = { id: 'abc', pa: 85, birth: { year: 2010, week: 1 }, attrs: {} } as unknown as Player;
  const young = peakRange(p, { year: 2026, week: 1 }, 0, pool);
  const old = peakRange(p, { year: 2031, week: 1 }, 200, pool);
  expect(young[0]).toBeLessThanOrEqual(old[0]);
  expect(young[1]).toBeGreaterThanOrEqual(old[1]);
  for (const r of [...young, ...old]) expect([1, 3, 5, 10, 20, 30, 50, 100, 200, 300, 500]).toContain(r);
});
```

- [ ] Implementasi `career.ts`:

```ts
/** Perkiraan potensi yang terlihat (bukan PA asli): titik tengah & sebaran yang menyempit dengan usia & jumlah laga. */
export function potentialEstimate(p: Player, date: { year: number; week: number }, matchesPlayed: number) {
  let h = 0;
  for (const ch of p.id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  const unit = ((h >>> 0) % 1000) / 1000 - 0.5; // −0,5..0,5
  const sd = Math.max(2, 15 - (ageAt(p.birth, date) - 15) * 1.2 - matchesPlayed / 30);
  return { est: p.pa + unit * 2 * sd * 1.5, sd };
}
export function potentialStars(p, date, matchesPlayed) { const { est } = potentialEstimate(p, date, matchesPlayed); return Math.max(0.5, Math.min(5, Math.round(est / 10) / 2)); }

const PEAK_STEPS = [1, 3, 5, 10, 20, 30, 50, 100, 200, 300, 500];
/** Prediksi peringkat puncak [terbaik, terburuk]: berapa atlet `pool` yang kemampuannya sekarang di atas est ± sd. */
export function peakRange(p: Player, date, matchesPlayed: number, pool: Player[]): [number, number] {
  const { est, sd } = potentialEstimate(p, date, matchesPlayed);
  const cas = pool.map((x) => currentAbility(x.attrs));
  const rankAt = (lvl: number) => { const n = cas.filter((c) => c > lvl).length + 1; return PEAK_STEPS.find((s) => s >= n) ?? 500; };
  return [rankAt(Math.min(99, est + sd)), rankAt(est - sd)];
}
```

- [ ] Profil (`Squad.tsx`) sesudah fakta Potensi, bila `ageAt ≤ 21` & belum pensiun: pool = atlet aktif segender usia ≥ 19 (`useMemo` per `version`), teks `t('peakText', { age: p.focus === 'D' ? 26 : 25, a, b })` — `b` 500 → "500+".
- [ ] i18n id: `peakFact: 'Perkiraan puncak', peakText: '±usia {age}: setara peringkat {a}–{b} dunia'`; en: `peakFact: 'Projected peak', peakText: '±age {age}: like world #{a}–{b}'`.
- [ ] `npx vitest run`, uji browser profil junior, ASUMSI & RENCANA, commit.
