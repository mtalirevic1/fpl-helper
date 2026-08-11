import type { PlayerProjection } from "./model/projections";

export interface RiskItem {
  id: number;
  name: string;
  teamShort: string;
  news: string;
  status: string;
  selectedByPercent: number;
  availability: number;
  expectedReturn: string | null;
  /** Ownership × how unavailable — higher means more template risk. */
  score: number;
}

/** Aggregate injury / availability news weighted by ownership. */
export function buildRiskDesk(
  players: PlayerProjection[],
  limit = 12,
): RiskItem[] {
  return players
    .filter(
      (player) =>
        (player.news && player.news.trim().length > 0) ||
        player.status !== "a" ||
        player.availability < 1,
    )
    .map((player) => {
      const importance = 1 - player.availability;
      return {
        id: player.id,
        name: player.name,
        teamShort: player.teamShort,
        news: player.news || statusFallback(player.status),
        status: player.status,
        selectedByPercent: player.selectedByPercent,
        availability: player.availability,
        expectedReturn: player.expectedReturn,
        score: player.selectedByPercent * (0.35 + importance),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function statusFallback(status: string): string {
  switch (status) {
    case "i":
      return "Injured";
    case "s":
      return "Suspended";
    case "u":
      return "Unavailable";
    case "d":
      return "Doubtful";
    case "n":
      return "Not in squad";
    default:
      return "Availability flag";
  }
}
