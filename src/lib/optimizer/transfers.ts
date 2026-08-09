import { type PositionId, SQUAD, TRANSFERS } from "../fpl/rules";
import { MODEL } from "../model/config";
import { round } from "../model/math";
import type { PlayerProjection } from "../model/projections";
import { bestXi, type BestXi, type OptimizerPlayer } from "./xi";

export interface OwnedPlayer {
  id: number;
  /** What the game will pay back for this player, in tenths of a million. */
  sellingPrice: number;
  purchasePrice: number;
  isCaptain: boolean;
  isViceCaptain: boolean;
}

export interface TransferMove {
  out: PlayerProjection;
  in: PlayerProjection;
  /** Money released (positive) or spent (negative), in tenths of a million. */
  cashDelta: number;
}

export interface TransferSuggestion {
  moves: TransferMove[];
  /** Transfers beyond the free ones, each costing four points. */
  hits: number;
  pointsHit: number;
  /** Expected points added across the horizon, before the hit. */
  xpGain: number;
  /** Expected points added after paying for any hits. */
  netGain: number;
  bankAfter: number;
  formationAfter: string;
}

export interface SquadAnalysis {
  /** Best XI over the whole horizon, used as the baseline for transfer plans. */
  xi: BestXi;
  /** Best XI for the target gameweek alone, which is this week's team advice. */
  lineup: BestXi;
  squadValue: number;
  bank: number;
  /** Squad members with no fixture in the target gameweek. */
  blanks: PlayerProjection[];
  /**
   * Squad members flagged as injured, doubtful or suspended, plus anyone with
   * an active manual adjustment such as a post-World Cup phased return.
   */
  flagged: PlayerProjection[];
}

function toOptimizer(player: PlayerProjection): OptimizerPlayer {
  return {
    id: player.id,
    position: player.position,
    teamId: player.teamId,
    price: player.price,
    xp: player.xpHorizon,
    xpNext: player.xpNext,
  };
}

export function analyseSquad(
  owned: OwnedPlayer[],
  byId: Map<number, PlayerProjection>,
  bank: number,
): SquadAnalysis {
  const players = owned
    .map((entry) => byId.get(entry.id))
    .filter((player): player is PlayerProjection => Boolean(player));

  const optimizerPlayers = players.map(toOptimizer);

  return {
    xi: bestXi(optimizerPlayers),
    lineup: bestXi(optimizerPlayers, "xpNext"),
    squadValue: owned.reduce((total, entry) => total + entry.sellingPrice, 0),
    bank,
    blanks: players.filter((player) => player.fixtureCountNext === 0),
    flagged: players.filter(
      (player) =>
        player.availability < 1 ||
        player.status !== "a" ||
        player.startFactorNext < 1,
    ),
  };
}

interface MoveContext {
  owned: OwnedPlayer[];
  byId: Map<number, PlayerProjection>;
  candidates: PlayerProjection[];
  bank: number;
  maxPerClub: number;
}

function clubCounts(players: PlayerProjection[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const player of players) {
    counts.set(player.teamId, (counts.get(player.teamId) ?? 0) + 1);
  }
  return counts;
}

/**
 * Every single transfer that is legal right now: same position, affordable out of
 * the bank plus the sale, and inside the three-per-club limit.
 */
function legalSingleMoves(context: MoveContext): TransferMove[] {
  const squad = context.owned
    .map((entry) => context.byId.get(entry.id))
    .filter((player): player is PlayerProjection => Boolean(player));
  const ownedIds = new Set(squad.map((player) => player.id));
  const counts = clubCounts(squad);
  const sellingPrice = new Map(
    context.owned.map((entry) => [entry.id, entry.sellingPrice]),
  );

  const moves: TransferMove[] = [];
  for (const outgoing of squad) {
    const out = sellingPrice.get(outgoing.id) ?? outgoing.price;
    for (const incoming of context.candidates) {
      if (incoming.position !== outgoing.position) continue;
      if (ownedIds.has(incoming.id)) continue;
      if (incoming.price > out + context.bank) continue;
      const clubCount =
        incoming.teamId === outgoing.teamId
          ? (counts.get(incoming.teamId) ?? 1) - 1
          : (counts.get(incoming.teamId) ?? 0);
      if (clubCount >= context.maxPerClub) continue;
      moves.push({ out: outgoing, in: incoming, cashDelta: out - incoming.price });
    }
  }
  return moves;
}

function scoreWithMoves(
  squad: PlayerProjection[],
  moves: TransferMove[],
): BestXi {
  const outgoing = new Set(moves.map((move) => move.out.id));
  const next = squad
    .filter((player) => !outgoing.has(player.id))
    .concat(moves.map((move) => move.in));
  return bestXi(next.map(toOptimizer));
}

export interface TransferPlanOptions {
  freeTransfers: number;
  maxTransfers?: number;
  /** How many suggestions to return. */
  limit?: number;
  maxPerClub?: number;
}

/**
 * Ranks transfer plans by the expected points they add over the horizon, after
 * paying four points for every transfer beyond the free ones.
 *
 * Single moves are evaluated exhaustively. Pairs are built from the best single
 * moves rather than from all combinations, which keeps the search fast while
 * still finding the "downgrade here to upgrade there" plans that matter.
 */
export function planTransfers(
  owned: OwnedPlayer[],
  byId: Map<number, PlayerProjection>,
  candidates: PlayerProjection[],
  bank: number,
  options: TransferPlanOptions,
): { baseline: BestXi; suggestions: TransferSuggestion[] } {
  const maxPerClub = options.maxPerClub ?? SQUAD.maxPerClub;
  const maxTransfers = Math.max(1, Math.min(2, options.maxTransfers ?? 2));
  const limit = options.limit ?? 8;

  const squad = owned
    .map((entry) => byId.get(entry.id))
    .filter((player): player is PlayerProjection => Boolean(player));
  const baseline = bestXi(squad.map(toOptimizer));
  const sellingPrice = new Map(
    owned.map((entry) => [entry.id, entry.sellingPrice]),
  );

  const singles = legalSingleMoves({
    owned,
    byId,
    candidates,
    bank,
    maxPerClub,
  });

  const hitCost = (transfers: number) =>
    Math.max(0, transfers - options.freeTransfers) * TRANSFERS.pointsHit;

  const evaluate = (moves: TransferMove[]): TransferSuggestion => {
    const after = scoreWithMoves(squad, moves);
    const spend = moves.reduce((total, move) => total - move.cashDelta, 0);
    const hits = Math.max(0, moves.length - options.freeTransfers);
    const xpGain = after.score - baseline.score;
    return {
      moves,
      hits,
      pointsHit: hitCost(moves.length),
      xpGain: round(xpGain, 2),
      netGain: round(xpGain - hitCost(moves.length), 2),
      bankAfter: bank - spend,
      formationAfter: after.formation,
    };
  };

  const singleSuggestions = singles
    .map((move) => evaluate([move]))
    .sort((a, b) => b.netGain - a.netGain);

  const suggestions = [...singleSuggestions];

  if (maxTransfers >= 2) {
    // Pair up the most promising single moves, including ones that lose points on
    // their own because they free up money for a bigger upgrade elsewhere.
    const byGain = singleSuggestions.slice(0, MODEL.pairSearchWidth);
    const byCash = [...singleSuggestions]
      .sort((a, b) => b.moves[0].cashDelta - a.moves[0].cashDelta)
      .slice(0, MODEL.pairSearchWidth);
    const shortlist = [...new Set([...byGain, ...byCash])];

    for (let i = 0; i < shortlist.length; i++) {
      for (let j = i + 1; j < shortlist.length; j++) {
        const a = shortlist[i].moves[0];
        const b = shortlist[j].moves[0];
        if (a.out.id === b.out.id || a.in.id === b.in.id) continue;

        const released =
          (sellingPrice.get(a.out.id) ?? a.out.price) +
          (sellingPrice.get(b.out.id) ?? b.out.price);
        if (a.in.price + b.in.price > released + bank) continue;

        const remaining = squad.filter(
          (player) => player.id !== a.out.id && player.id !== b.out.id,
        );
        const counts = clubCounts([...remaining, a.in, b.in]);
        if ([...counts.values()].some((count) => count > maxPerClub)) continue;
        const positionsOk = ([1, 2, 3, 4] as PositionId[]).every((position) => {
          const count = [...remaining, a.in, b.in].filter(
            (player) => player.position === position,
          ).length;
          return count === SQUAD.select[position];
        });
        if (!positionsOk) continue;

        suggestions.push(evaluate([a, b]));
      }
    }
  }

  const seen = new Set<string>();
  const deduped = suggestions
    .filter((suggestion) => suggestion.moves.length > 0)
    .sort((a, b) => b.netGain - a.netGain)
    .filter((suggestion) => {
      const key = suggestion.moves
        .map((move) => `${move.out.id}>${move.in.id}`)
        .sort()
        .join("|");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);

  return { baseline, suggestions: deduped };
}

/**
 * Free transfers available in the target gameweek.
 *
 * One is earned every gameweek and unused ones bank up to five. Three details
 * matter: squad changes before the Gameweek 1 deadline are unlimited, so the
 * first bankable transfer only exists from Gameweek 2; transfers made while a
 * Wildcard or Free Hit is active are free and leave the bank untouched; and
 * transfers taken as a points hit do not eat into next week's allowance, hence
 * the floor at zero before the new transfer is added.
 */
export function freeTransfersFor(
  history: Array<{ event: number; event_transfers: number }>,
  targetEvent: number,
  chipsPlayed: Array<{ name: string; event: number }> = [],
): number {
  const chipWeeks = new Set(
    chipsPlayed
      .filter((chip) => chip.name === "wildcard" || chip.name === "freehit")
      .map((chip) => chip.event),
  );

  let free: number = TRANSFERS.freePerGameweek;
  for (const week of history) {
    if (week.event <= 1 || week.event >= targetEvent) continue;
    const used = chipWeeks.has(week.event) ? 0 : week.event_transfers;
    const unused = Math.max(0, free - used);
    free = Math.min(
      TRANSFERS.maxBanked,
      unused + TRANSFERS.freePerGameweek,
    );
  }
  return Math.min(TRANSFERS.maxBanked, Math.max(1, free));
}
