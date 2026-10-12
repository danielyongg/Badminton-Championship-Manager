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
    await page.waitForTimeout(5000);
  }
  console.warn('dilewati (server terus gagal):', path); // mis. satu halaman ranking yang selalu error 500
  return null;
}

// 1. Ranking (semua halaman, 100 per halaman).
const rankings = {};
for (const [rankId, catId, code] of CATS) {
  const doubles = /D/.test(code);
  rankings[code] = [];
  let last = 1;
  for (let pg = 1; ; pg++) {
    const q = new URLSearchParams({ rankId, catId, publicationId: 0, doubles, searchKey: '', pageKey: 100, page: pg, drawCount: 1 });
    const d = await get(`vue-rankingtable?${q}`, `${CACHE}/r-${code}-${pg}.json`);
    if (d) rankings[code].push(...d.results.data);
    if (pg >= (d?.results.last_page ?? last)) break;
    last = d?.results.last_page ?? last;
  }
  console.log(code, rankings[code].length);
}
writeFileSync(`${CACHE}/rankings.json`, JSON.stringify(rankings));

// 2. Pilih atlet per negara game: senior s/d 24 per gender (terbaik dulu), junior (ranking junior) s/d 8.
const COUNTRY = {
  China: 'CHN', Indonesia: 'INA', Japan: 'JPN', Korea: 'KOR', Malaysia: 'MAS', 'Chinese Taipei': 'TPE', Thailand: 'THA',
  India: 'IND', 'Hong Kong China': 'HKG', Singapore: 'SGP', Vietnam: 'VIE', Philippines: 'PHI', 'Macau China': 'MAC',
  'United Arab Emirates': 'UAE', Denmark: 'DEN', France: 'FRA', England: 'ENG', Germany: 'GER', Spain: 'ESP', Netherlands: 'NED',
  Scotland: 'SCO', Ireland: 'IRL', Sweden: 'SWE', Finland: 'FIN', Switzerland: 'SUI', Poland: 'POL', Bulgaria: 'BUL',
  Czechia: 'CZE', Ukraine: 'UKR', Austria: 'AUT', Turkiye: 'TUR', Norway: 'NOR', Italy: 'ITA', Canada: 'CAN', USA: 'USA',
  Guatemala: 'GUA', Brazil: 'BRA', Mexico: 'MEX', Peru: 'PER', Egypt: 'EGY', Nigeria: 'NGR', 'South Africa': 'RSA',
  Algeria: 'ALG', Mauritius: 'MRI', Botswana: 'BOT', Australia: 'AUS', 'New Zealand': 'NZL',
};
const SENIOR_CAP = 24, JUNIOR_CAP = 8;
// Nomor → [gender pemain 1, gender pemain 2, ganda?, junior?]. XD: pemain 1 putra.
const KIND = { MS: ['M', null, 0, 0], WS: ['F', null, 0, 0], MD: ['M', 'M', 1, 0], WD: ['F', 'F', 1, 0], XD: ['M', 'F', 1, 0],
  BS: ['M', null, 0, 1], GS: ['F', null, 0, 1], BD: ['M', null, 0, 1], GD: ['F', null, 0, 1], XDJ: ['M', null, 0, 1] };
// Nama tampilan BWF ("Kunlavut VITIDSARN", "AN Se Young") → huruf besar-kecil biasa.
const nameOf = (m) => m.name_display_bold.replace(/<[^>]+>/g, '').trim()
  .replace(/\p{Lu}[\p{Lu}'-]+/gu, (w) => w[0] + w.slice(1).toLowerCase().replace(/(['-])(\p{Ll})/gu, (_, s, c) => s + c.toUpperCase()));
// Level (≈ kemampuan 1–100) dari peringkat: senior #1 ≈ 96, #10 ≈ 86, #100 ≈ 75, #1000 ≈ 65; junior #1 ≈ 72.
const levelOf = (rank, junior) => Math.round(junior ? 72 - 4 * Math.log(rank) : 96 - 4.5 * Math.log(rank));

const people = new Map(); // bwfId → atlet
const pairs = [];
for (const [code, rows] of Object.entries(rankings)) {
  const [g1, g2, dbl, junior] = KIND[code];
  for (const r of rows) {
    const cid = COUNTRY[r.p1_country_model?.name];
    if (!cid || !r.player1_model) continue;
    const lvl = levelOf(r.rank, junior);
    const ids = [];
    for (const [m, g] of [[r.player1_model, g1], [r.player2_model, g2]]) {
      if (!m || !g) continue;
      const p = people.get(m.id) ?? people.set(m.id, { id: m.id, name: nameOf(m), cid, g, lvl: 0, s: 0, d: 0 }).get(m.id);
      p.lvl = Math.max(p.lvl, lvl);
      if (dbl) p.d = Math.max(p.d, lvl); else p.s = Math.max(p.s, lvl);
      if (junior) p.junior = true; else p.senior = true;
      ids.push(m.id);
    }
    if (dbl && ids.length === 2 && COUNTRY[r.p2_country_model?.name] === cid) pairs.push([code, ids[0], ids[1]]);
  }
}
const chosen = new Set();
for (const cid of Object.values(COUNTRY)) for (const g of ['M', 'F']) {
  const all = [...people.values()].filter((p) => p.cid === cid && p.g === g).sort((a, b) => b.lvl - a.lvl);
  all.filter((p) => p.senior).slice(0, SENIOR_CAP).forEach((p) => chosen.add(p.id));
  all.filter((p) => !p.senior).slice(0, JUNIOR_CAP).forEach((p) => chosen.add(p.id));
}
console.log('dipilih', chosen.size);

// 3. Tanggal lahir & tangan dari profil (satu permintaan per atlet terpilih).
let n = 0;
for (const id of chosen) {
  const d = await get(`vue-player-summary?drawCount=1&playerId=${id}&isPara=false`, `${CACHE}/p-${id}.json`);
  const p = people.get(id);
  const dob = d?.results?.date_of_birth;
  if (dob) p.born = dob.slice(0, 10);
  if (++n % 100 === 0) console.log('profil', n);
}

// 4. Tulis data ringkas: atlet [bwfId, nama, negara, gender, lahir (YYYY-MM-DD | null), fokus, level, junior] & pasangan.
const players = [...chosen].map((id) => people.get(id)).sort((a, b) => a.cid.localeCompare(b.cid) || b.lvl - a.lvl)
  // Spesialis ganda: level tunggalnya jauh di bawah level ganda (atau tanpa ranking tunggal).
  .map((p) => [+p.id, p.name, p.cid, p.g, p.born ?? null, p.s < p.d - 8 ? 'D' : 'S', p.lvl, p.senior ? 0 : 1]);
const busy = new Set();
const keptPairs = pairs.filter(([d, a, b]) => {
  if (!chosen.has(a) || !chosen.has(b) || busy.has(`${d}:${a}`) || busy.has(`${d}:${b}`)) return false;
  if (people.get(a).cid !== people.get(b).cid) return false; // atlet yang tercatat di negara berbeda antar nomor
  busy.add(`${d}:${a}`).add(`${d}:${b}`);
  return true;
}).map(([d, a, b]) => [d, +a, +b]);
writeFileSync('src/engine/presets/bwfPlayers.json', JSON.stringify({ source: 'BWF World & Junior Rankings', fetched: new Date().toISOString().slice(0, 10), players, pairs: keptPairs }));
console.log('atlet', players.length, 'pasangan', keptPairs.length);
await browser.close();
