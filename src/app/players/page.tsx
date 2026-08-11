import type { Metadata } from "next";

import { HorizonPicker } from "@/components/horizon-picker";
import { PlayersTable } from "@/components/players-table";
import { PageHeader } from "@/components/ui";
import { getEntryPicks } from "@/lib/fpl/api";
import { MODEL } from "@/lib/model/config";
import { buildProjections } from "@/lib/model/projections";
import { pageMetadata } from "@/lib/site";
import { toPlayerRow } from "@/lib/view/rows";

export const revalidate = 300;

export const metadata: Metadata = pageMetadata({
  title: "FPL player projected points & stats",
  description:
    "Browse every Fantasy Premier League player with expected points, per-90 rates, clean-sheet odds, defensive contribution and fixture tickers.",
  path: "/players",
});

export default async function PlayersPage({
  searchParams,
}: {
  searchParams: Promise<{ horizon?: string; prior?: string; id?: string }>;
}) {
  const params = await searchParams;
  const horizon = Number(params.horizon) || MODEL.defaultHorizon;
  const priorScale = Number(params.prior);
  const projections = await buildProjections(horizon, {
    priorScale: Number.isFinite(priorScale) ? priorScale : undefined,
  });

  const rows = projections.players.map(toPlayerRow);
  const teams = projections.bootstrap.teams
    .map((team) => ({
      id: team.id,
      name: team.name,
      shortName: team.short_name,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  let myTeamIds: number[] = [];
  const entryId = Number(params.id);
  if (Number.isFinite(entryId) && entryId > 0) {
    const picks = await getEntryPicks(
      entryId,
      projections.season.targetEvent,
    ).catch(() => null);
    if (picks) myTeamIds = picks.picks.map((pick) => pick.element);
  }

  return (
    <>
      <PageHeader
        title="Players"
        description={`Every player in the game, projected over GW${projections.horizon.from}–${projections.horizon.to}. Sort by any column; hover a heading to see what it measures.${
          Number.isFinite(priorScale)
            ? ` Prior sensitivity is ${priorScale} (clamped 0.5–2).`
            : ""
        }`}
      >
        <HorizonPicker horizon={projections.horizon.events.length} />
      </PageHeader>

      <PlayersTable
        rows={rows}
        teams={teams}
        events={projections.horizon.events}
        myTeamIds={myTeamIds}
      />
    </>
  );
}
