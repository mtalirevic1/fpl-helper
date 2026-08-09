/**
 * Sanity checks the projection model and the squad optimiser against live data.
 * Run with `npm run check`.
 *
 * This is not a unit test suite — it exists to catch the failures that actually
 * happen with this kind of app: the API changing shape, the model producing
 * nonsense for a whole position, or the optimiser returning an illegal squad.
 */

import { MANUAL_ADJUSTMENTS } from "../src/data/manual-adjustments";
import { sellPriceTenths, SQUAD } from "../src/lib/fpl/rules";
import { chipAvailability } from "../src/lib/fpl/season";
import type { FplBootstrap } from "../src/lib/fpl/types";
import {
  availabilityForFixture,
  buildAdjustmentIndex,
  parseReturnDate,
  startFactorFor,
} from "../src/lib/model/adjustments";
import { MODEL } from "../src/lib/model/config";
import { poissonTail } from "../src/lib/model/math";
import { buildProjections } from "../src/lib/model/projections";
import { buildCandidates } from "../src/lib/optimizer/candidates";
import { recommendChips } from "../src/lib/optimizer/chips";
import { optimizeSquad } from "../src/lib/optimizer/squad";
import {
  analyseSquad,
  freeTransfersFor,
  type OwnedPlayer,
  planTransfers,
} from "../src/lib/optimizer/transfers";
import { isLegalSquad, bestXi } from "../src/lib/optimizer/xi";

let failures = 0;

function check(label: string, condition: boolean, detail = "") {
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function money(tenths: number) {
  return `£${(tenths / 10).toFixed(1)}m`;
}

async function main() {
  console.log("\nDefensive contribution model calibration");
  console.log(
    "  Published 2025/26 hit rates vs the Poisson threshold model used here:",
  );
  // Source: allaboutfpl.com DEFCON analysis, August 2026. Threshold is 12 CBIRT
  // for midfielders; the published success rate is per appearance.
  const calibration: Array<[string, number, number]> = [
    ["Anderson", 13.91, 0.7027],
    ["Bentancur", 13.31, 0.5652],
    ["Ampadu", 12.0, 0.5429],
    ["Garner", 12.08, 0.5263],
    ["Rice", 10.94, 0.4],
  ];
  let worstError = 0;
  for (const [name, per90, observed] of calibration) {
    const modelled = poissonTail(12, per90);
    worstError = Math.max(worstError, Math.abs(modelled - observed));
    console.log(
      `    ${name.padEnd(10)} ${per90.toFixed(2)} CBIRT/90  model ${(
        modelled * 100
      ).toFixed(1)}%  actual ${(observed * 100).toFixed(1)}%`,
    );
  }
  check(
    "Poisson threshold model is within 15 points of published hit rates",
    worstError < 0.15,
    `worst error ${(worstError * 100).toFixed(1)} points`,
  );

  console.log("\nBuilding projections from live FPL data...");
  const projections = await buildProjections(5);
  const { season, players, horizon } = projections;

  console.log(
    `  Season state: target GW${season.targetEvent}, ${season.finishedEvents} finished, preseason=${season.isPreseason}`,
  );
  console.log(
    `  Horizon GW${horizon.from}-GW${horizon.to}, ${players.length} players, baseline season ${projections.baselineSeason}`,
  );

  check("Projections were built for every player", players.length > 500);
  check("Every gameweek in the horizon is populated", horizon.events.length === 5);
  check(
    "No player has a negative or absurd projection",
    players.every((p) => p.xpHorizon >= 0 && p.xpHorizon < 80),
  );
  check(
    "Premium attackers project above cheap defenders on average",
    (() => {
      const premium = players.filter((p) => p.position === 4 && p.price >= 90);
      const cheap = players.filter((p) => p.position === 2 && p.price <= 45);
      if (!premium.length || !cheap.length) return false;
      const avg = (list: typeof players) =>
        list.reduce((t, p) => t + p.xpHorizon, 0) / list.length;
      return avg(premium) > avg(cheap);
    })(),
  );

  const withDefcon = players.filter(
    (p) => p.position !== 1 && p.breakdownNext.defensiveContributionProbability > 0.3,
  );
  check(
    "Defensive contribution points are being awarded to defensive players",
    withDefcon.length > 20,
    `${withDefcon.length} players above a 30% hit rate`,
  );

  for (const position of [1, 2, 3, 4] as const) {
    const top = players
      .filter((p) => p.position === position)
      .slice(0, 5)
      .map((p) => `${p.name} (${p.teamShort}, ${money(p.price)}, ${p.xpHorizon})`);
    console.log(`  Top ${position}: ${top.join(", ")}`);
  }

  console.log("\nOptimising a squad...");
  const candidates = buildCandidates(players, { minStartProbability: 0.2 });
  const started = Date.now();
  const solution = optimizeSquad(candidates, {});
  const elapsed = Date.now() - started;

  console.log(
    `  searched ${solution.poolSize} players in ${elapsed}ms — ${solution.formation}, cost ${money(
      solution.cost,
    )}, XI xP ${solution.startingXp.toFixed(1)}`,
  );
  for (const player of solution.startingXi) {
    const projection = projections.byId.get(player.id)!;
    console.log(
      `    XI  ${projection.positionShort} ${projection.name.padEnd(16)} ${projection.teamShort}  ${money(
        projection.price,
      )}  ${projection.xpHorizon}`,
    );
  }
  for (const player of solution.bench) {
    const projection = projections.byId.get(player.id)!;
    console.log(
      `    SUB ${projection.positionShort} ${projection.name.padEnd(16)} ${projection.teamShort}  ${money(
        projection.price,
      )}  ${projection.xpHorizon}`,
    );
  }

  check("Squad has 15 players in a legal 2/5/5/3 split", isLegalSquad(solution.squad, SQUAD.maxPerClub));
  check(
    "Squad is within budget",
    solution.cost <= SQUAD.budgetTenths,
    money(solution.cost),
  );
  check(
    "No more than three players from one club",
    (() => {
      const counts = new Map<number, number>();
      for (const p of solution.squad) {
        counts.set(p.teamId, (counts.get(p.teamId) ?? 0) + 1);
      }
      return [...counts.values()].every((c) => c <= SQUAD.maxPerClub);
    })(),
  );
  check("Starting XI is legal", solution.startingXi.length === 11 && solution.formation !== "invalid");
  check("Solver finished quickly", elapsed < 20000, `${elapsed}ms`);
  check("A captain was chosen from the XI", solution.captain !== null);

  console.log("\nOptimising with locks and a reduced budget...");
  const lockTarget = players.find((p) => p.position === 4 && p.price >= 100);
  const constrained = optimizeSquad(candidates, {
    budget: 980,
    locked: lockTarget ? [lockTarget.id] : [],
  });
  check(
    "Locked player is in the squad",
    !lockTarget || constrained.squad.some((p) => p.id === lockTarget.id),
  );
  check(
    "Reduced budget is respected",
    constrained.cost <= 980,
    money(constrained.cost),
  );

  console.log("\nXI and bench role locks...");
  const starterLock = players.find(
    (player) => player.position === 3 && player.rates.startProbability >= 0.6,
  );
  const benchLock = players.find(
    (player) =>
      player.position === 4 &&
      player.id !== starterLock?.id &&
      player.price <= 55,
  );
  if (starterLock && benchLock) {
    const roleLocked = optimizeSquad(candidates, {
      lockedStarters: [starterLock.id],
      lockedBench: [benchLock.id],
    });
    const starterIds = new Set(roleLocked.startingXi.map((player) => player.id));
    const benchIds = new Set(roleLocked.bench.map((player) => player.id));
    console.log(
      `  locked ${starterLock.name} in XI, ${benchLock.name} on bench → formation ${roleLocked.formation}`,
    );
    check(
      "A player locked to the XI starts",
      starterIds.has(starterLock.id),
    );
    check(
      "A player locked to the bench sits",
      benchIds.has(benchLock.id),
    );
    check(
      "Role locks keep both players in the 15",
      roleLocked.squad.some((player) => player.id === starterLock.id) &&
        roleLocked.squad.some((player) => player.id === benchLock.id),
    );
  } else {
    check("Found players to exercise role locks", false);
  }

  console.log("\nFixed formation...");
  const fixed = optimizeSquad(candidates, { formation: "3-5-2" });
  const defCount = fixed.startingXi.filter((player) => player.position === 2)
    .length;
  const midCount = fixed.startingXi.filter((player) => player.position === 3)
    .length;
  const fwdCount = fixed.startingXi.filter((player) => player.position === 4)
    .length;
  console.log(
    `  forced 3-5-2 → ${fixed.formation} (${defCount}-${midCount}-${fwdCount}), XI xP ${fixed.startingXp.toFixed(1)}`,
  );
  check("A forced formation is honoured", fixed.formation === "3-5-2");
  check(
    "A 3-5-2 XI has three defenders",
    defCount === 3 && midCount === 5 && fwdCount === 2,
  );

  console.log("\nChip-aware squad scoring...");
  const plain = optimizeSquad(candidates, { budget: SQUAD.budgetTenths });
  const forBenchBoost = optimizeSquad(candidates, {
    budget: SQUAD.budgetTenths,
    chip: "bboost",
  });
  const forTripleCaptain = optimizeSquad(candidates, {
    budget: SQUAD.budgetTenths,
    chip: "3xc",
  });

  const plainBenchNext = plain.bench.reduce((total, player) => total + player.xpNext, 0);
  const bbBenchNext = forBenchBoost.bench.reduce(
    (total, player) => total + player.xpNext,
    0,
  );
  console.log(
    `  default bench GW xP ${plainBenchNext.toFixed(1)} vs Bench Boost bench GW xP ${bbBenchNext.toFixed(1)}`,
  );
  check(
    "Bench Boost squad has at least as much chip-week bench xP as the default",
    bbBenchNext + 1e-9 >= plainBenchNext,
    `${bbBenchNext.toFixed(2)} vs ${plainBenchNext.toFixed(2)}`,
  );

  const plainCaptainNext = plain.captain?.xpNext ?? 0;
  const tcCaptainNext = forTripleCaptain.captain?.xpNext ?? 0;
  console.log(
    `  default captain GW xP ${plainCaptainNext.toFixed(1)} vs Triple Captain ${tcCaptainNext.toFixed(1)}`,
  );
  check(
    "Triple Captain squad's captain has at least as much chip-week xP as the default",
    tcCaptainNext + 1e-9 >= plainCaptainNext,
    `${tcCaptainNext.toFixed(2)} vs ${plainCaptainNext.toFixed(2)}`,
  );

  if (plain.squad.length === SQUAD.size) {
    const scoredPlain = bestXi(plain.squad, "xp", {});
    const scoredAsBb = bestXi(plain.squad, "xp", { chip: "bboost" });
    const scoredAsTc = bestXi(plain.squad, "xp", { chip: "3xc" });
    check(
      "Bench Boost objective is at least the plain score for the same squad",
      scoredAsBb.score + 1e-9 >= scoredPlain.score,
      `${scoredAsBb.score.toFixed(2)} vs ${scoredPlain.score.toFixed(2)}`,
    );
    check(
      "Triple Captain objective is at least the plain score for the same squad",
      scoredAsTc.score + 1e-9 >= scoredPlain.score,
      `${scoredAsTc.score.toFixed(2)} vs ${scoredPlain.score.toFixed(2)}`,
    );
    check(
      "Chip gain matches the score uplift for Triple Captain",
      Math.abs(scoredAsTc.score - scoredPlain.score - scoredAsTc.chipGain) < 1e-6,
    );
    check(
      "Chip gain is non-negative under Bench Boost",
      scoredAsBb.chipGain >= -1e-9,
    );
  }

  console.log("\nOver-budget locks...");
  // Take the default squad and lock everyone on a budget below its cost — the
  // search must raise the budget rather than drop any of the locks.
  const frozen = solution.squad.map((player) => player.id);
  const frozenCost = solution.cost;
  const tightBudget = Math.max(600, frozenCost - 50);
  if (frozen.length === SQUAD.size && tightBudget < frozenCost) {
    const tight = optimizeSquad(candidates, {
      budget: tightBudget,
      locked: frozen,
    });
    console.log(
      `  locked full £${(frozenCost / 10).toFixed(1)}m squad on ${money(
        tightBudget,
      )} → cost ${money(tight.cost)}, budget ${money(tight.budget)}`,
    );
    check(
      "A full locked squad is kept when it blows the budget",
      frozen.every((id) => tight.squad.some((player) => player.id === id)),
    );
    check(
      "Budget adapts upward to fit a locked overspend",
      tight.budget >= frozenCost,
      money(tight.budget),
    );
  } else {
    check("Built a full squad to test over-budget locks", false);
  }

  console.log("\nSelling prices");
  // Purchase price plus half of any profit, rounded down to the nearest £0.1m.
  const sellCases: Array<[number, number, number]> = [
    [50, 50, 50],
    [50, 53, 51],
    [50, 54, 52],
    [100, 90, 90],
    [65, 70, 67],
  ];
  for (const [purchase, now, expected] of sellCases) {
    const actual = sellPriceTenths(purchase, now);
    check(
      `bought ${money(purchase)}, now ${money(now)} sells for ${money(expected)}`,
      actual === expected,
      `got ${money(actual)}`,
    );
  }

  console.log("\nFree transfer accounting");
  const ftCases: Array<{
    label: string;
    history: Array<{ event: number; event_transfers: number }>;
    target: number;
    chips?: Array<{ name: string; event: number }>;
    expected: number;
  }> = [
    { label: "no gameweeks played", history: [], target: 1, expected: 1 },
    {
      label: "gameweek 1 grants no bankable transfer",
      history: [{ event: 1, event_transfers: 0 }],
      target: 2,
      expected: 1,
    },
    {
      label: "quiet gameweeks 2 and 3 bank up to three",
      history: [1, 2, 3].map((event) => ({ event, event_transfers: 0 })),
      target: 4,
      expected: 3,
    },
    {
      label: "banked transfers cap at five",
      history: Array.from({ length: 10 }, (_, i) => ({
        event: i + 1,
        event_transfers: 0,
      })),
      target: 11,
      expected: 5,
    },
    {
      label: "taking a hit does not borrow from next week",
      history: [
        { event: 1, event_transfers: 0 },
        { event: 2, event_transfers: 4 },
      ],
      target: 3,
      expected: 1,
    },
    {
      label: "a wildcard week leaves the bank untouched",
      history: [
        { event: 1, event_transfers: 0 },
        { event: 2, event_transfers: 0 },
        { event: 3, event_transfers: 8 },
      ],
      target: 4,
      chips: [{ name: "wildcard", event: 3 }],
      expected: 3,
    },
  ];
  for (const testCase of ftCases) {
    const actual = freeTransfersFor(
      testCase.history,
      testCase.target,
      testCase.chips ?? [],
    );
    check(
      testCase.label,
      actual === testCase.expected,
      `expected ${testCase.expected}, got ${actual}`,
    );
  }

  console.log("\nInjury return dates from FPL news");
  const reference = Date.UTC(2026, 7, 9); // 9 Aug 2026
  const day = 24 * 60 * 60 * 1000;
  const returnCases: Array<[string, number | null]> = [
    ["Hamstring injury - Expected back 15 Sep", Date.UTC(2026, 8, 15, 12)],
    ["Suspended until 30 Aug", Date.UTC(2026, 7, 30, 12)],
    // A January date read in August must mean next year.
    ["Knee injury - Expected back 15 Jan", Date.UTC(2027, 0, 15, 12)],
    ["Knock - 75% chance of playing", null],
    ["", null],
  ];
  for (const [news, expected] of returnCases) {
    const actual = parseReturnDate(news, reference);
    check(
      `"${news || "(no news)"}"`,
      actual === expected,
      `expected ${expected}, got ${actual}`,
    );
  }
  check(
    "before the return date the flagged availability stands",
    availabilityForFixture(0, "i", reference + 10 * day, reference + 5 * day) === 0,
  );
  check(
    "after an injury return, availability is partially restored",
    availabilityForFixture(0, "i", reference + 10 * day, reference + 15 * day) ===
      MODEL.availabilityAfterReturn,
  );
  check(
    "after a suspension ends, availability is fully restored",
    availabilityForFixture(0, "s", reference + 10 * day, reference + 15 * day) ===
      MODEL.availabilityAfterSuspension,
  );

  console.log("\nManual adjustments (World Cup recovery, rotation)");
  const syntheticBootstrap = {
    teams: [
      { id: 1, short_name: "AVL" },
      { id: 2, short_name: "MUN" },
    ],
    elements: [
      {
        id: 11,
        team: 1,
        first_name: "Emiliano",
        second_name: "Martínez",
        web_name: "Martínez",
      },
      {
        id: 22,
        team: 2,
        first_name: "Lisandro",
        second_name: "Martínez",
        web_name: "L.Martínez",
      },
    ],
  } as unknown as FplBootstrap;
  const syntheticIndex = buildAdjustmentIndex(syntheticBootstrap, [
    { player: "Emiliano Martinez", kind: "world-cup", reason: "t", windows: [] },
    { player: "Martinez", kind: "world-cup", reason: "t", windows: [] },
    { player: "Nobody Real", kind: "world-cup", reason: "t", windows: [] },
    { player: "Martinez", team: "MUN", kind: "world-cup", reason: "t", windows: [] },
  ]);
  check(
    "a full name resolves a shared surname to one player",
    syntheticIndex.byElement.get(11)?.length === 1,
  );
  check(
    "a bare shared surname is rejected as ambiguous, not guessed",
    syntheticIndex.ambiguous.includes("Martinez"),
  );
  check(
    "an unknown name is reported, not silently dropped",
    syntheticIndex.unmatched.includes("Nobody Real"),
  );
  check(
    "a team code resolves an otherwise ambiguous surname",
    syntheticIndex.byElement.get(22)?.some((a) => a.team === "MUN") === true,
  );

  const wcWindows = [
    { fromEvent: 1, toEvent: 1, startFactor: 0.45 },
    { fromEvent: 2, toEvent: 2, startFactor: 0.7 },
  ];
  const wcAdjustment = {
    player: "x",
    kind: "world-cup" as const,
    reason: "t",
    windows: wcWindows,
  };
  check(
    "the start factor applies inside its window",
    startFactorFor([wcAdjustment], 1, false) === 0.45,
  );
  check(
    "the start factor lapses outside its window",
    startFactorFor([wcAdjustment], 5, false) === 1,
  );
  check(
    "goalkeepers are penalised more gently",
    startFactorFor([wcAdjustment], 1, true) ===
      1 - (1 - 0.45) * MODEL.keeperAdjustmentShare,
  );

  const liveIndex = buildAdjustmentIndex(
    projections.bootstrap,
    MANUAL_ADJUSTMENTS,
  );
  const matchedCount = [...liveIndex.byElement.values()].reduce(
    (total, list) => total + list.length,
    0,
  );
  console.log(
    `  ${matchedCount}/${MANUAL_ADJUSTMENTS.length} curated entries matched a player`,
  );
  if (liveIndex.unmatched.length) {
    console.log(`  unmatched: ${liveIndex.unmatched.join(", ")}`);
  }
  if (liveIndex.ambiguous.length) {
    console.log(`  ambiguous: ${liveIndex.ambiguous.join(", ")}`);
  }
  check(
    "most curated adjustments matched a live player",
    matchedCount >= MANUAL_ADJUSTMENTS.length / 2,
    `${matchedCount} of ${MANUAL_ADJUSTMENTS.length}`,
  );

  const eased = players.filter((player) => player.startFactorNext < 1);
  console.log(
    `  ${eased.length} players carry a reduced start chance in GW${horizon.from}`,
  );
  for (const player of eased.slice(0, 6)) {
    console.log(
      `    ${player.name.padEnd(16)} start factor ${player.startFactorNext}  xP GW${horizon.from} ${player.xpNext}`,
    );
  }
  check(
    "adjustments are visible in early gameweeks when the list matches",
    horizon.from > 4 || matchedCount === 0 || eased.length > 0,
  );
  check(
    "adjustments flow through to projected start probabilities",
    eased.every(
      (player) =>
        player.breakdownNext.startProbability <=
        player.rates.startProbability * player.startFactorNext + 1e-9,
    ),
  );

  const lastDeadlineMs =
    (projections.bootstrap.events.find((event) => event.id === horizon.to)
      ?.deadline_time_epoch ?? 0) * 1000;
  const returning = players.filter(
    (player) =>
      player.expectedReturn &&
      player.availability === 0 &&
      Date.parse(player.expectedReturn) < lastDeadlineMs,
  );
  for (const player of returning.slice(0, 5)) {
    console.log(
      `    ${player.name.padEnd(16)} out, back ${player.expectedReturn}: xP GW${horizon.from} ${player.xpNext}, horizon ${player.xpHorizon}`,
    );
  }
  check(
    "a player out now but returning inside the horizon still projects points",
    returning.length === 0 ||
      returning.some((player) => player.xpHorizon > player.xpNext),
    "expected at least one flagged player to score after their return date",
  );

  console.log("\nTransfer and chip advice on a synthetic squad");
  // Build a deliberately mediocre squad so there is obvious room to improve.
  const weakSquad = optimizeSquad(candidates, { budget: 880 });
  const owned: OwnedPlayer[] = weakSquad.squad.map((player) => ({
    id: player.id,
    sellingPrice: player.price,
    purchasePrice: player.price,
    isCaptain: player.id === weakSquad.captain?.id,
    isViceCaptain: player.id === weakSquad.viceCaptain?.id,
  }));
  const bank = SQUAD.budgetTenths - weakSquad.cost;

  const analysis = analyseSquad(owned, projections.byId, bank);
  const { baseline, suggestions } = planTransfers(
    owned,
    projections.byId,
    players.filter(
      (player) => player.availability > 0 && player.rates.startProbability >= 0.25,
    ),
    bank,
    { freeTransfers: 1, maxTransfers: 2, limit: 5 },
  );

  console.log(
    `  Squad worth ${money(analysis.squadValue)} with ${money(bank)} banked projects ${baseline.score.toFixed(1)}`,
  );
  for (const suggestion of suggestions) {
    console.log(
      `    ${suggestion.moves
        .map((move) => `${move.out.name} -> ${move.in.name}`)
        .join(" + ")}  gain ${suggestion.xpGain.toFixed(1)}  hit ${
        suggestion.pointsHit
      }  net ${suggestion.netGain.toFixed(1)}  bank after ${money(
        suggestion.bankAfter,
      )}`,
    );
  }

  check("Transfer suggestions were produced", suggestions.length > 0);
  check(
    "Every suggestion is a like-for-like position swap",
    suggestions.every((suggestion) =>
      suggestion.moves.every(
        (move) => move.out.position === move.in.position,
      ),
    ),
  );
  check(
    "No suggestion overspends the bank",
    suggestions.every((suggestion) => suggestion.bankAfter >= 0),
  );
  check(
    "No suggestion buys a player already owned",
    suggestions.every((suggestion) =>
      suggestion.moves.every(
        (move) => !owned.some((entry) => entry.id === move.in.id),
      ),
    ),
  );
  check(
    "No suggestion breaks the three-per-club limit",
    suggestions.every((suggestion) => {
      const outgoing = new Set(suggestion.moves.map((move) => move.out.id));
      const next = owned
        .filter((entry) => !outgoing.has(entry.id))
        .map((entry) => projections.byId.get(entry.id)!)
        .concat(suggestion.moves.map((move) => move.in));
      const counts = new Map<number, number>();
      for (const player of next) {
        counts.set(player.teamId, (counts.get(player.teamId) ?? 0) + 1);
      }
      return [...counts.values()].every((count) => count <= SQUAD.maxPerClub);
    }),
  );
  check(
    "Net gain equals raw gain minus the points hit",
    suggestions.every(
      (suggestion) =>
        Math.abs(
          suggestion.netGain - (suggestion.xpGain - suggestion.pointsHit),
        ) < 0.011,
    ),
  );
  check(
    "Suggestions are ordered by net gain",
    suggestions.every(
      (suggestion, index) =>
        index === 0 || suggestions[index - 1].netGain >= suggestion.netGain,
    ),
  );
  check(
    "A single free transfer is never charged a hit",
    suggestions
      .filter((suggestion) => suggestion.moves.length === 1)
      .every((suggestion) => suggestion.pointsHit === 0),
  );

  const syntheticSquad = owned
    .map((entry) => projections.byId.get(entry.id)!)
    .filter(Boolean);
  const chipsFor = (targetEvent: number, used: Array<{ name: string; event: number }> = []) =>
    recommendChips({
      lineup: analysis.lineup,
      squad: syntheticSquad,
      targetEvent,
      availability: chipAvailability(projections.bootstrap, used),
      horizonScore: baseline.score,
      freshSquadScore: solution.startingXp + solution.weightedBenchXp,
    });

  const chips = chipsFor(season.targetEvent);
  for (const chip of chips) {
    console.log(
      `    GW${season.targetEvent} ${chip.label.padEnd(15)} ${chip.status.padEnd(7)} worth ${chip.gain.toFixed(1)}  ${chip.reason}`,
    );
  }
  check("All four chips were assessed", chips.length === 4);
  check(
    "Chip values are finite and non-negative",
    chips.every((chip) => Number.isFinite(chip.gain) && chip.gain >= 0),
  );
  check(
    "Wildcard and Free Hit are reported as closed in Gameweek 1, not as used",
    season.targetEvent !== 1 ||
      ["wildcard", "freehit"].every(
        (name) => chips.find((chip) => chip.chip === name)?.status === "closed",
      ),
  );

  // Gameweek 5 is inside every chip window, so the recommendation logic itself
  // can be exercised there.
  const midSeasonChips = chipsFor(5);
  for (const chip of midSeasonChips) {
    console.log(
      `    GW5 ${chip.label.padEnd(15)} ${chip.status.padEnd(7)} worth ${chip.gain.toFixed(1)}  ${chip.reason}`,
    );
  }
  check(
    "A Wildcard is recommended when a rebuild clearly beats the current squad",
    midSeasonChips.find((chip) => chip.chip === "wildcard")?.status === "play",
    "the synthetic squad was built on a reduced budget so a rebuild should win",
  );
  check(
    "A chip already played in this half is reported as used",
    chipsFor(5, [{ name: "wildcard", event: 3 }]).find(
      (chip) => chip.chip === "wildcard",
    )?.status === "used",
  );
  check(
    "A chip played in the first half is available again in the second",
    chipsFor(25, [{ name: "wildcard", event: 3 }]).find(
      (chip) => chip.chip === "wildcard",
    )?.available === true,
  );

  console.log(
    failures === 0
      ? "\nAll checks passed.\n"
      : `\n${failures} check(s) failed.\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
