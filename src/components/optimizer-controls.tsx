"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { money, percent } from "@/lib/format";
import { MODEL } from "@/lib/model/config";

import { cx, PositionBadge } from "./ui";

export interface PickerPlayer {
  id: number;
  name: string;
  teamShort: string;
  position: 1 | 2 | 3 | 4;
  price: number;
  xpHorizon: number;
}

export interface OptimizerSettings {
  horizon: number;
  budget: number;
  minStart: number;
  locked: number[];
  excluded: number[];
}

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

  const [budget, setBudget] = useState(settings.budget);
  const [minStart, setMinStart] = useState(settings.minStart);
  const [search, setSearch] = useState("");

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
      locked: settings.locked,
      excluded: settings.excluded,
      ...next,
    };
    params.set("horizon", String(merged.horizon));
    params.set("budget", String(merged.budget));
    params.set("minStart", merged.minStart.toFixed(2));
    if (merged.locked.length) params.set("lock", merged.locked.join(","));
    else params.delete("lock");
    if (merged.excluded.length) params.set("ban", merged.excluded.join(","));
    else params.delete("ban");
    startTransition(() => router.push(`/optimizer?${params}`));
  };

  const results = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return [];
    return players
      .filter((player) =>
        `${player.name} ${player.teamShort}`.toLowerCase().includes(term),
      )
      .slice(0, 8);
  }, [players, search]);

  const toggle = (list: number[], id: number) =>
    list.includes(id) ? list.filter((value) => value !== id) : [...list, id];

  return (
    <div className="space-y-4 rounded-2xl border border-line bg-surface/80 p-4">
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
                onClick={() => apply({ horizon: value })}
                className={cx(
                  "flex-1 rounded-md py-1 text-xs font-medium transition-colors",
                  settings.horizon === value
                    ? "bg-accent text-brand"
                    : "text-ink-muted hover:text-ink",
                )}
              >
                {value}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-ink-dim">
            Gameweeks the squad is optimised over.
          </p>
        </div>

        <div>
          <label className="text-[11px] tracking-wider text-ink-dim uppercase">
            Budget {money(budget)}
          </label>
          <input
            type="range"
            min={800}
            max={1050}
            step={5}
            value={budget}
            onChange={(event) => setBudget(Number(event.target.value))}
            onPointerUp={() => apply({ budget })}
            onKeyUp={() => apply({ budget })}
            className="mt-3 w-full accent-[color:var(--color-accent)]"
          />
          <p className="mt-1 text-xs text-ink-dim">
            £100.0m at the start of the season; raise it to match your squad value
            plus bank.
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
          Lock in or rule out players
        </label>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search a player to lock or ban"
          className="mt-1 w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
        />

        {results.length > 0 && (
          <ul className="mt-2 divide-y divide-line overflow-hidden rounded-lg border border-line">
            {results.map((player) => (
              <li
                key={player.id}
                className="flex items-center gap-2 bg-surface-2/60 px-3 py-2 text-sm"
              >
                <PositionBadge position={player.position} />
                <span className="font-medium">{player.name}</span>
                <span className="text-xs text-ink-dim">
                  {player.teamShort} · {money(player.price)} ·{" "}
                  {player.xpHorizon.toFixed(1)} xP
                </span>
                <div className="ml-auto flex gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      apply({ locked: toggle(settings.locked, player.id) })
                    }
                    className="rounded-md border border-accent/40 px-2 py-1 text-xs text-accent hover:bg-accent/10"
                  >
                    {settings.locked.includes(player.id) ? "Unlock" : "Lock in"}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      apply({ excluded: toggle(settings.excluded, player.id) })
                    }
                    className="rounded-md border border-danger/40 px-2 py-1 text-xs text-danger hover:bg-danger/10"
                  >
                    {settings.excluded.includes(player.id) ? "Allow" : "Rule out"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-3 flex flex-wrap gap-4">
          <ChipList
            label="Locked in"
            ids={settings.locked}
            byId={byId}
            tone="accent"
            onRemove={(id) =>
              apply({ locked: settings.locked.filter((value) => value !== id) })
            }
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
