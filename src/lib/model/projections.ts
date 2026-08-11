import { MANUAL_ADJUSTMENTS } from "@/data/manual-adjustments";

import { getBootstrap, getFixtures } from "../fpl/api";
import { type PositionId, POSITION_SHORT } from "../fpl/rules";
import {
  fixturesByTeam,
  getSeasonState,
  type SeasonState,
} from "../fpl/season";
import type { FplBootstrap, FplElement, FplFixture } from "../fpl/types";
import {
  type AdjustmentKind,
  availabilityForFixture,
  buildAdjustmentIndex,
  parseReturnDate,
  startFactorFor,
} from "./adjustments";
import { baseline } from "./baseline";
import { MODEL } from "./config";
import { round, safeDivide } from "./math";
import {
  buildPositionPriors,
  playerRates,
  type PlayerRates,
  type RateContext,
} from "./rates";
import { buildTeamStrength, type TeamStrength } from "./teams";
import {
  addBreakdowns,
  bpsRuleChangeFactor,
  EMPTY_XP,
  fixtureXp,
  type XpBreakdown,
} from "./xp";

export interface FixtureProjection {
  fixtureId: number;
  event: number;
  kickoff: string | null;
  isHome: boolean;
  difficulty: number;
  opponentId: number;
  opponentShort: string;
  expectedGoalsFor: number;
  expectedGoalsAgainst: number;
  cleanSheetProbability: number;
  xp: number;
}

export type PriceTrend =
  | "very-likely-rise"
  | "likely-rise"
  | "stable"
  | "likely-fall"
  | "very-likely-fall";

export interface PlayerProjection {
  id: number;
  code: number;
  name: string;
  fullName: string;
  position: PositionId;
  positionShort: string;
  teamId: number;
  teamName: string;
  teamShort: string;
  /** Price in tenths of a million, as the API reports it. */
  price: number;
  status: string;
  news: string;
  availability: number;
  selectedByPercent: number;
  form: number;
  pointsPerGame: number;
  totalPoints: number;
  minutes: number;
  starts: number;
  rates: PlayerRates;
  dataSource: PlayerRates["source"];
  /** Expected points in the gameweek recommendations are being built for. */
  xpNext: number;
  xpNextLow: number;
  xpNextHigh: number;
  /** Expected points summed over the whole horizon. */
  xpHorizon: number;
  xpHorizonLow: number;
  xpHorizonHigh: number;
  /** True when FPL lists this player first for penalties. */
  isPenaltyTaker: boolean;
  isDirectFreeKickTaker: boolean;
  isCornerTaker: boolean;
  /** Expected points per fixture over the horizon. */
  xpPerFixture: number;
  /** Expected points over the horizon per £1.0m of price. */
  value: number;
  breakdownNext: XpBreakdown;
  breakdownHorizon: XpBreakdown;
  fixtures: FixtureProjection[];
  /** Fixtures in the target gameweek: 0 for a blank, 2 for a double. */
  fixtureCountNext: number;
  netTransfersEvent: number;
  priceChangeEvent: number;
  priceTrend: PriceTrend;
  /** FPL's own expected points for the next gameweek, for comparison. */
  officialEpNext: number;
  /** Manual adjustments matched to this player (World Cup recovery, rotation). */
  adjustments: Array<{ kind: AdjustmentKind; reason: string }>;
  /** Start-probability factor applied in the target gameweek. 1 means none. */
  startFactorNext: number;
  /** Return date parsed from the FPL news text, as an ISO date, if any. */
  expectedReturn: string | null;
}

export interface ProjectionSet {
  bootstrap: FplBootstrap;
  fixtures: FplFixture[];
  season: SeasonState;
  teamStrength: TeamStrength;
  players: PlayerProjection[];
  byId: Map<number, PlayerProjection>;
  horizon: { from: number; to: number; events: number[] };
  baselineSeason: string;
  generatedAt: string;
}

const num = (value: string | null | undefined): number => {
  if (value === null || value === undefined) return 0;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * FPL never publishes its price-change algorithm, but daily net transfers are the
 * input it says it uses. This expresses momentum as a share of all managers,
 * which is what the movement thresholds broadly track.
 */
function priceTrendOf(element: FplElement, totalPlayers: number): PriceTrend {
  const net = element.transfers_in_event - element.transfers_out_event;
  const share = safeDivide(net, totalPlayers);
  const { likely, veryLikely } = MODEL.priceShareThresholds;
  if (share > veryLikely) return "very-likely-rise";
  if (share > likely) return "likely-rise";
  if (share < -veryLikely) return "very-likely-fall";
  if (share < -likely) return "likely-fall";
  return "stable";
}

function applySetPieceRates(
  element: FplElement,
  rates: PlayerRates,
): PlayerRates {
  let xG90 = rates.xG90;
  let xA90 = rates.xA90;
  if (element.penalties_order === 1) {
    xG90 *= MODEL.setPiece.penaltyXgMult;
  }
  if (element.direct_freekicks_order === 1) {
    xG90 *= MODEL.setPiece.directFreeKickXgMult;
  }
  if (element.corners_and_indirect_freekicks_order === 1) {
    xA90 *= MODEL.setPiece.cornerXaMult;
  }
  return { ...rates, xG90, xA90 };
}

function confidenceWidth(rates: PlayerRates, startProbability: number): number {
  const base =
    rates.source === "prior"
      ? MODEL.confidence.priorWidth
      : rates.source === "blended" || rates.source === "previous"
        ? MODEL.confidence.blendedWidth
        : MODEL.confidence.currentWidth;
  const minutesExtra =
    rates.sampleMinutes < MODEL.confidence.lowMinutesThreshold
      ? MODEL.confidence.lowMinutesExtra
      : 0;
  const startExtra =
    startProbability < 0.55 ? MODEL.confidence.lowStartExtra : 0;
  return Math.min(0.55, base + minutesExtra + startExtra);
}

/**
 * Builds expected points for every player over a gameweek horizon.
 *
 * `horizon` is the number of gameweeks to project, starting from the gameweek
 * that is still open for transfers (or in progress). Blank and double gameweeks
 * fall out naturally because projections iterate a team's actual fixture list
 * rather than assuming one match per gameweek.
 */
export interface ProjectionOptions {
  /**
   * Scales prior weight in rate blending. Clamped to 0.5–2. Advanced URL
   * `?prior=` on Players / Optimizer.
   */
  priorScale?: number;
}

export async function buildProjections(
  horizonInput: number = MODEL.defaultHorizon,
  options: ProjectionOptions = {},
): Promise<ProjectionSet> {
  const [bootstrap, fixtures] = await Promise.all([
    getBootstrap(),
    getFixtures(),
  ]);

  const season = getSeasonState(bootstrap, fixtures);
  const teamStrength = buildTeamStrength(bootstrap, fixtures);

  const horizon = Math.max(1, Math.min(MODEL.maxHorizon, horizonInput));
  const from = season.targetEvent;
  const lastEvent = bootstrap.events.at(-1)?.id ?? 38;
  const to = Math.min(lastEvent, from + horizon - 1);
  const events = Array.from({ length: to - from + 1 }, (_, i) => from + i);

  const teamFixtures = fixturesByTeam(fixtures, from, to);
  const teamsById = new Map(bootstrap.teams.map((t) => [t.id, t]));

  const priorScale = Math.min(
    2,
    Math.max(0.5, options.priorScale ?? 1),
  );

  const context: RateContext = {
    bootstrapIsPreviousSeason: season.isPreseason,
    priors: buildPositionPriors(bootstrap, season.isPreseason),
    matchesPlayed: season.matchesPlayed,
    priorMinutesScale: priorScale,
  };

  const adjustmentIndex = buildAdjustmentIndex(bootstrap, MANUAL_ADJUSTMENTS);
  if (
    process.env.NODE_ENV !== "production" &&
    (adjustmentIndex.unmatched.length || adjustmentIndex.ambiguous.length)
  ) {
    if (adjustmentIndex.unmatched.length) {
      console.warn(
        `Manual adjustments matched no player (skipped): ${adjustmentIndex.unmatched.join(", ")}`,
      );
    }
    if (adjustmentIndex.ambiguous.length) {
      console.warn(
        `Manual adjustments matched several players (skipped — add a team or full name): ${adjustmentIndex.ambiguous.join(", ")}`,
      );
    }
  }

  const now = Date.now();
  const eventDeadlines = new Map(
    bootstrap.events.map((event) => [
      event.id,
      event.deadline_time_epoch * 1000,
    ]),
  );

  const players: PlayerProjection[] = [];

  for (const element of bootstrap.elements) {
    const position = element.element_type as PositionId;
    const team = teamsById.get(element.team);
    if (!team) continue;

    const rates = applySetPieceRates(element, playerRates(element, context));
    const bonusFactor = bpsRuleChangeFactor(rates);

    const playerAdjustments = adjustmentIndex.byElement.get(element.id) ?? [];
    const returnMs =
      rates.availability < 1 ? parseReturnDate(element.news, now) : null;

    const upcoming = teamFixtures.get(element.team) ?? [];
    const fixtureProjections: FixtureProjection[] = [];
    let breakdownNext: XpBreakdown = { ...EMPTY_XP };
    let breakdownHorizon: XpBreakdown = { ...EMPTY_XP };
    let fixtureCountNext = 0;

    for (const fixture of upcoming) {
      const expectation = teamStrength.expectation(fixture, element.team);
      const event = fixture.event ?? from;
      const fixtureMs = fixture.kickoff_time
        ? Date.parse(fixture.kickoff_time)
        : (eventDeadlines.get(event) ?? null);
      const xp = fixtureXp({
        position,
        rates,
        expectation,
        bonusFactor,
        availability: availabilityForFixture(
          rates.availability,
          element.status,
          returnMs,
          fixtureMs,
        ),
        startFactor: startFactorFor(playerAdjustments, event, position === 1),
      });

      breakdownHorizon = addBreakdowns(breakdownHorizon, xp);
      if (event === from) {
        breakdownNext = addBreakdowns(breakdownNext, xp);
        fixtureCountNext += 1;
      }

      fixtureProjections.push({
        fixtureId: fixture.id,
        event,
        kickoff: fixture.kickoff_time,
        isHome: expectation.isHome,
        difficulty: expectation.difficulty,
        opponentId: expectation.opponentId,
        opponentShort: teamsById.get(expectation.opponentId)?.short_name ?? "?",
        expectedGoalsFor: round(expectation.goalsFor, 2),
        expectedGoalsAgainst: round(expectation.goalsAgainst, 2),
        cleanSheetProbability: round(expectation.cleanSheetProbability, 3),
        xp: round(xp.total, 2),
      });
    }

    const xpHorizon = breakdownHorizon.total;
    const xpNext = breakdownNext.total;
    const startProb = breakdownNext.startProbability;
    const width = confidenceWidth(rates, startProb);

    players.push({
      id: element.id,
      code: element.code,
      name: element.web_name,
      fullName: `${element.first_name} ${element.second_name}`.trim(),
      position,
      positionShort: POSITION_SHORT[position],
      teamId: team.id,
      teamName: team.name,
      teamShort: team.short_name,
      price: element.now_cost,
      status: element.status,
      news: element.news,
      availability: rates.availability,
      selectedByPercent: num(element.selected_by_percent),
      form: num(element.form),
      pointsPerGame: num(element.points_per_game),
      totalPoints: element.total_points,
      minutes: element.minutes,
      starts: element.starts,
      rates,
      dataSource: rates.source,
      xpNext: round(xpNext, 2),
      xpNextLow: round(xpNext * (1 - width), 2),
      xpNextHigh: round(xpNext * (1 + width), 2),
      xpHorizon: round(xpHorizon, 2),
      xpHorizonLow: round(xpHorizon * (1 - width), 2),
      xpHorizonHigh: round(xpHorizon * (1 + width), 2),
      isPenaltyTaker: element.penalties_order === 1,
      isDirectFreeKickTaker: element.direct_freekicks_order === 1,
      isCornerTaker: element.corners_and_indirect_freekicks_order === 1,
      xpPerFixture: round(
        safeDivide(xpHorizon, fixtureProjections.length),
        2,
      ),
      value: round(safeDivide(xpHorizon, element.now_cost / 10), 2),
      breakdownNext,
      breakdownHorizon,
      fixtures: fixtureProjections,
      fixtureCountNext,
      netTransfersEvent:
        element.transfers_in_event - element.transfers_out_event,
      priceChangeEvent: element.cost_change_event,
      priceTrend: priceTrendOf(element, bootstrap.total_players),
      officialEpNext: num(element.ep_next),
      // Only adjustments still relevant to the horizon are surfaced in the UI.
      adjustments: playerAdjustments
        .filter((adjustment) =>
          adjustment.windows.some(
            (window) => window.toEvent >= from && window.fromEvent <= to,
          ),
        )
        .map((adjustment) => ({
          kind: adjustment.kind,
          reason: adjustment.reason,
        })),
      startFactorNext: round(
        startFactorFor(playerAdjustments, from, position === 1),
        3,
      ),
      expectedReturn: returnMs
        ? new Date(returnMs).toISOString().slice(0, 10)
        : null,
    });
  }

  players.sort((a, b) => b.xpHorizon - a.xpHorizon);

  return {
    bootstrap,
    fixtures,
    season,
    teamStrength,
    players,
    byId: new Map(players.map((p) => [p.id, p])),
    horizon: { from, to, events },
    baselineSeason: baseline.season,
    generatedAt: new Date().toISOString(),
  };
}
