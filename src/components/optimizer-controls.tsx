"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";

import {
  getBuilderHistory,
  popBuilderHistory,
  pushBuilderHistory,
} from "@/lib/client-storage";
import { money, percent } from "@/lib/format";
import {
  CHIP_LABEL,
  type ChipName,
  FORMATION_OPTIONS,
} from "@/lib/fpl/rules";
import { MODEL } from "@/lib/model/config";

import { cx, PositionBadge } from "./ui";

const HISTORY_EVENT = "fpl-edge-builder-history";

function subscribeHistory(onStoreChange: () => void) {
  window.addEventListener(HISTORY_EVENT, onStoreChange);
  return () => window.removeEventListener(HISTORY_EVENT, onStoreChange);
}

function historySnapshot() {
  return String(getBuilderHistory().length);
}

function notifyHistory() {
  window.dispatchEvent(new Event(HISTORY_EVENT));
}

export interface PickerPlayer {
  id: number;
  name: string;
  teamShort: string;
  teamId: number;
  position: 1 | 2 | 3 | 4;
  price: number;
  xpHorizon: number;
}

export type OptimizerChip = ChipName | null;

export interface OptimizerSettings {
  horizon: number;
  budget: number;
  minStart: number;
  /** "auto" or a label like "4-4-2". */
  formation: string;
  /** Chip planned for the first gameweek of the horizon. */
  chip: OptimizerChip;
  locked: number[];
  lockedStarters: number[];
  lockedBench: number[];
  excluded: number[];
}

const CHIP_OPTIONS: Array<{
  value: OptimizerChip;
  label: string;
  hint: string;
}> = [
  {
    value: null,
    label: "None",
    hint: "Default scoring — build a squad to hold across the horizon.",
  },
  {
    value: "bboost",
    label: CHIP_LABEL.bboost,
    hint: "Bench counts fully in the chip week; the rest of the horizon stays discounted.",
  },
  {
    value: "3xc",
    label: CHIP_LABEL["3xc"],
    hint: "Favours squads with a standout captain fixture in the chip week.",
  },
  {
    value: "freehit",
    label: CHIP_LABEL.freehit,
    hint: "Forces the horizon to 1 — Free Hit reverts after the week.",
  },
  {
    value: "wildcard",
    label: CHIP_LABEL.wildcard,
    hint: "Same objective as none — a wildcard squad is held for the run.",
  },
];

/**
 * Controls for the squad builder. Every setting is written to the URL so the
 * search runs on the server and a configuration can be shared as a link.
 */
export function OptimizerControls({
  players,
  settings,
}: {
  players: PickerPlayer[];
  settings: OptimizerSettings;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const historyLen = Number(
    useSyncExternalStore(subscribeHistory, historySnapshot, () => "0"),
  );

  useEffect(() => {
    // Seed history with the landing query so Undo has somewhere to return.
    pushBuilderHistory(searchParams.toString());
    notifyHistory();
  }, [searchParams]);

  const [budget, setBudget] = useState(settings.budget);
  const [minStart, setMinStart] = useState(settings.minStart);
  const [search, setSearch] = useState("");
  // Keep local slider state in sync when the URL/budget adapter changes props.
  const [budgetBaseline, setBudgetBaseline] = useState(settings.budget);
  const [minStartBaseline, setMinStartBaseline] = useState(settings.minStart);
  if (settings.budget !== budgetBaseline) {
    setBudgetBaseline(settings.budget);
    setBudget(settings.budget);
  }
  if (settings.minStart !== minStartBaseline) {
    setMinStartBaseline(settings.minStart);
    setMinStart(settings.minStart);
  }

  const byId = useMemo(
    () => new Map(players.map((player) => [player.id, player])),
    [players],
  );

  const apply = (next: Partial<OptimizerSettings>) => {
    const params = new URLSearchParams(searchParams.toString());
    const merged: OptimizerSettings = {
      horizon: settings.horizon,
      budget,
      minStart,
      formation: settings.formation,
      chip: settings.chip,
      locked: settings.locked,
      lockedStarters: settings.lockedStarters,
      lockedBench: settings.lockedBench,
      excluded: settings.excluded,
      ...next,
    };
    // Free Hit reverts after one week, so the search only looks at that week.
    if (merged.chip === "freehit") merged.horizon = 1;
    params.set("horizon", String(merged.horizon));
    params.set("budget", String(merged.budget));
    params.set("minStart", merged.minStart.toFixed(2));
    if (merged.formation && merged.formation !== "auto") {
      params.set("formation", merged.formation);
    } else params.delete("formation");
    if (merged.chip) params.set("chip", merged.chip);
    else params.delete("chip");
    if (merged.locked.length) params.set("lock", merged.locked.join(","));
    else params.delete("lock");
    if (merged.lockedStarters.length) {
      params.set("xi", merged.lockedStarters.join(","));
    } else params.delete("xi");
    if (merged.lockedBench.length) {
      params.set("bench", merged.lockedBench.join(","));
    } else params.delete("bench");
    if (merged.excluded.length) params.set("ban", merged.excluded.join(","));
    else params.delete("ban");
    // Control changes drop a one-off Replace include so locks stay intentional.
    params.delete("include");
    params.delete("includeRole");
    const query = params.toString();
    pushBuilderHistory(searchParams.toString());
    pushBuilderHistory(query);
    notifyHistory();
    startTransition(() =>
      router.push(`/optimizer?${query}`, { scroll: false }),
    );
  };

  const undo = () => {
    const previous = popBuilderHistory();
    if (previous === null) return;
    notifyHistory();
    startTransition(() =>
      router.push(previous ? `/optimizer?${previous}` : "/optimizer", {
        scroll: false,
      }),
    );
  };

  const canUndo = historyLen >= 2;

  const activeChipHint =
    CHIP_OPTIONS.find((option) => option.value === settings.chip)?.hint ??
    CHIP_OPTIONS[0].hint;

  const results = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return [];
    return players
      .filter((player) =>
        `${player.name} ${player.teamShort}`.toLowerCase().includes(term),
      )
      .slice(0, 8);
  }, [players, search]);

  const lockAs = (id: number, role: "xi" | "bench" | "squad") => {
    const locked = settings.locked.includes(id)
      ? settings.locked
      : [...settings.locked, id];
    if (role === "xi") {
      apply({
        locked,
        lockedStarters: settings.lockedStarters.includes(id)
          ? settings.lockedStarters
          : [...settings.lockedStarters, id],
        lockedBench: settings.lockedBench.filter((value) => value !== id),
      });
      return;
    }
    if (role === "bench") {
      apply({
        locked,
        lockedBench: settings.lockedBench.includes(id)
          ? settings.lockedBench
          : [...settings.lockedBench, id],
        lockedStarters: settings.lockedStarters.filter((value) => value !== id),
      });
      return;
    }
    apply({
      locked,
      lockedStarters: settings.lockedStarters.filter((value) => value !== id),
      lockedBench: settings.lockedBench.filter((value) => value !== id),
    });
  };

  const unlock = (id: number) =>
    apply({
      locked: settings.locked.filter((value) => value !== id),
      lockedStarters: settings.lockedStarters.filter((value) => value !== id),
      lockedBench: settings.lockedBench.filter((value) => value !== id),
    });

  const toggleBan = (id: number) => {
    const excluded = settings.excluded.includes(id)
      ? settings.excluded.filter((value) => value !== id)
      : [...settings.excluded, id];
    apply({
      excluded,
      locked: settings.locked.filter((value) => value !== id),
      lockedStarters: settings.lockedStarters.filter((value) => value !== id),
      lockedBench: settings.lockedBench.filter((value) => value !== id),
    });
  };

  const roleOf = (id: number): "xi" | "bench" | "squad" | null => {
    if (settings.lockedStarters.includes(id)) return "xi";
    if (settings.lockedBench.includes(id)) return "bench";
    if (settings.locked.includes(id)) return "squad";
    return null;
  };

  return (
    <div className="space-y-4 rounded-2xl border border-line bg-surface/80 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-dim">
          Settings sync to the URL so builds are shareable.
        </p>
        <button
          type="button"
          onClick={undo}
          disabled={!canUndo || pending}
          className="rounded-md border border-line px-2.5 py-1 text-xs text-ink-muted hover:text-ink disabled:opacity-40"
        >
          Undo
        </button>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="text-[11px] tracking-wider text-ink-dim uppercase">
            Horizon
          </label>
          <div className="mt-1 flex rounded-lg border border-line bg-surface-2 p-0.5">
            {Array.from(
              { length: MODEL.maxHorizon },
              (_, index) => index + 1,
            ).map((value) => (
              <button
                key={value}
                type="button"
                disabled={settings.chip === "freehit" && value !== 1}
                onClick={() => apply({ horizon: value })}
                className={cx(
                  "flex-1 rounded-md py-1 text-xs font-medium transition-colors",
                  settings.horizon === value
                    ? "bg-accent text-brand"
                    : "text-ink-muted hover:text-ink",
                  settings.chip === "freehit" &&
                    value !== 1 &&
                    "cursor-not-allowed opacity-40 hover:text-ink-muted",
                )}
              >
                {value}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-ink-dim">
            {settings.chip === "freehit"
              ? "Free Hit locks the horizon to 1 gameweek."
              : "Gameweeks the squad is optimised over."}
          </p>
        </div>

        <div>
          <label className="text-[11px] tracking-wider text-ink-dim uppercase">
            Budget {money(budget)}
          </label>
          <input
            type="range"
            min={800}
            max={1500}
            step={5}
            value={Math.min(1500, Math.max(800, budget))}
            onChange={(event) => setBudget(Number(event.target.value))}
            onPointerUp={() => apply({ budget })}
            onKeyUp={() => apply({ budget })}
            className="mt-3 w-full accent-[color:var(--color-accent)]"
          />
          <p className="mt-1 text-xs text-ink-dim">
            £100.0m at the start of the season. Over-budget locks and replaces
            raise this automatically to fit.
          </p>
        </div>

        <div>
          <label className="text-[11px] tracking-wider text-ink-dim uppercase">
            Minimum start chance {percent(minStart)}
          </label>
          <input
            type="range"
            min={0}
            max={0.8}
            step={0.05}
            value={minStart}
            onChange={(event) => setMinStart(Number(event.target.value))}
            onPointerUp={() => apply({ minStart })}
            onKeyUp={() => apply({ minStart })}
            className="mt-3 w-full accent-[color:var(--color-accent)]"
          />
          <p className="mt-1 text-xs text-ink-dim">
            Filters out players unlikely to be picked by their manager.
          </p>
        </div>
      </div>

      <div className="border-t border-line pt-4">
        <label className="text-[11px] tracking-wider text-ink-dim uppercase">
          Chip
        </label>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {CHIP_OPTIONS.map((option) => (
            <button
              key={option.label}
              type="button"
              onClick={() => apply({ chip: option.value })}
              className={cx(
                "rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
                settings.chip === option.value
                  ? "border-accent bg-accent text-brand"
                  : "border-line bg-surface-2 text-ink-muted hover:border-accent/40 hover:text-ink",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-ink-dim">{activeChipHint}</p>
      </div>

      <div className="border-t border-line pt-4">
        <label className="text-[11px] tracking-wider text-ink-dim uppercase">
          Formation
        </label>
        <div className="mt-1 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => apply({ formation: "auto" })}
            className={cx(
              "rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
              settings.formation === "auto"
                ? "border-accent bg-accent text-brand"
                : "border-line bg-surface-2 text-ink-muted hover:border-accent/40 hover:text-ink",
            )}
          >
            Auto
          </button>
          {FORMATION_OPTIONS.map((label) => (
            <button
              key={label}
              type="button"
              onClick={() => apply({ formation: label })}
              className={cx(
                "rounded-md border px-2.5 py-1.5 text-xs font-medium tabular-nums transition-colors",
                settings.formation === label
                  ? "border-accent bg-accent text-brand"
                  : "border-line bg-surface-2 text-ink-muted hover:border-accent/40 hover:text-ink",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-ink-dim">
          Auto picks the highest-scoring legal shape. A fixed formation rebuilds
          the XI and bench around that DEF-MID-FWD split.
        </p>
      </div>

      <div className="border-t border-line pt-4">
        <label className="text-[11px] tracking-wider text-ink-dim uppercase">
          Lock in or rule out players
        </label>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search a player to lock into the XI, bench, or squad"
          className="mt-1 w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
        />

        {results.length > 0 && (
          <ul className="mt-2 divide-y divide-line overflow-hidden rounded-lg border border-line">
            {results.map((player) => {
              const role = roleOf(player.id);
              return (
                <li
                  key={player.id}
                  className="flex flex-wrap items-center gap-2 bg-surface-2/60 px-3 py-2 text-sm"
                >
                  <PositionBadge position={player.position} />
                  <span className="font-medium">{player.name}</span>
                  <span className="text-xs text-ink-dim">
                    {player.teamShort} · {money(player.price)} ·{" "}
                    {player.xpHorizon.toFixed(1)} xP
                  </span>
                  <div className="ml-auto flex flex-wrap gap-1.5">
                    {role ? (
                      <button
                        type="button"
                        onClick={() => unlock(player.id)}
                        className="rounded-md border border-accent/40 px-2 py-1 text-xs text-accent hover:bg-accent/10"
                      >
                        Unlock
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => lockAs(player.id, "xi")}
                          className="rounded-md border border-accent/40 px-2 py-1 text-xs text-accent hover:bg-accent/10"
                        >
                          Lock XI
                        </button>
                        <button
                          type="button"
                          onClick={() => lockAs(player.id, "bench")}
                          className="rounded-md border border-accent/40 px-2 py-1 text-xs text-accent hover:bg-accent/10"
                        >
                          Lock bench
                        </button>
                        <button
                          type="button"
                          onClick={() => lockAs(player.id, "squad")}
                          className="rounded-md border border-line-strong px-2 py-1 text-xs text-ink-muted hover:text-ink"
                        >
                          Lock squad
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => toggleBan(player.id)}
                      className="rounded-md border border-danger/40 px-2 py-1 text-xs text-danger hover:bg-danger/10"
                    >
                      {settings.excluded.includes(player.id)
                        ? "Allow"
                        : "Rule out"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-3 flex flex-wrap gap-4">
          <ChipList
            label="Locked in XI"
            ids={settings.lockedStarters}
            byId={byId}
            tone="accent"
            onRemove={unlock}
          />
          <ChipList
            label="Locked on bench"
            ids={settings.lockedBench}
            byId={byId}
            tone="accent"
            onRemove={unlock}
          />
          <ChipList
            label="Locked in squad"
            ids={settings.locked.filter(
              (id) =>
                !settings.lockedStarters.includes(id) &&
                !settings.lockedBench.includes(id),
            )}
            byId={byId}
            tone="accent"
            onRemove={unlock}
          />
          <ChipList
            label="Ruled out"
            ids={settings.excluded}
            byId={byId}
            tone="danger"
            onRemove={(id) =>
              apply({
                excluded: settings.excluded.filter((value) => value !== id),
              })
            }
          />
        </div>
      </div>

      {pending && (
        <p className="text-xs text-accent">Rebuilding the squad…</p>
      )}
    </div>
  );
}

function ChipList({
  label,
  ids,
  byId,
  tone,
  onRemove,
}: {
  label: string;
  ids: number[];
  byId: Map<number, PickerPlayer>;
  tone: "accent" | "danger";
  onRemove: (id: number) => void;
}) {
  if (!ids.length) return null;
  return (
    <div>
      <div className="text-[11px] tracking-wider text-ink-dim uppercase">
        {label}
      </div>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {ids.map((id) => {
          const player = byId.get(id);
          return (
            <button
              key={id}
              type="button"
              onClick={() => onRemove(id)}
              className={cx(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ring-1 ring-inset",
                tone === "accent"
                  ? "bg-accent/10 text-accent ring-accent/30"
                  : "bg-danger/10 text-danger ring-danger/30",
              )}
            >
              {player ? player.name : `#${id}`}
              <span aria-hidden>×</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * When the optimiser raises the budget to fit locked players, write that value
 * back into the URL so the slider and shared links stay in sync.
 */
export function BudgetAdapter({
  requested,
  adapted,
}: {
  requested: number;
  adapted: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (adapted <= requested) return;
    const params = new URLSearchParams(searchParams.toString());
    if (Number(params.get("budget")) === adapted) return;
    params.set("budget", String(adapted));
    router.replace(`/optimizer?${params.toString()}`, { scroll: false });
  }, [adapted, requested, router, searchParams]);

  return null;
}
