import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { FixtureStrip } from "@/components/fixture-strip";
import { Card, PageHeader, PositionBadge } from "@/components/ui";
import { money, points } from "@/lib/format";
import { buildProjections } from "@/lib/model/projections";
import { pageMetadata } from "@/lib/site";

export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ event: string }>;
}): Promise<Metadata> {
  const { event } = await params;
  return pageMetadata({
    title: `GW${event} FPL captain picks`,
    description: `Top Fantasy Premier League captain picks for gameweek ${event}, ranked by projected expected points.`,
    path: `/gw/${event}/captains`,
  });
}

export default async function GwCaptainsPage({
  params,
}: {
  params: Promise<{ event: string }>;
}) {
  const { event: raw } = await params;
  const event = Number(raw);
  if (!Number.isFinite(event) || event < 1 || event > 38) notFound();

  const projections = await buildProjections(1);
  if (event < projections.season.targetEvent - 1 || event > projections.season.targetEvent + 6) {
    // Allow nearby GWs; still render using current projection window when possible.
  }

  const playable = projections.players.filter(
    (player) => player.availability > 0 && player.rates.startProbability > 0.25,
  );
  const captains = [...playable]
    .sort((a, b) => b.xpNext - a.xpNext)
    .slice(0, 15);

  return (
    <>
      <PageHeader
        title={`GW${event} captain picks`}
        description="Ranked by model expected points in the open transfer gameweek (doubles included). Use as a shortlist, not a guarantee."
      >
        <Link
          href={`/gw/${event}/transfers`}
          className="rounded-lg border border-line-strong px-3 py-1.5 text-sm hover:border-accent hover:text-accent"
        >
          Transfer targets
        </Link>
      </PageHeader>

      <Card title="Top captains" subtitle={`Projected for GW${projections.horizon.from}`}>
        <ol className="divide-y divide-line">
          {captains.map((player, index) => (
            <li key={player.id} className="flex items-center gap-3 py-3">
              <span className="w-6 text-sm tabular-nums text-ink-dim">
                {index + 1}
              </span>
              <PositionBadge position={player.position} />
              <div className="min-w-0 flex-1">
                <Link
                  href={`/players/${player.id}`}
                  className="font-medium hover:text-accent"
                >
                  {player.name}
                </Link>
                <div className="text-xs text-ink-dim">
                  {player.teamShort} · {money(player.price)} ·{" "}
                  {player.selectedByPercent.toFixed(1)}% owned
                </div>
                <p className="mt-1 text-xs text-ink-muted">
                  {player.fixtureCountNext === 0
                    ? "Blank this week — weak captaincy option."
                    : player.fixtureCountNext >= 2
                      ? `Double gameweek — ${points(player.xpNext)} xP across both fixtures.`
                      : `Single fixture outlook ${points(player.xpNext)} xP (${points(player.xpNextLow)}–${points(player.xpNextHigh)}).`}
                </p>
              </div>
              <FixtureStrip
                fixtures={player.fixtures.filter((f) => f.event === projections.horizon.from)}
                events={[projections.horizon.from]}
              />
              <div className="w-14 text-right font-semibold tabular-nums">
                {points(player.xpNext)}
              </div>
            </li>
          ))}
        </ol>
      </Card>
    </>
  );
}
