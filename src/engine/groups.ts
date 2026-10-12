import { nextPow2, seedPositionGroups, type DrawEntrant } from './draw';
import { mainRoundName, type MatchRound, type PlayFn } from './knockout';
import { shuffle, type Rng } from './rng';
import { ROUNDS, type DrawStep, type EntrantId, type GroupStage, type Round } from './types';

// Fase grup (round-robin) + babak gugur: World Tour Finals, Olimpiade, tunggal Super 1000 (2027+).

export interface Standing {
  id: EntrantId;
  wins: number;
  gameDiff: number;
  pointDiff: number;
}

export interface GroupStageResult {
  groups: EntrantId[][];
  standings: Standing[][]; // urut peringkat akhir grup
  steps: DrawStep[];
}

/**
 * Undian grup dengan sistem pot: pot k = peringkat k·G+1 … (k+1)·G.
 * Pot 1 (unggulan) masuk grup berurutan (unggulan 1 → grup 1); pot lain diundi,
 * lalu ditukar di dalam pot agar pemain senegara sebisa mungkin tidak satu grup.
 */
export function groupDraw(entrants: DrawEntrant[], g: GroupStage, rng: Rng): { groups: DrawEntrant[][]; steps: DrawStep[] } {
  const groups: DrawEntrant[][] = Array.from({ length: g.groups }, () => []);
  const steps: DrawStep[] = [];
  const clashes = (grp: DrawEntrant[], e: DrawEntrant) => grp.filter((x) => x !== e && x.countryId === e.countryId).length;
  for (let k = 0; k * g.groups < entrants.length; k++) {
    const pot = entrants.slice(k * g.groups, (k + 1) * g.groups);
    const placed = k === 0 ? pot : shuffle(rng, pot);
    placed.forEach((e, i) => groups[i].push(e));
    // Perbaikan: tukar anggota pot antar-grup bila mengurangi jumlah senegara.
    if (k > 0)
      for (let i = 0; i < placed.length; i++)
        for (let j = 0; j < placed.length; j++) {
          const a = groups[i].at(-1)!, b = groups[j].at(-1)!;
          if (i === j || !a || !b) continue;
          const before = clashes(groups[i], a) + clashes(groups[j], b);
          groups[i][groups[i].length - 1] = b;
          groups[j][groups[j].length - 1] = a;
          if (clashes(groups[i], b) + clashes(groups[j], a) >= before) {
            groups[i][groups[i].length - 1] = a;
            groups[j][groups[j].length - 1] = b;
          }
        }
    groups.forEach((grp, i) => grp[k] && steps.push({ key: 'step_pot', vars: { k: k + 1, e: grp[k].id, g: String.fromCharCode(65 + i) }, entrant: grp[k].id }));
  }
  return { groups, steps };
}

/**
 * Round-robin satu grup. Urutan: jumlah menang; 2 seri → head-to-head;
 * ≥ 3 seri → selisih game, lalu selisih poin, lalu urutan unggulan. (ASUMSI: disederhanakan dari GCR)
 */
export async function playGroup(ids: EntrantId[], play: PlayFn): Promise<Standing[]> {
  const st = new Map(ids.map((id) => [id, { id, wins: 0, gameDiff: 0, pointDiff: 0 }]));
  const beat = new Set<string>();
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++) {
      const r = await play(ids[i], ids[j], 'G');
      const [w, l] = r.winner === 0 ? [ids[i], ids[j]] : [ids[j], ids[i]];
      st.get(w)!.wins++;
      beat.add(`${w}>${l}`);
      for (const [x, y] of r.scores) {
        const sa = st.get(ids[i])!, sb = st.get(ids[j])!;
        sa.gameDiff += x > y ? 1 : -1; sb.gameDiff += x > y ? -1 : 1;
        sa.pointDiff += x - y; sb.pointDiff += y - x;
      }
    }
  const seedOrder = new Map(ids.map((id, i) => [id, i]));
  const list = [...st.values()];
  return list.sort((a, b) => {
    if (a.wins !== b.wins) return b.wins - a.wins;
    const tied = list.filter((x) => x.wins === a.wins).length;
    if (tied === 2) return beat.has(`${a.id}>${b.id}`) ? -1 : 1;
    return b.gameDiff - a.gameDiff || b.pointDiff - a.pointDiff || seedOrder.get(a.id)! - seedOrder.get(b.id)!;
  });
}

/**
 * Penempatan lolosan grup ke bagan gugur. Juara grup i → posisi unggulan ke-i;
 * runner-up → paruh yang berlawanan dengan juara grupnya (WTF: juara grup A vs runner-up B di SF).
 */
export function knockoutFromGroups(standings: Standing[][], advance: number, rng: Rng): (EntrantId | null)[] {
  const n = standings.length * advance;
  const N = nextPow2(n);
  const field: (EntrantId | null)[] = Array(N).fill(null);
  const order = seedPositionGroups(N).flat();
  const top = (p: number) => p <= N / 2;
  const winnerPos: number[] = [];
  standings.forEach((s, i) => {
    // ASUMSI: bila juara grup lebih banyak dari posisi unggulan (16 grup → R16), sisanya diundi ke posisi bebas.
    const pos = order[i] ?? shuffle(rng, field.map((_, k) => k + 1).filter((p) => !field[p - 1] && !order.includes(p)))[0];
    field[pos - 1] = s[0].id;
    winnerPos[i] = pos;
  });
  for (let place = 1; place < advance; place++)
    standings.forEach((s, i) => {
      const free = field.map((x, k) => (x ? 0 : k + 1)).filter((p) => p && top(p) !== top(winnerPos[i]));
      const any = field.map((x, k) => (x ? 0 : k + 1)).filter(Boolean);
      field[shuffle(rng, free.length ? free : any)[0] - 1] = s[place].id;
    });
  return field;
}

/** Babak yang "dicapai" peserta yang tersingkir di grup: peringkat advance+1 → satu babak sebelum babak gugur pertama, lainnya dua babak sebelum. */
export function groupEliminatedRound(koSize: number, place: number, advance: number): MatchRound {
  const first = ROUNDS.indexOf(mainRoundName(koSize, 0) as Round);
  return ROUNDS[Math.min(ROUNDS.length - 1, first + (place === advance + 1 ? 1 : 2))];
}
