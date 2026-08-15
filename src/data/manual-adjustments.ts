import type { ManualAdjustment } from "@/lib/model/adjustments";

/**
 * Hand-maintained availability intelligence. Edit this file as news breaks —
 * it is matched against live FPL data by name, so nothing else needs updating.
 *
 * Matching rules: `player` is compared (ignoring case and accents) against the
 * FPL web name, surname and full name. Use a full name whenever the surname is
 * shared ("Emiliano Martínez"), and add `team` ("MCI") if that is still not
 * unique. Entries that match nothing or several players are skipped and
 * reported by `npm run check` and `npm run review:adjustments` — they never
 * silently adjust the wrong player. The review command also flags expired
 * windows, FPL-already-out overlap, and news that moved since the last snapshot
 * (`src/data/adjustments-review.json`). It does not rewrite start factors.
 *
 * Current contents (reviewed 15 Aug 2026, six days before the GW1 deadline):
 * the 2026 World Cup ran to 19 July. Final-weekend players only rejoined clubs
 * around 9–12 August. Some now have a first friendly or Community Shield
 * minutes; others are still being managed, and a few have been ruled unlikely
 * to start opening weekend. Separate injury notes sit below the World Cup
 * windows so they do not get mixed with "eased in" flags.
 */

/** Played deep into the World Cup and still short of minutes. */
const worldCup = (player: string, team?: string): ManualAdjustment => ({
  player,
  team,
  kind: "world-cup",
  reason:
    "World Cup final weekend — back in club training only from ~10 Aug, early minutes likely managed",
  windows: [
    { fromEvent: 1, toEvent: 1, startFactor: 0.45 },
    { fromEvent: 2, toEvent: 2, startFactor: 0.7 },
    { fromEvent: 3, toEvent: 4, startFactor: 0.85 },
  ],
});

/** Deep World Cup run, but already used in a friendly / Community Shield. */
const worldCupMinutes = (player: string, team?: string): ManualAdjustment => ({
  player,
  team,
  kind: "world-cup",
  reason:
    "World Cup returnee who has first club minutes — still likely to be eased rather than nailed for 90",
  windows: [
    { fromEvent: 1, toEvent: 1, startFactor: 0.7 },
    { fromEvent: 2, toEvent: 2, startFactor: 0.85 },
    { fromEvent: 3, toEvent: 4, startFactor: 0.95 },
  ],
});

/**
 * Manager has said they will not start opening weekend (bench possible).
 * Softer than a full exclusion — Iraola on Mac Allister / Munoz, 14 Aug.
 */
const worldCupUnlikelyStart = (
  player: string,
  team?: string,
): ManualAdjustment => ({
  player,
  team,
  kind: "world-cup",
  reason:
    "Manager has said they are unlikely to start GW1 after the World Cup final weekend; bench minutes possible",
  windows: [
    { fromEvent: 1, toEvent: 1, startFactor: 0.18 },
    { fromEvent: 2, toEvent: 2, startFactor: 0.55 },
    { fromEvent: 3, toEvent: 4, startFactor: 0.8 },
  ],
});

/** Extra week of rest beyond the FIFA three-week minimum (Villa trio). */
const worldCupExtraRest = (player: string, team?: string): ManualAdjustment => ({
  player,
  team,
  kind: "world-cup",
  reason:
    "Given four weeks off after the World Cup final weekend — missed the Super Cup, still catching up for GW1",
  windows: [
    { fromEvent: 1, toEvent: 1, startFactor: 0.35 },
    { fromEvent: 2, toEvent: 2, startFactor: 0.65 },
    { fromEvent: 3, toEvent: 4, startFactor: 0.85 },
  ],
});

export const MANUAL_ADJUSTMENTS: ManualAdjustment[] = [
  // Arsenal — Arteta (15 Aug): Rice, Saka, Zubimendi available for the
  // Community Shield after training this week, but they had no pre-season
  // minutes so they are expected from the bench. Eze, Madueke and Raya got
  // a first run against Como.
  worldCup("Rice"),
  worldCup("Saka"),
  worldCup("Zubimendi"),
  worldCup("Merino"),
  worldCupMinutes("Eze"),
  worldCupMinutes("Madueke"),
  worldCupMinutes("Raya"),
  {
    player: "Saliba",
    kind: "injury-doubt",
    reason:
      "Arteta: long-term back injury, Community Shield and an extended period ruled out (no surgery)",
    windows: [
      { fromEvent: 1, toEvent: 4, startFactor: 0.05 },
      { fromEvent: 5, toEvent: 8, startFactor: 0.25 },
    ],
  },
  {
    player: "Timber",
    kind: "injury-doubt",
    reason:
      "Arteta: groin issue, a few weeks away; hopes to rejoin group training around GW2",
    windows: [
      { fromEvent: 1, toEvent: 2, startFactor: 0.08 },
      { fromEvent: 3, toEvent: 4, startFactor: 0.4 },
    ],
  },

  // Aston Villa — Emery gave Watkins, Konsa and Emi Martínez four weeks, so
  // they missed the Super Cup on 12 Aug. Digne has left for PSG.
  worldCupExtraRest("Konsa"),
  worldCupExtraRest("Watkins"),
  worldCupExtraRest("Emiliano Martínez"),

  // Liverpool — Echo / Iraola (14 Aug): both back in training, Munoz played
  // 30 minutes vs Monaco, neither expected to start at Newcastle. Not a
  // full GW1 exclusion any more.
  worldCupUnlikelyStart("Mac Allister"),
  worldCupUnlikelyStart("Victor Munoz"),

  // Chelsea — Alonso: Rogers "will be ready" for the season start but skipped
  // the tour. Lacroix signed from Palace and is back in training.
  worldCup("Chalobah"),
  worldCup("Reece James"),
  worldCup("Morgan Rogers"),
  worldCup("Gusto"),
  worldCup("Enzo", "CHE"),
  worldCup("Lacroix"),
  {
    player: "Colwill",
    kind: "injury-doubt",
    reason:
      "Missed late pre-season matches as a precaution; Fofana is suspended until GW3",
    windows: [{ fromEvent: 1, toEvent: 1, startFactor: 0.45 }],
  },

  // Crystal Palace
  worldCup("Dean Henderson"),
  worldCup("Mateta"),
  worldCup("Yeremy", "CRY"), // Yeremy Pino — FPL lists him by first name

  // Tottenham — Porro, Romero and Spence only reported this week. Senesi was
  // in earlier for testing and has been used in predicted XIs. Van de Ven
  // has not played a pre-season minute.
  worldCup("Spence"),
  worldCup("Pedro Porro"),
  worldCup("Cristian Romero"),
  worldCupMinutes("Senesi"),
  {
    player: "van de Ven",
    kind: "injury-doubt",
    reason:
      "No pre-season minutes since returning from the World Cup; Brentford looks unlikely",
    windows: [
      { fromEvent: 1, toEvent: 1, startFactor: 0.2 },
      { fromEvent: 2, toEvent: 2, startFactor: 0.55 },
      { fromEvent: 3, toEvent: 4, startFactor: 0.8 },
    ],
  },

  // Manchester City — Guehi, Anderson, O'Reilly, Cherki and Haaland trained
  // this week for the Community Shield; Rodri is in rehab after back surgery.
  worldCup("Trafford"),
  worldCup("Guéhi"),
  worldCup("O'Reilly"),
  worldCup("Elliot Anderson"),
  worldCup("Cherki"),
  worldCup("Haaland"),
  {
    player: "Rodrigo",
    team: "MCI",
    kind: "injury-doubt",
    reason:
      "Club: minor back surgery after the World Cup; Maresca says rehab, Community Shield too soon",
    windows: [
      { fromEvent: 1, toEvent: 2, startFactor: 0.05 },
      { fromEvent: 3, toEvent: 4, startFactor: 0.35 },
    ],
  },

  // Manchester United
  worldCup("Mainoo"),
  worldCup("Rashford"),
  worldCup("Lisandro Martínez"),
  {
    player: "Sesko",
    kind: "injury-doubt",
    reason:
      "Shin injury — missed the whole pre-season; club hope he makes the Hull squad but is unlikely to start",
    windows: [
      { fromEvent: 1, toEvent: 1, startFactor: 0.25 },
      { fromEvent: 2, toEvent: 2, startFactor: 0.55 },
      { fromEvent: 3, toEvent: 4, startFactor: 0.8 },
    ],
  },

  // Chelsea veteran, World Cup minutes elsewhere
  worldCup("Jordan Henderson"),
];
