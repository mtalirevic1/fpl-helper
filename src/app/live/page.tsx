import type { Metadata } from "next";
import Link from "next/link";

import { Card, EmptyState, PageHeader, Stat } from "@/components/ui";
import { points } from "@/lib/format";
import { getBootstrap, getEntryPicks, getLive } from "@/lib/fpl/api";
import { buildProjections } from "@/lib/model/projections";
import { pageMetadata } from "@/lib/site";

export const revalidate = 60;

export const metadata: Metadata = pageMetadata({
  title: "FPL live gameweek points",
  description:
    "Live Fantasy Premier League points and BPS from the current gameweek, with a residual versus projected xP for your squad.",
  path: "/live",
});

export default async function LivePage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const params = await searchParams;
  const entryId = Number(params.id);

  const [bootstrap, projections] = await Promise.all([
    getBootstrap(),
    buildProjections(1),
  ]);
  const event =
    bootstrap.events.find((item) => item.is_current)?.id ??
    projections.season.targetEvent;

  const live = await getLive(event).catch(() => null);
  if (!live) {
    return (
      <>
        <PageHeader title="Live points" />
        <EmptyState title="Live data unavailable">
          The FPL live feed could not be loaded. Try again shortly.
        </EmptyState>
      </>
    );
  }

  const liveById = new Map(live.elements.map((element) => [element.id, element]));
  const topLive = [...live.elements]
    .sort((a, b) => b.stats.total_points - a.stats.total_points)
    .slice(0, 15)
    .map((element) => {
      const player = projections.byId.get(element.id);
      return {
        id: element.id,
        name: player?.name ?? `#${element.id}`,
        teamShort: player?.teamShort ?? "—",
        points: element.stats.total_points,
        bps: element.stats.bps,
        bonus: element.stats.bonus,
        xpNext: player?.xpNext ?? 0,
      };
    });

  let squadRows: Array<{
    id: number;
    name: string;
    points: number;
    xpNext: number;
    multiplier: number;
    isCaptain: boolean;
  }> = [];

  if (Number.isFinite(entryId) && entryId > 0) {
    const picks = await getEntryPicks(entryId, event).catch(() => null);
    if (picks) {
      squadRows = picks.picks
        .filter((pick) => pick.multiplier > 0)
        .map((pick) => {
          const player = projections.byId.get(pick.element);
          const liveRow = liveById.get(pick.element);
          return {
            id: pick.element,
            name: player?.name ?? `#${pick.element}`,
            points: liveRow?.stats.total_points ?? 0,
            xpNext: player?.xpNext ?? 0,
            multiplier: pick.multiplier,
            isCaptain: pick.is_captain,
          };
        })
        .sort((a, b) => b.points * b.multiplier - a.points * a.multiplier);
    }
  }

  const squadLive = squadRows.reduce(
    (total, row) => total + row.points * row.multiplier,
    0,
  );
  const squadXp = squadRows.reduce(
    (total, row) => total + row.xpNext * (row.isCaptain ? 2 : 1),
    0,
  );

  return (
    <>
      <PageHeader
        title={`Live · GW${event}`}
        description="Provisional points from the FPL live feed. Bonus can still move until the gameweek is checked."
      />

      {squadRows.length > 0 && (
        <div className="mb-4 grid gap-4 sm:grid-cols-3">
          <Stat label="Your live XI" value={squadLive} tone="accent" />
          <Stat
            label="Projected (C×2)"
            value={points(squadXp)}
            hint="Pre-match xP for comparison"
          />
          <Stat
            label="Residual"
            value={points(squadLive - squadXp)}
            hint="Live minus projected"
          />
        </div>
      )}

      {squadRows.length > 0 && (
        <Card title="Your starting XI" className="mb-4">
          <ul className="divide-y divide-line text-sm">
            {squadRows.map((row) => (
              <li
                key={row.id}
                className="flex items-center gap-2 py-2"
              >
                <Link
                  href={`/players/${row.id}`}
                  className="font-medium hover:text-accent"
                >
                  {row.name}
                </Link>
                {row.isCaptain && <span className="text-xs text-accent">C</span>}
                <span className="ml-auto tabular-nums">
                  {row.points * row.multiplier}
                </span>
                <span className="w-16 text-right text-xs text-ink-dim tabular-nums">
                  xP {points(row.xpNext)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Top live scorers">
        <ul className="divide-y divide-line text-sm">
          {topLive.map((row) => (
            <li key={row.id} className="flex items-center gap-2 py-2">
              <Link
                href={`/players/${row.id}`}
                className="font-medium hover:text-accent"
              >
                {row.name}
              </Link>
              <span className="text-xs text-ink-dim">{row.teamShort}</span>
              <span className="ml-auto font-semibold tabular-nums">
                {row.points}
              </span>
              <span className="w-20 text-right text-xs text-ink-dim">
                BPS {row.bps}
                {row.bonus > 0 ? ` · B${row.bonus}` : ""}
              </span>
            </li>
          ))}
        </ul>
        {!Number.isFinite(entryId) && (
          <p className="mt-3 text-xs text-ink-dim">
            Add <code className="text-accent">?id=</code> your team ID to see
            your live XI residual versus projected points.
          </p>
        )}
      </Card>
    </>
  );
}
