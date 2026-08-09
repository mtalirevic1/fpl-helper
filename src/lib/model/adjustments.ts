import type { FplBootstrap } from "../fpl/types";
import { clamp } from "./math";
import { MODEL } from "./config";

/**
 * Manual availability intelligence the FPL API does not carry: players easing
 * back after a deep World Cup run, informal injury doubts from press
 * conferences, or known rotation situations. The curated list lives in
 * `src/data/manual-adjustments.ts`; this module matches it against live FPL
 * data and turns it into per-gameweek start-probability factors.
 */

export type AdjustmentKind = "world-cup" | "injury-doubt" | "rotation";

export interface AdjustmentWindow {
  fromEvent: number;
  toEvent: number;
  /** Multiplier on the chance of starting in these gameweeks (0–1). */
  startFactor: number;
}

export interface ManualAdjustment {
  /**
   * Matched against the player's web name, surname and full name, ignoring
   * case and accents. Use the full name for common surnames ("Emiliano
   * Martínez", not "Martínez").
   */
  player: string;
  /** Three-letter club code (e.g. "ARS") if the name alone is ambiguous. */
  team?: string;
  kind: AdjustmentKind;
  /** Shown in the UI next to the player. */
  reason: string;
  windows: AdjustmentWindow[];
}

export interface AdjustmentIndex {
  /** Adjustments that matched exactly one player, keyed by element id. */
  byElement: Map<number, ManualAdjustment[]>;
  /** Entries whose name matched no player — usually a transfer or a typo. */
  unmatched: string[];
  /** Entries that matched several players and need a team or fuller name. */
  ambiguous: string[];
}

const normalize = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

/** Resolves the curated list against live bootstrap data by name. */
export function buildAdjustmentIndex(
  bootstrap: FplBootstrap,
  adjustments: ManualAdjustment[],
): AdjustmentIndex {
  const teamShortById = new Map(
    bootstrap.teams.map((team) => [team.id, normalize(team.short_name)]),
  );

  const byName = new Map<string, number[]>();
  for (const element of bootstrap.elements) {
    const names = new Set([
      normalize(element.web_name),
      normalize(element.second_name),
      normalize(`${element.first_name} ${element.second_name}`),
      normalize(`${element.first_name} ${element.web_name}`),
    ]);
    for (const name of names) {
      if (!name) continue;
      const list = byName.get(name);
      if (list) list.push(element.id);
      else byName.set(name, [element.id]);
    }
  }

  const elementsById = new Map(bootstrap.elements.map((e) => [e.id, e]));
  const byElement = new Map<number, ManualAdjustment[]>();
  const unmatched: string[] = [];
  const ambiguous: string[] = [];

  for (const adjustment of adjustments) {
    let ids = byName.get(normalize(adjustment.player)) ?? [];
    if (ids.length > 1 && adjustment.team) {
      const wanted = normalize(adjustment.team);
      ids = ids.filter(
        (id) => teamShortById.get(elementsById.get(id)!.team) === wanted,
      );
    }
    if (ids.length === 0) {
      unmatched.push(adjustment.player);
      continue;
    }
    if (ids.length > 1) {
      ambiguous.push(adjustment.player);
      continue;
    }
    const list = byElement.get(ids[0]);
    if (list) list.push(adjustment);
    else byElement.set(ids[0], [adjustment]);
  }

  return { byElement, unmatched, ambiguous };
}

/**
 * The combined start-probability factor for one player in one gameweek.
 * Goalkeepers keep more of their place after a long summer than outfielders,
 * so their penalty is softened.
 */
export function startFactorFor(
  adjustments: ManualAdjustment[],
  event: number,
  isGoalkeeper: boolean,
): number {
  let factor = 1;
  for (const adjustment of adjustments) {
    for (const window of adjustment.windows) {
      if (event < window.fromEvent || event > window.toEvent) continue;
      factor *= clamp(window.startFactor, 0, 1);
    }
  }
  if (isGoalkeeper && factor < 1) {
    factor = 1 - (1 - factor) * MODEL.keeperAdjustmentShare;
  }
  return factor;
}

const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

/**
 * Pulls the return date out of FPL's news text, e.g. "Hamstring injury -
 * Expected back 15 Sep" or "Suspended until 30 Aug". Returns a UTC timestamp,
 * or null when the news carries no parseable date.
 *
 * FPL never states the year, so it is inferred from the reference time: a date
 * that would land more than 45 days in the past is taken to mean next year
 * (news posted in December about a January return, or a long-term injury).
 */
export function parseReturnDate(
  news: string,
  referenceMs: number,
): number | null {
  if (!news) return null;
  const match = news.match(
    /\b(?:expected back|suspended until|available from)\s+(\d{1,2})\s+([a-z]{3})/i,
  );
  if (!match) return null;

  const day = Number(match[1]);
  const month = MONTHS[match[2].toLowerCase()];
  if (month === undefined || day < 1 || day > 31) return null;

  const reference = new Date(referenceMs);
  let timestamp = Date.UTC(reference.getUTCFullYear(), month, day, 12);
  if (timestamp < referenceMs - 45 * 24 * 60 * 60 * 1000) {
    timestamp = Date.UTC(reference.getUTCFullYear() + 1, month, day, 12);
  }
  return timestamp;
}

/**
 * Availability for a single fixture, once a return date is known: before the
 * date the flagged availability stands, from the date onwards the player is
 * treated as back, at slightly reduced availability for injuries (setback risk)
 * and full availability after a suspension.
 */
export function availabilityForFixture(
  flaggedAvailability: number,
  status: string,
  returnMs: number | null,
  fixtureMs: number | null,
): number {
  if (returnMs === null || fixtureMs === null) return flaggedAvailability;
  if (fixtureMs < returnMs) return flaggedAvailability;
  const restored =
    status === "s"
      ? MODEL.availabilityAfterSuspension
      : MODEL.availabilityAfterReturn;
  return Math.max(flaggedAvailability, restored);
}
