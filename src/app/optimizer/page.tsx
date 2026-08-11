import type { Metadata } from "next";

import { CopyButtons } from "@/components/copy-buttons";
import {
  BudgetAdapter,
  OptimizerControls,
  type PickerPlayer,
} from "@/components/optimizer-controls";
import { OptimizerPitch } from "@/components/optimizer-pitch";
import { Badge, Card, EmptyState, PageHeader, Stat } from "@/components/ui";
import { money, points } from "@/lib/format";
import { getBootstrap } from "@/lib/fpl/api";
import {
  CHIP_LABEL,
  CHIPS,
  type ChipName,
  POSITION_NAME,
  type PositionId,
  parseFormation,
  SQUAD,
} from "@/lib/fpl/rules";
import { chipAvailability } from "@/lib/fpl/season";
import { MODEL } from "@/lib/model/config";
import { buildProjections } from "@/lib/model/projections";
import { buildCandidates } from "@/lib/optimizer/candidates";
import { optimizeSquad } from "@/lib/optimizer/squad";
import { absoluteUrl, pageMetadata } from "@/lib/site";
import { toPlayerRow } from "@/lib/view/rows";

export const revalidate = 300;

export const metadata: Metadata = pageMetadata({
  title: "FPL squad builder & chip optimiser",
  description:
    "Build the best FPL squad for your budget with locks, formations and chip modes for Bench Boost, Triple Captain, Free Hit and Wildcard.",
  path: "/optimizer",
});

function parseIds(value: string | undefined): number[] {
  if (!value) return [];
  return value
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((id) => Number.isFinite(id) && id > 0);
}

function parseChip(value: string | undefined): ChipName | null {
  if (!value) return null;
  return (CHIPS.names as readonly string[]).includes(value)
    ? (value as ChipName)
    : null;
}

function chipSubtitle(
  chip: ChipName | null,
  from: number,
  to: number,
): string {
  if (chip === "bboost") {
    return `Optimised for Bench Boost in GW${from}: the bench counts fully that week while the rest of GW${from}–${to} still shapes the squad.`;
  }
  if (chip === "3xc") {
    return `Optimised for Triple Captain in GW${from}: squads with a monster captain fixture that week score higher.`;
  }
  if (chip === "freehit") {
    return `Optimised for Free Hit in GW${from} only — the chip reverts after the week, so the horizon is locked to 1.`;
  }
  if (chip === "wildcard") {
    return `Wildcard mode uses the same hold-and-play objective as a normal build across GW${from}–${to}.`;
  }
  return `The best 15 the money can buy for GW${from}–${to}: maximum projected points inside the budget, the squad split and the club limit.`;
}

export default async function OptimizerPage({
  searchParams,
}: {
  searchParams: Promise<{
    horizon?: string;
    budget?: string;
    minStart?: string;
    formation?: string;
    chip?: string;
    lock?: string;
    xi?: string;
    bench?: string;
    ban?: string;
    include?: string;
    includeRole?: string;
    prior?: string;
  }>;
}) {
  const params = await searchParams;
  const chip = parseChip(params.chip);
  const requestedHorizon = Math.min(
    MODEL.maxHorizon,
    Math.max(1, Number(params.horizon) || MODEL.defaultHorizon),
  );
  // Free Hit only lasts one week, so a multi-week horizon would optimise the
  // wrong thing. Force the single-week view regardless of the URL horizon.
  const horizon = chip === "freehit" ? 1 : requestedHorizon;
  const budget = Math.max(600, Number(params.budget) || SQUAD.budgetTenths);
  const minStart = Math.min(0.9, Math.max(0, Number(params.minStart) || 0.25));
  const priorScale = Number(params.prior);
  const formationParam = params.formation?.trim() || "auto";
  const formation =
    formationParam === "auto" || parseFormation(formationParam)
      ? formationParam
      : "auto";
  const lockedStarters = parseIds(params.xi);
  const lockedBench = parseIds(params.bench);
  const locked = [
    ...new Set([
      ...parseIds(params.lock),
      ...lockedStarters,
      ...lockedBench,
    ]),
  ];
  const excluded = parseIds(params.ban);
  // Quiet "must include" from Replace — forces the pick into the 15 without
  // showing Lock badges or pinning an XI/bench role.
  const included = parseIds(params.include);
  const searchLocked = [...new Set([...locked, ...included])];

  const [projections, bootstrap] = await Promise.all([
    buildProjections(horizon, {
      priorScale: Number.isFinite(priorScale) ? priorScale : undefined,
    }),
    getBootstrap(),
  ]);
  const candidates = buildCandidates(projections.players, {
    minStartProbability: minStart,
  });

  const solution = optimizeSquad(candidates, {
    budget,
    locked: searchLocked,
    lockedStarters,
    lockedBench,
    excluded,
    formation: formation === "auto" ? null : formation,
    chip,
  });
  // Locks/replaces may force the optimiser to raise the budget; surface that
  // value in the controls and sync it back into the URL.
  const effectiveBudget = Math.max(budget, solution.budget);

  const targetEvent = projections.horizon.from;
  const availability = chipAvailability(bootstrap, []);
  const chipOpen =
    !chip ||
    availability.some(
      (entry) =>
        entry.chip === chip &&
        targetEvent >= entry.window.startEvent &&
        targetEvent <= entry.window.stopEvent,
    );
  const chipWindowHint = (() => {
    if (!chip || chipOpen) return null;
    const next = availability
      .filter((entry) => entry.chip === chip)
      .sort((a, b) => a.window.startEvent - b.window.startEvent)[0];
    return next
      ? `${CHIP_LABEL[chip]} is not playable in GW${targetEvent}. Its windows run GW${next.window.startEvent}–${next.window.stopEvent} (and the matching second-half window). The squad below is still built as if you play it.`
      : `${CHIP_LABEL[chip]} is not playable in GW${targetEvent}. The squad below is still built as if you play it.`;
  })();

  const rowFor = (id: number) => {
    const player = projections.byId.get(id);
    return player ? toPlayerRow(player) : null;
  };

  const startingXi = solution.startingXi
    .map((player) => rowFor(player.id))
    .filter((row): row is NonNullable<typeof row> => Boolean(row));
  const bench = solution.bench
    .map((player) => rowFor(player.id))
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  const pickerPlayers: PickerPlayer[] = projections.players.map((player) => ({
    id: player.id,
    name: player.name,
    teamShort: player.teamShort,
    teamId: player.teamId,
    position: player.position,
    price: player.price,
    xpHorizon: player.xpHorizon,
  }));

  const controlPlayers = pickerPlayers.slice(0, 400);

  const spendByPosition = ([1, 2, 3, 4] as PositionId[]).map((position) => {
    const inPosition = solution.squad.filter(
      (player) => player.position === position,
    );
    return {
      position,
      spend: inPosition.reduce((total, player) => total + player.price, 0),
      xp: inPosition.reduce((total, player) => total + player.xp, 0),
    };
  });

  const chipWeekBenchXp = solution.bench.reduce((total, player) => {
    const projection = projections.byId.get(player.id);
    return total + (projection?.xpNext ?? player.xpNext);
  }, 0);

  const xiPlusBench =
    solution.startingXp +
    (chip === "bboost" ? chipWeekBenchXp : solution.weightedBenchXp);

  return (
    <>
      <PageHeader
        title="Squad builder"
        description={`${chipSubtitle(
          chip,
          projections.horizon.from,
          projections.horizon.to,
        )} Pick a formation, lock players, replace anyone on the pitch, or plan a chip.`}
      />

      <BudgetAdapter requested={budget} adapted={effectiveBudget} />

      <OptimizerControls
        players={controlPlayers}
        settings={{
          horizon,
          budget: effectiveBudget,
          minStart,
          formation,
          chip,
          locked,
          lockedStarters,
          lockedBench,
          excluded,
        }}
      />

      {(solution.warnings.length > 0 || chipWindowHint) && (
        <div className="mt-4 rounded-xl border border-warn/40 bg-warn/5 px-4 py-3 text-sm text-warn">
          <ul className="list-inside list-disc space-y-1">
            {chipWindowHint && <li>{chipWindowHint}</li>}
            {solution.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      {solution.squad.length === 0 ? (
        <div className="mt-4">
          <EmptyState title="No squad fits these constraints">
            Raise the budget, lower the minimum start chance, or remove some locked
            players.
          </EmptyState>
        </div>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <CopyButtons
              link={absoluteUrl(
                `/optimizer?${new URLSearchParams(
                  Object.entries(params)
                    .filter(([, value]) => value !== undefined)
                    .map(([key, value]) => [key, String(value)]),
                ).toString()}`,
              )}
              squadText={[
                `FPL Edge squad · GW${projections.horizon.from}–${projections.horizon.to}`,
                `XI: ${startingXi.map((p) => p.name).join(", ")}`,
                `Bench: ${bench.map((p) => p.name).join(", ")}`,
                `Bank: ${money(solution.inTheBank)} · ${points(solution.startingXp)} xP XI`,
              ].join("\n")}
            />
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label={
                chip === "bboost"
                  ? "XI + chip-week bench"
                  : "Projected XI points"
              }
              value={points(
                chip === "bboost" ? xiPlusBench : solution.startingXp,
              )}
              tone="accent"
              hint={
                chip === "bboost"
                  ? `Starting XI over GW${projections.horizon.from}–${projections.horizon.to} plus full bench in GW${projections.horizon.from}`
                  : `Over GW${projections.horizon.from}–${projections.horizon.to}, captain not counted`
              }
            />
            <Stat
              label="Squad cost"
              value={money(solution.cost)}
              hint={
                solution.inTheBank < 0
                  ? `${money(-solution.inTheBank)} over the stated budget`
                  : `${money(solution.inTheBank)} left in the bank`
              }
            />
            <Stat
              label="Formation"
              value={solution.formation}
              hint={
                formation === "auto"
                  ? "Best legal shape for this squad"
                  : `Fixed to ${formation}${
                      solution.formation !== formation
                        ? " (adjusted)"
                        : ""
                    }`
              }
            />
            {chip === "3xc" ? (
              <Stat
                label="Triple Captain gain"
                value={points(solution.chipGain)}
                hint={
                  solution.captain
                    ? `Extra ×2 on ${
                        projections.byId.get(solution.captain.id)?.name ??
                        "captain"
                      } in GW${projections.horizon.from}`
                    : `Extra captain multipliers in GW${projections.horizon.from}`
                }
              />
            ) : chip === "bboost" ? (
              <Stat
                label="Chip-week bench"
                value={points(chipWeekBenchXp)}
                hint={`What Bench Boost adds in GW${projections.horizon.from} (horizon remainder still discounted in the score)`}
              />
            ) : chip === "freehit" ? (
              <Stat
                label="Free Hit week"
                value={`GW${projections.horizon.from}`}
                hint="Horizon forced to 1 because Free Hit reverts after the week"
              />
            ) : (
              <Stat
                label="Bench points"
                value={points(solution.benchXp)}
                hint="What a Bench Boost would be worth over the horizon"
              />
            )}
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <Card
              title={
                chip
                  ? `Suggested ${CHIP_LABEL[chip]} squad for gameweek ${projections.horizon.from}`
                  : `Suggested squad for gameweek ${projections.horizon.from}`
              }
              subtitle={`Captain armband goes to the highest projection for GW${projections.horizon.from}. Lock pins a spot; Replace swaps that player for another in the same position.`}
              className="lg:col-span-2"
              action={
                <Badge tone="neutral">
                  {solution.poolSize} candidates searched
                </Badge>
              }
            >
              <OptimizerPitch
                startingXi={startingXi}
                bench={bench}
                captainId={solution.captain?.id}
                viceCaptainId={solution.viceCaptain?.id}
                event={projections.horizon.from}
                locked={locked}
                lockedStarters={lockedStarters}
                lockedBench={lockedBench}
                players={pickerPlayers}
                budget={effectiveBudget}
                squadCost={solution.cost}
                excluded={excluded}
              />
            </Card>

            <div className="space-y-4">
              <Card title="Where the money went">
                <ul className="space-y-3">
                  {spendByPosition.map((entry) => (
                    <li key={entry.position}>
                      <div className="flex items-baseline justify-between text-sm">
                        <span>{POSITION_NAME[entry.position]}s</span>
                        <span className="font-semibold tabular-nums">
                          {money(entry.spend)}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                        <div
                          className="h-full rounded-full bg-accent/70"
                          style={{
                            width: `${(entry.spend / solution.cost) * 100}%`,
                          }}
                        />
                      </div>
                      <div className="mt-1 text-xs text-ink-dim">
                        {points(entry.xp)} projected points
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>

              <Card title="How this is chosen">
                <p className="text-sm text-ink-muted">
                  Squads are scored by their best legal starting XI plus a
                  discounted bench, because a bench player only scores when a
                  starter does not play
                  {chip === "bboost"
                    ? " — except under Bench Boost, when the chip week counts in full and only the rest of the horizon is discounted"
                    : ""}
                  {chip === "3xc"
                    ? ". Triple Captain adds the two extra captain multipliers for the chip week to the score"
                    : ""}
                  . The search builds {solution.restarts + 2} squads from
                  different starting points and improves each one with single and
                  double swaps, keeping the best. It is the best squad found
                  rather than a mathematical certificate, though with this many
                  restarts the two rarely differ.
                </p>
                <p className="mt-3 text-sm text-ink-muted">
                  Locking from the pitch pins a player to that role — XI or bench —
                  while the optimiser rebuilds the rest of the 15 around them.
                  Replace freezes everyone else and swaps only that slot. A fixed
                  formation scores every candidate squad as that shape, so the
                  search builds for 3-5-2 (or whatever you pick) rather than
                  whatever happens to score highest. Set the horizon to 1 to chase
                  the coming gameweek, or 6–8 to build for a fixture run
                  {chip === "freehit"
                    ? " — Free Hit overrides this and always uses a one-week horizon"
                    : ""}
                  .
                </p>
              </Card>
            </div>
          </div>
        </>
      )}
    </>
  );
}
