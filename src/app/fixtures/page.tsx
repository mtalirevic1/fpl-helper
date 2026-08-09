import { HorizonPicker } from "@/components/horizon-picker";
import { Card, cx, DifficultyPill, PageHeader } from "@/components/ui";
import { percent, ukDateTime } from "@/lib/format";
import { fixturesByTeam, fixtureView } from "@/lib/fpl/season";
import { buildProjections } from "@/lib/model/projections";

export const revalidate = 300;

export default async function FixturesPage({
  searchParams,
}: {
  searchParams: Promise<{ horizon?: string }>;
}) {
  const params = await searchParams;
  const requested = Number(params.horizon) || 6;
  const projections = await buildProjections(requested);
  const { bootstrap, fixtures, horizon, teamStrength } = projections;

  const events = horizon.events;
  const byTeam = fixturesByTeam(fixtures, horizon.from, horizon.to);

  const rows = bootstrap.teams
    .map((team) => {
      const teamFixtures = byTeam.get(team.id) ?? [];
      const model = teamStrength.teams.get(team.id);
      const expectations = teamFixtures.map((fixture) =>
        teamStrength.expectation(fixture, team.id),
      );
      const averageDifficulty = expectations.length
        ? expectations.reduce(
            (total, expectation) => total + expectation.difficulty,
            0,
          ) / expectations.length
        : 3;
      return {
        team,
        model,
        expectations,
        averageDifficulty,
        expectedGoalsFor: expectations.reduce(
          (total, expectation) => total + expectation.goalsFor,
          0,
        ),
        expectedGoalsAgainst: expectations.reduce(
          (total, expectation) => total + expectation.goalsAgainst,
          0,
        ),
        cleanSheets: expectations.reduce(
          (total, expectation) => total + expectation.cleanSheetProbability,
          0,
        ),
      };
    })
    .sort((a, b) => a.averageDifficulty - b.averageDifficulty);

  const upcoming = fixtures
    .filter(
      (fixture) =>
        fixture.event === horizon.from && !fixture.finished,
    )
    .sort((a, b) =>
      (a.kickoff_time ?? "").localeCompare(b.kickoff_time ?? ""),
    );
  const teamsById = new Map(bootstrap.teams.map((team) => [team.id, team]));

  return (
    <>
      <PageHeader
        title="Fixture ticker"
        description={`Difficulty and modelled goal expectations for GW${horizon.from}–${horizon.to}, easiest run first. Two cells in one gameweek is a double; a dash is a blank.`}
      >
        <HorizonPicker horizon={events.length} />
      </PageHeader>

      <Card
        title="Fixture difficulty by club"
        subtitle="Difficulty ratings come from FPL. Expected goals come from this app's Poisson model of team strength."
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] tracking-wider text-ink-dim uppercase">
                <th className="py-2 pr-3">Club</th>
                {events.map((event) => (
                  <th key={event} className="px-1 py-2 text-center">
                    GW{event}
                  </th>
                ))}
                <th className="px-2 py-2 text-right">Avg FDR</th>
                <th className="px-2 py-2 text-right">xG for</th>
                <th className="px-2 py-2 text-right">xG against</th>
                <th className="px-2 py-2 text-right">Clean sheets</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.team.id}
                  className="border-b border-line/60 last:border-0"
                >
                  <td className="py-2 pr-3">
                    <div className="font-medium">{row.team.name}</div>
                    <div className="text-xs text-ink-dim">
                      {row.team.short_name}
                      {row.model && row.model.matchesPlayed > 0 && (
                        <> · {row.model.matchesPlayed} played</>
                      )}
                    </div>
                  </td>
                  {events.map((event) => {
                    const inEvent = (byTeam.get(row.team.id) ?? []).filter(
                      (fixture) => fixture.event === event,
                    );
                    if (!inEvent.length) {
                      return (
                        <td key={event} className="px-1 py-2 text-center">
                          <span className="inline-flex min-w-[3.25rem] justify-center rounded-md border border-dashed border-line px-1 py-1 text-[11px] text-ink-dim">
                            —
                          </span>
                        </td>
                      );
                    }
                    return (
                      <td key={event} className="px-1 py-2">
                        <div className="flex flex-col items-center gap-0.5">
                          {inEvent.map((fixture) => {
                            const view = fixtureView(fixture, row.team.id);
                            const expectation = teamStrength.expectation(
                              fixture,
                              row.team.id,
                            );
                            return (
                              <DifficultyPill
                                key={fixture.id}
                                difficulty={view.difficulty}
                                title={`${teamsById.get(view.opponent)?.name} · difficulty ${
                                  view.difficulty
                                } · expected ${expectation.goalsFor.toFixed(
                                  2,
                                )}-${expectation.goalsAgainst.toFixed(2)}`}
                              >
                                {teamsById.get(view.opponent)?.short_name}
                                {view.isHome ? " (H)" : " (A)"}
                              </DifficultyPill>
                            );
                          })}
                        </div>
                      </td>
                    );
                  })}
                  <td
                    className={cx(
                      "px-2 py-2 text-right font-semibold tabular-nums",
                      row.averageDifficulty <= 2.5
                        ? "text-accent"
                        : row.averageDifficulty >= 3.5
                          ? "text-danger"
                          : "text-ink-muted",
                    )}
                  >
                    {row.averageDifficulty.toFixed(2)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-ink-muted">
                    {row.expectedGoalsFor.toFixed(1)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-ink-muted">
                    {row.expectedGoalsAgainst.toFixed(1)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-ink-muted">
                    {row.cleanSheets.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mt-4">
        <Card
          title={`Gameweek ${horizon.from} matches`}
          subtitle={`${upcoming.length} fixtures, with the model's expected scoreline.`}
        >
          {upcoming.length === 0 ? (
            <p className="text-sm text-ink-dim">
              Every match in this gameweek has been played.
            </p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {upcoming.map((fixture) => {
                const home = teamsById.get(fixture.team_h);
                const away = teamsById.get(fixture.team_a);
                const expectation = teamStrength.expectation(
                  fixture,
                  fixture.team_h,
                );
                return (
                  <li
                    key={fixture.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-2/50 px-3 py-2.5"
                  >
                    <div>
                      <div className="font-medium">
                        {home?.short_name} v {away?.short_name}
                      </div>
                      <div className="text-xs text-ink-dim">
                        {ukDateTime(fixture.kickoff_time)}
                      </div>
                    </div>
                    <div className="text-right text-sm">
                      <div className="font-semibold tabular-nums">
                        {expectation.goalsFor.toFixed(2)} –{" "}
                        {expectation.goalsAgainst.toFixed(2)}
                      </div>
                      <div className="text-xs text-ink-dim">
                        CS {percent(expectation.cleanSheetProbability)} /{" "}
                        {percent(Math.exp(-expectation.goalsFor))}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-4 text-xs text-ink-dim">
            Expected goals come from a Poisson model of team strength. Before the
            season it is driven by FPL&apos;s own strength ratings; real results
            then take over gradually, carrying most of the weight after about
            eight matches.
          </p>
        </Card>
      </div>
    </>
  );
}
