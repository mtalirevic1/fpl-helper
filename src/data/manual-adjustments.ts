import type { ManualAdjustment } from "@/lib/model/adjustments";

/**
 * Hand-maintained availability intelligence. Edit this file as news breaks —
 * it is matched against live FPL data by name, so nothing else needs updating.
 *
 * Matching rules: `player` is compared (ignoring case and accents) against the
 * FPL web name, surname and full name. Use a full name whenever the surname is
 * shared ("Emiliano Martínez"), and add `team` ("MCI") if that is still not
 * unique. Entries that match nothing or several players are skipped and
 * reported by `npm run check` — they never silently adjust the wrong player.
 *
 * Current contents: the 2026 World Cup ran to 19 July, with Spain beating
 * Argentina in the final and England and France in the third-place match the
 * evening before. Players from those four squads got a mandatory three-week
 * shutdown and only rejoined their clubs around 10–12 August — under two weeks
 * before Gameweek 1 on 21 August. History says they start slowly: benched,
 * subbed early, or rested outright. The windows below taper that risk off over
 * the first four gameweeks. Goalkeepers are automatically penalised less (see
 * `keeperAdjustmentShare` in the model config).
 */

/** Played until the final weekend: eased back over the first month. */
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

/** Publicly ruled out of Gameweek 1 by their manager. */
const worldCupRuledOut = (player: string, team?: string): ManualAdjustment => ({
  player,
  team,
  kind: "world-cup",
  reason: "Ruled out of GW1 by the manager after the World Cup final weekend",
  windows: [
    { fromEvent: 1, toEvent: 1, startFactor: 0.05 },
    { fromEvent: 2, toEvent: 2, startFactor: 0.6 },
    { fromEvent: 3, toEvent: 4, startFactor: 0.85 },
  ],
});

export const MANUAL_ADJUSTMENTS: ManualAdjustment[] = [
  // Arsenal — heaviest England/Spain involvement of any club.
  worldCup("Rice"),
  worldCup("Saka"),
  worldCup("Eze"),
  worldCup("Madueke"),
  worldCup("Saliba"),
  worldCup("Raya"),
  worldCup("Merino"),
  worldCup("Zubimendi"),

  // Aston Villa
  worldCup("Konsa"),
  worldCup("Watkins"),
  worldCup("Digne"),
  worldCup("Emiliano Martínez"),

  // Liverpool — both ruled out of GW1 in the manager's press conference.
  // Victor Munoz is the Spain international, not Palace's Daniel Muñoz.
  worldCupRuledOut("Mac Allister"),
  worldCupRuledOut("Victor Munoz"),

  // Chelsea
  worldCup("Chalobah"),
  worldCup("Reece James"),
  worldCup("Morgan Rogers"),
  worldCup("Gusto"),
  worldCup("Enzo", "CHE"),

  // Crystal Palace
  worldCup("Dean Henderson"),
  worldCup("Lacroix"),
  worldCup("Mateta"),
  worldCup("Yeremy", "CRY"), // Yeremy Pino — FPL lists him by first name

  // Tottenham
  worldCup("Spence"),
  worldCup("Senesi"),
  worldCup("Pedro Porro"),
  worldCup("Cristian Romero"),

  // Manchester City
  worldCup("Trafford"),
  worldCup("Guéhi"),
  worldCup("O'Reilly"),
  worldCup("Elliot Anderson"),
  worldCup("Cherki"),
  worldCup("Rodrigo", "MCI"), // Rodri — FPL lists him as "Rodrigo"

  // Manchester United
  worldCup("Mainoo"),
  worldCup("Rashford"),
  worldCup("Lisandro Martínez"),

  // Elsewhere
  worldCup("Jordan Henderson"),
];
