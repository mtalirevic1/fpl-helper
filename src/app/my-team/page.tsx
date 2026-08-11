import type { Metadata } from "next";
import Link from "next/link";

import { CopyButtons } from "@/components/copy-buttons";
import { HorizonPicker } from "@/components/horizon-picker";
import { SquadPitch } from "@/components/squad-pitch";
import { TeamIdForm } from "@/components/team-id-form";
import { TransferPreviewButtons } from "@/components/transfer-preview-buttons";
import {
  Badge,
  Card,
  cx,
  EmptyState,
  PageHeader,
  Stat,
} from "@/components/ui";
import { compactNumber, money, percent, points, signed } from "@/lib/format";
import { getEntry, getEntryHistory, getEntryPicks } from "@/lib/fpl/api";
import { SQUAD, TRANSFERS } from "@/lib/fpl/rules";
import { chipAvailability } from "@/lib/fpl/season";
import { MODEL } from "@/lib/model/config";
import { buildProjections } from "@/lib/model/projections";
import { buildCandidates } from "@/lib/optimizer/candidates";
import { captaincyRanking, recommendChips } from "@/lib/optimizer/chips";
import { analyseOwnership } from "@/lib/optimizer/ownership";
import { optimizeSquad } from "@/lib/optimizer/squad";
import {
  analyseSquad,
  applyTransferMoves,
  freeTransfersFor,
  type OwnedPlayer,
  planTransferHorizon,
  planTransfers,
} from "@/lib/optimizer/transfers";
import { absoluteUrl, pageMetadata } from "@/lib/site";
import { toPlayerRow } from "@/lib/view/rows";

export const revalidate = 60;

export const metadata: Metadata = pageMetadata({
  title: "FPL transfer & chip advice for your team",
  description:
    "Enter your FPL team ID for recommended transfers, captain, bench order and chip advice based on live expected points.",
  path: "/my-team",
});

function parsePreview(
  raw: string | undefined,
): Array<{ out: number; in: number }> {
  if (!raw) return [];
  return raw
    .split(",")
    .map((part) => {
      const [outRaw, inRaw] = part.split(":");
      return { out: Number(outRaw), in: Number(inRaw) };
    })
    .filter(
      (move) =>
        Number.isFinite(move.out) &&
        Number.isFinite(move.in) &&
        move.out > 0 &&
        move.in > 0,
    );
}

export default async function MyTeamPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; horizon?: string; preview?: string }>;
}) {
  const params = await searchParams;
  const entryId = Number(params.id);
  const horizon = Math.min(
    MODEL.maxHorizon,
    Math.max(1, Number(params.horizon) || MODEL.defaultHorizon),
  );
  const previewMoves = parsePreview(params.preview);

  if (!Number.isFinite(entryId) || entryId <= 0) {
    return (
      <>
        <PageHeader
          title="My team"
          description="Enter your FPL team ID to get transfer, captain, bench and chip advice for your actual squad. Nothing is stored server-side and no login is needed."
        />
        <Card title="Find your team ID">
          <TeamIdForm />
          <p className="mt-4 text-sm text-ink-muted">
            Sign in at fantasy.premierleague.com, open the Points tab, and take the
            number from the address bar — it looks like{" "}
            <code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">
              /entry/1234567/event/1
            </code>
            . The ID is <code className="text-accent">1234567</code>.
          </p>
        </Card>
      </>
    );
  }

  const projections = await buildProjections(horizon);
  const { season, byId } = projections;

  const [entry, history] = await Promise.all([
    getEntry(entryId).catch(() => null),
    getEntryHistory(entryId).catch(() => null),
  ]);

  if (!entry) {
    return (
      <>
        <PageHeader title="My team" />
        <EmptyState title={`No team found with ID ${entryId}`}>
          Check the number and try again.
        </EmptyState>
        <div className="mt-4">
          <Card title="Try another ID">
            <TeamIdForm />
          </Card>
        </div>
      </>
    );
  }

  // Picks are only published once a gameweek has started, so the most recent
  // available squad is the current gameweek's.
  const picksEvent = entry.current_event;
  const picks = picksEvent
    ? await getEntryPicks(entryId, picksEvent).catch(() => null)
    : null;

  const classicLeagues = entry.leagues?.classic?.slice(0, 6) ?? [];

  const header = (
    <PageHeader
      title={entry.name}
      description={
        <>
          {entry.player_first_name} {entry.player_last_name}
          {entry.summary_overall_points !== null && (
            <>
              {" · "}
              {entry.summary_overall_points} points
            </>
          )}
          {entry.summary_overall_rank !== null && (
            <>
              {" · "}rank {compactNumber(entry.summary_overall_rank)}
            </>
          )}
        </>
      }
    >
      <div className="flex flex-col items-end gap-2">
        <HorizonPicker horizon={horizon} />
        <TeamIdForm current={entryId} />
      </div>
    </PageHeader>
  );

  if (!picks) {
    return (
      <>
        {header}
        <EmptyState title="Your squad is not public yet">
          FPL only publishes a squad once its first gameweek has kicked off. Until
          then, use the{" "}
          <Link href="/optimizer" className="text-accent hover:underline">
            squad builder
          </Link>{" "}
          to plan your team.
        </EmptyState>
      </>
    );
  }

  const baseOwned: OwnedPlayer[] = picks.picks.map((pick) => {
    const player = byId.get(pick.element);
    return {
      id: pick.element,
      // Public picks do not expose purchase prices, so today's price is used as
      // the selling price. If you bought a player before a rise, you will have
      // slightly more to spend than shown here.
      sellingPrice: pick.selling_price ?? player?.price ?? 0,
      purchasePrice: pick.purchase_price ?? player?.price ?? 0,
      isCaptain: pick.is_captain,
      isViceCaptain: pick.is_vice_captain,
    };
  });

  const baseBank = picks.entry_history.bank;
  const freeTransfers = history
    ? freeTransfersFor(history.current, season.targetEvent, history.chips)
    : TRANSFERS.freePerGameweek;

  const candidates = projections.players.filter(
    (player) => player.availability > 0 && player.rates.startProbability >= 0.25,
  );

  const stagedMoves = previewMoves
    .map((move) => {
      const out = byId.get(move.out);
      const incoming = byId.get(move.in);
      if (!out || !incoming) return null;
      return {
        out,
        in: incoming,
        cashDelta:
          (baseOwned.find((entry) => entry.id === out.id)?.sellingPrice ??
            out.price) - incoming.price,
      };
    })
    .filter((move): move is NonNullable<typeof move> => Boolean(move));

  const staged =
    stagedMoves.length > 0
      ? applyTransferMoves(baseOwned, stagedMoves, baseBank)
      : { owned: baseOwned, bank: baseBank };
  const owned = staged.owned;
  const bank = staged.bank;
  const previewActive = stagedMoves.length > 0;

  const analysis = analyseSquad(owned, byId, bank);
  const ownership = analyseOwnership(owned, byId, projections.players);

  const { baseline, suggestions } = planTransfers(
    owned,
    byId,
    candidates,
    bank,
    {
      freeTransfers,
      maxTransfers: 2,
      limit: 8,
      horizonWeeks: horizon,
    },
  );

  const horizonPlan = planTransferHorizon(
    baseOwned,
    byId,
    candidates,
    baseBank,
    {
      freeTransfers,
      targetEvent: season.targetEvent,
      weeks: horizon,
    },
  );

  const squadPlayers = owned
    .map((entryPlayer) => byId.get(entryPlayer.id))
    .filter((player): player is NonNullable<typeof player> => Boolean(player));

  // A Wildcard is only worth it if a rebuilt squad clearly beats the current one.
  const freshSquad = optimizeSquad(
    buildCandidates(projections.players, { minStartProbability: 0.25 }),
    { budget: analysis.squadValue + bank },
  );

  const chips = recommendChips({
    lineup: analysis.lineup,
    squad: squadPlayers,
    targetEvent: season.targetEvent,
    availability: chipAvailability(
      projections.bootstrap,
      history?.chips ?? [],
    ),
    horizonScore: baseline.score,
    freshSquadScore: freshSquad.startingXp + freshSquad.weightedBenchXp,
  });

  const captains = captaincyRanking(analysis.lineup, byId);
  const currentCaptain = owned.find((player) => player.isCaptain);

  const startingXi = analysis.lineup.startingXi
    .map((player) => byId.get(player.id))
    .filter((player): player is NonNullable<typeof player> => Boolean(player))
    .map(toPlayerRow);
  const bench = analysis.lineup.bench
    .map((player) => byId.get(player.id))
    .filter((player): player is NonNullable<typeof player> => Boolean(player))
    .map(toPlayerRow);

  const squadText = [
    `XI (${analysis.lineup.formation}): ${startingXi.map((p) => p.name).join(", ")}`,
    `Bench: ${bench.map((p) => p.name).join(", ")}`,
  ].join("\n");

  const previewKeys = suggestions.slice(0, 5).map((suggestion) => ({
    key: suggestion.moves.map((move) => `${move.out.id}:${move.in.id}`).join(","),
    label:
      suggestion.moves.length === 1
        ? `Preview ${suggestion.moves[0].in.name}`
        : `Preview ${suggestion.moves.length} moves`,
  }));

  return (
    <>
      {header}

      {previewActive && (
        <div className="mb-4 rounded-xl border border-cyan/40 bg-cyan/5 px-4 py-3 text-sm text-cyan">
          Previewing staged transfers — bank {money(bank)}.{" "}
          <Link
            href={`/my-team?id=${entryId}&horizon=${horizon}`}
            className="underline hover:text-ink"
          >
            Clear preview
          </Link>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <CopyButtons
          link={absoluteUrl(
            `/my-team?id=${entryId}&horizon=${horizon}`,
          )}
          squadText={squadText}
        />
        {classicLeagues.length > 0 && (
          <div className="flex flex-wrap gap-2 text-xs">
            {classicLeagues.map((league) => (
              <Link
                key={league.id}
                href={`/leagues?league=${league.id}&id=${entryId}`}
                className="rounded-md border border-line px-2 py-1 text-ink-muted hover:text-accent"
              >
                {league.name}
              </Link>
            ))}
          </div>
        )}
        <Link
          href={`/live?id=${entryId}`}
          className="text-xs text-accent hover:underline"
        >
          Live points →
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label={`Projected GW${season.targetEvent}`}
          value={points(
            startingXi.reduce((total, player) => total + player.xpNext, 0),
          )}
          tone="accent"
          hint="Recommended XI, captain not doubled"
        />
        <Stat
          label="Squad value"
          value={money(analysis.squadValue)}
          hint={`${money(bank)} in the bank`}
        />
        <Stat
          label="Free transfers"
          value={freeTransfers}
          hint={`Up to ${TRANSFERS.maxBanked} can be banked; extras cost ${TRANSFERS.pointsHit} points`}
        />
        <Stat
          label="Flagged players"
          value={analysis.flagged.length}
          tone={analysis.flagged.length ? "warn" : "default"}
          hint={
            analysis.blanks.length
              ? `${analysis.blanks.length} without a GW${season.targetEvent} fixture`
              : "Everyone has a fixture"
          }
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card
          title={`Recommended XI for gameweek ${season.targetEvent}`}
          subtitle={`Best legal shape from your 15 for this gameweek (${analysis.lineup.formation}). Bench is ordered by projected points.`}
          className="lg:col-span-2"
        >
          <SquadPitch
            startingXi={startingXi}
            bench={bench}
            captainId={captains[0]?.id}
            viceCaptainId={captains[1]?.id}
            event={season.targetEvent}
          />
        </Card>

        <div className="space-y-4">
          <Card
            title="Captaincy"
            subtitle={`Ranked by projected points in GW${season.targetEvent}.`}
          >
            <ol className="divide-y divide-line">
              {captains.slice(0, 5).map((player, index) => (
                <li
                  key={player.id}
                  className="flex items-center gap-2 py-2 text-sm"
                >
                  <span className="w-4 tabular-nums text-ink-dim">
                    {index + 1}
                  </span>
                  <Link
                    href={`/players/${player.id}`}
                    className="font-medium hover:text-accent"
                  >
                    {player.name}
                  </Link>
                  <span className="text-xs text-ink-dim">
                    {player.teamShort}
                  </span>
                  {currentCaptain?.id === player.id && (
                    <Badge tone="accent">Current C</Badge>
                  )}
                  <span className="ml-auto font-semibold tabular-nums">
                    {points(player.xpNext)}
                  </span>
                </li>
              ))}
            </ol>
            {currentCaptain && captains[0] && currentCaptain.id !== captains[0].id && (
              <p className="mt-3 text-sm text-warn">
                Switching the armband to {captains[0].name} is worth about{" "}
                {points(
                  captains[0].xpNext -
                    (byId.get(currentCaptain.id)?.xpNext ?? 0),
                )}{" "}
                points this gameweek.
              </p>
            )}
            {captains[0] && (
              <p className="mt-2 text-xs text-ink-dim">
                Captain {captains[0].name}: highest GW{season.targetEvent}{" "}
                projection in your XI at {points(captains[0].xpNext)}.
              </p>
            )}
          </Card>

          <Card
            title="Ownership"
            subtitle="How template your squad looks versus the field."
          >
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-[11px] tracking-wider text-ink-dim uppercase">
                  Avg ownership
                </div>
                <div className="font-semibold tabular-nums">
                  {ownership.averageOwnership.toFixed(1)}%
                </div>
              </div>
              <div>
                <div className="text-[11px] tracking-wider text-ink-dim uppercase">
                  Differentials
                </div>
                <div className="font-semibold tabular-nums">
                  {ownership.differentialCount}
                  <span className="text-xs font-normal text-ink-dim">
                    {" "}
                    under 8%
                  </span>
                </div>
              </div>
            </div>
            {ownership.missingTemplate.length > 0 && (
              <div className="mt-3">
                <div className="text-[11px] tracking-wider text-ink-dim uppercase">
                  Missing from xP template
                </div>
                <ul className="mt-1 space-y-1 text-sm">
                  {ownership.missingTemplate.slice(0, 4).map((player) => (
                    <li key={player.id}>
                      <Link
                        href={`/players/${player.id}`}
                        className="hover:text-accent"
                      >
                        {player.name}
                      </Link>
                      <span className="text-xs text-ink-dim">
                        {" "}
                        · {player.selectedByPercent.toFixed(1)}% ·{" "}
                        {points(player.xpNext)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          <Card title="Chips" subtitle="Judged against this gameweek.">
            <ul className="space-y-3">
              {chips.map((chip) => (
                <li key={`${chip.chip}-${chip.label}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{chip.label}</span>
                    {chip.status === "play" && (
                      <Badge tone="accent">Play it</Badge>
                    )}
                    {chip.status === "hold" && (
                      <Badge tone="neutral">Hold</Badge>
                    )}
                    {chip.status === "used" && <Badge tone="warn">Used</Badge>}
                    {chip.status === "closed" && (
                      <Badge tone="neutral">Not this week</Badge>
                    )}
                    {chip.available && (
                      <span className="ml-auto text-sm font-semibold tabular-nums">
                        {signed(chip.gain)}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-ink-dim">{chip.reason}</p>
                  <p className="mt-1 text-xs">
                    <Link
                      href={`/optimizer?chip=${chip.chip}&budget=${
                        analysis.squadValue + bank
                      }${chip.chip === "freehit" ? "&horizon=1" : ""}`}
                      className="text-accent hover:underline"
                    >
                      Build best {chip.label} squad →
                    </Link>
                  </p>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

      <div className="mt-4">
        <Card
          title="Transfer suggestions"
          subtitle={`This week — ranked by points gained over GW${projections.horizon.from}–${projections.horizon.to} after hits. You have ${freeTransfers} free transfer${
            freeTransfers === 1 ? "" : "s"
          }.`}
          action={
            previewKeys.length > 0 ? (
              <TransferPreviewButtons previews={previewKeys} />
            ) : undefined
          }
        >
          {suggestions.length === 0 ? (
            <p className="text-sm text-ink-dim">
              No legal transfer improves your squad — hold your free transfer.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] tracking-wider text-ink-dim uppercase">
                    <th className="py-2">Move</th>
                    <th className="py-2 text-right">Cost</th>
                    <th className="py-2 text-right">Hit</th>
                    <th className="py-2 text-right">Gain</th>
                    <th className="py-2 text-right">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {suggestions.map((suggestion, index) => (
                    <tr
                      key={index}
                      className="border-b border-line/60 last:border-0"
                    >
                      <td className="py-2.5">
                        <ul className="space-y-1">
                          {suggestion.moves.map((move) => (
                            <li
                              key={`${move.out.id}-${move.in.id}`}
                              className="flex flex-wrap items-center gap-2"
                            >
                              <span className="text-danger">
                                {move.out.name}
                              </span>
                              <span className="text-ink-dim">→</span>
                              <Link
                                href={`/players/${move.in.id}`}
                                className="font-medium text-accent hover:underline"
                              >
                                {move.in.name}
                              </Link>
                              <span className="text-xs text-ink-dim">
                                {move.in.teamShort} · {money(move.in.price)} ·{" "}
                                {points(move.in.xpHorizon)} xP
                              </span>
                            </li>
                          ))}
                        </ul>
                        <p className="mt-1 text-xs text-ink-dim">
                          {suggestion.reason}
                        </p>
                      </td>
                      <td className="py-2.5 text-right tabular-nums text-ink-muted">
                        {money(suggestion.bankAfter)} left
                      </td>
                      <td className="py-2.5 text-right tabular-nums text-ink-muted">
                        {suggestion.pointsHit ? `−${suggestion.pointsHit}` : "—"}
                      </td>
                      <td className="py-2.5 text-right tabular-nums">
                        {signed(suggestion.xpGain)}
                      </td>
                      <td
                        className={cx(
                          "py-2.5 text-right font-semibold tabular-nums",
                          suggestion.netGain > 0 ? "text-accent" : "text-ink-dim",
                        )}
                      >
                        {signed(suggestion.netGain)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="mt-4 text-xs text-ink-dim">
            Your current squad projects {points(baseline.score)} points over the
            horizon on this scoring, counting the bench at a discount. Public team
            data does not expose purchase prices, so selling prices are assumed to
            equal today&apos;s price — the game gives you back your purchase price
            plus half of any profit, so your real budget may be marginally higher.
          </p>
        </Card>
      </div>

      <div className="mt-4">
        <Card
          title={`Plan next ${horizon} gameweek${horizon === 1 ? "" : "s"}`}
          subtitle={`Beam search that banks free transfers when hitting is not worth it. Cumulative net ${signed(horizonPlan.cumulativeNet)}.`}
        >
          {horizonPlan.steps.length === 0 ? (
            <p className="text-sm text-ink-dim">No multi-week plan available.</p>
          ) : (
            <ol className="space-y-3">
              {horizonPlan.steps.map((step) => (
                <li
                  key={step.event}
                  className="rounded-lg border border-line bg-surface-2/40 px-3 py-2 text-sm"
                >
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="font-semibold">GW{step.event}</span>
                    <span className="text-xs text-ink-dim">
                      FT after {step.freeTransfersAfter} · bank{" "}
                      {money(step.bankAfter)} · cum {signed(step.cumulativeNet)}
                    </span>
                  </div>
                  {step.moves.length === 0 ? (
                    <p className="mt-1 text-ink-muted">{step.reason}</p>
                  ) : (
                    <ul className="mt-1 space-y-1">
                      {step.moves.map((move) => (
                        <li key={`${step.event}-${move.out.id}-${move.in.id}`}>
                          <span className="text-danger">{move.out.name}</span>
                          {" → "}
                          <Link
                            href={`/players/${move.in.id}`}
                            className="text-accent hover:underline"
                          >
                            {move.in.name}
                          </Link>
                        </li>
                      ))}
                      <li className="text-xs text-ink-dim">{step.reason}</li>
                    </ul>
                  )}
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      {analysis.flagged.length > 0 && (
        <div className="mt-4">
          <Card title="Fitness and availability">
            <ul className="space-y-2 text-sm">
              {analysis.flagged.map((player) => (
                <li key={player.id} className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/players/${player.id}`}
                    className="font-medium hover:text-accent"
                  >
                    {player.name}
                  </Link>
                  {player.availability < 1 || player.status !== "a" ? (
                    <Badge tone={player.availability === 0 ? "danger" : "warn"}>
                      {percent(player.availability)} chance
                    </Badge>
                  ) : (
                    <Badge tone="warn">Managed minutes</Badge>
                  )}
                  <span className="text-ink-muted">
                    {player.news ||
                      player.adjustments[0]?.reason ||
                      "Flagged by FPL"}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      <div className="mt-4">
        <Card
          title="Wildcard comparison"
          subtitle={`The best squad your ${money(
            analysis.squadValue + bank,
          )} could buy, if you started again.`}
        >
          <div className="flex flex-wrap items-baseline gap-6">
            <div>
              <div className="text-[11px] tracking-wider text-ink-dim uppercase">
                Your squad
              </div>
              <div className="text-2xl font-semibold tabular-nums">
                {points(baseline.score)}
              </div>
            </div>
            <div>
              <div className="text-[11px] tracking-wider text-ink-dim uppercase">
                Rebuilt squad
              </div>
              <div className="text-2xl font-semibold tabular-nums text-accent">
                {points(freshSquad.startingXp + freshSquad.weightedBenchXp)}
              </div>
            </div>
            <div>
              <div className="text-[11px] tracking-wider text-ink-dim uppercase">
                Difference
              </div>
              <div className="text-2xl font-semibold tabular-nums">
                {signed(
                  freshSquad.startingXp +
                    freshSquad.weightedBenchXp -
                    baseline.score,
                )}
              </div>
            </div>
            <Link
              href={`/optimizer?horizon=${horizon}&budget=${analysis.squadValue + bank}`}
              className="ml-auto rounded-lg border border-line-strong px-4 py-2 text-sm font-medium hover:border-accent hover:text-accent"
            >
              Open in squad builder
            </Link>
          </div>
          <p className="mt-3 text-xs text-ink-dim">
            A Wildcard is worth playing when this gap is large and durable, not
            when it is a couple of points. The threshold used for the
            recommendation above is {MODEL.chipThresholds.wildcard} points over
            the horizon, and a full rebuild would take{" "}
            {SQUAD.size} transfers without it.
          </p>
        </Card>
      </div>
    </>
  );
}
