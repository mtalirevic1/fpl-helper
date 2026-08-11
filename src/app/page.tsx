import Link from "next/link";
import type { Metadata } from "next";

import { ChipCalendar } from "@/components/chip-calendar";
import { DeadlineCountdown } from "@/components/deadline";
import { FixtureStrip } from "@/components/fixture-strip";
import { OpenMyTeamLink } from "@/components/open-my-team-link";
import {
  Badge,
  Card,
  cx,
  EmptyState,
  Meter,
  PageHeader,
  PositionBadge,
  Stat,
} from "@/components/ui";
import { money, percent, points, ukDateTime } from "@/lib/format";
import { buildDgwCalendar } from "@/lib/fpl/dgw-calendar";
import { POSITION_NAME, type PositionId, SEASON } from "@/lib/fpl/rules";
import { chipAvailability } from "@/lib/fpl/season";
import { MODEL } from "@/lib/model/config";
import {
  buildProjections,
  type PlayerProjection,
  type PriceTrend,
} from "@/lib/model/projections";
import { nextPriceChangeHeuristic } from "@/lib/price-deadline";
import { buildRiskDesk } from "@/lib/risk-desk";
import { pageMetadata } from "@/lib/site";

export const revalidate = 300;

export const metadata: Metadata = pageMetadata({
  title: "FPL expected points & captain picks",
  description:
    "Live Fantasy Premier League expected points, captain picks, differentials and price-change watch for the coming gameweek.",
  path: "/",
  absoluteTitle: "FPL Edge — FPL expected points & squad optimiser",
});

const TREND_LABEL: Record<PriceTrend, string> = {
  "very-likely-rise": "Very likely to rise",
  "likely-rise": "Likely to rise",
  stable: "Unlikely to change",
  "likely-fall": "Likely to drop",
  "very-likely-fall": "Very likely to drop",
};

function PlayerCell({ player }: { player: PlayerProjection }) {
  return (
    <div className="flex items-center gap-2">
      <PositionBadge position={player.position} />
      <Link
        href={`/players/${player.id}`}
        className="font-medium hover:text-accent"
      >
        {player.name}
      </Link>
      <span className="text-xs text-ink-dim">{player.teamShort}</span>
      {player.availability < 1 && (
        <Badge tone={player.availability === 0 ? "danger" : "warn"}>
          {percent(player.availability)}
        </Badge>
      )}
    </div>
  );
}

function TopPicks({
  players,
  events,
  metric,
}: {
  players: PlayerProjection[];
  events: number[];
  metric: "xpHorizon" | "value";
}) {
  const max = Math.max(...players.map((player) => player[metric]), 0.01);
  return (
    <ul className="divide-y divide-line">
      {players.map((player) => (
        <li key={player.id} className="py-2.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <PlayerCell player={player} />
            </div>
            <div className="shrink-0 text-right">
              <div className="font-semibold tabular-nums">
                {metric === "value"
                  ? points(player.value, 2)
                  : points(player.xpHorizon)}
              </div>
              <div className="text-[11px] text-ink-dim">
                {metric === "value" ? "xP per £m" : money(player.price)}
              </div>
            </div>
          </div>
          <div className="mt-1.5">
            <Meter value={player[metric]} max={max} />
          </div>
          <div className="mt-1.5 overflow-hidden">
            <FixtureStrip
              fixtures={player.fixtures.slice(0, 3)}
              events={events.slice(0, 3)}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default async function DashboardPage() {
  let projections;
  try {
    projections = await buildProjections();
  } catch {
    return (
      <>
        <PageHeader title="Dashboard" />
        <EmptyState title="FPL API unavailable">
          Live Fantasy Premier League data could not be loaded. Refresh in a
          minute — the public API is sometimes briefly down.
        </EmptyState>
      </>
    );
  }

  const { season, players, horizon, bootstrap, fixtures } = projections;

  const target = bootstrap.events.find(
    (event) => event.id === season.targetEvent,
  );
  const playable = players.filter(
    (player) => player.availability > 0 && player.rates.startProbability > 0.25,
  );

  const byPosition = ([1, 2, 3, 4] as PositionId[]).map((position) => ({
    position,
    players: playable
      .filter((player) => player.position === position)
      .slice(0, 5),
  }));

  const bestValue = [...playable]
    .filter((player) => player.xpHorizon > 8)
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const captainPicks = [...playable]
    .sort((a, b) => b.xpNext - a.xpNext)
    .slice(0, 5);

  const risers = [...players]
    .filter((player) => player.netTransfersEvent > 0)
    .sort((a, b) => b.netTransfersEvent - a.netTransfersEvent)
    .slice(0, 6);
  const fallers = [...players]
    .filter((player) => player.netTransfersEvent < 0)
    .sort((a, b) => a.netTransfersEvent - b.netTransfersEvent)
    .slice(0, 6);

  const likelyTonight = [...players]
    .filter(
      (player) =>
        player.priceTrend === "very-likely-rise" ||
        player.priceTrend === "very-likely-fall",
    )
    .sort(
      (a, b) => Math.abs(b.netTransfersEvent) - Math.abs(a.netTransfersEvent),
    )
    .slice(0, 8);

  const differentials = [...playable]
    .filter((player) => player.selectedByPercent < 8 && player.xpHorizon > 12)
    .sort((a, b) => b.xpHorizon - a.xpHorizon)
    .slice(0, 6);

  const riskDesk = buildRiskDesk(players, 8);
  const calendar = buildDgwCalendar(
    bootstrap,
    fixtures,
    horizon.from,
    Math.min(horizon.to, horizon.from + 5),
    chipAvailability(bootstrap, []),
  );
  const priceWindow = nextPriceChangeHeuristic();
  const { likely, veryLikely } = MODEL.priceShareThresholds;

  return (
    <>
      <PageHeader
        title={`Gameweek ${season.targetEvent}`}
        description={
          season.isPreseason
            ? `The ${SEASON} season has not started, so every projection is built from ${projections.baselineSeason} data, this season's prices and the published fixture list. It will start using live results automatically once matches begin.`
            : `Projections blend ${season.finishedEvents} completed gameweeks of ${SEASON} data with ${projections.baselineSeason} as a prior, and update as results come in.`
        }
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        {season.targetDeadline ? (
          <div className="rounded-2xl border border-line bg-surface/80 p-4">
            <DeadlineCountdown
              deadline={season.targetDeadline}
              label={`Deadline · ${ukDateTime(target?.deadline_time ?? null)}`}
              align="start"
            />
          </div>
        ) : (
          <div />
        )}
        <div className="rounded-2xl border border-line bg-surface/80 p-4">
          <DeadlineCountdown
            deadline={priceWindow}
            label="Price change · ~01:30 UK (approx.)"
            align="start"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Projection horizon"
          value={`GW${horizon.from}–${horizon.to}`}
          hint={`${horizon.events.length} gameweeks of fixtures`}
        />
        <Stat
          label="Players modelled"
          value={players.length}
          tone="accent"
          hint={`${playable.length} realistic starters`}
        />
        <Stat
          label="Highest projected"
          value={points(players[0]?.xpHorizon ?? 0)}
          hint={`${players[0]?.name ?? "—"} over the horizon`}
        />
        <Stat
          label="Managers playing"
          value={new Intl.NumberFormat("en-GB", { notation: "compact" }).format(
            bootstrap.total_players,
          )}
          hint={target?.average_entry_score ? `GW average ${target.average_entry_score}` : "Average score not yet set"}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card
          title={`Captain picks for GW${season.targetEvent}`}
          subtitle="Ranked by expected points in this gameweek alone, doubles included."
        >
          <ol className="divide-y divide-line">
            {captainPicks.map((player, index) => (
              <li key={player.id} className="flex items-center gap-3 py-2.5">
                <span className="w-5 text-sm tabular-nums text-ink-dim">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <PlayerCell player={player} />
                </div>
                <FixtureStrip
                  fixtures={player.fixtures.filter(
                    (fixture) => fixture.event === season.targetEvent,
                  )}
                  events={[season.targetEvent]}
                />
                <div className="w-16 text-right">
                  <div className="font-semibold tabular-nums">
                    {points(player.xpNext)}
                  </div>
                  <div className="text-[11px] text-ink-dim">xP</div>
                </div>
              </li>
            ))}
          </ol>
        </Card>

        <Card
          title="Best value"
          subtitle={`Expected points per £1.0m over GW${horizon.from}–${horizon.to}.`}
        >
          <TopPicks players={bestValue} events={horizon.events} metric="value" />
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        {byPosition.map(({ position, players: positionPlayers }) => (
          <Card
            key={position}
            title={POSITION_NAME[position]}
            subtitle={`Top projected over GW${horizon.from}–${horizon.to}`}
          >
            <TopPicks
              players={positionPlayers}
              events={horizon.events}
              metric="xpHorizon"
            />
          </Card>
        ))}
      </div>

      <div className="mt-4">
        <ChipCalendar profiles={calendar} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card
          title="Price watch"
          subtitle={`Net-transfer share thresholds: likely ±${(likely * 100).toFixed(1)}%, very likely ±${(veryLikely * 100).toFixed(1)}% of all managers.`}
          className="lg:col-span-2"
        >
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <h3 className="mb-2 text-xs font-semibold tracking-wider text-accent uppercase">
                Rising
              </h3>
              <PriceList players={risers} />
            </div>
            <div>
              <h3 className="mb-2 text-xs font-semibold tracking-wider text-danger uppercase">
                Falling
              </h3>
              <PriceList players={fallers} />
            </div>
          </div>
          <div className="mt-6">
            <h3 className="mb-2 text-xs font-semibold tracking-wider text-ink-dim uppercase">
              Likely tonight
            </h3>
            <PriceList players={likelyTonight} />
          </div>
          <p className="mt-4 text-xs text-ink-dim">
            FPL does not publish its price-change algorithm or an official price
            deadline. The countdown above is a typical ~01:30 UK window, labelled
            approximate. Rising targets vs falling owned alternatives: transfer
            now if you need the riser; wait if you can bank the faller first.
          </p>
        </Card>

        <Card
          title="Differentials"
          subtitle="Strong projections owned by under 8% of managers."
        >
          <ul className="divide-y divide-line">
            {differentials.map((player) => (
              <li key={player.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <PlayerCell player={player} />
                </div>
                <div className="text-right">
                  <div className="font-semibold tabular-nums">
                    {points(player.xpHorizon)}
                  </div>
                  <div className="text-[11px] text-ink-dim">
                    {player.selectedByPercent.toFixed(1)}% owned
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card
          title="Risk desk"
          subtitle="News and availability flags ranked by ownership × impact."
        >
          {!riskDesk.length ? (
            <p className="text-sm text-ink-dim">No flagged players right now.</p>
          ) : (
            <ul className="divide-y divide-line">
              {riskDesk.map((item) => (
                <li key={item.id} className="py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <Link
                      href={`/players/${item.id}`}
                      className="font-medium hover:text-accent"
                    >
                      {item.name}
                      <span className="ml-1.5 text-xs text-ink-dim">
                        {item.teamShort}
                      </span>
                    </Link>
                    <span className="text-xs tabular-nums text-ink-dim">
                      {item.selectedByPercent.toFixed(1)}%
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-ink-muted line-clamp-2">
                    {item.news}
                    {item.expectedReturn
                      ? ` · back ${item.expectedReturn}`
                      : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Live & leagues">
          <p className="text-sm text-ink-muted">
            Track live points during the gameweek, or paste a classic league ID
            to rank rivals by FPL score and model xP.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/live"
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-brand hover:bg-accent-dim"
            >
              Live points
            </Link>
            <Link
              href="/leagues"
              className="rounded-lg border border-line-strong px-4 py-2 text-sm font-semibold hover:border-accent hover:text-accent"
            >
              Mini-leagues
            </Link>
            <Link
              href={`/gw/${season.targetEvent}/captains`}
              className="rounded-lg border border-line-strong px-4 py-2 text-sm font-semibold hover:border-accent hover:text-accent"
            >
              GW{season.targetEvent} captains
            </Link>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Card title="Build a squad from scratch">
          <p className="text-sm text-ink-muted">
            The squad builder maximises projected points across the horizon inside
            the £100.0m budget, the 2/5/5/3 split and the three-per-club limit.
            Lock in players you have already decided on.
          </p>
          <Link
            href="/optimizer"
            className="mt-4 inline-flex rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-brand hover:bg-accent-dim"
          >
            Open squad builder
          </Link>
        </Card>
        <Card title="Already have a team?">
          <p className="text-sm text-ink-muted">
            Enter your FPL team ID and get transfer suggestions ranked by points
            gained after any hit, plus captain, bench order and chip advice.
            Team ID is stored locally as <code>fpl-edge:team-id</code>.
          </p>
          <OpenMyTeamLink className="mt-4 inline-flex rounded-lg border border-line-strong px-4 py-2 text-sm font-semibold hover:border-accent hover:text-accent">
            Open my team
          </OpenMyTeamLink>
        </Card>
      </div>
    </>
  );
}

function PriceList({ players }: { players: PlayerProjection[] }) {
  if (!players.length) {
    return (
      <p className="text-sm text-ink-dim">
        No transfer activity recorded for this gameweek yet.
      </p>
    );
  }
  const max = Math.max(
    ...players.map((player) => Math.abs(player.netTransfersEvent)),
    1,
  );
  return (
    <ul className="space-y-2">
      {players.map((player) => (
        <li key={player.id}>
          <div className="flex items-center justify-between gap-2 text-sm">
            <Link
              href={`/players/${player.id}`}
              className="truncate hover:text-accent"
            >
              {player.name}
              <span className="ml-1.5 text-xs text-ink-dim">
                {player.teamShort}
              </span>
            </Link>
            <span
              className={cx(
                "shrink-0 tabular-nums",
                player.netTransfersEvent > 0 ? "text-accent" : "text-danger",
              )}
            >
              {player.netTransfersEvent > 0 ? "+" : ""}
              {new Intl.NumberFormat("en-GB", { notation: "compact" }).format(
                player.netTransfersEvent,
              )}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <div className="flex-1">
              <Meter
                value={Math.abs(player.netTransfersEvent)}
                max={max}
                tone={player.netTransfersEvent > 0 ? "accent" : "warn"}
              />
            </div>
            <span className="w-32 shrink-0 text-right text-[10px] text-ink-dim">
              {TREND_LABEL[player.priceTrend]}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
