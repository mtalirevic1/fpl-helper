import baselineFile from "@/data/baseline.json";

/** A player's totals across one completed season. */
export interface SeasonAggregate {
  code: number;
  cost: number;
  minutes: number;
  starts: number;
  goals: number;
  assists: number;
  xG: number;
  xA: number;
  xGC: number;
  cleanSheets: number;
  goalsConceded: number;
  saves: number;
  penaltiesSaved: number;
  penaltiesMissed: number;
  yellowCards: number;
  redCards: number;
  ownGoals: number;
  bonus: number;
  bps: number;
  cbi: number;
  tackles: number;
  recoveries: number;
  defensiveContribution: number;
  totalPoints: number;
}

export interface BaselineFile {
  generatedAt: string;
  season: string;
  source: string;
  playerCount: number;
  players: Record<string, SeasonAggregate>;
}

/**
 * Last completed season's totals, captured by `npm run snapshot:baseline`. Keyed
 * by the player's permanent FPL `code` so it survives id reshuffles between
 * seasons. Refresh it once a season (or any time you want a newer prior).
 */
export const baseline = baselineFile as unknown as BaselineFile;

export function baselineFor(code: number): SeasonAggregate | null {
  return baseline.players[String(code)] ?? null;
}

/** Matches in a Premier League season, the denominator for baseline role rates. */
export const BASELINE_TEAM_MATCHES = 38;
