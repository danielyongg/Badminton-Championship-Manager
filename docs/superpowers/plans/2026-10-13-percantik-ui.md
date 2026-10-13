# Percantik UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tema visual baru (gaya "Arena" + palet "Lapangan"), terang/gelap dengan pilihan tema, huruf Barlow, bendera negara, papan skor Live Match ala TV.

**Architecture:** Semua warna jadi token CSS di `src/ui/style.css`; tema dipilih lewat `data-theme` di `<html>` (modul kecil `src/ui/theme.ts`). Dua komponen baru: `ThemeSelect` dan `Flag`. Markup lama hampir tetap; warna inline di TSX diganti token. Engine tidak disentuh.

**Tech Stack:** React 19, Vite, Vitest, CSS biasa, `@fontsource/barlow`, SVG dari `flag-icons` (disalin, bukan dependensi runtime).

## Global Constraints
- Spesifikasi: `docs/superpowers/specs/2026-10-13-percantik-ui-design.md` (tabel token dipakai persis).
- localStorage `bcm-theme` = `auto|light|dark`, akses dalam try/catch (pola `bcm-lang` di `src/i18n/index.ts`).
- Semua teks baru lewat i18n: kunci di `src/i18n/index.ts` (id) dan `src/i18n/en.ts` (en; TS memaksa lengkap).
- Tanpa perubahan engine; `npx tsc -b` & `npx vitest run` harus lolos tiap task.
- Pesan commit bahasa Indonesia, diakhiri `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

### Task 1: Fondasi tema (token, Barlow, pilihan tema)

**Files:**
- Create: `src/ui/theme.ts`, `src/ui/ThemeSelect.tsx`
- Modify: `src/main.tsx`, `src/ui/style.css` (bagian atas: token & elemen dasar), `src/ui/App.tsx:72`, `src/ui/Career.tsx:175`, `src/i18n/index.ts`, `src/i18n/en.ts`, `package.json`

**Interfaces:**
- Produces: `type Theme = 'auto' | 'light' | 'dark'`; `getTheme(): Theme`; `setTheme(t: Theme): void` (simpan + terapkan); `applyTheme(t: Theme): void`; `<ThemeSelect />`. Token CSS: `--bg --surface --fg --muted --line --accent --accent-strong --accent-soft --on-accent --gold --gold-soft --danger --danger-soft`; class `.primary` untuk tombol utama.

- [ ] **Step 1:** `npm install @fontsource/barlow@5.3.0`
- [ ] **Step 2:** Tulis `src/ui/theme.ts`:

```ts
export type Theme = 'auto' | 'light' | 'dark';
export const THEMES: Theme[] = ['auto', 'light', 'dark'];

export function getTheme(): Theme {
  try { const v = localStorage.getItem('bcm-theme'); return v === 'light' || v === 'dark' ? v : 'auto'; } catch { return 'auto'; }
}

/** Otomatis = tanpa atribut (CSS mengikuti prefers-color-scheme). */
export function applyTheme(t: Theme) {
  if (t === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
}

export function setTheme(t: Theme) {
  try { localStorage.setItem('bcm-theme', t); } catch { /* mode privat: hanya untuk sesi ini */ }
  applyTheme(t);
}
```

- [ ] **Step 3:** `src/ui/ThemeSelect.tsx` (pola `LangSelect`, state lokal karena tidak perlu render ulang aplikasi):

```tsx
import { useState } from 'react';
import { t, type TextKey } from '../i18n';
import { getTheme, setTheme, THEMES, type Theme } from './theme';

export function ThemeSelect() {
  const [v, setV] = useState(getTheme);
  return (
    <label>{t('theme')}
      <select value={v} onChange={(e) => { const x = e.target.value as Theme; setTheme(x); setV(x); }}>
        {THEMES.map((x) => <option key={x} value={x}>{t(`theme_${x}` as TextKey)}</option>)}
      </select>
    </label>
  );
}
```

- [ ] **Step 4:** i18n — id: `theme: 'Tema', theme_auto: 'Otomatis', theme_light: 'Terang', theme_dark: 'Gelap'`; en: `theme: 'Theme', theme_auto: 'Automatic', theme_light: 'Light', theme_dark: 'Dark'`.
- [ ] **Step 5:** `src/main.tsx`: tambahkan `import '@fontsource/barlow/400.css'; import '@fontsource/barlow/600.css'; import '@fontsource/barlow/800.css'; import { applyTheme, getTheme } from './ui/theme';` dan `applyTheme(getTheme());` sebelum `createRoot`.
- [ ] **Step 6:** Pasang `<ThemeSelect />` setelah `<LangSelect …/>` di `App.tsx` (menu utama) dan `Career.tsx` (pengaturan header).
- [ ] **Step 7:** Ganti baris `:root` di `style.css` dengan token dari spesifikasi + elemen dasar:

```css
:root {
  font-family: Barlow, system-ui, sans-serif; color-scheme: light;
  --bg: #f4f6f3; --surface: #ffffff; --fg: #1d2a24; --muted: #6b7a72; --line: #e3e8e4;
  --accent: #0b6b45; --accent-strong: #0b6b45; --accent-soft: #e8f5ee; --on-accent: #ffffff;
  --gold: #8a6200; --gold-soft: #fff4d6; --danger: #c0392b; --danger-soft: #fbe9e7;
  --series-1: #2a78d6; --series-2: #eb6834;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme=light]) { /* GELAP */ } }
:root[data-theme=dark] { /* GELAP */ }
```
dengan `/* GELAP */` = `color-scheme: dark; --bg: #0e1613; --surface: #16241e; --fg: #dce8e1; --muted: #87998f; --line: #23362d; --accent: #2fa874; --accent-strong: #5fd39e; --accent-soft: #1b3329; --on-accent: #06120d; --gold: #f0c35a; --gold-soft: #3a3016; --danger: #ef6a5b; --danger-soft: #3a1d1a; --series-1: #3987e5; --series-2: #d95926;` (ditulis lengkap di kedua blok).
Elemen dasar: `body { background: var(--bg); color: var(--fg); }`, `a { color: var(--accent-strong); }`, `button, select, input` (latar `--surface`, warna `--fg`, garis `--line`, radius 4px, padding 4px 10px, font inherit), `button:hover:not(:disabled)` garis `--accent`, `:disabled` opacity .5, `:focus-visible` outline 2px `--accent`, `.primary` (latar `--accent`, teks `--on-accent`, 800, kapital, spasi .05em), `button[aria-pressed=true]` tab gaya garis bawah (latar transparan, `box-shadow: inset 0 -2px var(--accent)`, teks `--fg` 600), `Canvas` di `th/.shell/.live/.livebar/nav` diganti `var(--surface)`, `.card` latar `--surface` radius 6px, `.card h2/h3` 0.8rem kapital spasi .06em `--muted`, `th` 0.75rem kapital `--muted`, `tr.sel` & `tr.mine` latar `--accent-soft`, `.mine` `--accent-strong`, `.up` `--accent-strong`, `.down` `--danger`, `.stars` `--gold`, `.tag` garis & teks `--accent-strong`, `.flash` `--gold-soft`, `.modal` latar `#000a` + `backdrop-filter: blur(2px)`, `h1` Barlow 800. Transisi `background-color, color, border-color 150ms` pada `button`.
- [ ] **Step 8:** `npx tsc -b && npx vitest run` → lolos. Cek cepat di browser: ganti tema di menu utama, muat ulang → tema bertahan.
- [ ] **Step 9:** Commit `Tema baru: token warna terang/gelap, pilihan tema, huruf Barlow`.

### Task 2: Bendera negara

**Files:**
- Create: `src/assets/flags/*.svg` (47), `src/assets/flags/README.md`, `src/ui/Flag.tsx`, `src/ui/flags.test.ts`
- Modify: `src/ui/EventViews.tsx` (`Who`), `src/ui/LiveDraw.tsx` (`who`), `src/ui/Team.tsx` (`name` di `FinalsResult`, tabel kekuatan), `src/ui/Ranking.tsx:89`, `src/ui/Squad.tsx:104`, `src/ui/LiveMatch.tsx` (papan skor; dikerjakan di Task 3)

**Interfaces:**
- Produces: `flagCode(id: string): string | undefined` — id negara (mis. `INA`) atau id atlet/pasangan yang diawali kode negara (`INA-M1`, `INA-r-123`, `INA-MD2026-1`) → kode negara bila ada bendera; `<Flag id={string} />` → `<img class="flag">` atau `null`.

- [ ] **Step 1: Tes gagal** `src/ui/flags.test.ts`:

```ts
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { WORLD } from '../engine/presets/world';
import { flagCode } from './Flag';

describe('bendera', () => {
  it('tiap negara game punya file bendera', () => {
    const missing = WORLD.countries.filter((c) => !existsSync(`src/assets/flags/${c.id}.svg`)).map((c) => c.id);
    expect(missing).toEqual([]);
  });
  it('kode negara dari id negara, atlet & pasangan', () => {
    expect(flagCode('INA')).toBe('INA');
    expect(flagCode('JPN-r-12345')).toBe('JPN');
    expect(flagCode('DEN-MD2026-1')).toBe('DEN');
    expect(flagCode('XXX-M1')).toBeUndefined();
  });
});
```
- [ ] **Step 2:** `npx vitest run src/ui/flags.test.ts` → FAIL (modul `./Flag` belum ada).
- [ ] **Step 3:** Salin SVG 4×3: `npm pack flag-icons@7.5.0` ke scratchpad, ekstrak, salin `flags/4x3/<iso>.svg` → `src/assets/flags/<IOC>.svg` dengan peta IOC→ISO: CHN cn, INA id, JPN jp, KOR kr, MAS my, TPE tw, THA th, IND in, HKG hk, SGP sg, VIE vn, PHI ph, MAC mo, UAE ae, DEN dk, FRA fr, ENG gb-eng, GER de, ESP es, NED nl, SCO gb-sct, IRL ie, SWE se, FIN fi, SUI ch, POL pl, BUL bg, CZE cz, UKR ua, AUT at, TUR tr, NOR no, ITA it, CAN ca, USA us, GUA gt, BRA br, MEX mx, PER pe, EGY eg, NGR ng, RSA za, ALG dz, MRI mu, BOT bw, AUS au, NZL nz. README: sumber `flag-icons` 7.5.0 (https://github.com/lipis/flag-icons), lisensi MIT, peta di atas.
- [ ] **Step 4:** `src/ui/Flag.tsx`:

```tsx
// Bendera negara game (SVG dari flag-icons, MIT; lihat src/assets/flags/README.md).
const FLAGS = import.meta.glob('../assets/flags/*.svg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const URL_OF = new Map(Object.entries(FLAGS).map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1, -4), url]));

/** Kode negara dari id negara atau id atlet/pasangan yang diawali kode negara (`INA-…`). */
export function flagCode(id: string): string | undefined {
  const code = id.split('-')[0];
  return URL_OF.has(code) ? code : undefined;
}

/** Bendera kecil di depan nama; negara tanpa bendera (dibuat di Editor) → tidak tampil. */
export function Flag({ id }: { id?: string | null }) {
  const code = id ? flagCode(id) : undefined;
  return code ? <img className="flag" src={URL_OF.get(code)} alt={code} title={code} /> : null;
}
```
CSS: `.flag { width: 14px; height: 10.5px; object-fit: cover; vertical-align: -1px; margin-right: 4px; border-radius: 1px; box-shadow: 0 0 0 1px var(--line); }`.
- [ ] **Step 5:** `npx vitest run src/ui/flags.test.ts` → PASS.
- [ ] **Step 6:** Pasang bendera:
  - `EventViews.tsx` `Who`: render `<Flag id={id} />` sebelum nama (di dalam `<a>`/`<span>`).
  - `LiveDraw.tsx` `who`: `<span …><Flag id={id} />{name(id)}</span>`.
  - `Team.tsx` `FinalsResult`: `name` tetap string untuk judul; sel tabel grup & kotak bagan pakai `<><Flag id={c} />{name(c)}</>`. Tabel kekuatan tim (cari `strengths.map`) juga.
  - `Ranking.tsx:89` kolom negara: `<td><Flag id={name(r.entrantId).country} />{name(r.entrantId).country}</td>`.
  - `Squad.tsx:104` profil: `<Flag id={p.countryId} />` sebelum `{p.countryId}`.
- [ ] **Step 7:** `npx tsc -b && npx vitest run` → lolos. Commit `Bendera negara (47 SVG) di ranking, bagan, beregu, live drawing, profil`.

### Task 3: Warna inline → token, tombol utama, bagan, papan skor Live Match

**Files:**
- Modify: `src/ui/Squad.tsx:30-31` (`FatigueBar`), `src/ui/LiveMatch.tsx`, `src/ui/EventViews.tsx` (`RoundColumns`), `src/ui/Team.tsx` (bagan beregu), `src/ui/Career.tsx` (tombol header & pop-up), `src/ui/Team.tsx`/`LiveDraw.tsx` (tombol konfirmasi), `src/ui/style.css`

**Interfaces:**
- Consumes: token Task 1, `<Flag>` Task 2.

- [ ] **Step 1:** `FatigueBar`: `const color = value > 60 ? 'var(--danger)' : value > 35 ? 'var(--gold)' : 'var(--accent)';`. LiveMatch bar energi: `background: 'var(--accent)'`.
- [ ] **Step 2:** `.primary` pada: header karier `advance1` (`Career.tsx`), tombol konfirmasi pop-up entry (`entryConfirm`), `confirmLineup` & tombol konfirmasi skuad (`Team.tsx`), mulai/lanjut/jeda & `continue` (`LiveMatch.tsx`), tombol lanjut/selesai live drawing (`LiveDraw.tsx`), `start` (menu utama `App.tsx`).
- [ ] **Step 3:** Bagan: di `RoundColumns` tambahkan class `mine` pada `.match` bila `who.mine?.(a) || who.mine?.(b)`; di bagan beregu bila salah satu sisi = `managed`. CSS:

```css
.match { background: var(--surface); border: 1px solid var(--line); border-radius: 4px; padding: 4px 8px; font-size: .8rem; }
.match.mine { box-shadow: inset 3px 0 var(--accent); }
.match > div { color: var(--muted); }
.match > div.win { color: var(--fg); font-weight: 700; }
```
- [ ] **Step 4:** Live Match papan skor (opsi A). Di tabel `.board`: sel server `<td className="srv">●</td>` (bukan emoji), nama dengan `<Flag>` dari `names`-pemilik (tambah prop `ids: [string, string]` ke `LiveMatch`; `Career.tsx` mengoper `live.req.entrants`), sel poin berjalan class `pt`. Log rally: `<li><b>{score}</b> <span className={`chip${ev.winner === mySide ? '' : ' opp'}`}>{t(ev.type)}</span> {names[ev.winner]}…</li>`. CSS:

```css
.board td.pt { font-size: 1.6rem; font-weight: 800; min-width: 2.2em; text-align: center; background: var(--fg); color: var(--surface); }
.board tr.mine td.pt { background: var(--accent); color: var(--on-accent); }
.board td.srv { color: var(--gold); }
.log { list-style: none; padding-left: 0; }
.log li { padding: 3px 0; border-bottom: 1px solid var(--line); }
.chip { font-size: .7rem; font-weight: 700; padding: 0 5px; border-radius: 3px; text-transform: uppercase; background: var(--accent-soft); color: var(--accent-strong); }
.chip.opp { background: var(--danger-soft); color: var(--danger); }
.momentum .track { background: linear-gradient(90deg, var(--danger), var(--line), var(--accent)); }
```
Hapus aturan `.board td.big` lama (diganti `.pt`).
- [ ] **Step 5:** `npx tsc -b && npx vitest run` → lolos. Commit `Papan skor Live Match ala TV, bagan bertema, tombol utama, warna inline jadi token`.

### Task 4: Verifikasi visual & dokumen

- [ ] **Step 1:** `npm run dev` (port 5173). Buat karier Indonesia, main 2 minggu dengan Live Match semua laga. Periksa tema terang, gelap, dan lebar 390px: menu utama, dashboard, ranking (bendera), skuad + profil, halaman turnamen (bagan), Live Match, live drawing, pop-up line-up beregu. Perbaiki kontras/tata letak yang rusak.
- [ ] **Step 2:** `npm run build` → lolos (ukuran bundle dicatat).
- [ ] **Step 3:** `docs/RENCANA.md`: centang "Desain visual baru" dengan ringkasan (tema Arena + Lapangan, terang/gelap, Barlow, bendera, papan skor). Commit & push `main` (deploy Pages otomatis).
