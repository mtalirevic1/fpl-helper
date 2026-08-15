import { MANUAL_ADJUSTMENTS } from "../../data/manual-adjustments";
import type { FplBootstrap, FplElement } from "../fpl/types";
import {
  buildAdjustmentIndex,
  startFactorFor,
  type ManualAdjustment,
} from "./adjustments";

export interface AdjustmentSnapshotPlayer {
  id: number;
  name: string;
  status: string;
  chanceNext: number | null;
  news: string;
  newsAdded: string | null;
}

export interface AdjustmentSnapshot {
  generatedAt: string;
  targetEvent: number;
  players: AdjustmentSnapshotPlayer[];
}

export interface AdjustmentReviewRow {
  id: number;
  name: string;
  teamShort: string;
  kind: ManualAdjustment["kind"];
  reason: string;
  startFactor: number;
  status: string;
  chanceNext: number | null;
  news: string;
  newsAdded: string | null;
  detail: string;
}

export interface AdjustmentReview {
  targetEvent: number;
  unmatched: string[];
  ambiguous: string[];
  /** Every window has already passed the open transfer gameweek. */
  expired: AdjustmentReviewRow[];
  /** FPL already flags them out — the curated haircut is redundant. */
  fplAlreadyOut: AdjustmentReviewRow[];
  /** We haircut them hard while FPL still says they are likely to play. */
  chanceConflict: AdjustmentReviewRow[];
  /** Official news/status changed since the last committed snapshot. */
  newsChanged: AdjustmentReviewRow[];
  active: AdjustmentReviewRow[];
}

const OUT_STATUSES = new Set(["i", "s", "u", "n"]);

function chanceNextOf(element: FplElement): number | null {
  return element.chance_of_playing_next_round;
}

function rowFor(
  element: FplElement,
  teamShort: string,
  adjustment: ManualAdjustment,
  event: number,
  isGoalkeeper: boolean,
  detail: string,
): AdjustmentReviewRow {
  return {
    id: element.id,
    name: element.web_name,
    teamShort,
    kind: adjustment.kind,
    reason: adjustment.reason,
    startFactor: startFactorFor([adjustment], event, isGoalkeeper),
    status: element.status,
    chanceNext: chanceNextOf(element),
    news: element.news,
    newsAdded: element.news_added,
    detail,
  };
}

/**
 * Compares the curated adjustment list to live bootstrap flags. Never writes
 * start factors — it only tells you which entries look stale or redundant.
 */
export function reviewAdjustments(
  bootstrap: FplBootstrap,
  targetEvent: number,
  snapshot: AdjustmentSnapshot | null = null,
  adjustments: ManualAdjustment[] = MANUAL_ADJUSTMENTS,
): AdjustmentReview {
  const index = buildAdjustmentIndex(bootstrap, adjustments);
  const teams = new Map(
    bootstrap.teams.map((team) => [team.id, team.short_name]),
  );
  const byId = new Map(bootstrap.elements.map((element) => [element.id, element]));
  const previous = new Map(
    (snapshot?.players ?? []).map((player) => [player.id, player]),
  );

  const expired: AdjustmentReviewRow[] = [];
  const fplAlreadyOut: AdjustmentReviewRow[] = [];
  const chanceConflict: AdjustmentReviewRow[] = [];
  const newsChanged: AdjustmentReviewRow[] = [];
  const active: AdjustmentReviewRow[] = [];

  for (const [id, list] of index.byElement) {
    const element = byId.get(id);
    if (!element) continue;
    const teamShort = teams.get(element.team) ?? "?";
    const isGoalkeeper = element.element_type === 1;

    for (const adjustment of list) {
      const lastWindow = Math.max(
        ...adjustment.windows.map((window) => window.toEvent),
        0,
      );
      const startFactor = startFactorFor(
        [adjustment],
        targetEvent,
        isGoalkeeper,
      );
      const chance = chanceNextOf(element);
      const flaggedOut =
        OUT_STATUSES.has(element.status) || chance === 0;

      if (adjustment.windows.length > 0 && lastWindow < targetEvent) {
        expired.push(
          rowFor(
            element,
            teamShort,
            adjustment,
            targetEvent,
            isGoalkeeper,
            `last window GW${lastWindow}`,
          ),
        );
        continue;
      }

      if (flaggedOut) {
        fplAlreadyOut.push(
          rowFor(
            element,
            teamShort,
            adjustment,
            targetEvent,
            isGoalkeeper,
            `FPL status ${element.status}${chance === null ? "" : `, ${chance}% next`}`,
          ),
        );
      } else if (startFactor < 0.3 && (chance === null || chance >= 75) && element.status === "a") {
        chanceConflict.push(
          rowFor(
            element,
            teamShort,
            adjustment,
            targetEvent,
            isGoalkeeper,
            `factor ${startFactor} vs FPL ${chance === null ? "available, no %" : `${chance}%`}`,
          ),
        );
      }

      const before = previous.get(id);
      if (
        before &&
        (before.status !== element.status ||
          before.chanceNext !== chance ||
          before.news !== element.news ||
          before.newsAdded !== element.news_added)
      ) {
        newsChanged.push(
          rowFor(
            element,
            teamShort,
            adjustment,
            targetEvent,
            isGoalkeeper,
            `was ${before.status}${before.chanceNext === null ? "" : `/${before.chanceNext}%`}${before.news ? ` · ${before.news}` : ""}`,
          ),
        );
      }

      if (startFactor < 1) {
        active.push(
          rowFor(
            element,
            teamShort,
            adjustment,
            targetEvent,
            isGoalkeeper,
            adjustment.kind,
          ),
        );
      }
    }
  }

  return {
    targetEvent,
    unmatched: index.unmatched,
    ambiguous: index.ambiguous,
    expired,
    fplAlreadyOut,
    chanceConflict,
    newsChanged,
    active,
  };
}

export function snapshotFromReview(
  bootstrap: FplBootstrap,
  targetEvent: number,
  adjustments: ManualAdjustment[] = MANUAL_ADJUSTMENTS,
): AdjustmentSnapshot {
  const index = buildAdjustmentIndex(bootstrap, adjustments);
  const byId = new Map(bootstrap.elements.map((element) => [element.id, element]));
  const players: AdjustmentSnapshotPlayer[] = [];
  for (const id of [...index.byElement.keys()].sort((a, b) => a - b)) {
    const element = byId.get(id);
    if (!element) continue;
    players.push({
      id: element.id,
      name: element.web_name,
      status: element.status,
      chanceNext: chanceNextOf(element),
      news: element.news,
      newsAdded: element.news_added,
    });
  }
  return {
    generatedAt: new Date().toISOString(),
    targetEvent,
    players,
  };
}

export function reviewHasBlockers(review: AdjustmentReview): boolean {
  return review.unmatched.length > 0 || review.ambiguous.length > 0;
}

export function formatAdjustmentReview(review: AdjustmentReview): string {
  const lines: string[] = [];
  const section = (title: string, rows: AdjustmentReviewRow[]) => {
    if (!rows.length) return;
    lines.push(`${title} (${rows.length})`);
    for (const row of rows) {
      lines.push(
        `  ${row.name.padEnd(16)} ${row.teamShort}  ${row.kind.padEnd(13)} factor ${row.startFactor}  ${row.detail}`,
      );
    }
  };

  lines.push(`Target GW${review.targetEvent}`);
  if (review.unmatched.length) {
    lines.push(`Unmatched — remove or rename: ${review.unmatched.join(", ")}`);
  }
  if (review.ambiguous.length) {
    lines.push(`Ambiguous — add a team code: ${review.ambiguous.join(", ")}`);
  }
  section("Expired windows", review.expired);
  section("FPL already marks them out (haircut is redundant)", review.fplAlreadyOut);
  section("Hard haircut vs FPL still available", review.chanceConflict);
  section("News/status changed since snapshot", review.newsChanged);
  lines.push(`Active haircuts in GW${review.targetEvent}: ${review.active.length}`);
  return lines.join("\n");
}
