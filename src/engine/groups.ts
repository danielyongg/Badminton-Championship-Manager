import { nextPow2, seedPositionGroups, type DrawEntrant } from './draw';
import { mainRoundName, type MatchRound, type PlayFn, type PlayResult } from './knockout';
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
/**
 * Jadwal round-robin per hari pertandingan (metode lingkaran, unggulan 1 tetap): 4 tim → (1v4, 2v3), (1v3, 4v2), (1v2, 3v4),
 * seperti jadwal grup BWF. Indeks posisi di grup.
 */
export function roundRobin(n: number): [number, number][][] {
  const t = [...Array(n).keys()];
  if (n % 2) t.push(-1); // bye
  const days: [number, number][][] = [];
  for (let r = 0; r < t.length - 1; r++) {
    days.push(t.slice(0, t.length / 2).map((a, k) => [a, t[t.length - 1 - k]] as [number, number]).filter(([a, b]) => a >= 0 && b >= 0));
    t.splice(1, 0, t.pop()!);
  }
  return days;
}

export async function playGroup(ids: EntrantId[], play: PlayFn, parallel = false): Promise<Standing[]> {
  const st = new Map(ids.map((id) => [id, { id, wins: 0, gameDiff: 0, pointDiff: 0 }]));
  const beat = new Set<string>();
  const pending: Promise<void>[] = [];
  for (const [md, day] of roundRobin(ids.length).entries()) {
    for (const [i, j] of day) {
      const settle = (r: PlayResult) => {
        const [w, l] = r.winner === 0 ? [ids[i], ids[j]] : [ids[j], ids[i]];
        st.get(w)!.wins++;
        beat.add(`${w}>${l}`);
        for (const [x, y] of r.scores) {
          const sa = st.get(ids[i])!, sb = st.get(ids[j])!;
          sa.gameDiff += x > y ? 1 : -1; sb.gameDiff += x > y ? -1 : 1;
          sa.pointDiff += x - y; sb.pointDiff += y - x;
        }
      };
      const r = play(ids[i], ids[j], 'G', { i: 0, n: 1, md });
      if (parallel) pending.push(Promise.resolve(r).then(settle)); else settle(await r);
    }
    // Paralel: beri giliran grup lain mendaftarkan hari yang sama → urutan laga hari 1 semua grup, lalu hari 2, dst.
    if (parallel) await Promise.resolve();
  }
  await Promise.all(pending);
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
/** `steps`: diisi langkah undian (juara grup → posisi tetap, peringkat berikutnya diundi ke paruh lain) untuk live drawing. */
export function knockoutFromGroups(standings: Standing[][], advance: number, rng: Rng, steps?: DrawStep[]): (EntrantId | null)[] {
  const n = standings.length * advance;
  const N = nextPow2(n);
  const field: (EntrantId | null)[] = Array(N).fill(null);
  const order = seedPositionGroups(N).flat();
  const top = (p: number) => p <= N / 2;
  const winnerPos: number[] = [];
  // Posisi juara grup = posisi unggulan grupnya. Lolos 1 per grup (tunggal Olimpiade, Paris 2024 §3.4.2): posisi ditentukan,
  // tanpa undian. Lolos ≥ 2 (ganda Olimpiade §3.4.4, Thomas/Uber Cup, Finals): juara grup 1–2 tetap di ujung bagan, juara
  // grup lainnya diundi di antara posisi unggulan setingkat (3–4, 5–8, …).
  const seat = standings.map((_, i) => order[i]);
  if (advance > 1)
    for (let lo = 2; lo < seat.length; lo *= 2) shuffle(rng, seat.slice(lo, Math.min(lo * 2, seat.length))).forEach((p, k) => (seat[lo + k] = p));
  // Juara grup lebih banyak dari posisi unggulan (12–16 grup → R16): juara grup ke-(N+1−s) di sebelah juara grup ke-s, sehingga
  // posisi kosong (bye) jatuh di sebelah juara grup unggulan teratas (Paris 2024 §3.4.2: grup B, O, F, K dihilangkan).
  const beside = (i: number) => { const p = order[2 * order.length - 1 - i]; return p && (p % 2 ? p + 1 : p - 1); };
  standings.forEach((s, i) => {
    const pos = seat[i] ?? beside(i) ?? shuffle(rng, field.map((_, k) => k + 1).filter((p) => !field[p - 1] && !order.includes(p)))[0];
    field[pos - 1] = s[0].id;
    winnerPos[i] = pos;
    steps?.push({ key: 'step_winner', vars: { g: String.fromCharCode(65 + i), e: s[0].id, pos }, pos, entrant: s[0].id });
  });
  for (let place = 1; place < advance; place++)
    standings.forEach((s, i) => {
      const free = field.map((x, k) => (x ? 0 : k + 1)).filter((p) => p && top(p) !== top(winnerPos[i]));
      const any = field.map((x, k) => (x ? 0 : k + 1)).filter(Boolean);
      const pos = shuffle(rng, free.length ? free : any)[0];
      field[pos - 1] = s[place].id;
      steps?.push({ key: 'step_runnerUp', vars: { g: String.fromCharCode(65 + i), n: place + 1, e: s[place].id, pos }, pos, entrant: s[place].id });
    });
  // Posisi kosong (grup lebih sedikit dari bagan, mis. 12 grup → R16): bye bagi juara grup unggulan teratas.
  if (steps) field.forEach((x, k) => { if (!x) steps.push({ key: 'step_bye', vars: { pos: k + 1 }, pos: k + 1 }); });
  return field;
}

/** Posisi juara grup di bagan gugur tanpa undian (`knockoutFromGroups`; lolos ≥ 2: juara grup 3+ nanti diundi di antara posisi ini). */
export function winnerSlots(groups: number, advance: number): (number | null)[] {
  const N = nextPow2(groups * advance);
  const order = seedPositionGroups(N).flat();
  const field: (number | null)[] = Array(N).fill(null);
  for (let i = 0; i < groups && order[i] !== undefined; i++) field[order[i] - 1] = i;
  return field;
}

/** Babak yang "dicapai" peserta yang tersingkir di grup: peringkat advance+1 → satu babak sebelum babak gugur pertama, lainnya dua babak sebelum. */
export function groupEliminatedRound(koSize: number, place: number, advance: number): MatchRound {
  const first = ROUNDS.indexOf(mainRoundName(koSize, 0) as Round);
  return ROUNDS[Math.min(ROUNDS.length - 1, first + (place === advance + 1 ? 1 : 2))];
}
