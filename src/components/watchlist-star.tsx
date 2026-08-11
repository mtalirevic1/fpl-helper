"use client";

import { useSyncExternalStore } from "react";

import { getWatchlist, toggleWatchlist } from "@/lib/client-storage";

import { cx } from "./ui";

function subscribe(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener("fpl-edge-watchlist", onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener("fpl-edge-watchlist", onStoreChange);
  };
}

function getSnapshot() {
  return getWatchlist().join(",");
}

function getServerSnapshot() {
  return "";
}

export function WatchlistStar({
  playerId,
  className,
}: {
  playerId: number;
  className?: string;
}) {
  const ids = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const active = ids.split(",").map(Number).includes(playerId);

  return (
    <button
      type="button"
      title={active ? "Remove from watchlist" : "Add to watchlist"}
      aria-pressed={active}
      onClick={() => {
        toggleWatchlist(playerId);
        window.dispatchEvent(new Event("fpl-edge-watchlist"));
      }}
      className={cx(
        "grid size-6 place-items-center rounded-md text-sm transition-colors",
        active
          ? "text-accent"
          : "text-ink-dim hover:text-ink",
        className,
      )}
    >
      {active ? "★" : "☆"}
    </button>
  );
}
