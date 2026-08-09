import {
  type ChipName,
  FORMATIONS,
  formationLabel,
  parseFormation,
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
  /** Raw bench expected points under the active metric. */
  benchXp: number;
  /**
   * Objective used when comparing squads. Under a chip this includes the points
   * the chip itself adds (full bench for Bench Boost, extra captain multipliers
   * for Triple Captain).
   */
  score: number;
  /** Expected points the selected chip adds over the no-chip objective. */
  chipGain: number;
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
 * Soft constraints on who must start and who must sit. Used by the squad builder
 * so a player locked from the pitch stays in that role while the rest of the
 * squad is rebuilt around them. A fixed formation forces that shape instead of
 * picking the highest-scoring legal one. A chip changes how the squad is scored.
 */
export interface XiConstraints {
  mustStart?: ReadonlySet<number>;
  mustBench?: ReadonlySet<number>;
  /** Formation label such as "4-4-2". Omit or null to choose automatically. */
  formation?: string | null;
  /** Chip being planned for the first gameweek of the horizon. */
  chip?: ChipName | null;
}

/**
 * Bench contribution to the objective. Normally a bench player is worth only a
 * fraction of their projected points. Under Bench Boost the chip week counts in
 * full and only the rest of the horizon is discounted.
 */
function benchContribution(
  player: OptimizerPlayer,
  weight: number,
  metric: XiMetric,
  chip: ChipName | null | undefined,
): { weighted: number; chipGain: number } {
  if (chip === "bboost") {
    const remainder = Math.max(0, player.xp - player.xpNext);
    const weighted = player.xpNext + remainder * weight;
    // Relative to the usual `xp * weight` discount on the whole horizon.
    const baseline = player.xp * weight;
    return { weighted, chipGain: Math.max(0, weighted - baseline) };
  }
  return { weighted: player[metric] * weight, chipGain: 0 };
}

/**
 * Picks the highest-scoring legal starting XI from a 15-man squad by trying every
 * formation allowed in 2026/27 and taking the best players in each position.
 *
 * The bench is then ordered by expected points, except that the reserve
 * goalkeeper always occupies its own slot, and discounted: a bench player only
 * scores when a starter does not play, so they are worth a fraction of face value
 * — unless Bench Boost is active, in which case the chip week counts in full.
 */
export function bestXi(
  squad: OptimizerPlayer[],
  metric: XiMetric = "xp",
  constraints: XiConstraints = {},
): BestXi {
  const value = (player: OptimizerPlayer) => player[metric];
  const mustStart = constraints.mustStart ?? new Set<number>();
  const mustBench = constraints.mustBench ?? new Set<number>();
  const chip = constraints.chip ?? null;
  const forcedFormation = parseFormation(constraints.formation);
  const formations = forcedFormation ? [forcedFormation] : FORMATIONS;
  const squadById = new Map(squad.map((player) => [player.id, player]));

  const forcedStarters = [...mustStart]
    .map((id) => squadById.get(id))
    .filter((player): player is OptimizerPlayer => Boolean(player));
  const forcedByPosition: Record<PositionId, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const player of forcedStarters) {
    forcedByPosition[player.position] += 1;
  }

  const byPosition = new Map<PositionId, OptimizerPlayer[]>();
  for (const position of [1, 2, 3, 4] as PositionId[]) {
    byPosition.set(
      position,
      squad
        .filter(
          (player) =>
            player.position === position && !mustBench.has(player.id),
        )
        .sort((a, b) => {
          const aForced = mustStart.has(a.id) ? 1 : 0;
          const bForced = mustStart.has(b.id) ? 1 : 0;
          if (aForced !== bForced) return bForced - aForced;
          return value(b) - value(a);
        }),
    );
  }

  let best: { xi: OptimizerPlayer[]; xp: number; formation: string } | null =
    null;

  for (const formation of formations) {
    let feasible = true;
    for (const position of [1, 2, 3, 4] as PositionId[]) {
      if (forcedByPosition[position] > formation[position]) {
        feasible = false;
        break;
      }
    }
    if (!feasible) continue;

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
    // Every forced starter must have been selected for this formation.
    if (forcedStarters.some((player) => !xi.some((p) => p.id === player.id))) {
      continue;
    }
    if (!best || xp > best.xp) {
      best = { xi, xp, formation: formationLabel(formation) };
    }
  }

  if (!best) {
    // Manual formation with conflicting locks: still honour the shape, seating
    // the best available players even if some locks could not be kept.
    if (forcedFormation) {
      const xi: OptimizerPlayer[] = [];
      let xp = 0;
      let feasible = true;
      for (const position of [1, 2, 3, 4] as PositionId[]) {
        const available = byPosition.get(position) ?? [];
        const needed = forcedFormation[position];
        if (available.length < needed) {
          feasible = false;
          break;
        }
        for (let i = 0; i < needed; i++) {
          xi.push(available[i]);
          xp += value(available[i]);
        }
      }
      if (feasible) {
        best = { xi, xp, formation: formationLabel(forcedFormation) };
      }
    }
  }

  if (!best) {
    const fallback = [...squad]
      .filter((player) => !mustBench.has(player.id))
      .sort((a, b) => {
        const aForced = mustStart.has(a.id) ? 1 : 0;
        const bForced = mustStart.has(b.id) ? 1 : 0;
        if (aForced !== bForced) return bForced - aForced;
        return value(b) - value(a);
      });
    const xi = fallback.slice(0, SQUAD.startingXi);
    best = {
      xi,
      xp: xi.reduce((total, p) => total + value(p), 0),
      formation: forcedFormation
        ? formationLabel(forcedFormation)
        : "invalid",
    };
  }

  const starterIds = new Set(best.xi.map((p) => p.id));
  const benchOutfield = squad
    .filter((p) => !starterIds.has(p.id) && p.position !== 1)
    .sort((a, b) => {
      const aForced = mustBench.has(a.id) ? 1 : 0;
      const bForced = mustBench.has(b.id) ? 1 : 0;
      if (aForced !== bForced) return bForced - aForced;
      return value(b) - value(a);
    });
  const benchKeeper = squad
    .filter((p) => !starterIds.has(p.id) && p.position === 1)
    .sort((a, b) => {
      const aForced = mustBench.has(a.id) ? 1 : 0;
      const bForced = mustBench.has(b.id) ? 1 : 0;
      if (aForced !== bForced) return bForced - aForced;
      return value(b) - value(a);
    });
  const bench = [...benchOutfield, ...benchKeeper];

  let weightedBenchXp = 0;
  let benchChipGain = 0;
  benchOutfield.forEach((player, index) => {
    const weight =
      MODEL.benchWeights[index] ?? MODEL.benchWeights.at(-1)!;
    const contribution = benchContribution(player, weight, metric, chip);
    weightedBenchXp += contribution.weighted;
    benchChipGain += contribution.chipGain;
  });
  const keeperWeight = MODEL.benchWeights.at(-1)!;
  for (const player of benchKeeper) {
    const contribution = benchContribution(
      player,
      keeperWeight,
      metric,
      chip,
    );
    weightedBenchXp += contribution.weighted;
    benchChipGain += contribution.chipGain;
  }

  const captainOrder = [...best.xi].sort((a, b) => b.xpNext - a.xpNext);
  const captain = captainOrder[0] ?? null;
  const viceCaptain = captainOrder[1] ?? null;

  // Triple Captain adds two extra multipliers on the chip week (×3 instead of ×2).
  const tripleCaptainGain =
    chip === "3xc" && captain ? 2 * captain.xpNext : 0;
  const chipGain = benchChipGain + tripleCaptainGain;

  return {
    startingXi: best.xi,
    bench,
    formation: best.formation,
    startingXp: best.xp,
    weightedBenchXp,
    benchXp: bench.reduce((total, p) => total + value(p), 0),
    score: best.xp + weightedBenchXp + tripleCaptainGain,
    chipGain,
    captain,
    viceCaptain,
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
