import { makeRng, normal, type Rng } from './rng';
import { CHOKER_BIG, CHOKER_MENTAL, CLUTCH_BIG, CLUTCH_MENTAL, CONSISTENT_DAY, MOMENTUM_RIDER, SLOW_RUBBER, SLOW_WARMUP, traitShare } from './traits';
import { ATTRS, type Attr, type Attrs, type EntrantId, type Instruction, type Match, type MatchConfig, type MatchStats, type PatternKind, type Player, type PointType, type Strategy, type WinnerShot } from './types';

// Mesin pertandingan berbasis rally. Dibuat sebagai "mesin langkah" (playRally) agar
// Live Match (Fase 8) bisa memainkan rally satu per satu dan mengubah strategi di interval.

export interface SideInput {
  players: Player[]; // 1 (tunggal) atau 2 (ganda)
  chemistry?: number; // ganda saja
  day?: number; // kondisi hari itu (termasuk efek on fire); kosong = diacak baru
  /** Laga besar (SF/F atau turnamen besar): sifat mental juara/demam panggung berlaku penuh. */
  big?: boolean;
  /** Kapan sisi ini memakai challenge (Hawk-Eye); bawaan 'sure' (AI). 'ask' hanya di Live Match, selain itu = 'sure'. */
  challenge?: ChallengePolicy;
  /** Usia rata-rata sisi ini (tahun laga − tahun lahir): ukuran pengalaman di tur; kosong = setara ±24 tahun. */
  age?: number;
}

export type ChallengePolicy = 'never' | 'sure' | 'ask';
/** Reaksi atlet yang dirugikan keputusan hakim garis: sangat yakin salah / ragu / tanpa protes. */
export type Reaction = 'sure' | 'unsure' | 'none';
/**
 * Bola tipis di garis (hanya laga dengan Instant Review). `by` = sisi yang dirugikan keputusan `call` (atas pukulan lawan bila
 * 'in', atas pukulannya sendiri bila 'out'); `wrong` = kebenaran tersembunyi (keputusan hakim garis salah).
 */
export interface LineCall { by: 0 | 1; call: 'in' | 'out'; wrong: boolean; react: Reaction; challenged?: boolean }

/**
 * Instant Review (ASUMSI angka, aturan dari BWF Statutes 4.1.8 v2.0): maks 2 challenge gagal per game; challenge berhasil
 * tidak mengurangi jatah. TIGHT = peluang poin non-net jadi bola tipis; WRONG = peluang hakim garis salah.
 */
export const REVIEW_FAILS = 2;
const TIGHT = 0.065, WRONG = 0.27;

interface SideState {
  attrs: Attrs; // atribut dasar sisi ini (rata-rata pasangan + form + chemistry)
  energy: number; // 0–100
  strategy: Strategy;
  male: boolean; // kecepatan smash (tunggal/ganda putra & campuran lebih cepat)
  clutch?: number; // tambahan mental di poin kritis (mental juara − demam panggung)
  slow?: number; // bagian sisi yang starter lambat (0–1)
  rider?: number; // bagian sisi yang pemburu momentum (0–1)
  /** Instruksi manajer sampai jeda berikutnya (interval / akhir game); kosong = tanpa instruksi. */
  instruction?: Instruction;
  challenge?: ChallengePolicy;
  age?: number;
}

/** Hasil reli yang sudah ditentukan tetapi belum dicatat ke skor (menunggu keputusan challenge). */
interface Outcome {
  winner: 0 | 1;
  type: PointType;
  shots: number;
  kmh?: number;
  energyMult: number;
  own?: boolean; // kesalahan sendiri (unforced) — untuk statistik
  shot?: WinnerShot; // pukulan sisi yang kalah bila tercatat 'error' (dipakai bila challenge membalikkan poin)
  line?: LineCall;
}

export interface MatchState {
  sides: [SideState, SideState];
  games: [number, number][]; // game yang sudah selesai
  score: [number, number]; // game berjalan
  server: 0 | 1;
  intervalDone: boolean;
  winner?: 0 | 1;
  stats: MatchStats;
  run: [0 | 1, number]; // rentetan poin berjalan: [sisi, jumlah]
  srng: Rng; // acak khusus statistik (panjang reli, kecepatan smash): tidak menggeser urutan acak hasil laga
  rallies: number;
  momentum: number; // −1 (sisi 1 unggul) .. 1 (sisi 0 unggul)
  /** Laga dengan Instant Review (Hawk-Eye); `fails` = challenge gagal tiap sisi di game berjalan. */
  review?: boolean;
  fails: [number, number];
  /** Bola tipis yang menunggu keputusan challenge manajer (lihat `challenge`). */
  pending?: Outcome;
}

export interface RallyEvent {
  winner: 0 | 1;
  type: PointType;
  shots: number; // panjang reli (pukulan)
  kmh?: number; // kecepatan smash penentu (bila poin smash)
  interval?: boolean; // baru masuk interval (11 poin; 8 poin di sistem 3×15)
  gameOver?: boolean;
  matchOver?: boolean;
  /** Bola tipis (keputusan akhir setelah challenge, bila ada). */
  line?: LineCall;
  /** Reli belum dicatat: menunggu `challenge(st, cfg, ya/tidak)`. */
  pending?: boolean;
}

export type MatchResult = Pick<Match, 'scores' | 'winner'> & { stats: MatchStats };

const PHYSICAL: Attr[] = ['speed', 'stamina', 'smash', 'defense'];

/**
 * Efek instruksi interval (ASUMSI, skala duel = selisih atribut; strategi memberi ±5–7):
 * duel = bonus tiap duel; recv = bonus duel saat menerima servis; energy = pengali biaya energi;
 * against = pengali efek momentum lawan terhadap sisi ini; error = tambahan peluang salah sendiri per reli.
 */
export const INSTRUCTION_EFFECT: Record<Instruction, { duel: number; recv: number; energy: number; against: number; error: number }> = {
  none: { duel: 0, recv: 0, energy: 1, against: 1, error: 0 },
  calm: { duel: 0, recv: 0, energy: 1, against: 0.4, error: -0.004 },
  pressServe: { duel: 0, recv: 3, energy: 1.05, against: 1, error: 0.003 },
  conserve: { duel: -2, recv: 0, energy: 0.65, against: 1, error: 0 },
  allOut: { duel: 5, recv: 0, energy: 1.6, against: 1, error: 0.004 },
};
const ins = (s: SideState) => INSTRUCTION_EFFECT[s.instruction ?? 'none'];
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const logistic = (x: number) => 1 / (1 + Math.exp(-x));

/** Tingkat morale (−10..+10) untuk tampilan. */
export const MORALE_TIERS = ['veryLow', 'low', 'normal', 'high', 'veryHigh'] as const;
export const moraleTier = (m: number) => MORALE_TIERS[m >= 6 ? 4 : m >= 2 ? 3 : m > -2 ? 2 : m > -6 ? 1 : 0];
/** Bonus/penalti atribut dari morale: naik sedikit bila tinggi, turun penuh bila rendah. */
export const moraleEffect = (m: number, cfg: MatchConfig) => m * (m >= 0 ? cfg.morale.up : cfg.morale.down);

/** Bonus semua atribut pasangan ganda dari chemistry (50 = netral). */
export const chemistryBonus = (chemistry: number, cfg: MatchConfig) => (chemistry - 50) * cfg.chemistryWeight;

/** Ability pasangan ganda seperti dipakai mesin (tanpa morale & kondisi hari itu): rata-rata ability + bonus chemistry. */
export const pairAbility = (abilities: number[], chemistry: number, cfg: MatchConfig) =>
  abilities.reduce((s, x) => s + x, 0) / abilities.length + chemistryBonus(chemistry, cfg);

function sideAttrs(side: SideInput, cfg: MatchConfig, day = 0): Attrs {
  const ps = side.players;
  const bonus = ps.length > 1 ? chemistryBonus(side.chemistry ?? 50, cfg) : 0;
  const stage = side.big ? CLUTCH_BIG * traitShare(ps, 'clutch') - CHOKER_BIG * traitShare(ps, 'choker') : 0;
  const dayScale = 1 - (1 - CONSISTENT_DAY) * traitShare(ps, 'consistent'); // konsisten: kondisi harian lebih stabil
  const form = ps.reduce((s, p) => s + moraleEffect(p.form, cfg), 0) / ps.length + day * dayScale + stage;
  return Object.fromEntries(
    ATTRS.map((a) => [a, ps.reduce((s, p) => s + p.attrs[a], 0) / ps.length + form + bonus]),
  ) as Attrs;
}

const pair = (): [number, number] => [0, 0];
export const emptyStats = (): MatchStats => ({
  v: 2, win: { smash: pair(), net: pair(), drop: pair(), clear: pair() }, ue: pair(), fe: pair(), sf: pair(), sw: pair(),
  srv: pair(), srvWon: pair(), streak: pair(), gp: pair(), gps: pair(), mps: pair(), kmh: pair(), longest: 0, rallies: [0, 0, 0], sec: 0,
});

/**
 * Panjang reli (pukulan) per pola. ASUMSI (perkiraan siaran BWF): rata-rata ±9 pukulan, reli panjang 10–25.
 * Kecepatan smash: dasar putra 360 / putri 300 km/jam, +2,5 per poin atribut Smash di atas 70, acak σ 12.
 */
const SHOTS: Record<PatternKind, [number, number]> = { smash: [3, 8], net: [3, 7], deception: [4, 8], rally: [10, 16] };
const smashKmh = (s: SideState, smash: number, rng: Rng) => Math.round(clamp((s.male ? 360 : 300) + (smash - 70) * 2.5 + normal(rng, 0, 12), 200, 480));

/** Sisi yang memegang game point sebelum reli ini (menang reli = menang game), atau tidak ada. */
function gamePointFor(st: MatchState, cfg: MatchConfig): 0 | 1 | undefined {
  for (const x of [0, 1] as const) {
    const a = st.score[x] + 1, b = st.score[1 - x];
    if ((a >= cfg.pointsToWin && a - b >= 2) || a === cfg.cap) return x;
  }
  return undefined;
}

const clutchOf = (s: SideInput) => CLUTCH_MENTAL * traitShare(s.players, 'clutch') - CHOKER_MENTAL * traitShare(s.players, 'choker');

export function createMatch(sides: [SideInput, SideInput], cfg: MatchConfig, rng: Rng, review = false): MatchState {
  const start = (s: SideInput) => clamp(100 - Math.max(...s.players.map((p) => p.fatigue)) * cfg.energy.fatigueToStart, 0, 100);
  return {
    sides: [
      { attrs: sideAttrs(sides[0], cfg, sides[0].day ?? normal(rng, 0, cfg.dayForm.sd)), energy: start(sides[0]), strategy: 'balanced', male: sides[0].players.some((p) => p.gender === 'M'), clutch: clutchOf(sides[0]), slow: traitShare(sides[0].players, 'slowStarter'), rider: traitShare(sides[0].players, 'momentumRider'), challenge: sides[0].challenge, age: sides[0].age },
      { attrs: sideAttrs(sides[1], cfg, sides[1].day ?? normal(rng, 0, cfg.dayForm.sd)), energy: start(sides[1]), strategy: 'balanced', male: sides[1].players.some((p) => p.gender === 'M'), clutch: clutchOf(sides[1]), slow: traitShare(sides[1].players, 'slowStarter'), rider: traitShare(sides[1].players, 'momentumRider'), challenge: sides[1].challenge, age: sides[1].age },
    ],
    review,
    fails: [0, 0],
    games: [],
    score: [0, 0],
    server: rng() < 0.5 ? 0 : 1,
    intervalDone: false,
    stats: emptyStats(),
    run: [0, 0],
    srng: makeRng(rng.state() ^ 0x5bd1e995),
    rallies: 0,
    momentum: 0,
  };
}

/** Nilai atribut efektif saat ini: dipengaruhi energi (atribut fisik) dan pemanasan (awal game 1). */
function eff(st: MatchState, side: 0 | 1, a: Attr, cfg: MatchConfig) {
  const s = st.sides[side];
  let v = s.attrs[a];
  if (PHYSICAL.includes(a)) v *= 1 - cfg.energy.effect * (1 - s.energy / 100);
  const pointsPlayed = st.score[0] + st.score[1];
  const slow = s.slow ?? 0;
  if (st.games.length === 0 && pointsPlayed < cfg.warmup.points) v -= cfg.warmup.maxPenalty * (1 - s.attrs.warmup / 100) * (1 + (SLOW_WARMUP - 1) * slow);
  if (st.games.length === 2) v += SLOW_RUBBER * slow; // starter lambat: kuat di rubber game
  return v;
}

const overall = (st: MatchState, side: 0 | 1, cfg: MatchConfig) =>
  ATTRS.reduce((sum, a) => sum + eff(st, side, a, cfg), 0) / ATTRS.length;

interface Pattern {
  kind: PatternKind;
  weight: number;
  attacker: 0 | 1;
  atk: Attr;
  def: Attr;
  winType: PointType; // jenis poin bila penyerang menang
  loseType: PointType; // jenis poin bila bertahan menang
  energyMult: number;
}

function patterns(st: MatchState, cfg: MatchConfig): Pattern[] {
  const list: Pattern[] = [];
  for (const x of [0, 1] as const) {
    const w = cfg.strategies[st.sides[x].strategy].weight;
    list.push({ kind: 'smash', weight: eff(st, x, 'smash', cfg) * w.smash, attacker: x, atk: 'smash', def: 'defense', winType: 'smash', loseType: 'clear', energyMult: 1.1 });
    list.push({ kind: 'net', weight: eff(st, x, 'net', cfg) * 0.8 * w.net, attacker: x, atk: 'net', def: 'net', winType: 'net', loseType: 'net', energyMult: 0.8 });
    list.push({ kind: 'deception', weight: eff(st, x, 'deception', cfg) * 0.6 * w.deception, attacker: x, atk: 'deception', def: 'speed', winType: 'drop', loseType: 'clear', energyMult: 0.9 });
    // Reli panjang: adu konsistensi, paling menguras energi.
    list.push({ kind: 'rally', weight: 18 * w.rally, attacker: x, atk: 'consistency', def: 'consistency', winType: 'clear', loseType: 'clear', energyMult: 1.6 });
  }
  return list;
}

function pickPattern(list: Pattern[], rng: Rng) {
  let r = rng() * list.reduce((s, p) => s + p.weight, 0);
  for (const p of list) if ((r -= p.weight) <= 0) return p;
  return list[list.length - 1];
}

function spendEnergy(st: MatchState, mult: number, cfg: MatchConfig) {
  for (const s of st.sides) {
    const cost = cfg.energy.costPerRally * (1 - (cfg.energy.staminaRelief * (s.attrs.stamina - 50)) / 100) * mult * cfg.strategies[s.strategy].energy * ins(s).energy;
    s.energy = clamp(s.energy - cost, 0, 100);
  }
}

/** Sisi yang salah sendiri di reli ini (atau tidak ada): risiko strategi, diperbesar bila Consistency rendah. */
function ownError(st: MatchState, cfg: MatchConfig, rng: Rng): 0 | 1 | undefined {
  const p = ([0, 1] as const).map((x) => Math.max(0, cfg.ownError.base + cfg.strategies[st.sides[x].strategy].error + ins(st.sides[x]).error)
    * (150 - eff(st, x, 'consistency', cfg)) / 100);
  const r = rng();
  return r < p[0] ? 0 : r < p[0] + p[1] ? 1 : undefined;
}

const recover = (st: MatchState, amount: number) => st.sides.forEach((s) => (s.energy = clamp(s.energy + amount, 0, 100)));

export function playRally(st: MatchState, cfg: MatchConfig, rng: Rng): RallyEvent {
  if (st.winner !== undefined) throw new Error('Pertandingan sudah selesai');
  if (st.pending) throw new Error('Menunggu keputusan challenge');
  const srv = st.server;
  const rcv = (1 - srv) as 0 | 1;
  let winner: 0 | 1;
  let type: PointType;
  let energyMult = 1;
  let erred: 0 | 1 | undefined;
  let shots: number;
  let kmh: number | undefined;
  let shot: WinnerShot | undefined = 'clear'; // undefined = bukan bola garis (servis, net)
  const s = st.stats;

  const serveProb = cfg.serviceEvent.base + (100 - eff(st, srv, 'serve', cfg)) * cfg.serviceEvent.perMissingServe;
  if (rng() < serveProb) {
    // Poin langsung dari servis: servis bagus → poin untuk server, servis buruk → kesalahan servis.
    winner = rng() < 0.2 + (eff(st, srv, 'serve', cfg) / 100) * 0.5 ? srv : rcv;
    type = 'service';
    energyMult = 0.2;
    if (winner === srv) { s.sw[srv]++; shots = 2; } else { s.sf[srv]++; shots = 1; }
    shot = undefined;
  } else if ((erred = ownError(st, cfg, rng)) !== undefined) {
    // Kesalahan sendiri sebelum pola berkembang: lawan dapat poin.
    winner = (1 - erred) as 0 | 1;
    type = 'error';
    energyMult = 0.5;
    shots = 2 + Math.floor(st.srng() * 8);
  } else {
    const p = pickPattern(patterns(st, cfg), rng);
    const x = p.attacker;
    const y = (1 - x) as 0 | 1;
    let diff = (1 - cfg.overallWeight) * (eff(st, x, p.atk, cfg) - eff(st, y, p.def, cfg))
      + cfg.overallWeight * (overall(st, x, cfg) - overall(st, y, cfg));
    if (Math.max(...st.score) >= cfg.pressure.fromScore)
      diff += cfg.pressure.weight * ((st.sides[x].attrs.mental + (st.sides[x].clutch ?? 0)) - (st.sides[y].attrs.mental + (st.sides[y].clutch ?? 0)));
    const sx = cfg.strategies[st.sides[x].strategy], sy = cfg.strategies[st.sides[y].strategy];
    diff += (sx.attack[p.kind] ?? 0) - sy.defend;
    const mom = x === 0 ? st.momentum : -st.momentum; // >0: momentum memihak x
    const [up, down] = mom > 0 ? [st.sides[x], st.sides[y]] : [st.sides[y], st.sides[x]];
    diff += cfg.momentum.weight * mom * (1 + (MOMENTUM_RIDER - 1) * (up.rider ?? 0)) * ins(down).against; // tenang: momentum lawan teredam
    const ix = ins(st.sides[x]), iy = ins(st.sides[y]);
    diff += ix.duel - iy.duel + (x === rcv ? ix.recv : -iy.recv);
    winner = rng() < logistic(diff / cfg.duelScale) ? x : y;
    type = winner === x ? p.winType : p.loseType;
    // Label statistik: sebagian poin duel tercatat sebagai kesalahan lawan; makin rendah Consistency, makin sering.
    // (Kesalahan sendiri yang menentukan reli ada di ownError.)
    const loser = (1 - winner) as 0 | 1;
    if (rng() < 0.18 + ((100 - eff(st, loser, 'consistency', cfg)) / 100) * 0.3) type = 'error';
    energyMult = p.energyMult * clamp(normal(rng, 1, 0.3), 0.3, 2);
    shot = p.kind === 'net' ? undefined : (loser === x ? p.winType : p.loseType) as WinnerShot;
    const [lo, n] = SHOTS[p.kind];
    shots = lo + Math.floor(st.srng() * n);
    if (p.kind === 'smash') {
      kmh = smashKmh(st.sides[x], eff(st, x, 'smash', cfg), st.srng);
      s.kmh[x] = Math.max(s.kmh[x], kmh);
      if (type !== 'smash') kmh = undefined; // hanya smash penentu yang ditampilkan di log
    }
  }

  const o: Outcome = { winner, type, shots, kmh, energyMult, own: erred !== undefined, shot };
  // Bola tipis hanya bila ada Instant Review (tanpa itu urutan acak laga tidak bergeser).
  if (st.review && shot && rng() < TIGHT) {
    const by = (1 - winner) as 0 | 1;
    const wrong = rng() < WRONG;
    // ponytail: usia sebagai ukuran pengalaman; atlet membaca bola dengan benar 55% (usia 17) … 85% (usia 32+), ±70% di usia 24.
    const thinksWrong = rng() < 0.55 + 0.3 * clamp(((st.sides[by].age ?? 24.5) - 17) / 15, 0, 1) ? wrong : !wrong;
    const react: Reaction = thinksWrong ? (rng() < 0.65 ? 'sure' : 'unsure') : (rng() < 0.3 ? 'unsure' : 'none');
    o.line = { by, call: type === 'error' ? 'out' : 'in', wrong, react };
    if (st.fails[by] < REVIEW_FAILS && st.sides[by].challenge === 'ask') {
      st.pending = o;
      return { winner, type, shots, line: o.line, pending: true };
    }
    return decide(st, cfg, o);
  }
  return applyOutcome(st, cfg, o);
}

/** Keputusan manajer atas bola tipis yang tertunda: `yes` = challenge; kosong = otomatis seperti 'sure'. */
export function challenge(st: MatchState, cfg: MatchConfig, yes?: boolean): RallyEvent {
  const o = st.pending;
  if (!o) throw new Error('Tidak ada bola tipis');
  st.pending = undefined;
  return decide(st, cfg, o, yes);
}

/** Challenge (bila jatah masih ada) lalu catat poin; challenge berhasil membalikkan poin. */
function decide(st: MatchState, cfg: MatchConfig, o: Outcome, yes?: boolean): RallyEvent {
  const l = o.line!;
  yes ??= st.sides[l.by].challenge !== 'never' && l.react === 'sure'; // AI & 'sure': hanya bila sangat yakin
  if (yes && st.fails[l.by] < REVIEW_FAILS) {
    l.challenged = true;
    if (!l.wrong) st.fails[l.by]++;
    else if (o.type === 'error') { o.winner = l.by; o.type = o.shot!; o.own = false; } // bola ternyata masuk: pukulan penentu
    else { o.winner = l.by; o.type = 'error'; o.own = true; o.kmh = undefined; } // bola ternyata keluar: salah sendiri
  }
  return applyOutcome(st, cfg, o);
}

/** Catat hasil reli: statistik, skor, momentum, interval & akhir game. */
function applyOutcome(st: MatchState, cfg: MatchConfig, { winner, type, shots, kmh, energyMult, own, line }: Outcome): RallyEvent {
  const s = st.stats;
  const srv = st.server;
  const loser = (1 - winner) as 0 | 1;
  const gpSide = gamePointFor(st, cfg);
  if (type === 'error') (own ? s.ue : s.fe)[loser]++;
  else if (type !== 'service') s.win[type as WinnerShot][winner]++;

  spendEnergy(st, energyMult, cfg);
  st.rallies++;
  // Statistik reli: servis, rentetan poin, game/match point, panjang reli & perkiraan durasi.
  s.srv[srv]++;
  if (winner === srv) s.srvWon[srv]++;
  st.run = st.run[0] === winner ? [winner, st.run[1] + 1] : [winner, 1];
  s.streak[winner] = Math.max(s.streak[winner], st.run[1]);
  if (gpSide !== undefined) {
    s.gp[gpSide]++;
    const matchPoint = st.games.filter((g) => g[gpSide] > g[1 - gpSide]).length === cfg.gamesToWin - 1;
    if (winner !== gpSide) (matchPoint ? s.mps : s.gps)[winner]++;
  }
  s.longest = Math.max(s.longest, shots);
  s.rallies[shots <= 4 ? 0 : shots <= 9 ? 1 : 2]++;
  s.sec += Math.round(shots * 1.2 + 20); // ±1,2 detik per pukulan + jeda antar reli
  st.score[winner]++;
  st.server = winner;
  st.momentum = st.momentum * cfg.momentum.decay + (winner === 0 ? 1 : -1) * (1 - cfg.momentum.decay);
  const ev: RallyEvent = { winner, type, shots, ...(kmh && { kmh }), ...(line && { line }) };

  const [a, b] = st.score;
  const w = a > b ? a : b;
  if ((w >= cfg.pointsToWin && Math.abs(a - b) >= 2) || w === cfg.cap) {
    st.games.push([a, b]);
    st.score = [0, 0];
    st.intervalDone = false;
    st.fails = [0, 0]; // jatah challenge per game
    ev.gameOver = true;
    for (const x of st.sides) x.instruction = undefined; // instruksi berlaku sampai jeda berikutnya
    s.sec += 120; // jeda antar game
    const won = st.games.filter((g) => g[winner] > g[1 - winner]).length;
    if (won === cfg.gamesToWin) {
      st.winner = winner;
      ev.matchOver = true;
    } else recover(st, cfg.energy.gameRecovery);
  } else if (!st.intervalDone && w === cfg.intervalAt) {
    st.intervalDone = true;
    ev.interval = true;
    for (const x of st.sides) x.instruction = undefined;
    s.sec += 60;
    recover(st, cfg.energy.intervalRecovery);
  }
  return ev;
}

export const matchResult = (st: MatchState): MatchResult => ({ scores: st.games, winner: st.winner!, stats: st.stats });

/** Mode Auto: seluruh laga disimulasikan sekaligus. `strategies` opsional (default 'balanced'); `review` = Instant Review. */
export function simulateMatch(sides: [SideInput, SideInput], cfg: MatchConfig, rng: Rng, strategies?: [Strategy, Strategy], review = false): MatchResult {
  const st = createMatch(sides, cfg, rng, review);
  if (strategies) { st.sides[0].strategy = strategies[0]; st.sides[1].strategy = strategies[1]; }
  for (const s of st.sides) if (s.challenge === 'ask') s.challenge = 'sure'; // tanpa Live Match tidak ada yang ditanya
  while (st.winner === undefined) playRally(st, cfg, rng);
  return matchResult(st);
}

/** Rekor pertemuan a vs b: [menang a, menang b]. */
export function headToHead(matches: Match[], a: EntrantId, b: EntrantId): [number, number] {
  const h: [number, number] = [0, 0];
  for (const m of matches) {
    const ia = m.sides.indexOf(a);
    if (ia === -1 || !m.sides.includes(b) || m.walkover) continue;
    h[m.winner === ia ? 0 : 1]++;
  }
  return h;
}

/** Aturan skor yang berlaku di tahun itu (sistem 3×15 mulai `newScoring.fromYear`). */
export function matchConfigFor(cfg: MatchConfig, year: number): MatchConfig {
  const n = cfg.newScoring;
  if (!n || year < n.fromYear) return cfg;
  return {
    ...cfg, pointsToWin: n.pointsToWin, cap: n.cap, intervalAt: n.intervalAt,
    pressure: { ...cfg.pressure, fromScore: n.pressureFrom }, warmup: { ...cfg.warmup, points: n.warmupPoints },
  };
}

/** Duel kunci tiap strategi (sesuai pola di `patterns`): atribut kita vs atribut lawan yang menahannya. */
const KEY_DUEL: Record<Exclude<Strategy, 'balanced'>, [Attr, Attr]> = {
  attacking: ['smash', 'defense'], fast: ['net', 'net'], deceptive: ['deception', 'speed'], defensive: ['consistency', 'consistency'],
};

/**
 * Saran strategi pra-laga: duel kunci dengan keunggulan terbesar (atribut dasar rata-rata pasangan, tanpa kondisi hari itu).
 * ponytail: heuristik sederhana; keunggulan < `min` poin → 'balanced'.
 */
export function suggestStrategy(me: Player[], opp: Player[], min = 4): { strategy: Strategy; edge?: { mine: Attr; theirs: Attr; a: number; b: number } } {
  const avg = (ps: Player[], a: Attr) => Math.round(ps.reduce((s, p) => s + p.attrs[a], 0) / ps.length);
  let best: { strategy: Strategy; edge?: { mine: Attr; theirs: Attr; a: number; b: number } } = { strategy: 'balanced' };
  let top = min - 1;
  for (const [strategy, [mine, theirs]] of Object.entries(KEY_DUEL) as [Strategy, [Attr, Attr]][]) {
    const a = avg(me, mine), b = avg(opp, theirs);
    if (a - b > top) { top = a - b; best = { strategy, edge: { mine, theirs, a, b } }; }
  }
  return best;
}

/** Saran instruksi menurut kondisi laga (sisi `me`); urutan prioritas: energi, momentum, game penentu, servis lawan. ASUMSI. */
export function suggestInstruction(st: MatchState, me: 0 | 1): { instruction: Instruction; reason?: 'energy' | 'momentum' | 'decider' | 'serve' } {
  const op = (1 - me) as 0 | 1;
  const mine = st.sides[me], theirs = st.sides[op];
  const momentum = me === 0 ? st.momentum : -st.momentum;
  const won = (x: 0 | 1) => st.games.filter((g) => g[x] > g[1 - x]).length;
  if (mine.energy < 35 && mine.energy < theirs.energy - 5) return { instruction: 'conserve', reason: 'energy' };
  if (momentum < -0.35) return { instruction: 'calm', reason: 'momentum' };
  if (won(op) === won(me) && st.games.length > 0 && mine.energy >= 45) return { instruction: 'allOut', reason: 'decider' };
  if (theirs.attrs.serve < mine.attrs.serve - 3) return { instruction: 'pressServe', reason: 'serve' };
  return { instruction: 'none' };
}
