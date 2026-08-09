/**
 * Snapshots every player's most recent completed season into
 * `src/data/baseline.json`, keyed by the player's permanent FPL `code`.
 *
 * The projection model needs a prior to lean on when the current season has too
 * few minutes to be informative — all of preseason, and roughly the first ten
 * gameweeks. Two sources are possible and the script picks whichever is cheaper:
 *
 *  1. Before the season starts, `bootstrap-static` still carries last season's
 *     totals, so one request is enough.
 *  2. Once matches begin those totals reset, so it crawls `element-summary` and
 *     reads the last `history_past` row for each player instead.
 *
 * Usage: npm run snapshot:baseline
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = "https://fantasy.premierleague.com/api";
const OUT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../src/data/baseline.json",
);
const CONCURRENCY = 6;
const SPACING_MS = 120;

async function getJson(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; fpl-helper/1.0)",
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${path}`);
  return res.json();
}

const num = (value) => {
  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

function toAggregate(row, code, cost) {
  return {
    code,
    cost,
    minutes: num(row.minutes),
    starts: num(row.starts),
    goals: num(row.goals_scored),
    assists: num(row.assists),
    xG: num(row.expected_goals),
    xA: num(row.expected_assists),
    xGC: num(row.expected_goals_conceded),
    cleanSheets: num(row.clean_sheets),
    goalsConceded: num(row.goals_conceded),
    saves: num(row.saves),
    penaltiesSaved: num(row.penalties_saved),
    penaltiesMissed: num(row.penalties_missed),
    yellowCards: num(row.yellow_cards),
    redCards: num(row.red_cards),
    ownGoals: num(row.own_goals),
    bonus: num(row.bonus),
    bps: num(row.bps),
    cbi: num(row.clearances_blocks_interceptions),
    tackles: num(row.tackles),
    recoveries: num(row.recoveries),
    defensiveContribution: num(row.defensive_contribution),
    totalPoints: num(row.total_points),
  };
}

async function mapWithConcurrency(items, worker) {
  const results = [];
  let index = 0;
  const runners = Array.from({ length: CONCURRENCY }, async () => {
    while (index < items.length) {
      const current = index++;
      results[current] = await worker(items[current], current);
      await new Promise((r) => setTimeout(r, SPACING_MS));
    }
  });
  await Promise.all(runners);
  return results;
}

async function main() {
  const [bootstrap, fixtures] = await Promise.all([
    getJson("/bootstrap-static/"),
    getJson("/fixtures/"),
  ]);

  const seasonStarted = fixtures.some((f) => f.started);
  const bootstrapMinutes = bootstrap.elements.reduce(
    (sum, e) => sum + e.minutes,
    0,
  );
  const useBootstrap = !seasonStarted && bootstrapMinutes > 0;

  const players = {};
  let season = "unknown";

  if (useBootstrap) {
    // Read the season label from any player who actually played last year.
    const sample = bootstrap.elements.find((e) => e.minutes > 500);
    if (sample) {
      const summary = await getJson(`/element-summary/${sample.id}/`);
      season = summary.history_past.at(-1)?.season_name ?? season;
    }
    for (const element of bootstrap.elements) {
      if (element.minutes <= 0) continue;
      players[element.code] = toAggregate(
        element,
        element.code,
        element.now_cost,
      );
    }
    console.log(
      `Preseason detected: took last season (${season}) from bootstrap-static.`,
    );
  } else {
    console.log(
      `Season in progress: crawling element-summary for ${bootstrap.elements.length} players...`,
    );
    let done = 0;
    await mapWithConcurrency(bootstrap.elements, async (element) => {
      try {
        const summary = await getJson(`/element-summary/${element.id}/`);
        const past = summary.history_past.at(-1);
        if (past && past.minutes > 0) {
          players[element.code] = toAggregate(
            past,
            element.code,
            past.end_cost,
          );
          season = past.season_name;
        }
      } catch (error) {
        console.warn(`  skipped ${element.web_name}: ${error.message}`);
      }
      done += 1;
      if (done % 50 === 0) {
        console.log(`  ${done}/${bootstrap.elements.length}`);
      }
    });
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    season,
    source: useBootstrap ? "bootstrap-static" : "element-summary",
    playerCount: Object.keys(players).length,
    players,
  };

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(payload, null, 1)}\n`, "utf8");
  console.log(`Wrote ${payload.playerCount} players to ${OUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
