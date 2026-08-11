import type { PlayerProjection } from "../model/projections";
import { bestXi } from "./xi";
import type { OwnedPlayer } from "./transfers";

export interface OwnershipRow {
  id: number;
  name: string;
  teamShort: string;
  ownership: number;
  effectiveOwnership: number;
  isCaptain: boolean;
  differential: boolean;
  highlyOwned: boolean;
}

export interface OwnershipSummary {
  rows: OwnershipRow[];
  averageOwnership: number;
  averageEffectiveOwnership: number;
  differentialCount: number;
  highlyOwnedCount: number;
  /** Template XI by next-GW xP that you do not own. */
  missingTemplate: PlayerProjection[];
  /** Owned players who would not make a pure xP template XI. */
  holdingOverTemplate: PlayerProjection[];
}

const DIFFERENTIAL_MAX = 8;
const HIGHLY_OWNED_MIN = 20;

/**
 * Compares a squad's ownership profile to the field and to a projected template
 * XI for the target gameweek.
 */
export function analyseOwnership(
  owned: OwnedPlayer[],
  byId: Map<number, PlayerProjection>,
  pool: PlayerProjection[],
): OwnershipSummary {
  const rows: OwnershipRow[] = owned
    .map((entry) => {
      const player = byId.get(entry.id);
      if (!player) return null;
      const ownership = player.selectedByPercent;
      const effectiveOwnership = entry.isCaptain ? ownership * 2 : ownership;
      return {
        id: player.id,
        name: player.name,
        teamShort: player.teamShort,
        ownership,
        effectiveOwnership,
        isCaptain: entry.isCaptain,
        differential: ownership < DIFFERENTIAL_MAX,
        highlyOwned: ownership >= HIGHLY_OWNED_MIN,
      };
    })
    .filter((row): row is OwnershipRow => Boolean(row))
    .sort((a, b) => b.effectiveOwnership - a.effectiveOwnership);

  const averageOwnership =
    rows.reduce((total, row) => total + row.ownership, 0) /
    Math.max(1, rows.length);
  const averageEffectiveOwnership =
    rows.reduce((total, row) => total + row.effectiveOwnership, 0) /
    Math.max(1, rows.length);

  const ownedIds = new Set(owned.map((entry) => entry.id));
  const byPosition = {
    1: pool.filter((p) => p.position === 1).sort((a, b) => b.xpNext - a.xpNext),
    2: pool.filter((p) => p.position === 2).sort((a, b) => b.xpNext - a.xpNext),
    3: pool.filter((p) => p.position === 3).sort((a, b) => b.xpNext - a.xpNext),
    4: pool.filter((p) => p.position === 4).sort((a, b) => b.xpNext - a.xpNext),
  };
  const templateFifteen = [
    ...byPosition[1].slice(0, 2),
    ...byPosition[2].slice(0, 5),
    ...byPosition[3].slice(0, 5),
    ...byPosition[4].slice(0, 3),
  ];
  const templateXi = bestXi(
    templateFifteen.map((player) => ({
      id: player.id,
      position: player.position,
      teamId: player.teamId,
      price: player.price,
      xp: player.xpNext,
      xpNext: player.xpNext,
    })),
    "xpNext",
  );

  const templateIds = new Set(templateXi.startingXi.map((player) => player.id));
  const missingTemplate = templateXi.startingXi
    .map((player) => byId.get(player.id))
    .filter((player): player is PlayerProjection =>
      Boolean(player && !ownedIds.has(player.id)),
    );
  const holdingOverTemplate = owned
    .map((entry) => byId.get(entry.id))
    .filter((player): player is PlayerProjection =>
      Boolean(player && !templateIds.has(player.id)),
    )
    .sort((a, b) => a.xpNext - b.xpNext)
    .slice(0, 5);

  return {
    rows,
    averageOwnership,
    averageEffectiveOwnership,
    differentialCount: rows.filter((row) => row.differential).length,
    highlyOwnedCount: rows.filter((row) => row.highlyOwned).length,
    missingTemplate,
    holdingOverTemplate,
  };
}
