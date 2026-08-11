import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

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
    title: `GW${event} FPL transfer targets`,
    description: `Differential and value Fantasy Premier League transfer targets for gameweek ${event}.`,
    path: `/gw/${event}/transfers`,
  });
}

export default async function GwTransfersPage({
  params,
}: {
  params: Promise<{ event: string }>;
}) {
  const { event: raw } = await params;
  const event = Number(raw);
  if (!Number.isFinite(event) || event < 1 || event > 38) notFound();

  const projections = await buildProjections(5);
  const playable = projections.players.filter(
    (player) => player.availability > 0 && player.rates.startProbability > 0.3,
  );

  const differentials = [...playable]
    .filter((player) => player.selectedByPercent < 8 && player.xpHorizon > 10)
    .sort((a, b) => b.xpHorizon - a.xpHorizon)
    .slice(0, 12);

  const value = [...playable]
    .filter((player) => player.xpHorizon > 8)
    .sort((a, b) => b.value - a.value)
    .slice(0, 12);

  return (
    <>
      <PageHeader
        title={`GW${event} transfer targets`}
        description={`Differentials and value picks over GW${projections.horizon.from}–${projections.horizon.to}.`}
      >
        <Link
          href={`/gw/${event}/captains`}
          className="rounded-lg border border-line-strong px-3 py-1.5 text-sm hover:border-accent hover:text-accent"
        >
          Captain picks
        </Link>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="Differentials"
          subtitle="Strong horizon projections owned by under 8%."
        >
          <PlayerList players={differentials} />
        </Card>
        <Card title="Best value" subtitle="Expected points per £1.0m.">
          <PlayerList players={value} showValue />
        </Card>
      </div>
    </>
  );
}

function PlayerList({
  players,
  showValue,
}: {
  players: Array<{
    id: number;
    name: string;
    teamShort: string;
    position: 1 | 2 | 3 | 4;
    price: number;
    xpHorizon: number;
    value: number;
    selectedByPercent: number;
  }>;
  showValue?: boolean;
}) {
  return (
    <ul className="divide-y divide-line">
      {players.map((player) => (
        <li key={player.id} className="flex items-center gap-3 py-2.5">
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
              {player.selectedByPercent.toFixed(1)}%
            </div>
          </div>
          <div className="text-right">
            <div className="font-semibold tabular-nums">
              {showValue ? points(player.value, 2) : points(player.xpHorizon)}
            </div>
            <div className="text-[11px] text-ink-dim">
              {showValue ? "xP / £m" : "xP horizon"}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
