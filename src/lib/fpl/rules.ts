/**
 * Fantasy Premier League rules for the 2026/27 season.
 *
 * Verified August 2026 against premierleague.com announcements:
 *  - "All you need to know about changes to FPL for 2026/27"
 *  - "What's new in 2026/27 Fantasy: Changes to Bonus Points System"
 *  - "What's happening with defensive contribution points in 2026/27 Fantasy?"
 *
 * Anything the FPL API reports itself (squad size, budget, club limit, sell-on fee)
 * is read from `bootstrap-static.game_settings` at runtime; the values here are the
 * fallback used when that payload is unavailable.
 */

export const SEASON = "2026/27";

export type PositionId = 1 | 2 | 3 | 4;

export const POSITIONS = {
  GKP: 1,
  DEF: 2,
  MID: 3,
  FWD: 4,
} as const satisfies Record<string, PositionId>;

export const POSITION_SHORT: Record<PositionId, string> = {
  1: "GKP",
  2: "DEF",
  3: "MID",
  4: "FWD",
};

export const POSITION_NAME: Record<PositionId, string> = {
  1: "Goalkeeper",
  2: "Defender",
  3: "Midfielder",
  4: "Forward",
};

/** Squad construction rules. */
export const SQUAD = {
  size: 15,
  startingXi: 11,
  /** Budget in FPL tenths of a million (1000 = £100.0m). */
  budgetTenths: 1000,
  maxPerClub: 3,
  /** Players of each position that must be in the 15-man squad. */
  select: { 1: 2, 2: 5, 3: 5, 4: 3 } as Record<PositionId, number>,
  /** Allowed range for each position in the starting XI. */
  play: {
    1: { min: 1, max: 1 },
    2: { min: 3, max: 5 },
    3: { min: 2, max: 5 },
    4: { min: 1, max: 3 },
  } as Record<PositionId, { min: number; max: number }>,
} as const;

/** Transfer rules: one free transfer a week, bankable up to five, -4 beyond that. */
export const TRANSFERS = {
  freePerGameweek: 1,
  maxBanked: 5,
  pointsHit: 4,
  /** Half of any price rise is kept by the game when you sell. */
  sellOnFee: 0.5,
} as const;

/**
 * Two full sets of chips again in 2026/27. The first set must be used before the
 * Gameweek 19 deadline (13:30 GMT, 2 January 2027) and cannot be carried over.
 */
export const CHIPS = {
  names: ["wildcard", "freehit", "bboost", "3xc"] as const,
  firstHalf: { startEvent: 1, stopEvent: 19 },
  secondHalf: { startEvent: 20, stopEvent: 38 },
} as const;

export type ChipName = (typeof CHIPS.names)[number];

export const CHIP_LABEL: Record<ChipName, string> = {
  wildcard: "Wildcard",
  freehit: "Free Hit",
  bboost: "Bench Boost",
  "3xc": "Triple Captain",
};

/** Points awarded for each action, by position. */
export const SCORING = {
  appearance: { upTo59: 1, atLeast60: 2 },
  goal: { 1: 10, 2: 6, 3: 5, 4: 4 } as Record<PositionId, number>,
  assist: 3,
  cleanSheet: { 1: 4, 2: 4, 3: 1, 4: 0 } as Record<PositionId, number>,
  /** Goalkeepers only: one point per three saves in a match. */
  savesPerPoint: 3,
  penaltySaved: 5,
  /** Goalkeepers and defenders lose a point for every two goals conceded. */
  concededPerPenalty: 2,
  concededPenalty: -1,
  penaltyMissed: -2,
  yellowCard: -1,
  redCard: -3,
  ownGoal: -2,
  bonus: { first: 3, second: 2, third: 1 },
} as const;

/**
 * Defensive contribution ("DEFCON") points, unchanged for 2026/27.
 * Defenders count clearances, blocks, interceptions and tackles (CBIT).
 * Midfielders and forwards also count ball recoveries (CBIRT), with a higher bar.
 * Capped at two points per match no matter how far the threshold is exceeded.
 */
export const DEFENSIVE_CONTRIBUTION = {
  points: 2,
  thresholds: { 1: null, 2: 10, 3: 12, 4: 12 } as Record<
    PositionId,
    number | null
  >,
  /** Whether ball recoveries count towards the total for this position. */
  countsRecoveries: { 1: false, 2: false, 3: true, 4: true } as Record<
    PositionId,
    boolean
  >,
} as const;

/**
 * Bonus Points System for 2026/27. Three changes were made this season, all of
 * which shift bonus away from defenders and towards goalkeepers and attackers:
 *   1. Being tackled ("dribbled past") no longer costs BPS at all.
 *   2. Clearances, blocks and interceptions now pay 1 BPS per THREE (was per two).
 *   3. Every save pays 2 BPS (+1 inside the box, +1 for a big chance saved);
 *      the "save from outside the box" metric is gone and a saved penalty
 *      dropped from 8 BPS to 7 (a big chance already adds the missing point).
 */
export const BPS = {
  playing60: 6,
  playingUpTo60: 3,
  goal: { 1: 12, 2: 12, 3: 18, 4: 24 } as Record<PositionId, number>,
  assist: 9,
  cleanSheet: { 1: 12, 2: 12, 3: 0, 4: 0 } as Record<PositionId, number>,
  /** 1 BPS per three clearances, blocks and interceptions (changed from two). */
  cbiPerPoint: 3,
  recoveriesPerPoint: 3,
  tacklesWonPerPoint: 2,
  save: 2,
  saveInsideBox: 1,
  saveBigChance: 1,
  penaltySaved: 7,
  penaltyMissed: -6,
  goalConceded: -1,
  yellowCard: -3,
  redCard: -9,
  ownGoal: -6,
  errorLeadingToGoal: -3,
} as const;

/**
 * Gameweek scores are provisional until "lockdown", now 09:00 UK time on the day
 * after a Gameweek's final match (previously one hour after full time). Live
 * projected bonus appears from the 20th minute of each match.
 */
export const LOCKDOWN = {
  ukHour: 9,
  dayAfterFinalMatch: true,
  provisionalBonusFromMinute: 20,
} as const;

export function positionShort(elementType: number): string {
  return POSITION_SHORT[elementType as PositionId] ?? "?";
}

export function isValidStartingXi(counts: Record<PositionId, number>): boolean {
  const total = counts[1] + counts[2] + counts[3] + counts[4];
  if (total !== SQUAD.startingXi) return false;
  return ([1, 2, 3, 4] as PositionId[]).every((pos) => {
    const { min, max } = SQUAD.play[pos];
    return counts[pos] >= min && counts[pos] <= max;
  });
}

/** Every starting XI shape that is legal under the 2026/27 rules. */
export const FORMATIONS: Array<Record<PositionId, number>> = (() => {
  const out: Array<Record<PositionId, number>> = [];
  for (let def = SQUAD.play[2].min; def <= SQUAD.play[2].max; def++) {
    for (let mid = SQUAD.play[3].min; mid <= SQUAD.play[3].max; mid++) {
      const fwd = SQUAD.startingXi - 1 - def - mid;
      if (fwd < SQUAD.play[4].min || fwd > SQUAD.play[4].max) continue;
      out.push({ 1: 1, 2: def, 3: mid, 4: fwd });
    }
  }
  return out;
})();

export function formationLabel(counts: Record<PositionId, number>): string {
  return `${counts[2]}-${counts[3]}-${counts[4]}`;
}

/** Labels for every legal formation, e.g. "4-4-2". */
export const FORMATION_OPTIONS = FORMATIONS.map(formationLabel);

/** Resolves a "4-4-2" label to position counts, or null when unknown / auto. */
export function parseFormation(
  label: string | null | undefined,
): Record<PositionId, number> | null {
  if (!label || label === "auto") return null;
  return FORMATIONS.find((formation) => formationLabel(formation) === label) ?? null;
}

/** Price paid back when selling: purchase price plus half of any profit. */
export function sellPriceTenths(
  purchaseTenths: number,
  nowTenths: number,
): number {
  if (nowTenths <= purchaseTenths) return nowTenths;
  const profit = nowTenths - purchaseTenths;
  return purchaseTenths + Math.floor(profit * TRANSFERS.sellOnFee);
}

export function chipHalf(event: number): "firstHalf" | "secondHalf" {
  return event <= CHIPS.firstHalf.stopEvent ? "firstHalf" : "secondHalf";
}
