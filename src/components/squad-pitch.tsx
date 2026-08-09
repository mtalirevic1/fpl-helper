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
}

function PlayerCard({
  player,
  event,
  badge,
  dim,
}: {
  player: PlayerRow;
  event: number;
  badge?: string;
  dim?: boolean;
}) {
  const fixtures = player.fixtures.filter(
    (fixture) => fixture.event === event,
  );

  return (
    <div
      className={cx(
        "w-[8.5rem] rounded-xl border border-line bg-surface/90 px-2 py-2 text-center shadow-sm transition-colors hover:border-line-strong",
        dim && "opacity-80",
      )}
    >
      <div className="flex items-center justify-center gap-1">
        {badge && (
          <span className="grid size-4 place-items-center rounded-full bg-accent text-[9px] font-bold text-brand">
            {badge}
          </span>
        )}
        <Link
          href={`/players/${player.id}`}
          className="truncate text-sm font-medium hover:text-accent"
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
        {player.availability < 1 && (
          <Badge tone={player.availability === 0 ? "danger" : "warn"}>
            {percent(player.availability)}
          </Badge>
        )}
      </div>
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
}: PitchProps) {
  const rows = ([1, 2, 3, 4] as PositionId[]).map((position) =>
    startingXi.filter((player) => player.position === position),
  );

  const badgeFor = (player: PlayerRow) =>
    player.id === captainId
      ? "C"
      : player.id === viceCaptainId
        ? "V"
        : undefined;

  return (
    <div>
      <div className="rounded-2xl border border-line bg-gradient-to-b from-emerald-950/40 to-surface/40 p-4">
        <div className="space-y-4">
          {rows.map((row, index) => (
            <div key={index} className="flex flex-wrap justify-center gap-2">
              {row.map((player) => (
                <PlayerCard
                  key={player.id}
                  player={player}
                  event={event}
                  badge={badgeFor(player)}
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
            <PlayerCard key={player.id} player={player} event={event} dim />
          ))}
        </div>
      </div>
    </div>
  );
}
