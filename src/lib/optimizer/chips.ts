import { CHIP_LABEL, type ChipName } from "../fpl/rules";
import type { ChipAvailability } from "../fpl/season";
import { MODEL } from "../model/config";
import { round } from "../model/math";
import type { PlayerProjection } from "../model/projections";
import type { BestXi } from "./xi";

export type ChipStatus =
  /** Worth playing in the target gameweek. */
  | "play"
  /** Available, but better saved. */
  | "hold"
  /** Already used in this half of the season. */
  | "used"
  /** Cannot be played in this particular gameweek. */
  | "closed";

export interface ChipRecommendation {
  chip: ChipName;
  label: string;
  status: ChipStatus;
  available: boolean;
  /** Expected points the chip would add if played in the target gameweek. */
  gain: number;
  recommended: boolean;
  reason: string;
  window: { startEvent: number; stopEvent: number } | null;
}

export interface ChipContext {
  /** The best XI for the target gameweek, scored on that gameweek alone. */
  lineup: BestXi;
  squad: PlayerProjection[];
  targetEvent: number;
  availability: ChipAvailability[];
  /** The current squad's expected points across the whole horizon. */
  horizonScore: number;
  /** The best buyable squad's expected points across the whole horizon. */
  freshSquadScore?: number;
}

/**
 * Judges each chip against the target gameweek.
 *
 * The comparison is always "what does this chip add to this gameweek", measured in
 * expected points, so the thresholds in `MODEL.chipThresholds` are the point at
 * which a chip is worth burning rather than saving.
 */
export function recommendChips(context: ChipContext): ChipRecommendation[] {
  const { lineup, squad, targetEvent, availability } = context;

  /**
   * A chip can only be played if this gameweek falls inside one of its two
   * windows and that window's chip has not already been used. Note that Wildcard
   * and Free Hit windows open in Gameweek 2, because unlimited transfers are
   * allowed before the season starts.
   */
  const statusOf = (chip: ChipName) => {
    const inWindow = availability.filter(
      (entry) =>
        entry.chip === chip &&
        targetEvent >= entry.window.startEvent &&
        targetEvent <= entry.window.stopEvent,
    );
    if (!inWindow.length) {
      const next = availability
        .filter((entry) => entry.chip === chip && entry.available)
        .sort((a, b) => a.window.startEvent - b.window.startEvent)[0];
      return {
        available: false,
        closed: true,
        window: next?.window ?? null,
      };
    }
    const usable = inWindow.find((entry) => entry.available);
    return {
      available: Boolean(usable),
      closed: false,
      window: (usable ?? inWindow[0]).window,
    };
  };

  const statuses = new Map(
    (["bboost", "3xc", "freehit", "wildcard"] as ChipName[]).map((chip) => [
      chip,
      statusOf(chip),
    ]),
  );
  const isAvailable = (chip: ChipName) =>
    statuses.get(chip)?.available ?? false;

  const benchThisWeek = lineup.bench.reduce((total, player) => {
    const projection = squad.find((p) => p.id === player.id);
    return total + (projection?.xpNext ?? 0);
  }, 0);

  const captainThisWeek = (() => {
    const captain = lineup.captain
      ? squad.find((p) => p.id === lineup.captain?.id)
      : undefined;
    return captain?.xpNext ?? 0;
  })();

  const playersWithFixture = squad.filter(
    (player) => player.fixtureCountNext > 0,
  ).length;
  const doubles = squad.filter((player) => player.fixtureCountNext > 1).length;

  const freshGain =
    context.freshSquadScore !== undefined
      ? context.freshSquadScore - context.horizonScore
      : 0;

  type Draft = Omit<ChipRecommendation, "status" | "window">;

  const drafts: Draft[] = [
    {
      chip: "bboost",
      label: CHIP_LABEL.bboost,
      available: isAvailable("bboost"),
      gain: round(benchThisWeek, 2),
      recommended:
        isAvailable("bboost") &&
        benchThisWeek >= MODEL.chipThresholds.benchBoost,
      reason:
        benchThisWeek >= MODEL.chipThresholds.benchBoost
          ? `Your bench projects ${benchThisWeek.toFixed(1)} points in GW${targetEvent}${
              doubles ? `, with ${doubles} squad players on a double` : ""
            }.`
          : `Your bench only projects ${benchThisWeek.toFixed(
              1,
            )} points — worth waiting for a stronger bench or a double gameweek.`,
    },
    {
      chip: "3xc",
      label: CHIP_LABEL["3xc"],
      available: isAvailable("3xc"),
      gain: round(captainThisWeek, 2),
      recommended:
        isAvailable("3xc") &&
        captainThisWeek >= MODEL.chipThresholds.tripleCaptain,
      reason: lineup.captain
        ? `A third multiplier on your captain is worth ${captainThisWeek.toFixed(
            1,
          )} points in GW${targetEvent}.`
        : "No captain could be identified.",
    },
    {
      chip: "freehit",
      label: CHIP_LABEL.freehit,
      available: isAvailable("freehit"),
      gain: round(Math.max(0, freshGain), 2),
      recommended:
        isAvailable("freehit") &&
        playersWithFixture < MODEL.chipThresholds.freeHitMinPlayers,
      reason:
        playersWithFixture < MODEL.chipThresholds.freeHitMinPlayers
          ? `Only ${playersWithFixture} of your 15 players have a fixture in GW${targetEvent}.`
          : `${playersWithFixture} of your 15 players have a fixture, so there is no blank to navigate.`,
    },
    {
      chip: "wildcard",
      label: CHIP_LABEL.wildcard,
      available: isAvailable("wildcard"),
      gain: round(Math.max(0, freshGain), 2),
      recommended:
        isAvailable("wildcard") && freshGain >= MODEL.chipThresholds.wildcard,
      reason:
        context.freshSquadScore === undefined
          ? "Run the optimiser to compare your squad with the best available one."
          : freshGain >= MODEL.chipThresholds.wildcard
            ? `A rebuilt squad projects ${freshGain.toFixed(
                1,
              )} points more than yours over the horizon.`
            : `A rebuilt squad would only gain ${freshGain.toFixed(
                1,
              )} points over the horizon — not worth a Wildcard yet.`,
    },
  ];

  return drafts.map((draft): ChipRecommendation => {
    const state = statuses.get(draft.chip)!;
    const status: ChipStatus = state.available
      ? draft.recommended
        ? "play"
        : "hold"
      : state.closed
        ? "closed"
        : "used";

    const reason =
      status === "closed"
        ? state.window
          ? `Not available in gameweek ${targetEvent}. The next window runs from gameweek ${state.window.startEvent} to ${state.window.stopEvent}.`
          : `Not available in gameweek ${targetEvent}.`
        : status === "used"
          ? "Already played in this half of the season."
          : draft.reason;

    return {
      ...draft,
      status,
      window: state.window,
      available: state.available,
      recommended: status === "play",
      gain: Number.isFinite(draft.gain) ? Math.max(0, draft.gain) : 0,
      reason,
    };
  });
}

/** Captain and vice-captain ranked by expected points in the target gameweek. */
export function captaincyRanking(
  xi: BestXi,
  byId: Map<number, PlayerProjection>,
): PlayerProjection[] {
  return xi.startingXi
    .map((player) => byId.get(player.id))
    .filter((player): player is PlayerProjection => Boolean(player))
    .sort((a, b) => b.xpNext - a.xpNext);
}
