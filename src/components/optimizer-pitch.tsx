"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

import { money } from "@/lib/format";
import { SQUAD } from "@/lib/fpl/rules";
import type { PlayerRow } from "@/lib/view/rows";

import type { PickerPlayer } from "./optimizer-controls";
import { SquadPitch } from "./squad-pitch";
import { cx, PositionBadge } from "./ui";

const POSITION_LABEL = {
  1: "goalkeeper",
  2: "defender",
  3: "midfielder",
  4: "forward",
} as const;

/**
 * Pitch for the squad builder. Locking pins a player to the XI or bench;
 * Replace picks a same-position stand-in and rebuilds within the current
 * budget when possible, keeping any other manual locks.
 */
export function OptimizerPitch({
  startingXi,
  bench,
  captainId,
  viceCaptainId,
  event,
  locked,
  lockedStarters,
  lockedBench,
  players,
  budget,
  squadCost,
  excluded,
}: {
  startingXi: PlayerRow[];
  bench: PlayerRow[];
  captainId?: number;
  viceCaptainId?: number;
  event: number;
  locked: number[];
  lockedStarters: number[];
  lockedBench: number[];
  players: PickerPlayer[];
  budget: number;
  squadCost: number;
  excluded: number[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [replacing, setReplacing] = useState<{
    player: PlayerRow;
    role: "xi" | "bench";
  } | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!replacing) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setReplacing(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [replacing]);

  const write = (
    nextLocked: number[],
    nextStarters: number[],
    nextBench: number[],
    nextExcluded: number[] = excluded,
    nextBudget: number = budget,
  ) => {
    const params = new URLSearchParams(searchParams.toString());
    if (nextLocked.length) params.set("lock", nextLocked.join(","));
    else params.delete("lock");
    if (nextStarters.length) params.set("xi", nextStarters.join(","));
    else params.delete("xi");
    if (nextBench.length) params.set("bench", nextBench.join(","));
    else params.delete("bench");
    if (nextExcluded.length) params.set("ban", nextExcluded.join(","));
    else params.delete("ban");
    // Manual lock/unlock replaces a one-off include from Replace.
    params.delete("include");
    params.delete("includeRole");
    if (nextBudget !== budget) params.set("budget", String(nextBudget));
    else if (!params.has("budget") && nextBudget !== SQUAD.budgetTenths) {
      params.set("budget", String(nextBudget));
    }
    startTransition(() =>
      router.push(`/optimizer?${params}`, { scroll: false }),
    );
  };

  const toggleLock = (playerId: number, role: "xi" | "bench") => {
    setReplacing(null);
    const inStarters = lockedStarters.includes(playerId);
    const inBench = lockedBench.includes(playerId);
    const inSquad = locked.includes(playerId);
    const currentlyLocked =
      role === "xi"
        ? inStarters || (inSquad && !inBench)
        : inBench || (inSquad && !inStarters);

    if (currentlyLocked) {
      write(
        locked.filter((id) => id !== playerId),
        lockedStarters.filter((id) => id !== playerId),
        lockedBench.filter((id) => id !== playerId),
      );
      return;
    }

    const nextLocked = inSquad ? locked : [...locked, playerId];
    if (role === "xi") {
      write(
        nextLocked,
        inStarters ? lockedStarters : [...lockedStarters, playerId],
        lockedBench.filter((id) => id !== playerId),
      );
    } else {
      write(
        nextLocked,
        lockedStarters.filter((id) => id !== playerId),
        inBench ? lockedBench : [...lockedBench, playerId],
      );
    }
  };

  const openReplace = (playerId: number, role: "xi" | "bench") => {
    const player =
      startingXi.find((entry) => entry.id === playerId) ??
      bench.find((entry) => entry.id === playerId);
    if (!player) return;
    setQuery("");
    setReplacing({ player, role });
  };

  const bank = budget - squadCost;
  const squadIds = useMemo(() => {
    return new Set([
      ...startingXi.map((player) => player.id),
      ...bench.map((player) => player.id),
    ]);
  }, [startingXi, bench]);

  const clubCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const player of [...startingXi, ...bench]) {
      counts.set(player.teamId, (counts.get(player.teamId) ?? 0) + 1);
    }
    return counts;
  }, [startingXi, bench]);

  const options = useMemo(() => {
    if (!replacing) return [];
    const outgoing = replacing.player;
    const term = query.trim().toLowerCase();
    const maxPrice = outgoing.price + Math.max(0, bank);

    return players
      .filter((player) => {
        if (player.id === outgoing.id) return false;
        if (player.position !== outgoing.position) return false;
        if (excluded.includes(player.id)) return false;
        if (term && !`${player.name} ${player.teamShort}`.toLowerCase().includes(term)) {
          return false;
        }
        return true;
      })
      .map((player) => {
        const alreadyInSquad = squadIds.has(player.id);
        const clubCount = clubCounts.get(player.teamId) ?? 0;
        const freesClubSlot =
          outgoing.teamId === player.teamId || alreadyInSquad;
        const clubOk = freesClubSlot || clubCount < SQUAD.maxPerClub;
        const affordable =
          alreadyInSquad || player.price <= maxPrice;
        return { player, alreadyInSquad, clubOk, affordable };
      })
      .filter((option) => option.clubOk)
      .sort((a, b) => {
        if (a.affordable !== b.affordable) return a.affordable ? -1 : 1;
        return b.player.xpHorizon - a.player.xpHorizon;
      })
      .slice(0, 40);
  }, [
    replacing,
    players,
    query,
    bank,
    squadIds,
    clubCounts,
    excluded,
  ]);

  /**
   * Rebuild around the chosen player. Keep every lock except the outgoing
   * player's, force the pick in via include, and keep the current budget so the
   * search trims elsewhere when it can.
   */
  const commitReplace = (incomingId: number) => {
    if (!replacing) return;
    const outgoingId = replacing.player.id;
    const nextExcluded = excluded.filter((id) => id !== incomingId);
    const nextLocked = locked.filter((id) => id !== outgoingId);
    const nextStarters = lockedStarters.filter((id) => id !== outgoingId);
    const nextBench = lockedBench.filter((id) => id !== outgoingId);

    const params = new URLSearchParams(searchParams.toString());
    if (nextLocked.length) params.set("lock", nextLocked.join(","));
    else params.delete("lock");
    if (nextStarters.length) params.set("xi", nextStarters.join(","));
    else params.delete("xi");
    if (nextBench.length) params.set("bench", nextBench.join(","));
    else params.delete("bench");
    if (nextExcluded.length) params.set("ban", nextExcluded.join(","));
    else params.delete("ban");
    // Quiet must-include so the pick sticks without forcing a new Lock badge.
    params.set("include", String(incomingId));
    params.delete("includeRole");
    // Stay on the stated budget; the optimiser adapts only if this pick cannot fit.
    params.set("budget", String(budget));

    setReplacing(null);
    startTransition(() =>
      router.push(`/optimizer?${params}`, { scroll: false }),
    );
  };

  return (
    <div className="space-y-4">
      <SquadPitch
        startingXi={startingXi}
        bench={bench}
        captainId={captainId}
        viceCaptainId={viceCaptainId}
        event={event}
        lockedStarters={lockedStarters}
        lockedBench={lockedBench}
        lockedSquad={locked}
        onToggleLock={toggleLock}
        onReplace={openReplace}
        replacingId={replacing?.player.id ?? null}
      />

      {replacing && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Replace ${replacing.player.name}`}
          className="sticky bottom-2 z-30 rounded-2xl border border-cyan/40 bg-surface-2/95 p-4 shadow-lg backdrop-blur sm:bottom-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[11px] tracking-wider text-cyan uppercase">
                Replace {replacing.role === "xi" ? "starter" : "bench player"}
              </div>
              <h3 className="mt-1 text-sm font-semibold text-ink">
                {replacing.player.name}{" "}
                <span className="font-normal text-ink-muted">
                  → pick another {POSITION_LABEL[replacing.player.position]}
                </span>
              </h3>
              <p className="mt-1 text-xs text-ink-dim">
                Rebuilds the squad around this pick and keeps your other locks.
                The current budget is kept when possible; it only rises if the
                player cannot fit. Bank: {money(Math.max(0, bank))}.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setReplacing(null)}
              className="rounded-md border border-line px-3 py-1.5 text-xs font-medium text-ink-muted hover:border-line-strong hover:text-ink"
            >
              Cancel
            </button>
          </div>

          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Search ${POSITION_LABEL[replacing.player.position]}s`}
            className="mt-3 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          />

          <ul className="mt-3 max-h-72 divide-y divide-line overflow-y-auto rounded-xl border border-line">
            {options.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-ink-dim">
                No legal {POSITION_LABEL[replacing.player.position]}s match.
              </li>
            ) : (
              options.map(({ player, alreadyInSquad, affordable }) => (
                <li key={player.id}>
                  <button
                    type="button"
                    onClick={() => commitReplace(player.id)}
                    disabled={pending}
                    className={cx(
                      "flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors hover:bg-surface/80 disabled:cursor-not-allowed disabled:hover:bg-transparent",
                      !affordable && !alreadyInSquad && "opacity-80",
                    )}
                  >
                    <PositionBadge position={player.position} />
                    <span className="font-medium">{player.name}</span>
                    <span className="text-xs text-ink-dim">
                      {player.teamShort} · {money(player.price)} ·{" "}
                      {player.xpHorizon.toFixed(1)} xP
                    </span>
                    <span className="ml-auto flex items-center gap-2 text-[11px]">
                      {alreadyInSquad && (
                        <span className="text-cyan">In squad</span>
                      )}
                      {!affordable && !alreadyInSquad && (
                        <span className="text-warn">May raise budget</span>
                      )}
                      <span className="font-semibold text-accent">Select</span>
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}

      {pending && (
        <p className="text-xs text-accent">Rebuilding the squad…</p>
      )}
    </div>
  );
}
