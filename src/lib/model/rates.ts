import { DEFENSIVE_CONTRIBUTION, type PositionId } from "../fpl/rules";
import type { FplBootstrap, FplElement } from "../fpl/types";
import {
  BASELINE_TEAM_MATCHES,
  baselineFor,
  type SeasonAggregate,
} from "./baseline";
import { MODEL } from "./config";
import { clamp, safeDivide, shrink } from "./math";

/** Per-90 output rates plus the selection profile the model needs per player. */
export interface PlayerRates {
  xG90: number;
  xA90: number;
  /** Multiplier turning expected goals into goals, from historical finishing. */
  finishing: number;
  saves90: number;
  penaltiesSaved90: number;
  penaltiesMissed90: number;
  yellowCards90: number;
  redCards90: number;
  ownGoals90: number;
  bonus90: number;
  bps90: number;
  cbi90: number;
  tackles90: number;
  recoveries90: number;
  /** Actions that count towards this player's defensive contribution, per 90. */
  defensiveActions90: number;
  availability: number;
  startProbability: number;
  subProbability: number;
  /** Minutes played when starting, from history. */
  minutesPerStart: number;
  /** Minutes of evidence behind the blended rates. */
  sampleMinutes: number;
  source: "current" | "blended" | "previous" | "prior";
}

const num = (value: string | number | null | undefined): number => {
  if (value === null || value === undefined) return 0;
  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

function fromElement(element: FplElement): SeasonAggregate {
  return {
    code: element.code,
    cost: element.now_cost,
    minutes: element.minutes,
    starts: element.starts,
    goals: element.goals_scored,
    assists: element.assists,
    xG: num(element.expected_goals),
    xA: num(element.expected_assists),
    xGC: num(element.expected_goals_conceded),
    cleanSheets: element.clean_sheets,
    goalsConceded: element.goals_conceded,
    saves: element.saves,
    penaltiesSaved: element.penalties_saved,
    penaltiesMissed: element.penalties_missed,
    yellowCards: element.yellow_cards,
    redCards: element.red_cards,
    ownGoals: element.own_goals,
    bonus: element.bonus,
    bps: element.bps,
    cbi: element.clearances_blocks_interceptions,
    tackles: element.tackles,
    recoveries: element.recoveries,
    defensiveContribution: element.defensive_contribution,
    totalPoints: element.total_points,
  };
}

/**
 * Defensive actions are recomputed from their components rather than read from
 * `defensive_contribution`, because a player reclassified between seasons would
 * otherwise carry the wrong position's definition. Defenders count clearances,
 * blocks, interceptions and tackles; midfielders and forwards add recoveries.
 */
function defensiveActions(
  season: SeasonAggregate,
  position: PositionId,
): number {
  const base = season.cbi + season.tackles;
  return DEFENSIVE_CONTRIBUTION.countsRecoveries[position]
    ? base + season.recoveries
    : base;
}

/**
 * Every player with a usable history, grouped by position and sorted by price.
 * Used to build a prior for players who have none.
 */
export interface PositionPriors {
  byPosition: Record<
    PositionId,
    Array<{ price: number; rates: PlayerRates }>
  >;
}

function ratesFromSeason(
  season: SeasonAggregate,
  position: PositionId,
  teamMatches: number,
): PlayerRates {
  const per90 = (total: number) => safeDivide(total * 90, season.minutes);
  const minutesPerStart =
    season.starts > 0
      ? clamp(season.minutes / season.starts, 15, 90)
      : MODEL.fullStartMinutes;
  const startRate = clamp(safeDivide(season.starts, teamMatches), 0, 1);
  // Minutes left over once starts are accounted for imply substitute outings.
  const residualMinutes = Math.max(
    0,
    season.minutes - season.starts * minutesPerStart,
  );
  const subRate = clamp(
    safeDivide(residualMinutes, teamMatches * MODEL.subAppearanceMinutes),
    0,
    1 - startRate,
  );

  const finishing =
    season.xG > 1
      ? clamp(
          1 +
            MODEL.finishingWeight * (season.goals / season.xG - 1),
          MODEL.finishingBounds[0],
          MODEL.finishingBounds[1],
        )
      : 1;

  return {
    xG90: per90(season.xG),
    xA90: per90(season.xA),
    finishing,
    saves90: per90(season.saves),
    penaltiesSaved90: per90(season.penaltiesSaved),
    penaltiesMissed90: per90(season.penaltiesMissed),
    yellowCards90: per90(season.yellowCards),
    redCards90: per90(season.redCards),
    ownGoals90: per90(season.ownGoals),
    bonus90: per90(season.bonus),
    bps90: per90(season.bps),
    cbi90: per90(season.cbi),
    tackles90: per90(season.tackles),
    recoveries90: per90(season.recoveries),
    defensiveActions90: per90(defensiveActions(season, position)),
    availability: 1,
    startProbability: startRate,
    subProbability: subRate,
    minutesPerStart,
    sampleMinutes: season.minutes,
    source: "current",
  };
}

const RATE_KEYS = [
  "xG90",
  "xA90",
  "saves90",
  "penaltiesSaved90",
  "penaltiesMissed90",
  "yellowCards90",
  "redCards90",
  "ownGoals90",
  "bonus90",
  "bps90",
  "cbi90",
  "tackles90",
  "recoveries90",
  "defensiveActions90",
] as const;

function blendRates(
  current: PlayerRates,
  previous: PlayerRates,
  teamMatches: number,
): PlayerRates {
  const blended = { ...current };
  for (const key of RATE_KEYS) {
    blended[key] = shrink(
      current[key],
      current.sampleMinutes,
      previous[key],
      MODEL.ratePriorMinutes,
    );
  }
  blended.finishing = shrink(
    current.finishing,
    current.sampleMinutes,
    previous.finishing,
    MODEL.ratePriorMinutes,
  );
  blended.startProbability = shrink(
    current.startProbability,
    teamMatches,
    previous.startProbability,
    MODEL.rolePriorMatches,
  );
  blended.subProbability = shrink(
    current.subProbability,
    teamMatches,
    previous.subProbability,
    MODEL.rolePriorMatches,
  );
  blended.minutesPerStart = shrink(
    current.minutesPerStart,
    teamMatches,
    previous.minutesPerStart,
    MODEL.rolePriorMatches,
  );
  blended.sampleMinutes = current.sampleMinutes + previous.sampleMinutes;
  blended.source = current.sampleMinutes > 0 ? "blended" : "previous";
  return blended;
}

/**
 * Collects the rates of every player with a usable history, per position, so that
 * a player with no history can be given the profile of others priced like them.
 */
export function buildPositionPriors(
  bootstrap: FplBootstrap,
  usePreviousSeason: boolean,
): PositionPriors {
  const byPosition = {} as PositionPriors["byPosition"];

  for (const position of [1, 2, 3, 4] as PositionId[]) {
    const peers: Array<{ price: number; rates: PlayerRates }> = [];
    for (const element of bootstrap.elements) {
      if (element.element_type !== position) continue;
      const current = fromElement(element);
      const previous = baselineFor(element.code);
      // In preseason the bootstrap aggregates *are* last season, but fall back
      // to the snapshot in case FPL has already zeroed them. In season, a peer
      // needs a few matches before their noisy early rates beat last season's.
      const season: SeasonAggregate | null = usePreviousSeason
        ? current.minutes > 0
          ? current
          : previous
        : current.minutes >= MODEL.peerMinSampleMinutes
          ? current
          : (previous ?? (current.minutes > 0 ? current : null));
      if (!season || season.minutes <= 0) continue;
      peers.push({
        price: element.now_cost,
        rates: ratesFromSeason(season, position, BASELINE_TEAM_MATCHES),
      });
    }
    peers.sort((a, b) => a.price - b.price);
    byPosition[position] = peers;
  }

  return { byPosition };
}

/**
 * The prior for a player with no history: the average profile of the players
 * priced most like them in the same position.
 *
 * This is far better than a flat positional average, because FPL prices carry
 * real information about expected role — the cheapest slots in every position are
 * dominated by backups who rarely start, and the model should expect exactly
 * that. Per-90 output is averaged weighted by minutes so that noisy cameos do not
 * distort it, while selection rates are averaged plainly, because the population
 * rate of starting is precisely what is being estimated.
 */
export function pricePeerPrior(
  priors: PositionPriors,
  position: PositionId,
  price: number,
): PlayerRates {
  const peers = priors.byPosition[position];
  const nearest = [...peers]
    .sort((a, b) => Math.abs(a.price - price) - Math.abs(b.price - price))
    .slice(0, MODEL.pricePeerCount);

  if (!nearest.length) {
    return {
      xG90: 0,
      xA90: 0,
      finishing: 1,
      saves90: 0,
      penaltiesSaved90: 0,
      penaltiesMissed90: 0,
      yellowCards90: 0,
      redCards90: 0,
      ownGoals90: 0,
      bonus90: 0,
      bps90: 0,
      cbi90: 0,
      tackles90: 0,
      recoveries90: 0,
      defensiveActions90: 0,
      availability: 1,
      startProbability: 0.2,
      subProbability: 0.2,
      minutesPerStart: MODEL.fullStartMinutes,
      sampleMinutes: 0,
      source: "prior",
    };
  }

  const totalMinutes = nearest.reduce(
    (total, peer) => total + peer.rates.sampleMinutes,
    0,
  );
  const weightedRate = (pick: (rates: PlayerRates) => number) =>
    totalMinutes > 0
      ? nearest.reduce(
          (total, peer) => total + pick(peer.rates) * peer.rates.sampleMinutes,
          0,
        ) / totalMinutes
      : 0;
  const plainAverage = (pick: (rates: PlayerRates) => number) =>
    nearest.reduce((total, peer) => total + pick(peer.rates), 0) /
    nearest.length;

  return {
    xG90: weightedRate((r) => r.xG90),
    xA90: weightedRate((r) => r.xA90),
    finishing: 1,
    saves90: weightedRate((r) => r.saves90),
    penaltiesSaved90: weightedRate((r) => r.penaltiesSaved90),
    penaltiesMissed90: weightedRate((r) => r.penaltiesMissed90),
    yellowCards90: weightedRate((r) => r.yellowCards90),
    redCards90: weightedRate((r) => r.redCards90),
    ownGoals90: weightedRate((r) => r.ownGoals90),
    bonus90: weightedRate((r) => r.bonus90),
    bps90: weightedRate((r) => r.bps90),
    cbi90: weightedRate((r) => r.cbi90),
    tackles90: weightedRate((r) => r.tackles90),
    recoveries90: weightedRate((r) => r.recoveries90),
    defensiveActions90: weightedRate((r) => r.defensiveActions90),
    availability: 1,
    // An unproven player is less likely to start than an established one on the
    // same money, so the peer selection rate is discounted.
    startProbability: clamp(
      plainAverage((r) => r.startProbability) * MODEL.noHistoryStartDiscount,
      0,
      1,
    ),
    subProbability: plainAverage((r) => r.subProbability),
    minutesPerStart: plainAverage((r) => r.minutesPerStart),
    sampleMinutes: 0,
    source: "prior",
  };
}

/** Availability from the official status flag and chance-of-playing percentage. */
export function availabilityOf(element: FplElement): number {
  const chance =
    element.chance_of_playing_next_round ?? element.chance_of_playing_this_round;
  if (chance !== null && chance !== undefined) return clamp(chance / 100, 0, 1);
  return MODEL.availabilityByStatus[element.status] ?? 0.5;
}

export interface RateContext {
  /** True when `bootstrap.elements` still holds last season's totals. */
  bootstrapIsPreviousSeason: boolean;
  priors: PositionPriors;
  matchesPlayed: Map<number, number>;
}

/**
 * Blends a player's current-season output with last season's, falling back to a
 * price-scaled positional prior when neither exists.
 */
export function playerRates(
  element: FplElement,
  context: RateContext,
): PlayerRates {
  const position = element.element_type as PositionId;
  const teamMatches = Math.max(
    0,
    context.matchesPlayed.get(element.team) ?? 0,
  );
  // In preseason the bootstrap still carries last season's totals — but if FPL
  // has already zeroed them ahead of kick-off, the committed baseline snapshot
  // takes over so the whole model does not collapse to priors.
  const elementSeason = fromElement(element);
  const previousSeason = context.bootstrapIsPreviousSeason
    ? elementSeason.minutes > 0
      ? elementSeason
      : baselineFor(element.code)
    : baselineFor(element.code);

  const currentSeason = context.bootstrapIsPreviousSeason
    ? null
    : elementSeason;

  let rates: PlayerRates;

  if (previousSeason && previousSeason.minutes > 0) {
    const previousRates = ratesFromSeason(
      previousSeason,
      position,
      BASELINE_TEAM_MATCHES,
    );
    previousRates.source = "previous";
    rates =
      currentSeason && currentSeason.minutes > 0
        ? blendRates(
            ratesFromSeason(currentSeason, position, Math.max(1, teamMatches)),
            previousRates,
            teamMatches,
          )
        : previousRates;
  } else if (currentSeason && currentSeason.minutes > 0) {
    rates = ratesFromSeason(
      currentSeason,
      position,
      Math.max(1, teamMatches),
    );
    rates.source = "current";
  } else {
    rates = pricePeerPrior(context.priors, position, element.now_cost);
  }

  rates.availability = availabilityOf(element);
  return rates;
}
