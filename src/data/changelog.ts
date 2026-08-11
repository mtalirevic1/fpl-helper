/**
 * Manual model changelog entries shown on /accuracy. Add a row when knobs or
 * scoring assumptions change in a way that affects projections.
 */

export interface ChangelogEntry {
  date: string;
  title: string;
  detail: string;
}

export const MODEL_CHANGELOG: ChangelogEntry[] = [
  {
    date: "2026-08-11",
    title: "Set-piece uplifts and confidence bands",
    detail:
      "Primary penalty / FK / corner takers get mild xG/xA multipliers; projections expose xpNextLow–xpNextHigh widened for thin samples.",
  },
  {
    date: "2026-08-01",
    title: "2026/27 BPS and DEFCON rules",
    detail:
      "Bonus elasticity and defensive contribution thresholds aligned to the published season rules.",
  },
];
