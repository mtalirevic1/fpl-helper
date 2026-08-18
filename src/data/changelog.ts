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
    date: "2026-08-18",
    title: "Community Shield minutes and GW1 knocks",
    detail:
      "Split Shield starters (Haaland, Anderson, O'Reilly, Madueke) from unused returnees; Rice, Saka, Guéhi and Cherki moved onto the minutes tier; Doku, Bruno G. and Garnacho added as unflagged knocks; Watkins GW1 raised after Abraham's doubt; Chalobah, Romero and Raya removed.",
  },
  {
    date: "2026-08-15",
    title: "World Cup / injury windows updated for GW1 week",
    detail:
      "Split returnees who already have minutes from those still managed; Mac Allister and Munoz no longer treated as fully ruled out; Saliba, Rodri, Timber, Sesko, van de Ven and Colwill added as injury notes; Digne removed after the PSG move.",
  },
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
