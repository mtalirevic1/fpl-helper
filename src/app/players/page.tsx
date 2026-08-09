import { HorizonPicker } from "@/components/horizon-picker";
import { PlayersTable } from "@/components/players-table";
import { PageHeader } from "@/components/ui";
import { MODEL } from "@/lib/model/config";
import { buildProjections } from "@/lib/model/projections";
import { toPlayerRow } from "@/lib/view/rows";

export const revalidate = 300;

export default async function PlayersPage({
  searchParams,
}: {
  searchParams: Promise<{ horizon?: string }>;
}) {
  const params = await searchParams;
  const horizon = Number(params.horizon) || MODEL.defaultHorizon;
  const projections = await buildProjections(horizon);

  const rows = projections.players.map(toPlayerRow);
  const teams = projections.bootstrap.teams
    .map((team) => ({
      id: team.id,
      name: team.name,
      shortName: team.short_name,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <PageHeader
        title="Players"
        description={`Every player in the game, projected over GW${projections.horizon.from}–${projections.horizon.to}. Sort by any column; hover a heading to see what it measures.`}
      >
        <HorizonPicker horizon={projections.horizon.events.length} />
      </PageHeader>

      <PlayersTable
        rows={rows}
        teams={teams}
        events={projections.horizon.events}
      />
    </>
  );
}
