import Link from "next/link";
import { notFound } from "next/navigation";

import { FixtureStrip } from "@/components/fixture-strip";
import {
  Badge,
  Card,
  cx,
  Meter,
  PageHeader,
  PositionBadge,
  Stat,
} from "@/components/ui";
import {
  money,
  percent,
  points,
  shortDate,
  statusLabel,
  ukDateTime,
} from "@/lib/format";
import { getElementSummary } from "@/lib/fpl/api";
import {
  DEFENSIVE_CONTRIBUTION,
  POSITION_NAME,
  SCORING,
} from "@/lib/fpl/rules";
import { buildProjections } from "@/lib/model/projections";
import type { XpBreakdown } from "@/lib/model/xp";

export const revalidate = 300;

const BREAKDOWN_ROWS: Array<{
  key: keyof XpBreakdown;
  label: string;
  explain: string;
}> = [
  {
    key: "appearance",
    label: "Appearance",
    explain: "1 point for playing, 2 for reaching 60 minutes",
  },
  { key: "goals", label: "Goals", explain: "Expected goals × points per goal" },
  { key: "assists", label: "Assists", explain: "Expected assists × 3 points" },
  {
    key: "cleanSheet",
    label: "Clean sheet",
    explain: "Chance of a clean sheet while on the pitch for 60 minutes",
  },
  {
    key: "saves",
    label: "Saves",
    explain: "1 point per three saves",
  },
  {
    key: "penaltySaves",
    label: "Penalty saves",
    explain: "5 points per penalty saved",
  },
  {
    key: "defensiveContribution",
    label: "Defensive contribution",
    explain: "2 points for reaching the position threshold",
  },
  {
    key: "bonus",
    label: "Bonus",
    explain: "Adjusted for the 2026/27 Bonus Points System changes",
  },
  {
    key: "goalsConceded",
    label: "Goals conceded",
    explain: "-1 point for every two goals conceded",
  },
  {
    key: "negatives",
    label: "Cards and misses",
    explain: "Yellow and red cards, own goals, missed penalties",
  },
];

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const playerId = Number(id);
  if (!Number.isFinite(playerId)) notFound();

  const projections = await buildProjections();
  const player = projections.byId.get(playerId);
  if (!player) notFound();

  const summary = await getElementSummary(playerId).catch(() => null);
  const history = summary?.history ?? [];
  const pastSeasons = summary?.history_past ?? [];

  const threshold = DEFENSIVE_CONTRIBUTION.thresholds[player.position];
  const flag = statusLabel(player.status, player.news);
  const maxFixtureXp = Math.max(
    ...player.fixtures.map((fixture) => fixture.xp),
    0.01,
  );

  return (
    <>
      <PageHeader
        title={player.fullName || player.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <PositionBadge position={player.position} />
            <span>{POSITION_NAME[player.position]}</span>
            <span className="text-ink-dim">·</span>
            <span>{player.teamName}</span>
            <span className="text-ink-dim">·</span>
            <span>{money(player.price)}</span>
            <span className="text-ink-dim">·</span>
            <span>{player.selectedByPercent.toFixed(1)}% owned</span>
            {flag && (
              <Badge tone={player.availability === 0 ? "danger" : "warn"}>
                {flag}
                {player.expectedReturn
                  ? ` — projected back ${shortDate(player.expectedReturn)}`
                  : ""}
              </Badge>
            )}
            {player.adjustments.map((adjustment) => (
              <Badge key={adjustment.reason} tone="warn">
                {adjustment.reason}
              </Badge>
            ))}
          </span>
        }
      >
        <Link
          href="/players"
          className="rounded-lg border border-line-strong px-3 py-1.5 text-sm hover:border-accent hover:text-accent"
        >
          Back to players
        </Link>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label={`xP gameweek ${projections.horizon.from}`}
          value={points(player.xpNext)}
          tone="accent"
          hint={`FPL's own estimate: ${player.officialEpNext.toFixed(1)}`}
        />
        <Stat
          label={`xP GW${projections.horizon.from}–${projections.horizon.to}`}
          value={points(player.xpHorizon)}
          hint={`${points(player.xpPerFixture)} per fixture`}
        />
        <Stat
          label="Value"
          value={points(player.value, 2)}
          hint="xP over the horizon per £1.0m"
        />
        <Stat
          label="Expected minutes"
          value={points(player.breakdownNext.expectedMinutes, 0)}
          hint={`${percent(player.breakdownNext.startProbability)} chance of starting`}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card
          title={`Where the points come from`}
          subtitle={`Expected points in gameweek ${projections.horizon.from}, rule by rule.`}
          className="lg:col-span-2"
        >
          <table className="w-full text-sm">
            <tbody>
              {BREAKDOWN_ROWS.filter((row) => {
                const value = player.breakdownNext[row.key] as number;
                if (value !== 0) return true;
                // Keep rows that are meaningful for the position even at zero.
                if (row.key === "saves" || row.key === "penaltySaves") {
                  return player.position === 1;
                }
                if (row.key === "defensiveContribution") return threshold !== null;
                return false;
              }).map((row) => {
                const value = player.breakdownNext[row.key] as number;
                return (
                  <tr key={row.key} className="border-b border-line/60 last:border-0">
                    <td className="py-2.5">
                      <div className="font-medium">{row.label}</div>
                      <div className="text-xs text-ink-dim">{row.explain}</div>
                    </td>
                    <td className="w-40 py-2.5">
                      <Meter
                        value={Math.abs(value)}
                        max={Math.max(
                          ...BREAKDOWN_ROWS.map((r) =>
                            Math.abs(player.breakdownNext[r.key] as number),
                          ),
                          0.01,
                        )}
                        tone={value < 0 ? "warn" : "accent"}
                      />
                    </td>
                    <td
                      className={cx(
                        "w-20 py-2.5 text-right font-semibold tabular-nums",
                        value < 0 ? "text-danger" : "text-ink",
                      )}
                    >
                      {value >= 0 ? "" : "−"}
                      {Math.abs(value).toFixed(2)}
                    </td>
                  </tr>
                );
              })}
              <tr className="border-t border-line-strong">
                <td className="py-2.5 font-semibold">Total</td>
                <td />
                <td className="py-2.5 text-right font-semibold tabular-nums text-accent">
                  {points(player.breakdownNext.total, 2)}
                </td>
              </tr>
            </tbody>
          </table>
        </Card>

        <Card title="Underlying rates" subtitle="Per 90 minutes, blended.">
          <dl className="space-y-3 text-sm">
            <Rate
              label="Expected goals"
              value={player.rates.xG90.toFixed(2)}
              hint={`worth ${SCORING.goal[player.position]} points each`}
            />
            <Rate label="Expected assists" value={player.rates.xA90.toFixed(2)} />
            <Rate label="Bonus" value={player.rates.bonus90.toFixed(2)} />
            <Rate label="BPS" value={player.rates.bps90.toFixed(1)} />
            {threshold !== null && (
              <Rate
                label={
                  DEFENSIVE_CONTRIBUTION.countsRecoveries[player.position]
                    ? "CBIRT (defensive actions)"
                    : "CBIT (defensive actions)"
                }
                value={player.rates.defensiveActions90.toFixed(1)}
                hint={`needs ${threshold} in a match · ${percent(
                  player.breakdownNext.defensiveContributionProbability,
                )} chance`}
              />
            )}
            {player.position === 1 && (
              <Rate label="Saves" value={player.rates.saves90.toFixed(2)} />
            )}
            <Rate
              label="Yellow cards"
              value={player.rates.yellowCards90.toFixed(2)}
            />
          </dl>

          <div className="mt-4 rounded-xl border border-line bg-surface-2/50 p-3 text-xs text-ink-muted">
            {player.dataSource === "prior" ? (
              <>
                No Premier League history for this player, so the projection uses
                the average profile of players priced like them in the same
                position. Treat it as a starting point, not evidence.
              </>
            ) : player.dataSource === "previous" ? (
              <>
                Based on {projections.baselineSeason} data ({player.rates.sampleMinutes.toLocaleString()}{" "}
                minutes). Current-season form will be blended in as it accumulates.
              </>
            ) : (
              <>
                Blended from this season and {projections.baselineSeason}, with{" "}
                {player.rates.sampleMinutes.toLocaleString()} minutes of evidence.
              </>
            )}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card
          title="Upcoming fixtures"
          subtitle={`Projected points fixture by fixture over GW${projections.horizon.from}–${projections.horizon.to}.`}
        >
          <div className="mb-4">
            <FixtureStrip
              fixtures={player.fixtures}
              events={projections.horizon.events}
              showEvent
            />
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] tracking-wider text-ink-dim uppercase">
                <th className="py-2">GW</th>
                <th className="py-2">Opponent</th>
                <th className="py-2 text-right">Team xG</th>
                <th className="py-2 text-right">CS</th>
                <th className="py-2 text-right">xP</th>
              </tr>
            </thead>
            <tbody>
              {player.fixtures.map((fixture) => (
                <tr
                  key={fixture.fixtureId}
                  className="border-b border-line/60 last:border-0"
                >
                  <td className="py-2 tabular-nums">{fixture.event}</td>
                  <td className="py-2">
                    {fixture.opponentShort} {fixture.isHome ? "(H)" : "(A)"}
                    <span className="ml-2 text-xs text-ink-dim">
                      {ukDateTime(fixture.kickoff)}
                    </span>
                  </td>
                  <td className="py-2 text-right tabular-nums text-ink-muted">
                    {fixture.expectedGoalsFor.toFixed(2)}
                  </td>
                  <td className="py-2 text-right tabular-nums text-ink-muted">
                    {percent(fixture.cleanSheetProbability)}
                  </td>
                  <td className="py-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16">
                        <Meter value={fixture.xp} max={maxFixtureXp} />
                      </div>
                      <span className="w-10 font-semibold tabular-nums">
                        {fixture.xp.toFixed(1)}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card
          title="Record"
          subtitle={
            history.length
              ? "This season, gameweek by gameweek."
              : "Season totals from previous campaigns."
          }
        >
          {history.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[11px] tracking-wider text-ink-dim uppercase">
                  <th className="py-2">GW</th>
                  <th className="py-2 text-right">Min</th>
                  <th className="py-2 text-right">G</th>
                  <th className="py-2 text-right">A</th>
                  <th className="py-2 text-right">DC</th>
                  <th className="py-2 text-right">Bonus</th>
                  <th className="py-2 text-right">Pts</th>
                </tr>
              </thead>
              <tbody>
                {[...history].reverse().slice(0, 12).map((week) => (
                  <tr
                    key={`${week.round}-${week.fixture}`}
                    className="border-b border-line/60 last:border-0"
                  >
                    <td className="py-2 tabular-nums">{week.round}</td>
                    <td className="py-2 text-right tabular-nums">
                      {week.minutes}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {week.goals_scored}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {week.assists}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {week.defensive_contribution}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {week.bonus}
                    </td>
                    <td className="py-2 text-right font-semibold tabular-nums">
                      {week.total_points}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : pastSeasons.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[11px] tracking-wider text-ink-dim uppercase">
                  <th className="py-2">Season</th>
                  <th className="py-2 text-right">Min</th>
                  <th className="py-2 text-right">G</th>
                  <th className="py-2 text-right">A</th>
                  <th className="py-2 text-right">Bonus</th>
                  <th className="py-2 text-right">Pts</th>
                  <th className="py-2 text-right">End price</th>
                </tr>
              </thead>
              <tbody>
                {[...pastSeasons].reverse().map((season) => (
                  <tr
                    key={season.season_name}
                    className="border-b border-line/60 last:border-0"
                  >
                    <td className="py-2">{season.season_name}</td>
                    <td className="py-2 text-right tabular-nums">
                      {season.minutes.toLocaleString()}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {season.goals_scored}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {season.assists}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {season.bonus}
                    </td>
                    <td className="py-2 text-right font-semibold tabular-nums">
                      {season.total_points}
                    </td>
                    <td className="py-2 text-right tabular-nums text-ink-muted">
                      {money(season.end_cost)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-ink-dim">
              No Premier League record for this player yet.
            </p>
          )}
        </Card>
      </div>
    </>
  );
}

function Rate({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <div>
        <dt className="text-ink-muted">{label}</dt>
        {hint && <dd className="text-xs text-ink-dim">{hint}</dd>}
      </div>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
