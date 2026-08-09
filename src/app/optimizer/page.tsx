import {
  OptimizerControls,
  type PickerPlayer,
} from "@/components/optimizer-controls";
import { SquadPitch } from "@/components/squad-pitch";
import { Badge, Card, EmptyState, PageHeader, Stat } from "@/components/ui";
import { money, points } from "@/lib/format";
import { POSITION_NAME, type PositionId, SQUAD } from "@/lib/fpl/rules";
import { MODEL } from "@/lib/model/config";
import { buildProjections } from "@/lib/model/projections";
import { buildCandidates } from "@/lib/optimizer/candidates";
import { optimizeSquad } from "@/lib/optimizer/squad";
import { toPlayerRow } from "@/lib/view/rows";

export const revalidate = 300;

function parseIds(value: string | undefined): number[] {
  if (!value) return [];
  return value
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((id) => Number.isFinite(id) && id > 0);
}

export default async function OptimizerPage({
  searchParams,
}: {
  searchParams: Promise<{
    horizon?: string;
    budget?: string;
    minStart?: string;
    lock?: string;
    ban?: string;
  }>;
}) {
  const params = await searchParams;
  const horizon = Math.min(
    MODEL.maxHorizon,
    Math.max(1, Number(params.horizon) || MODEL.defaultHorizon),
  );
  const budget = Math.max(600, Number(params.budget) || SQUAD.budgetTenths);
  const minStart = Math.min(0.9, Math.max(0, Number(params.minStart) || 0.25));
  const locked = parseIds(params.lock);
  const excluded = parseIds(params.ban);

  const projections = await buildProjections(horizon);
  const candidates = buildCandidates(projections.players, {
    minStartProbability: minStart,
  });

  const solution = optimizeSquad(candidates, {
    budget,
    locked,
    excluded,
  });

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

  const pickerPlayers: PickerPlayer[] = projections.players
    .slice(0, 400)
    .map((player) => ({
      id: player.id,
      name: player.name,
      teamShort: player.teamShort,
      position: player.position,
      price: player.price,
      xpHorizon: player.xpHorizon,
    }));

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

  return (
    <>
      <PageHeader
        title="Squad builder"
        description={`The best 15 the money can buy for GW${projections.horizon.from}–${projections.horizon.to}: maximum projected points inside the ${money(
          budget,
        )} budget, the ${SQUAD.select[1]}/${SQUAD.select[2]}/${SQUAD.select[3]}/${SQUAD.select[4]} squad split and the ${SQUAD.maxPerClub}-per-club limit.`}
      />

      <OptimizerControls
        players={pickerPlayers}
        settings={{ horizon, budget, minStart, locked, excluded }}
      />

      {solution.warnings.length > 0 && (
        <div className="mt-4 rounded-xl border border-warn/40 bg-warn/5 px-4 py-3 text-sm text-warn">
          <ul className="list-inside list-disc space-y-1">
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
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Projected XI points"
              value={points(solution.startingXp)}
              tone="accent"
              hint={`Over GW${projections.horizon.from}–${projections.horizon.to}, captain not counted`}
            />
            <Stat
              label="Squad cost"
              value={money(solution.cost)}
              hint={`${money(solution.inTheBank)} left in the bank`}
            />
            <Stat label="Formation" value={solution.formation} hint="Best legal shape for this squad" />
            <Stat
              label="Bench points"
              value={points(solution.benchXp)}
              hint="What a Bench Boost would be worth over the horizon"
            />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <Card
              title={`Suggested squad for gameweek ${projections.horizon.from}`}
              subtitle={`Captain armband goes to the highest projection for GW${projections.horizon.from}.`}
              className="lg:col-span-2"
              action={
                <Badge tone="neutral">
                  {solution.poolSize} candidates searched
                </Badge>
              }
            >
              <SquadPitch
                startingXi={startingXi}
                bench={bench}
                captainId={solution.captain?.id}
                viceCaptainId={solution.viceCaptain?.id}
                event={projections.horizon.from}
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
                  starter does not play. The search builds{" "}
                  {solution.restarts + 2} squads from different starting points
                  and improves each one with single and double swaps, keeping the
                  best. It is the best squad found rather than a mathematical
                  certificate, though with this many restarts the two rarely
                  differ.
                </p>
                <p className="mt-3 text-sm text-ink-muted">
                  Set the horizon to 1 to chase the coming gameweek, or 6–8 to
                  build for a fixture run.
                </p>
              </Card>
            </div>
          </div>
        </>
      )}
    </>
  );
}
