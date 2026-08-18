/**
 * Reviews hand-maintained start-probability adjustments against live FPL flags.
 *
 * Prints unmatched names, expired windows, players who have left the league,
 * players FPL already lists as out, and news that changed since the last
 * snapshot. Never writes start factors.
 *
 * Usage:
 *   npm run review:adjustments
 *   npm run review:adjustments -- --write   # after you have edited the list
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { getBootstrap, getFixtures } from "../src/lib/fpl/api";
import { getSeasonState } from "../src/lib/fpl/season";
import {
  formatAdjustmentReview,
  reviewAdjustments,
  reviewHasBlockers,
  snapshotFromReview,
  type AdjustmentSnapshot,
} from "../src/lib/model/review-adjustments";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SNAPSHOT = resolve(ROOT, "src/data/adjustments-review.json");

async function loadSnapshot(): Promise<AdjustmentSnapshot | null> {
  try {
    const raw = await readFile(SNAPSHOT, "utf8");
    return JSON.parse(raw) as AdjustmentSnapshot;
  } catch {
    return null;
  }
}

async function main() {
  const write = process.argv.includes("--write");
  const [bootstrap, fixtures] = await Promise.all([
    getBootstrap(),
    getFixtures(),
  ]);
  const season = getSeasonState(bootstrap, fixtures);
  const previous = await loadSnapshot();
  const review = reviewAdjustments(bootstrap, season.targetEvent, previous);

  console.log(formatAdjustmentReview(review));
  if (!previous) {
    console.log(
      "\nNo snapshot yet. Run with --write after reviewing to track news diffs.",
    );
  }

  if (write) {
    const snapshot = snapshotFromReview(bootstrap, season.targetEvent);
    await mkdir(dirname(SNAPSHOT), { recursive: true });
    await writeFile(SNAPSHOT, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
    console.log(`\nWrote ${SNAPSHOT} (${snapshot.players.length} players)`);
  }

  if (reviewHasBlockers(review)) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
