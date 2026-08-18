import type { PlayerProjection } from "../model/projections";
import type { OptimizerPlayer } from "./xi";

export interface CandidateOptions {
  /** Drop anyone less likely than this to start the next gameweek. */
  minStartProbability?: number;
  /** Drop injured, suspended and unavailable players. */
  requireAvailable?: boolean;
  /**
   * Always keep these players, even when they fail the start-chance or
   * availability filters. Used for explicit locks and replaces so a backup
   * keeper (or similar) can still be forced into the 15.
   */
  mustInclude?: number[];
}

export function toOptimizerPlayer(player: PlayerProjection): OptimizerPlayer {
  return {
    id: player.id,
    position: player.position,
    teamId: player.teamId,
    price: player.price,
    xp: player.xpHorizon,
    xpNext: player.xpNext,
  };
}

/**
 * Turns projections into optimiser candidates, filtering out players who are not
 * realistically selectable. Without a start-probability floor the optimiser is
 * happy to fill the bench with £4.0m players who never play, which is technically
 * correct but useless as advice.
 */
export function buildCandidates(
  players: PlayerProjection[],
  options: CandidateOptions = {},
): OptimizerPlayer[] {
  const minStart = options.minStartProbability ?? 0;
  const requireAvailable = options.requireAvailable ?? true;
  const mustInclude = new Set(options.mustInclude ?? []);

  return players
    .filter((player) => {
      if (mustInclude.has(player.id)) return true;
      if (requireAvailable && player.availability <= 0) return false;
      if (player.rates.startProbability < minStart) return false;
      return true;
    })
    .map(toOptimizerPlayer);
}
