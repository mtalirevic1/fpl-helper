"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { getWatchlist } from "@/lib/client-storage";
import { money, percent, points, shortDate } from "@/lib/format";
import type { PositionId } from "@/lib/fpl/rules";
import type { PriceTrend } from "@/lib/model/projections";
import type { PlayerRow } from "@/lib/view/rows";

import { Badge, cx, DifficultyPill, FIXTURE_CHIP, PositionBadge } from "./ui";
import { WatchlistStar } from "./watchlist-star";

type SortKey =
  | "xpHorizon"
  | "xpNext"
  | "value"
  | "price"
  | "form"
  | "pointsPerGame"
  | "totalPoints"
  | "selectedByPercent"
  | "startProbability"
  | "xG90"
  | "xA90"
  | "defconProbability"
  | "cleanSheetProbability"
  | "officialEpNext";

const COLUMNS: Array<{
  key: SortKey;
  label: string;
  title: string;
  format: (row: PlayerRow) => string;
  positions?: PositionId[];
}> = [
  {
    key: "xpNext",
    label: "xP GW",
    title: "Projected points in the next gameweek",
    format: (row) => points(row.xpNext),
  },
  {
    key: "xpHorizon",
    label: "xP horizon",
    title: "Projected points over the whole horizon",
    format: (row) => points(row.xpHorizon),
  },
  {
    key: "value",
    label: "xP / £m",
    title: "Projected points over the horizon per £1.0m of price",
    format: (row) => points(row.value, 2),
  },
  {
    key: "price",
    label: "Price",
    title: "Current price",
    format: (row) => money(row.price),
  },
  {
    key: "startProbability",
    label: "Start",
    title: "Probability of starting the next gameweek",
    format: (row) => percent(row.startProbability),
  },
  {
    key: "xG90",
    label: "xG90",
    title: "Expected goals per 90 minutes",
    format: (row) => row.xG90.toFixed(2),
  },
  {
    key: "xA90",
    label: "xA90",
    title: "Expected assists per 90 minutes",
    format: (row) => row.xA90.toFixed(2),
  },
  {
    key: "defconProbability",
    label: "DEFCON",
    title:
      "Chance of hitting the defensive contribution threshold: 10 CBIT for defenders, 12 CBIRT for midfielders and forwards",
    format: (row) =>
      row.position === 1 ? "—" : percent(row.defconProbability),
  },
  {
    key: "cleanSheetProbability",
    label: "CS",
    title: "Clean sheet probability in the next gameweek",
    format: (row) => percent(row.cleanSheetProbability),
  },
  {
    key: "form",
    label: "Form",
    title: "FPL form: average points over the last 30 days",
    format: (row) => row.form.toFixed(1),
  },
  {
    key: "pointsPerGame",
    label: "PPG",
    title: "Points per game",
    format: (row) => row.pointsPerGame.toFixed(1),
  },
  {
    key: "totalPoints",
    label: "Pts",
    title: "Total points",
    format: (row) => String(row.totalPoints),
  },
  {
    key: "selectedByPercent",
    label: "Owned",
    title: "Percentage of managers who own this player",
    format: (row) => `${row.selectedByPercent.toFixed(1)}%`,
  },
  {
    key: "officialEpNext",
    label: "FPL xP",
    title: "FPL's own expected points for the next gameweek, for comparison",
    format: (row) => row.officialEpNext.toFixed(1),
  },
];

const POSITION_FILTERS: Array<{ value: "all" | PositionId; label: string }> = [
  { value: "all", label: "All" },
  { value: 1, label: "GKP" },
  { value: 2, label: "DEF" },
  { value: 3, label: "MID" },
  { value: 4, label: "FWD" },
];

export function PlayersTable({
  rows,
  teams,
  events,
  myTeamIds = [],
}: {
  rows: PlayerRow[];
  teams: Array<{ id: number; name: string; shortName: string }>;
  events: number[];
  /** Element IDs currently in the stored / queried FPL squad. */
  myTeamIds?: number[];
}) {
  // FPL prices are in tenths of a million. The ceiling must come from live data
  // so premiums above a hardcoded £15.0m cap (e.g. Haaland at £15.5m) stay
  // selectable when the slider is at its maximum.
  const priceCeiling = useMemo(() => {
    const highest = rows.reduce((max, row) => Math.max(max, row.price), 0);
    return Math.max(150, highest);
  }, [rows]);
  const priceFloor = useMemo(() => {
    if (!rows.length) return 38;
    return Math.min(38, ...rows.map((row) => row.price));
  }, [rows]);

  const [search, setSearch] = useState("");
  const [position, setPosition] = useState<"all" | PositionId>("all");
  const [team, setTeam] = useState<"all" | number>("all");
  // null means "no user override" — track the live ceiling so the default
  // always includes every player, including the most expensive.
  const [maxPriceOverride, setMaxPriceOverride] = useState<number | null>(null);
  const maxPrice = maxPriceOverride ?? priceCeiling;
  const [hideUnavailable, setHideUnavailable] = useState(true);
  const [minStart, setMinStart] = useState(0);
  const [maxOwnership, setMaxOwnership] = useState(100);
  const [priceTrend, setPriceTrend] = useState<"all" | PriceTrend>("all");
  const [fixtureFilter, setFixtureFilter] = useState<
    "all" | "blank" | "double"
  >("all");
  const [excludeMyTeam, setExcludeMyTeam] = useState(false);
  const [watchlistOnly, setWatchlistOnly] = useState(false);
  const [watchlist, setWatchlist] = useState<number[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("xpHorizon");
  const [ascending, setAscending] = useState(false);
  const [limit, setLimit] = useState(60);

  useEffect(() => {
    const sync = () => setWatchlist(getWatchlist());
    sync();
    window.addEventListener("fpl-edge-watchlist", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("fpl-edge-watchlist", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const owned = useMemo(() => new Set(myTeamIds), [myTeamIds]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const watch = new Set(watchlist);
    const result = rows.filter((row) => {
      if (position !== "all" && row.position !== position) return false;
      if (team !== "all" && row.teamId !== team) return false;
      if (row.price > maxPrice) return false;
      if (hideUnavailable && row.availability <= 0) return false;
      if (row.startProbability < minStart) return false;
      if (row.selectedByPercent > maxOwnership) return false;
      if (priceTrend !== "all" && row.priceTrend !== priceTrend) return false;
      if (fixtureFilter === "blank" && row.fixtureCountNext !== 0) return false;
      if (fixtureFilter === "double" && row.fixtureCountNext < 2) return false;
      if (excludeMyTeam && owned.has(row.id)) return false;
      if (watchlistOnly && !watch.has(row.id)) return false;
      if (term && !`${row.name} ${row.teamShort}`.toLowerCase().includes(term)) {
        return false;
      }
      return true;
    });

    result.sort((a, b) => {
      const delta = a[sortKey] - b[sortKey];
      return ascending ? delta : -delta;
    });
    return result;
  }, [
    rows,
    search,
    position,
    team,
    maxPrice,
    hideUnavailable,
    minStart,
    maxOwnership,
    priceTrend,
    fixtureFilter,
    excludeMyTeam,
    watchlistOnly,
    watchlist,
    owned,
    sortKey,
    ascending,
  ]);

  const visible = filtered.slice(0, limit);

  const sortBy = (key: SortKey) => {
    if (key === sortKey) {
      setAscending((previous) => !previous);
    } else {
      setSortKey(key);
      setAscending(false);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-line bg-surface/80 p-4">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] tracking-wider text-ink-dim uppercase">
            Search
          </span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Player or club"
            className="w-44 rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-sm outline-none focus:border-accent"
          />
        </label>

        <div className="flex flex-col gap-1">
          <span className="text-[11px] tracking-wider text-ink-dim uppercase">
            Position
          </span>
          <div className="flex rounded-lg border border-line bg-surface-2 p-0.5">
            {POSITION_FILTERS.map((option) => (
              <button
                key={String(option.value)}
                type="button"
                onClick={() => setPosition(option.value)}
                className={cx(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  position === option.value
                    ? "bg-accent text-brand"
                    : "text-ink-muted hover:text-ink",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] tracking-wider text-ink-dim uppercase">
            Club
          </span>
          <select
            value={String(team)}
            onChange={(event) =>
              setTeam(
                event.target.value === "all"
                  ? "all"
                  : Number(event.target.value),
              )
            }
            className="w-40 rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-accent"
          >
            <option value="all">All clubs</option>
            {teams.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] tracking-wider text-ink-dim uppercase">
            Max price {money(maxPrice)}
          </span>
          <input
            type="range"
            min={priceFloor}
            max={priceCeiling}
            step={1}
            value={Math.min(maxPrice, priceCeiling)}
            onChange={(event) => setMaxPriceOverride(Number(event.target.value))}
            className="w-36 accent-[color:var(--color-accent)]"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] tracking-wider text-ink-dim uppercase">
            Min start chance {percent(minStart)}
          </span>
          <input
            type="range"
            min={0}
            max={0.9}
            step={0.05}
            value={minStart}
            onChange={(event) => setMinStart(Number(event.target.value))}
            className="w-36 accent-[color:var(--color-accent)]"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] tracking-wider text-ink-dim uppercase">
            Max ownership {maxOwnership}%
          </span>
          <input
            type="range"
            min={1}
            max={100}
            step={1}
            value={maxOwnership}
            onChange={(event) => setMaxOwnership(Number(event.target.value))}
            className="w-36 accent-[color:var(--color-accent)]"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] tracking-wider text-ink-dim uppercase">
            Price trend
          </span>
          <select
            value={priceTrend}
            onChange={(event) =>
              setPriceTrend(event.target.value as "all" | PriceTrend)
            }
            className="w-40 rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-accent"
          >
            <option value="all">Any</option>
            <option value="very-likely-rise">Very likely rise</option>
            <option value="likely-rise">Likely rise</option>
            <option value="stable">Stable</option>
            <option value="likely-fall">Likely fall</option>
            <option value="very-likely-fall">Very likely fall</option>
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] tracking-wider text-ink-dim uppercase">
            Next fixtures
          </span>
          <select
            value={fixtureFilter}
            onChange={(event) =>
              setFixtureFilter(
                event.target.value as "all" | "blank" | "double",
              )
            }
            className="w-36 rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-accent"
          >
            <option value="all">Any</option>
            <option value="blank">Blank next</option>
            <option value="double">Double next</option>
          </select>
        </label>

        <label className="flex items-center gap-2 text-sm text-ink-muted">
          <input
            type="checkbox"
            checked={hideUnavailable}
            onChange={(event) => setHideUnavailable(event.target.checked)}
            className="size-4 accent-[color:var(--color-accent)]"
          />
          Hide unavailable
        </label>

        <label className="flex items-center gap-2 text-sm text-ink-muted">
          <input
            type="checkbox"
            checked={excludeMyTeam}
            onChange={(event) => setExcludeMyTeam(event.target.checked)}
            className="size-4 accent-[color:var(--color-accent)]"
            disabled={!myTeamIds.length}
          />
          Exclude my team
        </label>

        <label className="flex items-center gap-2 text-sm text-ink-muted">
          <input
            type="checkbox"
            checked={watchlistOnly}
            onChange={(event) => setWatchlistOnly(event.target.checked)}
            className="size-4 accent-[color:var(--color-accent)]"
          />
          Watchlist only
        </label>

        <div className="ml-auto text-sm text-ink-muted">
          {filtered.length} players
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-line bg-surface/80">
        <table className="w-full min-w-[1100px] text-sm xl:min-w-0">
          <thead>
            <tr className="border-b border-line text-left">
              <th className="px-3 py-3 text-[11px] font-semibold tracking-wider text-ink-dim uppercase xl:px-2">
                Player
              </th>
              <th className="px-1.5 py-3 text-[11px] font-semibold tracking-wider text-ink-dim uppercase">
                Next fixtures
              </th>
              {COLUMNS.map((column) => (
                <th
                  key={column.key}
                  title={column.title}
                  className="px-1.5 py-3 text-right xl:px-1"
                >
                  <button
                    type="button"
                    onClick={() => sortBy(column.key)}
                    className={cx(
                      "text-[11px] font-semibold tracking-wider uppercase transition-colors",
                      sortKey === column.key
                        ? "text-accent"
                        : "text-ink-dim hover:text-ink",
                    )}
                  >
                    {column.label}
                    {sortKey === column.key && (ascending ? " ↑" : " ↓")}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr
                key={row.id}
                className="border-b border-line/60 last:border-0 hover:bg-surface-2/50"
              >
                <td className="px-3 py-2.5 xl:px-2">
                  <div className="flex items-center gap-1.5">
                    <WatchlistStar playerId={row.id} />
                    <PositionBadge position={row.position} />
                    <Link
                      href={`/players/${row.id}`}
                      className="font-medium hover:text-accent"
                    >
                      {row.name}
                    </Link>
                    <span className="text-xs text-ink-dim">{row.teamShort}</span>
                    {row.availability <= 0 && (
                      <Badge
                        tone="danger"
                        title={
                          row.expectedReturn
                            ? `${row.news} — projections resume from ${row.expectedReturn}`
                            : row.news
                        }
                      >
                        {row.expectedReturn
                          ? `Out until ${shortDate(row.expectedReturn)}`
                          : "Out"}
                      </Badge>
                    )}
                    {row.availability > 0 && row.availability < 1 && (
                      <Badge tone="warn" title={row.news}>
                        {percent(row.availability)}
                      </Badge>
                    )}
                    {row.adjustments.length > 0 && row.startFactorNext < 1 && (
                      <Badge tone="warn" title={row.adjustments.join(" · ")}>
                        Eased in
                      </Badge>
                    )}
                    {row.dataSource === "prior" && (
                      <Badge
                        tone="info"
                        title="No Premier League history: projected from players priced similarly in the same position"
                      >
                        No history
                      </Badge>
                    )}
                  </div>
                </td>
                <td className="px-1.5 py-2.5">
                  <div className="flex items-start gap-0.5 xl:gap-1">
                    {events.slice(0, 5).map((event) => {
                      const inEvent = row.fixtures.filter(
                        (fixture) => fixture.event === event,
                      );
                      if (!inEvent.length) {
                        return (
                          <span
                            key={event}
                            title={`No fixture in GW${event}`}
                            className={cx(
                              FIXTURE_CHIP,
                              "border border-dashed border-line font-normal text-ink-dim",
                            )}
                          >
                            —
                          </span>
                        );
                      }
                      return (
                        <span key={event} className="flex flex-col gap-0.5">
                          {inEvent.map((fixture, index) => (
                            <DifficultyPill
                              key={index}
                              difficulty={fixture.difficulty}
                              title={`GW${fixture.event} · difficulty ${fixture.difficulty} · ${fixture.xp} xP`}
                            >
                              {fixture.opponentShort}
                              {fixture.isHome ? " (H)" : " (A)"}
                            </DifficultyPill>
                          ))}
                        </span>
                      );
                    })}
                  </div>
                </td>
                {COLUMNS.map((column) => (
                  <td
                    key={column.key}
                    className={cx(
                      "px-1.5 py-2.5 text-right tabular-nums whitespace-nowrap xl:px-1",
                      column.key === sortKey ? "text-accent" : "text-ink-muted",
                    )}
                  >
                    {column.format(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {limit < filtered.length && (
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => setLimit((previous) => previous + 60)}
            className="rounded-lg border border-line-strong px-4 py-2 text-sm font-medium hover:border-accent hover:text-accent"
          >
            Show more ({filtered.length - limit} remaining)
          </button>
        </div>
      )}
    </div>
  );
}
