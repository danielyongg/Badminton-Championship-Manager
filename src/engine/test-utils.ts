import { entrantsFor, type SeasonState } from './season';
import { DISCIPLINES, type Ruleset } from './types';

/** Tes: semua entrant negara manajer diberi prioritas semua tier → AI mendaftarkannya (tanpa centang manual). */
export function autoEnter(state: SeasonState, rs: Ruleset) {
  const all = rs.tiers.map((t) => t.id);
  for (const d of DISCIPLINES) for (const e of entrantsFor(state, d)) if (e.countryId === state.managedCountryId) (state.tierPrefs ??= {})[e.id] = all;
}
