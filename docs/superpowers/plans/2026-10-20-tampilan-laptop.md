# Tampilan Laptop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tata letak laptop (≥1024px) dengan menu samping, bilah atas, isi rata tengah maks 1200px, dan perbaikan per halaman — tanpa mengubah tampilan HP.

**Architecture:** Hampir semuanya CSS di `src/ui/style.css` dalam blok `@media (min-width: 1024px)` (dan satu blok 701–1023px). Markup hanya berubah dua tempat: pembungkus `<div className="page">` di `Career.tsx` dan kelas `squadtable` di tabel Skuad. Navigasi tetap satu sumber (`nav.maintabs`).

**Tech Stack:** React + TypeScript (Vite), CSS biasa (token di `:root`), Vitest.

## Global Constraints
- Tampilan ≤700px (HP / web app iOS) tidak boleh berubah.
- Isi halaman maksimal 1200px, rata tengah; menu samping ±200px; jarak tepi isi 24px.
- Tombol Menu utama: markup tetap di header; ≥1024px ditempatkan `position: fixed` di kiri bawah selebar menu samping.
- Sub-tab tetap baris tab di atas isi.
- Tidak ada tema/warna/font baru.

## Verifikasi (dipakai tiap tugas)
UI tidak punya tes visual; tiap tugas diverifikasi dengan:
1. `npx tsc -b` → tanpa output.
2. `npx vitest run` → semua lolos.
3. Browser (dev server `http://localhost:5173`, save "Uji Bakat"): tangkapan layar pada lebar 1280 dan 1440, serta 390 untuk HP.

---

### Task 1: Kerangka — bilah atas, menu samping, `.page`

**Files:**
- Modify: `src/ui/Career.tsx` (blok `return (<main> …` sekitar baris 192–270)
- Modify: `src/ui/style.css` (tambah blok di akhir file)

**Interfaces:**
- Produces: kelas `.page` (pembungkus isi), dipakai Task 2–3 sebagai wadah lebar maksimum.

- [ ] **Step 1: Bungkus isi halaman dengan `.page`**

Di `Career.tsx`, setelah `</nav>` milik `nav.controls.maintabs`, bungkus bilah Live dan konten:

```tsx
      </nav>
      <div className="page">
      {hubOn && !showHub && (
        <div className="livebar card">
          …tidak berubah…
        </div>
      )}
      {showHub ? hub
        : …rantai konten yang sama…
        : <Federation onChanged={() => { changed(); void persist(); }} onOpen={open} onOpenEvent={openEvent} />}
      </div>
    </main>
```

- [ ] **Step 2: CSS kerangka**

Tambahkan di akhir `src/ui/style.css`:

```css
/* ===== Laptop (≥1024px): bilah atas + menu samping + isi rata tengah. HP (≤700px) tidak terpengaruh. ===== */
.page { min-width: 0; }
@media (min-width: 701px) and (max-width: 1023px) {
  .page { max-width: 1200px; margin: 0 auto; }
}
@media (min-width: 1024px) {
  body { padding: 0; }
  main:has(> .shell) { display: grid; grid-template-columns: 200px minmax(0, 1fr); grid-template-rows: auto 1fr; min-height: 100vh; }
  main > .shell { grid-column: 1 / -1; margin: 0; padding: 10px 24px; display: flex; align-items: center; gap: 16px; }
  main > .shell .title b { font-size: 1.2rem; }
  main > .shell .meta { margin-right: auto; }
  main > .shell .advbar { display: flex; gap: 8px; align-items: center; }
  main > .shell .advbar .simulating { display: inline-flex; align-items: center; gap: 8px; font-size: .85rem; color: var(--muted); }
  main > .shell .menu-btn { position: fixed; left: 12px; bottom: 16px; width: 176px; z-index: 3; }
  nav.maintabs { grid-column: 1; grid-row: 2; position: sticky; top: var(--shell-h, 53px); align-self: start; height: calc(100vh - var(--shell-h, 53px)); box-sizing: border-box;
    flex-direction: column; flex-wrap: nowrap; align-items: stretch; gap: 2px; margin: 0; padding: 12px 12px 72px; border-bottom: none; border-right: 1px solid var(--line); background: var(--surface); overflow-y: auto; }
  nav.maintabs button { text-align: left; padding: 8px 12px; border-radius: 6px; font-size: .95rem; }
  nav.maintabs button[aria-pressed=true] { box-shadow: inset 3px 0 var(--accent); background: var(--accent-soft); color: var(--accent-strong); }
  main > .page { grid-column: 2; grid-row: 2; width: 100%; max-width: 1200px; margin: 0 auto; padding: 20px 24px 40px; box-sizing: border-box; }
}
```

Catatan: `--shell-h` default 53px (tinggi bilah atas satu baris). Bila tinggi berbeda di browser, sesuaikan angka default ini — tidak perlu JS.

- [ ] **Step 3: Verifikasi**

`npx tsc -b` (tanpa output), `npx vitest run` (lolos). Browser 1440: bilah atas penuh lebar, menu samping kiri menempel saat scroll, Menu utama di kiri bawah, isi rata tengah. 390: sama seperti sebelum perubahan (bilah maju di bawah, tab geser di atas).

- [ ] **Step 4: Commit**

```bash
git add src/ui/Career.tsx src/ui/style.css
git commit -m "Laptop: bilah atas, menu samping & isi rata tengah maks 1200px (HP tidak berubah)"
```

---

### Task 2: Dashboard tanpa lubang

**Files:**
- Modify: `src/ui/style.css` (blok `@media (min-width: 1024px)` dari Task 1)

**Interfaces:**
- Consumes: `.page` dari Task 1.

- [ ] **Step 1: Kolom mengalir**

Tambahkan di dalam blok `@media (min-width: 1024px)`:

```css
  /* Dashboard: kolom mengalir (atas → bawah) agar kartu beda tinggi tidak meninggalkan lubang. */
  .dash { display: block; columns: 2; column-gap: 16px; }
  .dash > * { break-inside: avoid; margin: 0 0 16px; display: inline-block; width: 100%; box-sizing: border-box; }
```

Dan blok baru:

```css
@media (min-width: 1280px) { .dash { columns: 3; } }
```

- [ ] **Step 2: Verifikasi**

Browser 1280 (3 kolom) & 1100 (2 kolom): tidak ada ruang kosong besar di bawah kartu; tabel di kartu ranking tidak keluar kartu. 390: dashboard sama seperti sebelumnya.

- [ ] **Step 3: Commit**

```bash
git add src/ui/style.css
git commit -m "Laptop: dashboard dalam kolom mengalir (tanpa lubang)"
```

---

### Task 3: Skuad, tabel & kotak pilihan

**Files:**
- Modify: `src/ui/Squad.tsx:129` (`<table>` daftar atlet → `<table className="squadtable">`)
- Modify: `src/ui/style.css`

- [ ] **Step 1: Kelas tabel Skuad**

```tsx
      <div className="scroll">
        <table className="squadtable">
```

- [ ] **Step 2: CSS**

Di dalam blok `@media (min-width: 1024px)`:

```css
  /* Skuad: kolom nama menempel; tabel bergeser di dalam wadahnya bila lebih lebar dari isi. */
  .squadtable th:first-child, .squadtable td:first-child { position: sticky; left: 0; z-index: 1; background: var(--surface); }
  .squadtable th:first-child { z-index: 2; }
  .squadtable .sectors { gap: 4px 8px; margin-right: 6px; }
  /* Kotak pilihan di luar tabel tidak melebar penuh. */
  .page .controls select { width: auto; max-width: 320px; }
  .page .controls.pair { grid-template-columns: repeat(2, minmax(0, 320px)); }
```

- [ ] **Step 3: Verifikasi**

Browser 1280: Skuad → kolom terakhir (Atur sektor + tombol Lepas) bisa dicapai dengan geser di dalam tabel, nama tetap terlihat; World → Ranking: kotak Jenis/Per minggu ±320px; Kalender & Entry rapi. 390: Skuad sama seperti sebelumnya.

- [ ] **Step 4: Commit**

```bash
git add src/ui/Squad.tsx src/ui/style.css
git commit -m "Laptop: kolom nama Skuad menempel, kotak pilihan tidak melebar penuh"
```

---

### Task 4: Menu utama & layar turnamen

**Files:**
- Modify: `src/ui/style.css`

- [ ] **Step 1: CSS**

Di dalam blok `@media (min-width: 1024px)`:

```css
  /* Menu utama (layar awal): rata tengah, judul lebih besar. */
  main.menu { margin: 0 auto; padding: 48px 24px; }
  main.menu h1 { font-size: 2.2rem; margin-bottom: 16px; }
  /* Layar babak / halaman turnamen: rata tengah dalam isi halaman. */
  .page .hub { margin-left: auto; margin-right: auto; }
```

(`main.menu` sudah `max-width: 900px` dari aturan yang ada.)

- [ ] **Step 2: Verifikasi**

Browser 1440: menu utama di tengah; buka turnamen yang sedang berjalan (layar babak) → di tengah isi. Live Match tetap pop-up. 390: menu utama sama seperti sebelumnya.

- [ ] **Step 3: Commit**

```bash
git add src/ui/style.css
git commit -m "Laptop: menu utama & layar babak rata tengah"
```

---

### Task 5: Pengecekan akhir

- [ ] **Step 1:** Browser 1280×800, 1440×900, 1920×1080: Dashboard, Skuad, Kalender & Entry, World (Ranking/Kalender/Negara), Federasi, halaman turnamen, layar babak, Live Match, menu utama, Settings. Perbaiki yang meleset (tambahkan ke blok ≥1024px saja).
- [ ] **Step 2:** 390px: halaman yang sama tampak seperti sebelum perubahan.
- [ ] **Step 3:** `npx tsc -b` dan `npx vitest run` lolos.
- [ ] **Step 4:** Commit perbaikan bila ada:

```bash
git add src/ui/style.css
git commit -m "Laptop: perbaikan hasil pengecekan 1280/1440/1920"
```
