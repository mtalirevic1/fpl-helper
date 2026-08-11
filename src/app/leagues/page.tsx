import type { Metadata } from "next";
import Link from "next/link";

import { Card, EmptyState, PageHeader } from "@/components/ui";
import { compactNumber } from "@/lib/format";
import {
  getClassicLeagueStandings,
  getEntry,
} from "@/lib/fpl/api";
import { pageMetadata } from "@/lib/site";

export const revalidate = 120;

export const metadata: Metadata = pageMetadata({
  title: "FPL mini-league standings",
  description:
    "Browse classic Fantasy Premier League mini-league standings and jump into any manager's squad advice.",
  path: "/leagues",
});

export default async function LeaguesPage({
  searchParams,
}: {
  searchParams: Promise<{ league?: string; id?: string; page?: string }>;
}) {
  const params = await searchParams;
  const leagueId = Number(params.league);
  const entryId = Number(params.id);
  const page = Math.max(1, Number(params.page) || 1);

  const entry =
    Number.isFinite(entryId) && entryId > 0
      ? await getEntry(entryId).catch(() => null)
      : null;

  const standings =
    Number.isFinite(leagueId) && leagueId > 0
      ? await getClassicLeagueStandings(leagueId, page).catch(() => null)
      : null;

  return (
    <>
      <PageHeader
        title="Mini-leagues"
        description="Paste a classic league ID from the FPL site. Standings are public — no login required."
      />

      <Card title="League ID">
        <form className="flex flex-wrap items-end gap-3" action="/leagues">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] tracking-wider text-ink-dim uppercase">
              Classic league ID
            </span>
            <input
              name="league"
              defaultValue={Number.isFinite(leagueId) ? String(leagueId) : ""}
              inputMode="numeric"
              placeholder="e.g. 12345"
              className="w-44 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </label>
          {Number.isFinite(entryId) && entryId > 0 && (
            <input type="hidden" name="id" value={entryId} />
          )}
          <button
            type="submit"
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-brand hover:bg-accent-dim"
          >
            Load standings
          </button>
        </form>
        {entry?.leagues?.classic && entry.leagues.classic.length > 0 && (
          <div className="mt-4">
            <div className="text-[11px] tracking-wider text-ink-dim uppercase">
              Leagues for {entry.name}
            </div>
            <ul className="mt-2 flex flex-wrap gap-2">
              {entry.leagues.classic.map((league) => (
                <li key={league.id}>
                  <Link
                    href={`/leagues?league=${league.id}&id=${entry.id}`}
                    className="rounded-md border border-line px-2.5 py-1 text-xs text-ink-muted hover:text-accent"
                  >
                    {league.name}
                    {league.entry_rank != null && (
                      <span className="text-ink-dim">
                        {" "}
                        · #{league.entry_rank}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      {Number.isFinite(leagueId) && leagueId > 0 && !standings && (
        <div className="mt-4">
          <EmptyState title="League not found">
            Check the classic league ID and try again.
          </EmptyState>
        </div>
      )}

      {standings && (
        <div className="mt-4">
          <Card
            title={standings.league.name}
            subtitle={`Page ${standings.standings.page}${
              standings.standings.has_next ? " · more available" : ""
            }`}
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] tracking-wider text-ink-dim uppercase">
                    <th className="py-2">Rank</th>
                    <th className="py-2">Team</th>
                    <th className="py-2">Manager</th>
                    <th className="py-2 text-right">GW</th>
                    <th className="py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.standings.results.map((row) => (
                    <tr
                      key={row.entry}
                      className="border-b border-line/60 last:border-0"
                    >
                      <td className="py-2 tabular-nums text-ink-dim">
                        {row.rank}
                      </td>
                      <td className="py-2">
                        <Link
                          href={`/my-team?id=${row.entry}`}
                          className="font-medium hover:text-accent"
                        >
                          {row.entry_name}
                        </Link>
                      </td>
                      <td className="py-2 text-ink-muted">{row.player_name}</td>
                      <td className="py-2 text-right tabular-nums">
                        {row.event_total}
                      </td>
                      <td className="py-2 text-right font-semibold tabular-nums">
                        {compactNumber(row.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex gap-3 text-xs">
              {page > 1 && (
                <Link
                  href={`/leagues?league=${leagueId}&page=${page - 1}${
                    Number.isFinite(entryId) ? `&id=${entryId}` : ""
                  }`}
                  className="text-accent hover:underline"
                >
                  Previous
                </Link>
              )}
              {standings.standings.has_next && (
                <Link
                  href={`/leagues?league=${leagueId}&page=${page + 1}${
                    Number.isFinite(entryId) ? `&id=${entryId}` : ""
                  }`}
                  className="text-accent hover:underline"
                >
                  Next page
                </Link>
              )}
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
