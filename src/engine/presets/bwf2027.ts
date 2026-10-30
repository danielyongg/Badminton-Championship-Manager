import type { Ruleset, Tier, TournamentDef } from '../types';
import { BWF_2026, CALENDAR_2026, OFFICIAL_WEEKS, TIERS_2026 } from './bwf2026';

// Preset "BWF 2027+": struktur World Tour baru.
// 5 S1000 (Denmark Open naik), 5 S750, 9 S500, 8 S300, 8 S100 (35 turnamen) sesuai kalender resmi 2027.
// ASUMSI: tabel poin & hadiah sama dengan 2026 (belum ada angka resmi berbeda).

const TIER_CHANGES: Record<string, Partial<Tier>> = {
  // ASUMSI: tunggal Super 1000 = 48 pemain, 16 grup × 3, juara grup ke R16.
  S1000: {
    days: 11, // mulai 2027: 11 hari, dua akhir pekan
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

// Kalender HSBC BWF World Tour 2027 resmi (BWF, 30 Juni 2026): tier & minggu 2027 jadi bawaan; 2028 lewat `weeks`.
const TIER_OF_EVENT_2027: Record<string, string> = {
  'german-open': 'S500', 'denmark-open': 'S1000', 'hong-kong-open': 'S750', 'singapore-open': 'S500', 'taipei-open': 'S300',
  'hylo-open': 'S300', 'syed-modi': 'S100',
};
const tiers: Tier[] = TIERS_2026.map((tier) => ({ ...tier, ...TIER_CHANGES[tier.id] }));
const prizeOf = (tierId: string) => tiers.find((x) => x.id === tierId)!.prizeUsd;

// Turnamen yang hanya ada di kalender tahun tertentu diatur `years` di CALENDAR_2026 (mis. Ruichang s/d 2026, Philippine Open mulai 2027).
const calendar: TournamentDef[] = CALENDAR_2026.map((e) => {
  const tierId = TIER_OF_EVENT_2027[e.id] ?? e.tierId;
  const official = OFFICIAL_WEEKS[e.id];
  return {
    ...e, tierId, prizeUsd: tierId === e.tierId && e.prizeUsd ? e.prizeUsd : prizeOf(tierId),
    // `weeks` disalin agar jadwal per tahun preset 2026 tidak ikut tertulis ke preset ini.
    // Continental Circuit yang minggu 2027-nya resmi: tahun-tahun berikutnya mengikuti minggu 2027 (ASUMSI).
    ...(official ? { week: official[0], weeks: { 2027: official[0], 2028: official[1] } }
      : { week: e.weeks?.[2027] ?? e.week, weeks: e.weeks && { ...e.weeks } }),
    ...(e.id === 'us-open' && { cityId: 'los-angeles' }), ...(e.id === 'china-open' && { cityId: 'chengdu' }),
  };
});

export const BWF_2027: Ruleset = {
  ...BWF_2026,
  id: 'bwf-2027',
  name: 'BWF 2027+',
  startYear: 2027,
  tiers,
  calendar,
};
