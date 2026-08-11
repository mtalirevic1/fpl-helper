/**
 * Writes a committed projection snapshot for backtesting:
 * `src/data/backtest/gw{N}.json`
 *
 * Usage: npx tsx scripts/snapshot-gw.ts [event]
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildProjections } from "../src/lib/model/projections";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function main() {
  const projections = await buildProjections(1);
  const event =
    Number(process.argv[2]) || projections.season.targetEvent;

  const payload = {
    event,
    generatedAt: new Date().toISOString(),
    targetEvent: projections.season.targetEvent,
    players: projections.players.map((player) => ({
      id: player.id,
      name: player.name,
      position: player.position,
      teamId: player.teamId,
      price: player.price,
      xpNext: player.xpNext,
      xpNextLow: player.xpNextLow,
      xpNextHigh: player.xpNextHigh,
      xpHorizon: player.xpHorizon,
      selectedByPercent: player.selectedByPercent,
      startProbability: player.breakdownNext.startProbability,
      dataSource: player.dataSource,
    })),
  };

  const dir = resolve(ROOT, "src/data/backtest");
  await mkdir(dir, { recursive: true });
  const out = resolve(dir, `gw${event}.json`);
  await writeFile(out, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Wrote ${out} (${payload.players.length} players)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
