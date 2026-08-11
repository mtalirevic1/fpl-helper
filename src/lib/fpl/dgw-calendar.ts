import type { ChipName } from "./rules";
import type { ChipAvailability } from "./season";
import type { FplBootstrap, FplFixture } from "./types";

export interface EventFixtureProfile {
  event: number;
  teamsWithZero: number;
  teamsWithOne: number;
  teamsWithTwoPlus: number;
  blankTeamIds: number[];
  doubleTeamIds: number[];
  suggestedChips: ChipName[];
}

/**
 * For each upcoming event, count how many clubs blank / play once / double, and
 * flag chip windows that line up with heavy blanks or doubles.
 */
export function buildDgwCalendar(
  bootstrap: FplBootstrap,
  fixtures: FplFixture[],
  fromEvent: number,
  toEvent: number,
  availability: ChipAvailability[],
): EventFixtureProfile[] {
  const teamIds = bootstrap.teams.map((team) => team.id);
  const profiles: EventFixtureProfile[] = [];

  for (let event = fromEvent; event <= toEvent; event += 1) {
    const counts = new Map<number, number>();
    for (const id of teamIds) counts.set(id, 0);
    for (const fixture of fixtures) {
      if (fixture.event !== event) continue;
      counts.set(fixture.team_h, (counts.get(fixture.team_h) ?? 0) + 1);
      counts.set(fixture.team_a, (counts.get(fixture.team_a) ?? 0) + 1);
    }

    let teamsWithZero = 0;
    let teamsWithOne = 0;
    let teamsWithTwoPlus = 0;
    const blankTeamIds: number[] = [];
    const doubleTeamIds: number[] = [];

    for (const id of teamIds) {
      const n = counts.get(id) ?? 0;
      if (n === 0) {
        teamsWithZero += 1;
        blankTeamIds.push(id);
      } else if (n === 1) {
        teamsWithOne += 1;
      } else {
        teamsWithTwoPlus += 1;
        doubleTeamIds.push(id);
      }
    }

    const suggestedChips: ChipName[] = [];
    const open = (chip: ChipName) =>
      availability.some(
        (row) =>
          row.chip === chip &&
          row.available &&
          event >= row.window.startEvent &&
          event <= row.window.stopEvent,
      );

    if (teamsWithTwoPlus >= 4 && open("bboost")) suggestedChips.push("bboost");
    if (teamsWithTwoPlus >= 2 && open("3xc")) suggestedChips.push("3xc");
    if (teamsWithZero >= 4 && open("freehit")) suggestedChips.push("freehit");

    profiles.push({
      event,
      teamsWithZero,
      teamsWithOne,
      teamsWithTwoPlus,
      blankTeamIds,
      doubleTeamIds,
      suggestedChips,
    });
  }

  return profiles;
}
