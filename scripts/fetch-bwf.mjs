// Ambil atlet asli dari ranking BWF (bwfbadminton.com) → src/engine/presets/bwfPlayers.json.
// Dijalankan manual (tidak ikut build): `node scripts/fetch-bwf.mjs`. Butuh Playwright + Chromium
// (situs memakai proteksi Cloudflare, jadi permintaan dikirim dari dalam halaman browser).
// Pelan-pelan: satu permintaan sekaligus dengan jeda, hasil mentah di-cache di .bwf-cache/ agar bisa diulang.
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const API = 'https://extranet-lv.bwfbadminton.com/api';
const CACHE = '.bwf-cache';
const DELAY = 400;
// [rankId, catId, kode nomor]: ranking dunia (2) & junior (1).
const CATS = [[2, 6, 'MS'], [2, 7, 'WS'], [2, 8, 'MD'], [2, 9, 'WD'], [2, 10, 'XD'], [1, 1, 'BS'], [1, 2, 'GS'], [1, 3, 'BD'], [1, 4, 'GD'], [1, 5, 'XDJ']];

mkdirSync(CACHE, { recursive: true });
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const page = await browser.newPage({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36' });
await page.goto('https://bwfbadminton.com/rankings/', { timeout: 60000 });
await page.waitForTimeout(5000);

async function get(path, file) {
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  for (let i = 0; i < 3; i++) {
    const r = await page.evaluate(async (u) => { const res = await fetch(u); return { s: res.status, t: await res.text() }; }, `${API}/${path}`);
    await page.waitForTimeout(DELAY);
    if (r.s === 200) { writeFileSync(file, r.t); return JSON.parse(r.t); }
    console.warn('retry', r.s, path);
    await page.waitForTimeout(3000);
  }
  throw new Error('gagal: ' + path);
}

// 1. Ranking (semua halaman, 100 per halaman).
const rankings = {};
for (const [rankId, catId, code] of CATS) {
  const doubles = /D/.test(code);
  rankings[code] = [];
  for (let pg = 1; ; pg++) {
    const q = new URLSearchParams({ rankId, catId, publicationId: 0, doubles, searchKey: '', pageKey: 100, page: pg, drawCount: 1 });
    const d = await get(`vue-rankingtable?${q}`, `${CACHE}/r-${code}-${pg}.json`);
    rankings[code].push(...d.results.data);
    if (pg >= d.results.last_page) break;
  }
  console.log(code, rankings[code].length);
}
writeFileSync(`${CACHE}/rankings.json`, JSON.stringify(rankings));
await browser.close();
