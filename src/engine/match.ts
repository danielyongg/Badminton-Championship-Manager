import { normal, type Rng } from './rng';
import { ATTRS, type Attr, type Attrs, type EntrantId, type Match, type MatchConfig, type PatternKind, type Player, type PointType, type Strategy } from './types';

// Mesin pertandingan berbasis rally. Dibuat sebagai "mesin langkah" (playRally) agar
// Live Match (Fase 8) bisa memainkan rally satu per satu dan mengubah strategi di interval.

export interface SideInput {
  players: Player[]; // 1 (tunggal) atau 2 (ganda)
  chemistry?: number; // ganda saja
}

interface SideState {
  attrs: Attrs; // atribut dasar sisi ini (rata-rata pasangan + form + chemistry)
  energy: number; // 0–100
  strategy: Strategy;
}

export interface MatchState {
  sides: [SideState, SideState];
  games: [number, number][]; // game yang sudah selesai
  score: [number, number]; // game berjalan
  server: 0 | 1;
  intervalDone: boolean;
  winner?: 0 | 1;
  stats: Record<PointType, [number, number]>;
  rallies: number;
  momentum: number; // −1 (sisi 1 unggul) .. 1 (sisi 0 unggul)
}

export interface RallyEvent {
  winner: 0 | 1;
  type: PointType;
  interval?: boolean; // baru masuk interval 11 poin
  gameOver?: boolean;
  matchOver?: boolean;
}

export type MatchResult = Pick<Match, 'scores' | 'winner'> & { stats: Record<PointType, [number, number]> };

const PHYSICAL: Attr[] = ['speed', 'stamina', 'smash', 'defense'];
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const logistic = (x: number) => 1 / (1 + Math.exp(-x));

function sideAttrs(side: SideInput, cfg: MatchConfig): Attrs {
  const ps = side.players;
  const bonus = ps.length > 1 ? ((side.chemistry ?? 50) - 50) * cfg.chemistryWeight : 0;
  const form = ps.reduce((s, p) => s + p.form, 0) / ps.length;
  return Object.fromEntries(
    ATTRS.map((a) => [a, ps.reduce((s, p) => s + p.attrs[a], 0) / ps.length + form + bonus]),
  ) as Attrs;
}

export function createMatch(sides: [SideInput, SideInput], cfg: MatchConfig, rng: Rng): MatchState {
  const start = (s: SideInput) => clamp(100 - Math.max(...s.players.map((p) => p.fatigue)) * cfg.energy.fatigueToStart, 0, 100);
  return {
    sides: [
      { attrs: sideAttrs(sides[0], cfg), energy: start(sides[0]), strategy: 'balanced' },
      { attrs: sideAttrs(sides[1], cfg), energy: start(sides[1]), strategy: 'balanced' },
    ],
    games: [],
    score: [0, 0],
    server: rng() < 0.5 ? 0 : 1,
    intervalDone: false,
    stats: { smash: [0, 0], net: [0, 0], clear: [0, 0], drop: [0, 0], error: [0, 0], service: [0, 0] },
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
  if (st.games.length === 0 && pointsPlayed < cfg.warmup.points) v -= cfg.warmup.maxPenalty * (1 - s.attrs.warmup / 100);
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
    const cost = cfg.energy.costPerRally * (1 - (cfg.energy.staminaRelief * (s.attrs.stamina - 50)) / 100) * mult * cfg.strategies[s.strategy].energy;
    s.energy = clamp(s.energy - cost, 0, 100);
  }
}

const recover = (st: MatchState, amount: number) => st.sides.forEach((s) => (s.energy = clamp(s.energy + amount, 0, 100)));

export function playRally(st: MatchState, cfg: MatchConfig, rng: Rng): RallyEvent {
  if (st.winner !== undefined) throw new Error('Pertandingan sudah selesai');
  const srv = st.server;
  const rcv = (1 - srv) as 0 | 1;
  let winner: 0 | 1;
  let type: PointType;
  let energyMult = 1;

  const serveProb = cfg.serviceEvent.base + (100 - eff(st, srv, 'serve', cfg)) * cfg.serviceEvent.perMissingServe;
  if (rng() < serveProb) {
    // Poin langsung dari servis: servis bagus → poin untuk server, servis buruk → kesalahan servis.
    winner = rng() < 0.2 + (eff(st, srv, 'serve', cfg) / 100) * 0.5 ? srv : rcv;
    type = 'service';
    energyMult = 0.2;
  } else {
    const p = pickPattern(patterns(st, cfg), rng);
    const x = p.attacker;
    const y = (1 - x) as 0 | 1;
    let diff = (1 - cfg.overallWeight) * (eff(st, x, p.atk, cfg) - eff(st, y, p.def, cfg))
      + cfg.overallWeight * (overall(st, x, cfg) - overall(st, y, cfg));
    if (Math.max(...st.score) >= cfg.pressure.fromScore)
      diff += cfg.pressure.weight * (st.sides[x].attrs.mental - st.sides[y].attrs.mental);
    const sx = cfg.strategies[st.sides[x].strategy], sy = cfg.strategies[st.sides[y].strategy];
    diff += (sx.attack[p.kind] ?? 0) - sy.defend;
    diff += cfg.momentum.weight * (x === 0 ? st.momentum : -st.momentum);
    winner = rng() < logistic(diff / cfg.duelScale) ? x : y;
    type = winner === x ? p.winType : p.loseType;
    // Sebagian poin sebenarnya kesalahan sendiri lawan; makin rendah Consistency, makin sering.
    const loser = (1 - winner) as 0 | 1;
    const errorRisk = cfg.strategies[st.sides[loser].strategy].error;
    if (rng() < 0.18 + errorRisk + ((100 - eff(st, loser, 'consistency', cfg)) / 100) * 0.3) type = 'error';
    energyMult = p.energyMult * clamp(normal(rng, 1, 0.3), 0.3, 2);
  }

  spendEnergy(st, energyMult, cfg);
  st.rallies++;
  st.stats[type][winner]++;
  st.score[winner]++;
  st.server = winner;
  st.momentum = st.momentum * cfg.momentum.decay + (winner === 0 ? 1 : -1) * (1 - cfg.momentum.decay);
  const ev: RallyEvent = { winner, type };

  const [a, b] = st.score;
  const w = a > b ? a : b;
  if ((w >= cfg.pointsToWin && Math.abs(a - b) >= 2) || w === cfg.cap) {
    st.games.push([a, b]);
    st.score = [0, 0];
    st.intervalDone = false;
    ev.gameOver = true;
    const won = st.games.filter((g) => g[winner] > g[1 - winner]).length;
    if (won === cfg.gamesToWin) {
      st.winner = winner;
      ev.matchOver = true;
    } else recover(st, cfg.energy.gameRecovery);
  } else if (!st.intervalDone && w === cfg.intervalAt) {
    st.intervalDone = true;
    ev.interval = true;
    recover(st, cfg.energy.intervalRecovery);
  }
  return ev;
}

export const matchResult = (st: MatchState): MatchResult => ({ scores: st.games, winner: st.winner!, stats: st.stats });

/** Mode Auto: seluruh laga disimulasikan sekaligus. `strategies` opsional (default 'balanced'). */
export function simulateMatch(sides: [SideInput, SideInput], cfg: MatchConfig, rng: Rng, strategies?: [Strategy, Strategy]): MatchResult {
  const st = createMatch(sides, cfg, rng);
  if (strategies) { st.sides[0].strategy = strategies[0]; st.sides[1].strategy = strategies[1]; }
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
