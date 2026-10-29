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
