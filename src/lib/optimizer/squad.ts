import { parseFormation, type PositionId, SQUAD } from "../fpl/rules";
import { MODEL } from "../model/config";
import { bestXi, type BestXi, isLegalSquad, type OptimizerPlayer } from "./xi";

export interface SquadOptions {
  /** Budget in tenths of a million. */
  budget?: number;
  maxPerClub?: number;
  /** Players that must appear in the squad. */
  locked?: number[];
  /** Locked players that must start in the XI. */
  lockedStarters?: number[];
  /** Locked players that must sit on the bench. */
  lockedBench?: number[];
  /** Players that must not appear in the squad. */
  excluded?: number[];
  /**
   * Fix the starting shape to this label (e.g. "3-5-2"). When omitted the
   * optimiser picks the highest-scoring legal formation for each candidate squad.
   */
  formation?: string | null;
  /** Candidate pool size per position; larger is slower but searches wider. */
  pool?: Record<number, number>;
  /** Randomised restarts. More restarts means a better answer and more time. */
  restarts?: number;
}

export interface SquadSolution extends BestXi {
  squad: OptimizerPlayer[];
  cost: number;
  budget: number;
  inTheBank: number;
  /** Candidate pool size the search explored. */
  poolSize: number;
  restarts: number;
  warnings: string[];
}

const POSITIONS: PositionId[] = [1, 2, 3, 4];

/** Deterministic pseudo-random source so results are reproducible. */
function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Narrows the ~570 players down to a pool worth searching: the best by raw
 * expected points, plus the best by points per pound, since a tight budget is
 * usually balanced with cheap high-value enablers.
 */
function buildPool(
  candidates: OptimizerPlayer[],
  options: SquadOptions,
): OptimizerPlayer[] {
  const excluded = new Set(options.excluded ?? []);
  const locked = new Set(options.locked ?? []);
  const poolSizes = options.pool ?? MODEL.optimiserPool;

  const pool: OptimizerPlayer[] = [];
  for (const position of POSITIONS) {
    const forPosition = candidates
      .filter(
        (player) =>
          player.position === position &&
          (!excluded.has(player.id) || locked.has(player.id)),
      )
      .sort((a, b) => b.xp - a.xp);

    const size = poolSizes[position] ?? 30;
    const selected = new Map<number, OptimizerPlayer>();
    for (const player of forPosition.slice(0, size)) {
      selected.set(player.id, player);
    }
    const byValue = [...forPosition].sort(
      (a, b) => b.xp / b.price - a.xp / a.price,
    );
    for (const player of byValue.slice(0, Math.ceil(size / 2))) {
      selected.set(player.id, player);
    }
    pool.push(...selected.values());
  }

  for (const id of locked) {
    if (pool.some((player) => player.id === id)) continue;
    const player = candidates.find((candidate) => candidate.id === id);
    if (player) pool.push(player);
  }

  return pool;
}

/** A squad under construction, tracking the constraints incrementally. */
class Working {
  players: OptimizerPlayer[] = [];
  cost = 0;
  private positionCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  private clubCounts = new Map<number, number>();
  private ids = new Set<number>();

  constructor(
    readonly budget: number,
    readonly maxPerClub: number,
  ) {}

  has(id: number) {
    return this.ids.has(id);
  }

  clubCount(teamId: number) {
    return this.clubCounts.get(teamId) ?? 0;
  }

  positionCount(position: number) {
    return this.positionCounts[position];
  }

  canAdd(player: OptimizerPlayer) {
    return (
      !this.ids.has(player.id) &&
      this.positionCounts[player.position] <
        SQUAD.select[player.position as PositionId] &&
      this.clubCount(player.teamId) < this.maxPerClub &&
      this.cost + player.price <= this.budget
    );
  }

  add(player: OptimizerPlayer) {
    this.players.push(player);
    this.ids.add(player.id);
    this.positionCounts[player.position] += 1;
    this.clubCounts.set(player.teamId, this.clubCount(player.teamId) + 1);
    this.cost += player.price;
  }

  remove(player: OptimizerPlayer) {
    const index = this.players.findIndex((p) => p.id === player.id);
    if (index < 0) return;
    this.players.splice(index, 1);
    this.ids.delete(player.id);
    this.positionCounts[player.position] -= 1;
    this.clubCounts.set(player.teamId, this.clubCount(player.teamId) - 1);
    this.cost -= player.price;
  }

  swap(out: OptimizerPlayer, incoming: OptimizerPlayer) {
    this.remove(out);
    this.add(incoming);
  }

  /** Whether swapping `out` for `incoming` keeps every constraint satisfied. */
  canSwap(out: OptimizerPlayer, incoming: OptimizerPlayer) {
    if (this.ids.has(incoming.id)) return false;
    if (incoming.position !== out.position) return false;
    if (this.cost - out.price + incoming.price > this.budget) return false;
    const clubCount =
      incoming.teamId === out.teamId
        ? this.clubCount(incoming.teamId) - 1
        : this.clubCount(incoming.teamId);
    return clubCount < this.maxPerClub;
  }

  snapshot() {
    return [...this.players];
  }
}

/**
 * Greedy construction. Players are taken in the given order, but only if enough
 * money is left to complete every remaining position with its cheapest option.
 */
function construct(
  order: OptimizerPlayer[],
  pool: OptimizerPlayer[],
  working: Working,
): boolean {
  const cheapest: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const position of POSITIONS) {
    const prices = pool
      .filter((player) => player.position === position)
      .map((player) => player.price);
    cheapest[position] = prices.length ? Math.min(...prices) : 40;
  }

  const reserveFor = (skipPosition: number) =>
    POSITIONS.reduce((total, position) => {
      const stillNeeded =
        SQUAD.select[position] - working.positionCount(position);
      const count = position === skipPosition ? stillNeeded - 1 : stillNeeded;
      return total + Math.max(0, count) * cheapest[position];
    }, 0);

  for (const player of order) {
    if (working.players.length >= SQUAD.size) break;
    if (!working.canAdd(player)) continue;
    if (
      working.cost + player.price + reserveFor(player.position) >
      working.budget
    ) {
      continue;
    }
    working.add(player);
  }

  // Anything still missing gets the cheapest legal option available.
  if (working.players.length < SQUAD.size) {
    for (const player of [...pool].sort((a, b) => a.price - b.price)) {
      if (working.players.length >= SQUAD.size) break;
      if (working.canAdd(player)) working.add(player);
    }
  }

  return working.players.length === SQUAD.size;
}

/** Exhaustive single-swap hill climbing, then a pruned double-swap pass. */
function improve(
  working: Working,
  pool: OptimizerPlayer[],
  locked: Set<number>,
  constraints: {
    mustStart: Set<number>;
    mustBench: Set<number>;
    formation?: string | null;
  },
) {
  const byPosition = new Map<PositionId, OptimizerPlayer[]>();
  for (const position of POSITIONS) {
    byPosition.set(
      position,
      pool
        .filter((player) => player.position === position)
        .sort((a, b) => b.xp - a.xp),
    );
  }

  let score = bestXi(working.players, "xp", constraints).score;

  for (let pass = 0; pass < 60; pass++) {
    let best: { out: OptimizerPlayer; in: OptimizerPlayer; score: number } | null =
      null;

    for (const outgoing of working.snapshot()) {
      if (locked.has(outgoing.id)) continue;
      for (const incoming of byPosition.get(outgoing.position) ?? []) {
        if (!working.canSwap(outgoing, incoming)) continue;
        const trial = working.players.map((player) =>
          player.id === outgoing.id ? incoming : player,
        );
        const trialScore = bestXi(trial, "xp", constraints).score;
        if (
          trialScore > score + 1e-9 &&
          (!best || trialScore > best.score)
        ) {
          best = { out: outgoing, in: incoming, score: trialScore };
        }
      }
    }

    if (best) {
      working.swap(best.out, best.in);
      score = best.score;
      continue;
    }

    // No single swap helps. Try swapping two players at once, which is how the
    // search escapes "I can only afford this upgrade by downgrading elsewhere".
    const doubleSwap = findDoubleSwap(
      working,
      byPosition,
      locked,
      score,
      constraints,
    );
    if (!doubleSwap) break;
    working.swap(doubleSwap.outA, doubleSwap.inA);
    working.swap(doubleSwap.outB, doubleSwap.inB);
    score = doubleSwap.score;
  }

  return score;
}

function findDoubleSwap(
  working: Working,
  byPosition: Map<PositionId, OptimizerPlayer[]>,
  locked: Set<number>,
  currentScore: number,
  constraints: {
    mustStart: Set<number>;
    mustBench: Set<number>;
    formation?: string | null;
  },
) {
  const squad = working.snapshot();
  const shortlist = (position: PositionId) =>
    (byPosition.get(position) ?? []).slice(0, MODEL.doubleSwapShortlist);

  let best:
    | {
        outA: OptimizerPlayer;
        inA: OptimizerPlayer;
        outB: OptimizerPlayer;
        inB: OptimizerPlayer;
        score: number;
      }
    | null = null;

  for (let i = 0; i < squad.length; i++) {
    const outA = squad[i];
    if (locked.has(outA.id)) continue;
    for (let j = i + 1; j < squad.length; j++) {
      const outB = squad[j];
      if (locked.has(outB.id)) continue;

      for (const inA of shortlist(outA.position)) {
        if (working.has(inA.id)) continue;
        for (const inB of shortlist(outB.position)) {
          if (working.has(inB.id) || inB.id === inA.id) continue;

          const cost =
            working.cost - outA.price - outB.price + inA.price + inB.price;
          if (cost > working.budget) continue;

          const trial = squad.map((player) =>
            player.id === outA.id
              ? inA
              : player.id === outB.id
                ? inB
                : player,
          );
          if (!isLegalSquad(trial, working.maxPerClub)) continue;

          const score = bestXi(trial, "xp", constraints).score;
          if (score > currentScore + 1e-9 && (!best || score > best.score)) {
            best = { outA, inA, outB, inB, score };
          }
        }
      }
    }
  }

  return best;
}

/**
 * Finds the best 15-man squad the money can buy.
 *
 * The problem is a multi-constrained knapsack: 15 players in a 2/5/5/3 split, at
 * most three from any one club, inside the budget, scored by the best legal
 * starting XI plus a discounted bench. It is solved by building several greedy
 * squads from different orderings and improving each one with single- and
 * double-swap hill climbing, keeping the best. The result is the best squad found
 * rather than a certificate of optimality, but with this many restarts the two
 * are the same in practice.
 */
export function optimizeSquad(
  candidates: OptimizerPlayer[],
  options: SquadOptions = {},
): SquadSolution {
  const budget = options.budget ?? SQUAD.budgetTenths;
  const maxPerClub = options.maxPerClub ?? SQUAD.maxPerClub;
  const locked = new Set(options.locked ?? []);
  const mustStart = new Set(options.lockedStarters ?? []);
  const mustBench = new Set(options.lockedBench ?? []);
  // Role locks imply squad locks — a player pinned to the XI or bench must stay
  // in the 15, otherwise the role constraint cannot be satisfied.
  for (const id of mustStart) locked.add(id);
  for (const id of mustBench) locked.add(id);
  for (const id of mustStart) {
    if (mustBench.has(id)) mustBench.delete(id);
  }
  const formation = options.formation ?? null;
  const formationShape = parseFormation(formation);
  const constraints = { mustStart, mustBench, formation };
  const restarts = options.restarts ?? MODEL.optimiserRestarts;
  const warnings: string[] = [];

  if (options.formation && !formationShape) {
    warnings.push(
      `Formation "${options.formation}" is not legal in 2026/27 — choosing automatically.`,
    );
    constraints.formation = null;
  }

  const pool = buildPool(candidates, { ...options, locked: [...locked] });
  for (const id of locked) {
    if (!pool.some((player) => player.id === id)) {
      warnings.push(`Player ${id} cannot be selected and was ignored.`);
      locked.delete(id);
      mustStart.delete(id);
      mustBench.delete(id);
    }
  }

  const lockedGkStarters = pool.filter(
    (player) => mustStart.has(player.id) && player.position === 1,
  );
  if (lockedGkStarters.length > 1) {
    warnings.push(
      "Only one goalkeeper can start — extra locked keepers were moved to the bench.",
    );
    for (const keeper of lockedGkStarters.slice(1)) {
      mustStart.delete(keeper.id);
      mustBench.add(keeper.id);
    }
  }

  // A fixed formation can seat fewer of a position than the user locked into the
  // XI. Keep the highest-projected locks and free the rest so the shape fits.
  const activeFormation = parseFormation(constraints.formation);
  if (activeFormation) {
    for (const position of POSITIONS) {
      const lockedInPos = pool
        .filter(
          (player) =>
            mustStart.has(player.id) && player.position === position,
        )
        .sort((a, b) => b.xp - a.xp);
      const allowed = activeFormation[position];
      if (lockedInPos.length <= allowed) continue;
      const demoted = lockedInPos.slice(allowed);
      warnings.push(
        `${constraints.formation} only starts ${allowed} in that position — extra locked players were freed from the XI.`,
      );
      for (const player of demoted) mustStart.delete(player.id);
    }
  }

  const lockedPlayers = pool.filter((player) => locked.has(player.id));
  const byPoints = [...pool].sort((a, b) => b.xp - a.xp);
  const byValue = [...pool].sort((a, b) => b.xp / b.price - a.xp / a.price);

  const random = mulberry32(20262027);
  const orderings: OptimizerPlayer[][] = [byValue, byPoints];
  for (let i = 0; i < restarts; i++) {
    // Rank-noised orderings explore parts of the space the two greedy starts miss.
    const noise = 0.35 + 0.5 * random();
    orderings.push(
      [...pool].sort(
        (a, b) =>
          b.xp / b.price ** noise - a.xp / a.price ** noise,
      ),
    );
  }

  let best: { squad: OptimizerPlayer[]; cost: number; score: number } | null =
    null;

  for (const ordering of orderings) {
    const working = new Working(budget, maxPerClub);
    for (const player of lockedPlayers) {
      if (working.canAdd(player)) working.add(player);
    }
    if (!construct(ordering, pool, working)) continue;
    const score = improve(working, pool, locked, constraints);
    if (!best || score > best.score) {
      best = { squad: working.snapshot(), cost: working.cost, score };
    }
  }

  if (!best) {
    warnings.push(
      "No legal squad fits these constraints — try raising the budget or removing locks.",
    );
    const empty = bestXi([]);
    return {
      ...empty,
      squad: [],
      cost: 0,
      budget,
      inTheBank: budget,
      poolSize: pool.length,
      restarts,
      warnings,
    };
  }

  if (!isLegalSquad(best.squad, maxPerClub)) {
    warnings.push("The best squad found breaks a squad rule; treat it as a guide.");
  }

  return {
    ...bestXi(best.squad, "xp", constraints),
    squad: best.squad,
    cost: best.cost,
    budget,
    inTheBank: budget - best.cost,
    poolSize: pool.length,
    restarts,
    warnings,
  };
}
