"use client";

import Link from "next/link";

import { money, percent, points } from "@/lib/format";
import type { PositionId } from "@/lib/fpl/rules";
import type { PlayerRow } from "@/lib/view/rows";

import { Badge, cx, DifficultyPill, FIXTURE_CHIP } from "./ui";

interface PitchProps {
  startingXi: PlayerRow[];
  bench: PlayerRow[];
  captainId?: number;
  viceCaptainId?: number;
  /** The gameweek whose fixtures are shown on each card. */
  event: number;
  /** Players locked into the starting XI. */
  lockedStarters?: number[];
  /** Players locked onto the bench. */
  lockedBench?: number[];
  /** Players locked into the squad without a fixed role. */
  lockedSquad?: number[];
  /**
   * When set, each card gets a lock control. `role` is where the card sits on
   * the pitch, so locking from the XI pins a starter and locking from the
   * bench pins a bench spot.
   */
  onToggleLock?: (playerId: number, role: "xi" | "bench") => void;
  /** Opens a manual replacement picker for this card's slot. */
  onReplace?: (playerId: number, role: "xi" | "bench") => void;
  /** Highlight the card currently being replaced. */
  replacingId?: number | null;
}

function PlayerCard({
  player,
  event,
  badge,
  dim,
  locked,
  lockLabel,
  replacing,
  onToggleLock,
  onReplace,
}: {
  player: PlayerRow;
  event: number;
  badge?: string;
  dim?: boolean;
  locked?: boolean;
  lockLabel?: string;
  replacing?: boolean;
  onToggleLock?: () => void;
  onReplace?: () => void;
}) {
  const fixtures = player.fixtures.filter(
    (fixture) => fixture.event === event,
  );

  return (
    <div
      className={cx(
        "flex w-[8.5rem] flex-col rounded-xl border bg-surface/90 px-2 py-2 text-center shadow-sm transition-colors",
        replacing
          ? "border-cyan/60 ring-1 ring-cyan/40"
          : locked
            ? "border-accent/60 ring-1 ring-accent/30"
            : "border-line hover:border-line-strong",
        dim && !locked && !replacing && "opacity-80",
      )}
    >
      <div className="flex items-center justify-center gap-1">
        {badge && (
          <span className="grid size-4 shrink-0 place-items-center rounded-full bg-accent text-[9px] font-bold text-brand">
            {badge}
          </span>
        )}
        <Link
          href={`/players/${player.id}`}
          className="truncate text-sm font-medium hover:text-accent"
          title={player.name}
        >
          {player.name}
        </Link>
      </div>
      <div className="mt-0.5 text-[10px] tracking-wide text-ink-dim uppercase">
        {player.positionShort} · {player.teamShort} · {money(player.price)}
      </div>
      <div className="mt-1.5 flex justify-center gap-1">
        {fixtures.length ? (
          fixtures.map((fixture, index) => (
            <DifficultyPill
              key={index}
              difficulty={fixture.difficulty}
              title={`GW${fixture.event} · ${fixture.xp} xP`}
            >
              {fixture.opponentShort}
              {fixture.isHome ? " (H)" : " (A)"}
            </DifficultyPill>
          ))
        ) : (
          <span
            className={cx(
              FIXTURE_CHIP,
              "border border-dashed border-line font-normal text-ink-dim",
            )}
          >
            —
          </span>
        )}
      </div>
      <div className="mt-1.5 flex items-center justify-center gap-2 text-[11px]">
        <span className="font-semibold tabular-nums text-accent">
          {points(player.xpNext)}
        </span>
        <span className="text-ink-dim">xP</span>
        {locked && (
          <Badge tone="accent">{dim ? "Bench" : "XI"}</Badge>
        )}
        {player.availability < 1 && (
          <Badge tone={player.availability === 0 ? "danger" : "warn"}>
            {percent(player.availability)}
          </Badge>
        )}
      </div>
      {(onToggleLock || onReplace) && (
        <div className="mt-2 flex gap-1">
          {onToggleLock && (
            <button
              type="button"
              onClick={onToggleLock}
              title={locked ? `Unlock ${player.name}` : lockLabel}
              aria-label={locked ? `Unlock ${player.name}` : lockLabel}
              aria-pressed={locked}
              className={cx(
                "flex-1 rounded-md border px-1 py-1 text-[10px] font-semibold tracking-wide uppercase transition-colors",
                locked
                  ? "border-accent/50 bg-accent/15 text-accent"
                  : "border-line bg-surface-2 text-ink-muted hover:border-accent/40 hover:text-accent",
              )}
            >
              {locked ? "Locked" : "Lock"}
            </button>
          )}
          {onReplace && (
            <button
              type="button"
              onClick={onReplace}
              className={cx(
                "flex-1 rounded-md border px-1 py-1 text-[10px] font-semibold tracking-wide uppercase transition-colors",
                replacing
                  ? "border-cyan/50 bg-cyan/10 text-cyan"
                  : "border-line bg-surface-2 text-ink-muted hover:border-accent/40 hover:text-accent",
              )}
            >
              {replacing ? "Picking…" : "Replace"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** The starting XI laid out by position, with the bench beneath it. */
export function SquadPitch({
  startingXi,
  bench,
  captainId,
  viceCaptainId,
  event,
  lockedStarters = [],
  lockedBench = [],
  lockedSquad = [],
  onToggleLock,
  onReplace,
  replacingId = null,
}: PitchProps) {
  const rows = ([1, 2, 3, 4] as PositionId[]).map((position) =>
    startingXi.filter((player) => player.position === position),
  );

  const starterLocks = new Set(lockedStarters);
  const benchLocks = new Set(lockedBench);
  const squadLocks = new Set(lockedSquad);

  const badgeFor = (player: PlayerRow) =>
    player.id === captainId
      ? "C"
      : player.id === viceCaptainId
        ? "V"
        : undefined;

  // Role locks win; otherwise a plain squad lock highlights wherever they sit.
  const showLocked = (id: number, role: "xi" | "bench") => {
    if (role === "xi") {
      if (starterLocks.has(id)) return true;
      if (benchLocks.has(id)) return false;
      return squadLocks.has(id);
    }
    if (benchLocks.has(id)) return true;
    if (starterLocks.has(id)) return false;
    return squadLocks.has(id);
  };

  return (
    <div>
      <div className="rounded-2xl border border-line bg-gradient-to-b from-emerald-950/40 to-surface/40 p-4">
        {(onToggleLock || onReplace) && (
          <p className="mb-3 text-center text-[11px] text-ink-dim">
            Lock keeps a player in that XI or bench spot. Replace swaps them for
            another player in the same position.
          </p>
        )}
        <div className="space-y-4">
          {rows.map((row, index) => (
            <div key={index} className="flex flex-wrap justify-center gap-2">
              {row.map((player) => (
                <PlayerCard
                  key={player.id}
                  player={player}
                  event={event}
                  badge={badgeFor(player)}
                  locked={showLocked(player.id, "xi")}
                  lockLabel={`Lock ${player.name} in the starting XI`}
                  replacing={replacingId === player.id}
                  onToggleLock={
                    onToggleLock
                      ? () => onToggleLock(player.id, "xi")
                      : undefined
                  }
                  onReplace={
                    onReplace ? () => onReplace(player.id, "xi") : undefined
                  }
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3">
        <div className="mb-2 text-[11px] font-semibold tracking-wider text-ink-dim uppercase">
          Bench (in order)
        </div>
        <div className="flex flex-wrap gap-2">
          {bench.map((player) => (
            <PlayerCard
              key={player.id}
              player={player}
              event={event}
              dim
              locked={showLocked(player.id, "bench")}
              lockLabel={`Lock ${player.name} on the bench`}
              replacing={replacingId === player.id}
              onToggleLock={
                onToggleLock
                  ? () => onToggleLock(player.id, "bench")
                  : undefined
              }
              onReplace={
                onReplace ? () => onReplace(player.id, "bench") : undefined
              }
            />
          ))}
        </div>
      </div>
    </div>
  );
}
