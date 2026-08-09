/**
 * Every tunable in the projection model, in one place, with the reasoning behind
 * the chosen value. Nothing here is an FPL rule — the rules live in
 * `src/lib/fpl/rules.ts`. These are modelling assumptions.
 */
export const MODEL = {
  /**
   * Minutes of current-season data needed before it outweighs last season's
   * per-90 rates. Ten full matches is the usual point at which attacking rates
   * start to stabilise.
   */
  ratePriorMinutes: 900,

  /**
   * Team matches needed before this season's selection pattern outweighs last
   * season's. Roles change over a summer, so this is deliberately short.
   */
  rolePriorMatches: 5,

  /**
   * Availability by FPL status flag. `d` (doubtful) and anything with an explicit
   * chance of playing use that percentage instead.
   */
  availabilityByStatus: {
    a: 1, // available
    d: 0.75, // doubtful, overridden by chance_of_playing when present
    i: 0, // injured
    s: 0, // suspended
    u: 0, // unavailable / left the league
    n: 0, // not in squad
  } as Record<string, number>,

  /** Minutes a nailed starter is assumed to play when they start. */
  fullStartMinutes: 78,
  /** Minutes a substitute appearance is assumed to be worth. */
  subAppearanceMinutes: 22,

  /**
   * Converting xG to goals: finishing regresses hard to the mean, so expected
   * goals are used almost as-is, with a small weight on actual conversion.
   */
  finishingWeight: 0.2,
  /** Cap on the finishing multiplier so small samples cannot run away. */
  finishingBounds: [0.75, 1.35] as [number, number],

  /**
   * Bonus points are a rank-order competition inside each match, so a given
   * percentage change in a player's BPS moves their bonus more than
   * proportionally. Used to price in the 2026/27 BPS changes.
   */
  bonusElasticity: 2,
  bonusFactorBounds: [0.6, 1.5] as [number, number],

  /**
   * Share of saves made inside the box and from a big chance. Needed because the
   * API reports only total saves, while 2026/27 BPS pays extra for both.
   */
  saveInsideBoxShare: 0.75,
  saveBigChanceShare: 0.12,

  /**
   * Defensive output rises slightly in harder fixtures — more time defending.
   * A difficulty-5 away trip lifts defensive actions by this much.
   */
  defensiveActionsDifficultySlope: 0.08,

  /**
   * Value of a bench spot when optimising a 15-man squad. Bench players only
   * score when a starter does not play, so they are worth a fraction of face
   * value, and the fourth bench slot (the reserve keeper) close to nothing.
   */
  benchWeights: [0.14, 0.08, 0.04, 0.02] as number[],

  /**
   * Players with no history at all — new signings, promoted-club players, youth —
   * inherit the average profile of the players priced most like them in the same
   * position. This is how many peers are averaged.
   */
  pricePeerCount: 25,
  /**
   * Minutes a peer needs this season before their current-season rates are used
   * in the price-peer pool. Below this, last season's baseline is less noisy.
   */
  peerMinSampleMinutes: 270,
  /**
   * An unproven player is less likely to start than an established player on the
   * same money, so their peer-derived start rate is discounted by this much.
   */
  noHistoryStartDiscount: 0.75,

  /**
   * Candidate pool sizes per position for the squad optimiser. Large enough that
   * the optimum is inside the pool, small enough to solve in well under a second.
   */
  optimiserPool: { 1: 18, 2: 55, 3: 65, 4: 35 } as Record<number, number>,

  /** Randomised greedy restarts before hill climbing. */
  optimiserRestarts: 10,
  /** Replacements considered per position during the double-swap pass. */
  doubleSwapShortlist: 10,

  /** Single transfers shortlisted before searching for two-transfer plans. */
  pairSearchWidth: 25,

  /** Default number of gameweeks recommendations look ahead over. */
  defaultHorizon: 5,
  maxHorizon: 8,

  /**
   * When FPL's news gives a return date ("Expected back 15 Sep"), fixtures after
   * that date use this availability instead of the flagged one — back, but with
   * some risk of a setback or a phased return. Suspensions end on the date
   * exactly, so they return at full availability.
   */
  availabilityAfterReturn: 0.85,
  availabilityAfterSuspension: 1,

  /**
   * When a manual adjustment cuts a regular starter's chance of starting, this
   * share of the lost starts comes back as substitute appearances — a rested
   * starter is usually on the bench, not out of the squad.
   */
  restedBenchShare: 0.5,

  /**
   * Goalkeepers are far less rotation-prone after a long summer than outfield
   * players, so start-probability penalties from manual adjustments are softened
   * by this factor for them (0 = no penalty, 1 = full penalty).
   */
  keeperAdjustmentShare: 0.5,

  /** Thresholds for suggesting each chip, in expected points. */
  chipThresholds: {
    benchBoost: 12,
    tripleCaptain: 8,
    /** Suggest a Free Hit when fewer than this many squad players have a fixture. */
    freeHitMinPlayers: 9,
    /** Suggest a Wildcard when a fresh squad beats the current one by this much. */
    wildcard: 15,
  },
} as const;
