import type { PositionId } from "../fpl/rules";
import { round } from "../model/math";
import type { PlayerProjection, PriceTrend } from "../model/projections";

/** A slim, serialisable projection for the client-side player table. */
export interface PlayerRow {
  id: number;
  name: string;
  teamShort: string;
  teamId: number;
  position: PositionId;
  positionShort: string;
  price: number;
  xpNext: number;
  xpNextLow: number;
  xpNextHigh: number;
  xpHorizon: number;
  xpPerFixture: number;
  value: number;
  isPenaltyTaker: boolean;
  isDirectFreeKickTaker: boolean;
  isCornerTaker: boolean;
  officialEpNext: number;
  form: number;
  pointsPerGame: number;
  totalPoints: number;
  selectedByPercent: number;
  minutes: number;
  starts: number;
  startProbability: number;
  expectedMinutes: number;
  xG90: number;
  xA90: number;
  defensiveActions90: number;
  defconProbability: number;
  cleanSheetProbability: number;
  savesPer90: number;
  bonusPer90: number;
  availability: number;
  status: string;
  news: string;
  /** Reasons for any active manual adjustments (World Cup recovery etc.). */
  adjustments: string[];
  /** Start-probability factor applied in the target gameweek. 1 means none. */
  startFactorNext: number;
  /** Return date parsed from the news, as an ISO date, if any. */
  expectedReturn: string | null;
  dataSource: PlayerProjection["dataSource"];
  priceTrend: PriceTrend;
  netTransfersEvent: number;
  fixtureCountNext: number;
  fixtures: Array<{
    event: number;
    opponentShort: string;
    isHome: boolean;
    difficulty: number;
    xp: number;
  }>;
}

export function toPlayerRow(player: PlayerProjection): PlayerRow {
  return {
    id: player.id,
    name: player.name,
    teamShort: player.teamShort,
    teamId: player.teamId,
    position: player.position,
    positionShort: player.positionShort,
    price: player.price,
    xpNext: player.xpNext,
    xpNextLow: player.xpNextLow,
    xpNextHigh: player.xpNextHigh,
    xpHorizon: player.xpHorizon,
    xpPerFixture: player.xpPerFixture,
    value: player.value,
    isPenaltyTaker: player.isPenaltyTaker,
    isDirectFreeKickTaker: player.isDirectFreeKickTaker,
    isCornerTaker: player.isCornerTaker,
    officialEpNext: player.officialEpNext,
    form: player.form,
    pointsPerGame: player.pointsPerGame,
    totalPoints: player.totalPoints,
    selectedByPercent: player.selectedByPercent,
    minutes: player.minutes,
    starts: player.starts,
    startProbability: round(player.breakdownNext.startProbability, 3),
    expectedMinutes: round(player.breakdownNext.expectedMinutes, 1),
    xG90: round(player.rates.xG90, 3),
    xA90: round(player.rates.xA90, 3),
    defensiveActions90: round(player.rates.defensiveActions90, 2),
    defconProbability: round(
      player.breakdownNext.defensiveContributionProbability,
      3,
    ),
    cleanSheetProbability: round(player.breakdownNext.cleanSheetProbability, 3),
    savesPer90: round(player.rates.saves90, 2),
    bonusPer90: round(player.rates.bonus90, 2),
    availability: player.availability,
    status: player.status,
    news: player.news,
    adjustments: player.adjustments.map((adjustment) => adjustment.reason),
    startFactorNext: player.startFactorNext,
    expectedReturn: player.expectedReturn,
    dataSource: player.dataSource,
    priceTrend: player.priceTrend,
    netTransfersEvent: player.netTransfersEvent,
    fixtureCountNext: player.fixtureCountNext,
    fixtures: player.fixtures.map((fixture) => ({
      event: fixture.event,
      opponentShort: fixture.opponentShort,
      isHome: fixture.isHome,
      difficulty: fixture.difficulty,
      xp: fixture.xp,
    })),
  };
}
