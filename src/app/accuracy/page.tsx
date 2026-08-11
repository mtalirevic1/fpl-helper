import type { Metadata } from "next";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { Card, EmptyState, PageHeader, Stat } from "@/components/ui";
import { MODEL_CHANGELOG } from "@/data/changelog";
import { getElementSummary } from "@/lib/fpl/api";
import { pageMetadata } from "@/lib/site";

export const revalidate = 3600;

export const metadata: Metadata = pageMetadata({
  title: "FPL model accuracy & changelog",
  description:
    "Backtested expected-points accuracy for FPL Edge, with MAE by position and the model changelog.",
  path: "/accuracy",
});

interface SnapshotPlayer {
  id: number;
  name: string;
  position: number;
  xpNext: number;
  xpNextLow?: number;
  xpNextHigh?: number;
}

interface Snapshot {
  event: number;
  generatedAt: string;
  players: SnapshotPlayer[];
}

async function loadSnapshots(): Promise<Snapshot[]> {
  const dir = join(process.cwd(), "src/data/backtest");
  try {
    const files = (await readdir(dir))
      .filter((name) => /^gw\d+\.json$/.test(name))
      .sort();
    const snapshots: Snapshot[] = [];
    for (const file of files) {
      const raw = await readFile(join(dir, file), "utf8");
      snapshots.push(JSON.parse(raw) as Snapshot);
    }
    return snapshots;
  } catch {
    return [];
  }
}

export default async function AccuracyPage() {
  const snapshots = await loadSnapshots();

  type Miss = { name: string; predicted: number; actual: number; error: number };
  let mae: number | null = null;
  let bias: number | null = null;
  const byPosition: Record<number, { n: number; mae: number; bias: number }> = {};
  const misses: Miss[] = [];
  let compared = 0;

  for (const snapshot of snapshots) {
    // Sample a subset to stay within rate limits on the accuracy page.
    const sample = snapshot.players
      .slice()
      .sort((a, b) => b.xpNext - a.xpNext)
      .slice(0, 40);

    for (const player of sample) {
      const summary = await getElementSummary(player.id).catch(() => null);
      const row = summary?.history.find((h) => h.round === snapshot.event);
      if (!row) continue;
      const actual = row.total_points;
      const error = player.xpNext - actual;
      compared += 1;
      misses.push({
        name: player.name,
        predicted: player.xpNext,
        actual,
        error,
      });
      const pos = byPosition[player.position] ?? { n: 0, mae: 0, bias: 0 };
      pos.n += 1;
      pos.mae += Math.abs(error);
      pos.bias += error;
      byPosition[player.position] = pos;
    }
  }

  if (compared > 0) {
    mae =
      misses.reduce((total, row) => total + Math.abs(row.error), 0) / compared;
    bias = misses.reduce((total, row) => total + row.error, 0) / compared;
    for (const pos of Object.values(byPosition)) {
      pos.mae /= pos.n;
      pos.bias /= pos.n;
    }
  }

  const topMisses = [...misses]
    .sort((a, b) => Math.abs(b.error) - Math.abs(a.error))
    .slice(0, 10);

  return (
    <>
      <PageHeader
        title="Model accuracy"
        description="Committed gameweek snapshots compared to finished points. Run npm run snapshot:gw before a deadline to add a slice."
      />

      {!snapshots.length ? (
        <EmptyState title="No backtest snapshots yet">
          Snapshots live in <code>src/data/backtest/</code>. Generate one with{" "}
          <code>npm run snapshot:gw</code>.
        </EmptyState>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="Snapshots" value={snapshots.length} />
            <Stat
              label="MAE"
              value={mae === null ? "—" : mae.toFixed(2)}
              hint={compared ? `${compared} player-weeks` : "Awaiting finished GWs"}
              tone="accent"
            />
            <Stat
              label="Bias"
              value={bias === null ? "—" : bias.toFixed(2)}
              hint="Positive means model over-predicted"
            />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card title="By position" subtitle="Mean absolute error">
              <ul className="divide-y divide-line text-sm">
                {([1, 2, 3, 4] as const).map((position) => {
                  const row = byPosition[position];
                  const label = ["", "GKP", "DEF", "MID", "FWD"][position];
                  return (
                    <li
                      key={position}
                      className="flex justify-between py-2 tabular-nums"
                    >
                      <span>{label}</span>
                      <span className="text-ink-muted">
                        {row
                          ? `MAE ${row.mae.toFixed(2)} · bias ${row.bias.toFixed(2)} (n=${row.n})`
                          : "—"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Card>
            <Card title="Largest misses" subtitle="Predicted − actual">
              {!topMisses.length ? (
                <p className="text-sm text-ink-dim">
                  No finished gameweek overlap yet.
                </p>
              ) : (
                <ul className="divide-y divide-line text-sm">
                  {topMisses.map((row) => (
                    <li
                      key={`${row.name}-${row.predicted}`}
                      className="flex justify-between gap-3 py-2"
                    >
                      <span>{row.name}</span>
                      <span className="tabular-nums text-ink-muted">
                        {row.predicted.toFixed(1)} → {row.actual} (
                        {row.error > 0 ? "+" : ""}
                        {row.error.toFixed(1)})
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}

      <Card
        title="Model changelog"
        subtitle="Manual notes when projection assumptions change."
        className="mt-4"
      >
        <ul className="divide-y divide-line">
          {MODEL_CHANGELOG.map((entry) => (
            <li key={`${entry.date}-${entry.title}`} className="py-3">
              <div className="text-xs tracking-wider text-ink-dim uppercase">
                {entry.date}
              </div>
              <div className="mt-1 font-medium">{entry.title}</div>
              <p className="mt-1 text-sm text-ink-muted">{entry.detail}</p>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
