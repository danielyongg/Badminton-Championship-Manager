import type { Ruleset, Tier, TournamentDef } from '../types';
import { BWF_2026, CALENDAR_2026, TIERS_2026 } from './bwf2026';

// Preset "BWF 2027+": struktur World Tour baru.
// 5 S1000 (Denmark Open naik), 5 S750, 9 S500, 8 S300, 8 S100; Syed Modi turun ke S100.
// ASUMSI: tabel poin & hadiah sama dengan 2026 (belum ada angka resmi berbeda).

const TIER_CHANGES: Record<string, Partial<Tier>> = {
  // ASUMSI: tunggal Super 1000 = 48 pemain, 16 grup × 3, juara grup ke R16.
  S1000: {
    drawSize: { MS: 48, WS: 48, MD: 32, WD: 32, XD: 32 },
    groupStage: { MS: { groups: 16, perGroup: 3, advance: 1 }, WS: { groups: 16, perGroup: 3, advance: 1 } },
  },
  // ASUMSI: Kejuaraan Dunia tunggal putra 64 (16 grup × 4), nomor lain 48 (16 grup × 3), juara grup ke R16.
  WC: {
    groupStage: {
      MS: { groups: 16, perGroup: 4, advance: 1 },
      WS: { groups: 16, perGroup: 3, advance: 1 }, MD: { groups: 16, perGroup: 3, advance: 1 },
      WD: { groups: 16, perGroup: 3, advance: 1 }, XD: { groups: 16, perGroup: 3, advance: 1 },
    },
  },
};

const TIER_OF_EVENT_2027: Record<string, string> = {
  'denmark-open': 'S1000',
  'syed-modi': 'S100',
  'korea-masters': 'S100',
};
const DROPPED_2027 = new Set(['lingshui-masters', 'odisha-masters']); // agar tepat 8 Super 100

const tiers: Tier[] = TIERS_2026.map((tier) => ({ ...tier, ...TIER_CHANGES[tier.id] }));
const prizeOf = (tierId: string) => tiers.find((x) => x.id === tierId)!.prizeUsd;

const calendar: TournamentDef[] = CALENDAR_2026
  .filter((e) => !DROPPED_2027.has(e.id))
  .map((e) => {
    const tierId = TIER_OF_EVENT_2027[e.id];
    return tierId ? { ...e, tierId, prizeUsd: prizeOf(tierId) } : e;
  });

export const BWF_2027: Ruleset = {
  ...BWF_2026,
  id: 'bwf-2027',
  name: 'BWF 2027+',
  startYear: 2027,
  tiers,
  calendar,
};
