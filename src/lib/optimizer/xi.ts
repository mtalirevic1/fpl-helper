import {
  FORMATIONS,
  formationLabel,
  type PositionId,
  SQUAD,
} from "../fpl/rules";
import { MODEL } from "../model/config";

export interface OptimizerPlayer {
  id: number;
  position: PositionId;
  teamId: number;
  /** Price in tenths of a million. */
  price: number;
  /** Expected points over the horizon being optimised for. */
  xp: number;
  /** Expected points in the immediate gameweek, used for captaincy. */
  xpNext: number;
}

export interface BestXi {
  startingXi: OptimizerPlayer[];
  bench: OptimizerPlayer[];
  formation: string;
  /** Expected points of the starting XI, captain not yet applied. */
  startingXp: number;
  /** Bench expected points discounted by how rarely a bench player scores. */
  weightedBenchXp: number;
  /** Raw bench expected points, which is what a Bench Boost would add. */
  benchXp: number;
  /** Objective used when comparing squads: XI plus discounted bench. */
  score: number;
  captain: OptimizerPlayer | null;
  viceCaptain: OptimizerPlayer | null;
}

/**
 * Which projection to pick the XI on: the whole horizon when building a squad to
 * hold for several gameweeks, or the next gameweek alone when setting this week's
 * lineup. The two differ whenever a player has a blank or a double.
 */
export type XiMetric = "xp" | "xpNext";

/**
 * Picks the highest-scoring legal starting XI from a 15-man squad by trying every
 * formation allowed in 2026/27 and taking the best players in each position.
 *
 * The bench is then ordered by expected points, except that the reserve
 * goalkeeper always occupies its own slot, and discounted: a bench player only
 * scores when a starter does not play, so they are worth a fraction of face value.
 */
export function bestXi(
  squad: OptimizerPlayer[],
  metric: XiMetric = "xp",
): BestXi {
  const value = (player: OptimizerPlayer) => player[metric];

  const byPosition = new Map<PositionId, OptimizerPlayer[]>();
  for (const position of [1, 2, 3, 4] as PositionId[]) {
    byPosition.set(
      position,
      squad
        .filter((p) => p.position === position)
        .sort((a, b) => value(b) - value(a)),
    );
  }

  let best: { xi: OptimizerPlayer[]; xp: number; formation: string } | null =
    null;

  for (const formation of FORMATIONS) {
    let feasible = true;
    const xi: OptimizerPlayer[] = [];
    let xp = 0;
    for (const position of [1, 2, 3, 4] as PositionId[]) {
      const available = byPosition.get(position) ?? [];
      const needed = formation[position];
      if (available.length < needed) {
        feasible = false;
        break;
      }
      for (let i = 0; i < needed; i++) {
        xi.push(available[i]);
        xp += value(available[i]);
      }
    }
    if (!feasible) continue;
    if (!best || xp > best.xp) {
      best = { xi, xp, formation: formationLabel(formation) };
    }
  }

  if (!best) {
    const fallback = [...squad].sort((a, b) => value(b) - value(a));
    const xi = fallback.slice(0, SQUAD.startingXi);
    best = {
      xi,
      xp: xi.reduce((total, p) => total + value(p), 0),
      formation: "invalid",
    };
  }

  const starterIds = new Set(best.xi.map((p) => p.id));
  const benchOutfield = squad
    .filter((p) => !starterIds.has(p.id) && p.position !== 1)
    .sort((a, b) => value(b) - value(a));
  const benchKeeper = squad.filter(
    (p) => !starterIds.has(p.id) && p.position === 1,
  );
  const bench = [...benchOutfield, ...benchKeeper];

  let weightedBenchXp = 0;
  benchOutfield.forEach((player, index) => {
    weightedBenchXp +=
      value(player) * (MODEL.benchWeights[index] ?? MODEL.benchWeights.at(-1)!);
  });
  weightedBenchXp += benchKeeper.reduce(
    (total, player) => total + value(player) * MODEL.benchWeights.at(-1)!,
    0,
  );

  const captainOrder = [...best.xi].sort((a, b) => b.xpNext - a.xpNext);

  return {
    startingXi: best.xi,
    bench,
    formation: best.formation,
    startingXp: best.xp,
    weightedBenchXp,
    benchXp: bench.reduce((total, p) => total + value(p), 0),
    score: best.xp + weightedBenchXp,
    captain: captainOrder[0] ?? null,
    viceCaptain: captainOrder[1] ?? null,
  };
}

/** Whether a set of players satisfies every squad rule bar the budget. */
export function isLegalSquad(squad: OptimizerPlayer[], maxPerClub: number) {
  if (squad.length !== SQUAD.size) return false;
  const positionCounts = new Map<PositionId, number>();
  const clubCounts = new Map<number, number>();
  for (const player of squad) {
    positionCounts.set(
      player.position,
      (positionCounts.get(player.position) ?? 0) + 1,
    );
    clubCounts.set(player.teamId, (clubCounts.get(player.teamId) ?? 0) + 1);
  }
  for (const position of [1, 2, 3, 4] as PositionId[]) {
    if ((positionCounts.get(position) ?? 0) !== SQUAD.select[position]) {
      return false;
    }
  }
  for (const count of clubCounts.values()) {
    if (count > maxPerClub) return false;
  }
  return true;
}
