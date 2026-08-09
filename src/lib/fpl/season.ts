import { CHIPS, type ChipName } from "./rules";
import type { FplBootstrap, FplEvent, FplFixture } from "./types";

export interface SeasonState {
  /** The gameweek currently being played, if any. */
  currentEvent: FplEvent | null;
  /** The next gameweek that can still be transferred into. */
  nextEvent: FplEvent | null;
  /** The most recently completed gameweek. */
  previousEvent: FplEvent | null;
  /** Gameweeks with all matches finished and data checked. */
  finishedEvents: number;
  /**
   * True before the first ball is kicked. The API keeps last season's totals in
   * `bootstrap-static.elements` until the season starts, so in preseason those
   * aggregates describe the *previous* campaign rather than this one.
   */
  isPreseason: boolean;
  /** The gameweek recommendations should be built for. */
  targetEvent: number;
  /** Deadline for `targetEvent` as an epoch in milliseconds. */
  targetDeadline: number | null;
  /** Matches each team has completed this season, keyed by team id. */
  matchesPlayed: Map<number, number>;
}

export function getSeasonState(
  bootstrap: FplBootstrap,
  fixtures: FplFixture[],
): SeasonState {
  const currentEvent = bootstrap.events.find((e) => e.is_current) ?? null;
  const nextEvent = bootstrap.events.find((e) => e.is_next) ?? null;
  const previousEvent = bootstrap.events.find((e) => e.is_previous) ?? null;
  const finishedEvents = bootstrap.events.filter((e) => e.finished).length;

  const matchesPlayed = new Map<number, number>();
  for (const team of bootstrap.teams) matchesPlayed.set(team.id, 0);
  for (const fixture of fixtures) {
    if (!fixture.finished) continue;
    for (const id of [fixture.team_h, fixture.team_a]) {
      matchesPlayed.set(id, (matchesPlayed.get(id) ?? 0) + 1);
    }
  }

  const anyMatchStarted = fixtures.some((f) => f.started);
  const isPreseason = !anyMatchStarted && currentEvent === null;

  // Advice must always target a gameweek whose deadline has not passed. Once a
  // gameweek kicks off, transfers, captaincy and chips all apply to the next
  // one, so the in-progress gameweek is only targeted when it is the last.
  const target = nextEvent ?? currentEvent;
  const targetEvent = target?.id ?? bootstrap.events.at(-1)?.id ?? 1;

  return {
    currentEvent,
    nextEvent,
    previousEvent,
    finishedEvents,
    isPreseason,
    targetEvent,
    targetDeadline: target ? target.deadline_time_epoch * 1000 : null,
    matchesPlayed,
  };
}

/** Fixtures for a gameweek range, grouped by team id. Handles blanks and doubles. */
export function fixturesByTeam(
  fixtures: FplFixture[],
  fromEvent: number,
  toEvent: number,
): Map<number, FplFixture[]> {
  const byTeam = new Map<number, FplFixture[]>();
  for (const fixture of fixtures) {
    if (fixture.event === null) continue;
    if (fixture.event < fromEvent || fixture.event > toEvent) continue;
    for (const id of [fixture.team_h, fixture.team_a]) {
      const list = byTeam.get(id);
      if (list) list.push(fixture);
      else byTeam.set(id, [fixture]);
    }
  }
  for (const list of byTeam.values()) {
    list.sort((a, b) => (a.event ?? 0) - (b.event ?? 0));
  }
  return byTeam;
}

/** Difficulty (1-5) and venue for one team in one fixture. */
export function fixtureView(fixture: FplFixture, teamId: number) {
  const isHome = fixture.team_h === teamId;
  return {
    isHome,
    opponent: isHome ? fixture.team_a : fixture.team_h,
    difficulty: isHome ? fixture.team_h_difficulty : fixture.team_a_difficulty,
  };
}

export interface ChipAvailability {
  chip: ChipName;
  half: "firstHalf" | "secondHalf";
  available: boolean;
  playedInEvent: number | null;
  window: { startEvent: number; stopEvent: number };
}

/**
 * Which of the eight chips remain. Chips come in two sets: the first must be
 * played by the Gameweek 19 deadline, the second is available from Gameweek 20.
 */
export function chipAvailability(
  bootstrap: FplBootstrap,
  chipsPlayed: Array<{ name: string; event: number }>,
): ChipAvailability[] {
  const out: ChipAvailability[] = [];
  for (const chip of CHIPS.names) {
    for (const half of ["firstHalf", "secondHalf"] as const) {
      const declared = bootstrap.chips.find(
        (c) =>
          c.name === chip &&
          (half === "firstHalf"
            ? c.stop_event <= CHIPS.firstHalf.stopEvent
            : c.start_event >= CHIPS.secondHalf.startEvent),
      );
      const window = declared
        ? { startEvent: declared.start_event, stopEvent: declared.stop_event }
        : CHIPS[half];
      const played = chipsPlayed.find(
        (c) =>
          c.name === chip &&
          c.event >= window.startEvent &&
          c.event <= window.stopEvent,
      );
      out.push({
        chip,
        half,
        available: !played,
        playedInEvent: played?.event ?? null,
        window,
      });
    }
  }
  return out;
}
