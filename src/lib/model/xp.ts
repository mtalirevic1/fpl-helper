import {
  BPS,
  DEFENSIVE_CONTRIBUTION,
  type PositionId,
  SCORING,
} from "../fpl/rules";
import { MODEL } from "./config";
import {
  clamp,
  expectedConcededPenalties,
  expectedFloorDivide,
  logistic,
  poissonTail,
} from "./math";
import type { PlayerRates } from "./rates";
import type { FixtureExpectation } from "./teams";

export interface XpBreakdown {
  appearance: number;
  goals: number;
  assists: number;
  cleanSheet: number;
  goalsConceded: number;
  saves: number;
  penaltySaves: number;
  defensiveContribution: number;
  bonus: number;
  negatives: number;
  total: number;
  /** Diagnostics shown in the UI. */
  expectedMinutes: number;
  startProbability: number;
  appearanceProbability: number;
  cleanSheetProbability: number;
  defensiveContributionProbability: number;
  expectedGoals: number;
  expectedAssists: number;
}

export const EMPTY_XP: XpBreakdown = {
  appearance: 0,
  goals: 0,
  assists: 0,
  cleanSheet: 0,
  goalsConceded: 0,
  saves: 0,
  penaltySaves: 0,
  defensiveContribution: 0,
  bonus: 0,
  negatives: 0,
  total: 0,
  expectedMinutes: 0,
  startProbability: 0,
  appearanceProbability: 0,
  cleanSheetProbability: 0,
  defensiveContributionProbability: 0,
  expectedGoals: 0,
  expectedAssists: 0,
};

/** Probability of reaching 60 minutes given a start, from typical start length. */
function probabilityOf60GivenStart(minutesPerStart: number): number {
  return clamp(logistic((minutesPerStart - 64) / 7), 0.05, 0.99);
}

/**
 * How the 2026/27 Bonus Points System changes move a player's bonus expectation.
 *
 * Historic bonus totals were earned under the old BPS, so they need adjusting for
 * three changes: clearances, blocks and interceptions now pay 1 BPS per three
 * rather than per two; every save pays 2 BPS plus extras for inside-the-box and
 * big-chance saves; and being tackled no longer costs anything. Only the first
 * two are quantifiable from public data — the tackled-penalty removal is a small
 * additional upside for dribblers that this deliberately leaves out.
 */
export function bpsRuleChangeFactor(rates: PlayerRates): number {
  if (rates.bps90 <= 0) return 1;

  const cbiDelta =
    rates.cbi90 / BPS.cbiPerPoint - rates.cbi90 / 2; // negative: harder now

  const oldSaveBps =
    3 * MODEL.saveInsideBoxShare + 2 * (1 - MODEL.saveInsideBoxShare);
  const newSaveBps =
    BPS.save +
    BPS.saveInsideBox * MODEL.saveInsideBoxShare +
    BPS.saveBigChance * MODEL.saveBigChanceShare;
  const saveDelta = rates.saves90 * (newSaveBps - oldSaveBps);

  const adjustedBps = Math.max(1, rates.bps90 + cbiDelta + saveDelta);
  const factor = (adjustedBps / rates.bps90) ** MODEL.bonusElasticity;
  return clamp(
    factor,
    MODEL.bonusFactorBounds[0],
    MODEL.bonusFactorBounds[1],
  );
}

export interface FixtureXpInput {
  position: PositionId;
  rates: PlayerRates;
  expectation: FixtureExpectation;
  /** Precomputed so it is not recalculated for every fixture. */
  bonusFactor: number;
  /**
   * Availability for this specific fixture. Defaults to the flagged
   * availability; projections override it when a return date is known.
   */
  availability?: number;
  /**
   * Multiplier on the chance of starting this specific fixture, from manual
   * adjustments (World Cup recovery, rotation news). Defaults to 1.
   */
  startFactor?: number;
}

/**
 * Expected points for one player in one fixture, built up rule by rule.
 *
 * Terms that are linear in minutes use expected minutes directly. Terms with a
 * threshold — save points, the goals-conceded deduction and defensive
 * contribution — are evaluated separately for a start and for a substitute
 * appearance, because averaging the minutes first would distort the threshold.
 */
export function fixtureXp({
  position,
  rates,
  expectation,
  bonusFactor,
  availability = rates.availability,
  startFactor = 1,
}: FixtureXpInput): XpBreakdown {
  const startProbability = clamp(
    availability * rates.startProbability * startFactor,
    0,
    1,
  );
  // A rested regular usually makes the bench rather than the stands, so part
  // of any start probability removed by an adjustment returns as sub minutes.
  const benchShift =
    rates.startProbability * (1 - startFactor) * MODEL.restedBenchShare;
  const subProbability = clamp(
    availability * (rates.subProbability + benchShift),
    0,
    1 - startProbability,
  );
  const appearanceProbability = startProbability + subProbability;
  if (appearanceProbability <= 0) return { ...EMPTY_XP };

  const startMinutes = rates.minutesPerStart;
  const subMinutes = MODEL.subAppearanceMinutes;
  const expectedMinutes =
    startProbability * startMinutes + subProbability * subMinutes;
  const minutesShare = expectedMinutes / 90;

  const p60 =
    startProbability * probabilityOf60GivenStart(startMinutes) +
    subProbability * 0.02;

  const appearance =
    appearanceProbability * SCORING.appearance.upTo59 +
    p60 * (SCORING.appearance.atLeast60 - SCORING.appearance.upTo59);

  const expectedGoals =
    rates.xG90 * rates.finishing * minutesShare * expectation.attackScale;
  const expectedAssists =
    rates.xA90 * minutesShare * expectation.attackScale;
  const goals = expectedGoals * SCORING.goal[position];
  const assists = expectedAssists * SCORING.assist;

  const cleanSheet =
    p60 * expectation.cleanSheetProbability * SCORING.cleanSheet[position];

  let goalsConceded = 0;
  if (position === 1 || position === 2) {
    const perScenario = (minutes: number) =>
      expectedConcededPenalties(expectation.goalsAgainst * (minutes / 90));
    goalsConceded =
      SCORING.concededPenalty *
      (startProbability * perScenario(startMinutes) +
        subProbability * perScenario(subMinutes));
  }

  let saves = 0;
  let penaltySaves = 0;
  if (position === 1) {
    const savesInScenario = (minutes: number) =>
      rates.saves90 * (minutes / 90) * expectation.concedeScale;
    saves =
      startProbability *
        expectedFloorDivide(
          savesInScenario(startMinutes),
          SCORING.savesPerPoint,
        ) +
      subProbability *
        expectedFloorDivide(savesInScenario(subMinutes), SCORING.savesPerPoint);
    penaltySaves =
      rates.penaltiesSaved90 *
      minutesShare *
      expectation.concedeScale *
      SCORING.penaltySaved;
  }

  const threshold = DEFENSIVE_CONTRIBUTION.thresholds[position];
  let defensiveContribution = 0;
  let defensiveContributionProbability = 0;
  if (threshold !== null && rates.defensiveActions90 > 0) {
    // Harder fixtures mean more defending, so slightly more qualifying actions.
    const difficultyFactor =
      1 +
      MODEL.defensiveActionsDifficultySlope *
        ((expectation.difficulty - 3) / 2);
    const lambda = (minutes: number) =>
      rates.defensiveActions90 * (minutes / 90) * difficultyFactor;
    defensiveContributionProbability =
      startProbability * poissonTail(threshold, lambda(startMinutes)) +
      subProbability * poissonTail(threshold, lambda(subMinutes));
    defensiveContribution =
      defensiveContributionProbability * DEFENSIVE_CONTRIBUTION.points;
  }

  // Bonus follows performance, so it leans mildly on the fixture as well.
  const bonusFixtureFactor = 1 + 0.25 * (expectation.attackScale - 1);
  const bonus =
    rates.bonus90 * minutesShare * bonusFactor * bonusFixtureFactor;

  const negatives =
    minutesShare *
    (rates.yellowCards90 * SCORING.yellowCard +
      rates.redCards90 * SCORING.redCard +
      rates.ownGoals90 * SCORING.ownGoal +
      rates.penaltiesMissed90 * SCORING.penaltyMissed);

  const total =
    appearance +
    goals +
    assists +
    cleanSheet +
    goalsConceded +
    saves +
    penaltySaves +
    defensiveContribution +
    bonus +
    negatives;

  return {
    appearance,
    goals,
    assists,
    cleanSheet,
    goalsConceded,
    saves,
    penaltySaves,
    defensiveContribution,
    bonus,
    negatives,
    total: Math.max(0, total),
    expectedMinutes,
    startProbability,
    appearanceProbability,
    cleanSheetProbability: expectation.cleanSheetProbability,
    defensiveContributionProbability,
    expectedGoals,
    expectedAssists,
  };
}

export function addBreakdowns(a: XpBreakdown, b: XpBreakdown): XpBreakdown {
  return {
    appearance: a.appearance + b.appearance,
    goals: a.goals + b.goals,
    assists: a.assists + b.assists,
    cleanSheet: a.cleanSheet + b.cleanSheet,
    goalsConceded: a.goalsConceded + b.goalsConceded,
    saves: a.saves + b.saves,
    penaltySaves: a.penaltySaves + b.penaltySaves,
    defensiveContribution:
      a.defensiveContribution + b.defensiveContribution,
    bonus: a.bonus + b.bonus,
    negatives: a.negatives + b.negatives,
    total: a.total + b.total,
    expectedMinutes: a.expectedMinutes + b.expectedMinutes,
    startProbability: Math.max(a.startProbability, b.startProbability),
    appearanceProbability: Math.max(
      a.appearanceProbability,
      b.appearanceProbability,
    ),
    cleanSheetProbability: Math.max(
      a.cleanSheetProbability,
      b.cleanSheetProbability,
    ),
    defensiveContributionProbability: Math.max(
      a.defensiveContributionProbability,
      b.defensiveContributionProbability,
    ),
    expectedGoals: a.expectedGoals + b.expectedGoals,
    expectedAssists: a.expectedAssists + b.expectedAssists,
  };
}
