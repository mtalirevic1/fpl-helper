import type { FplBootstrap, FplFixture, FplTeam } from "../fpl/types";
import { clamp, poissonZero, shrink } from "./math";

/**
 * Long-run Premier League scoring rates, used as the baseline that team strength
 * multipliers are applied to. Home teams average a little over 1.5 goals a game,
 * away teams a little under 1.3.
 */
export const LEAGUE_BASE_GOALS = { home: 1.52, away: 1.28 } as const;

/**
 * How far a team's strength rating moves its scoring and conceding rates. A team
 * rated 5 out of 5 scores roughly 50% more than average and concedes roughly 40%
 * less, which is what these log-scale coefficients reproduce.
 */
const RATING_ELASTICITY = { attack: 0.4, concede: -0.5 } as const;

/** Matches of real results needed before they outweigh the preseason ratings. */
const RESULTS_PRIOR_MATCHES = 8;

export interface TeamModel {
  id: number;
  name: string;
  shortName: string;
  attackHome: number;
  attackAway: number;
  concedeHome: number;
  concedeAway: number;
  matchesPlayed: number;
  /** Model-expected goals for and against averaged over all 38 fixtures. */
  avgGoalsFor: number;
  avgGoalsAgainst: number;
}

export interface FixtureExpectation {
  fixture: FplFixture;
  teamId: number;
  opponentId: number;
  isHome: boolean;
  difficulty: number;
  /** Expected goals scored by `teamId` in this fixture. */
  goalsFor: number;
  /** Expected goals conceded by `teamId` in this fixture. */
  goalsAgainst: number;
  cleanSheetProbability: number;
  /** Fixture goals-for relative to the team's own season average. */
  attackScale: number;
  /** Fixture goals-against relative to the team's own season average. */
  concedeScale: number;
}

export interface TeamStrength {
  teams: Map<number, TeamModel>;
  expectation(fixture: FplFixture, teamId: number): FixtureExpectation;
}

function ratingMultipliers(team: FplTeam) {
  // `strength_attack_*` and `strength_defence_*` are only populated once the
  // season is under way; before then only the 1-5 overall ratings are set.
  const quality = (rating: number) => clamp((rating - 3) / 2, -1, 1);
  return {
    attackHome: Math.exp(
      RATING_ELASTICITY.attack * quality(team.strength_overall_home),
    ),
    attackAway: Math.exp(
      RATING_ELASTICITY.attack * quality(team.strength_overall_away),
    ),
    concedeHome: Math.exp(
      RATING_ELASTICITY.concede * quality(team.strength_overall_home),
    ),
    concedeAway: Math.exp(
      RATING_ELASTICITY.concede * quality(team.strength_overall_away),
    ),
  };
}

interface Results {
  matches: number;
  goalsFor: number;
  goalsAgainst: number;
  expectedGoalsForBase: number;
  expectedGoalsAgainstBase: number;
}

function collectResults(
  bootstrap: FplBootstrap,
  fixtures: FplFixture[],
  ratings: Map<number, ReturnType<typeof ratingMultipliers>>,
): Map<number, Results> {
  const results = new Map<number, Results>();
  for (const team of bootstrap.teams) {
    results.set(team.id, {
      matches: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      expectedGoalsForBase: 0,
      expectedGoalsAgainstBase: 0,
    });
  }

  for (const fixture of fixtures) {
    if (!fixture.finished) continue;
    if (fixture.team_h_score === null || fixture.team_a_score === null) continue;

    const home = results.get(fixture.team_h);
    const away = results.get(fixture.team_a);
    const homeRating = ratings.get(fixture.team_h);
    const awayRating = ratings.get(fixture.team_a);
    if (!home || !away || !homeRating || !awayRating) continue;

    home.matches += 1;
    home.goalsFor += fixture.team_h_score;
    home.goalsAgainst += fixture.team_a_score;
    // What the ratings alone expected, so observed results can be compared to it
    // rather than to a flat league average that ignores fixture difficulty.
    home.expectedGoalsForBase +=
      LEAGUE_BASE_GOALS.home * homeRating.attackHome * awayRating.concedeAway;
    home.expectedGoalsAgainstBase +=
      LEAGUE_BASE_GOALS.away * awayRating.attackAway * homeRating.concedeHome;

    away.matches += 1;
    away.goalsFor += fixture.team_a_score;
    away.goalsAgainst += fixture.team_h_score;
    away.expectedGoalsForBase +=
      LEAGUE_BASE_GOALS.away * awayRating.attackAway * homeRating.concedeHome;
    away.expectedGoalsAgainstBase +=
      LEAGUE_BASE_GOALS.home * homeRating.attackHome * awayRating.concedeAway;
  }

  return results;
}

/**
 * Builds a Poisson goals model for every team, driven by FPL's own strength
 * ratings before the season starts and progressively taken over by real results
 * as they accumulate.
 */
export function buildTeamStrength(
  bootstrap: FplBootstrap,
  fixtures: FplFixture[],
): TeamStrength {
  const ratings = new Map(
    bootstrap.teams.map((team) => [team.id, ratingMultipliers(team)]),
  );
  const results = collectResults(bootstrap, fixtures, ratings);

  const teams = new Map<number, TeamModel>();
  for (const team of bootstrap.teams) {
    const rating = ratings.get(team.id)!;
    const record = results.get(team.id)!;

    // A single form factor per team, applied to both home and away multipliers,
    // keeps the venue split coming from the ratings where the sample is larger.
    const attackForm =
      record.expectedGoalsForBase > 0
        ? shrink(
            record.goalsFor / record.expectedGoalsForBase,
            record.matches,
            1,
            RESULTS_PRIOR_MATCHES,
          )
        : 1;
    const concedeForm =
      record.expectedGoalsAgainstBase > 0
        ? shrink(
            record.goalsAgainst / record.expectedGoalsAgainstBase,
            record.matches,
            1,
            RESULTS_PRIOR_MATCHES,
          )
        : 1;

    teams.set(team.id, {
      id: team.id,
      name: team.name,
      shortName: team.short_name,
      attackHome: rating.attackHome * clamp(attackForm, 0.5, 2),
      attackAway: rating.attackAway * clamp(attackForm, 0.5, 2),
      concedeHome: rating.concedeHome * clamp(concedeForm, 0.5, 2),
      concedeAway: rating.concedeAway * clamp(concedeForm, 0.5, 2),
      matchesPlayed: record.matches,
      avgGoalsFor: 0,
      avgGoalsAgainst: 0,
    });
  }

  const rawGoals = (fixture: FplFixture) => {
    const home = teams.get(fixture.team_h);
    const away = teams.get(fixture.team_a);
    if (!home || !away) return { home: LEAGUE_BASE_GOALS.home, away: LEAGUE_BASE_GOALS.away };
    return {
      home: LEAGUE_BASE_GOALS.home * home.attackHome * away.concedeAway,
      away: LEAGUE_BASE_GOALS.away * away.attackAway * home.concedeHome,
    };
  };

  // Second pass: each team's own season average, which is the denominator used to
  // express a single fixture as "easier or harder than usual for this player".
  const totals = new Map<number, { for: number; against: number; n: number }>();
  for (const fixture of fixtures) {
    if (fixture.event === null) continue;
    const goals = rawGoals(fixture);
    for (const [teamId, forGoals, againstGoals] of [
      [fixture.team_h, goals.home, goals.away],
      [fixture.team_a, goals.away, goals.home],
    ] as const) {
      const total = totals.get(teamId) ?? { for: 0, against: 0, n: 0 };
      total.for += forGoals;
      total.against += againstGoals;
      total.n += 1;
      totals.set(teamId, total);
    }
  }
  for (const team of teams.values()) {
    const total = totals.get(team.id);
    team.avgGoalsFor = total && total.n > 0 ? total.for / total.n : 1.4;
    team.avgGoalsAgainst = total && total.n > 0 ? total.against / total.n : 1.4;
  }

  return {
    teams,
    expectation(fixture, teamId): FixtureExpectation {
      const isHome = fixture.team_h === teamId;
      const opponentId = isHome ? fixture.team_a : fixture.team_h;
      const goals = rawGoals(fixture);
      const goalsFor = isHome ? goals.home : goals.away;
      const goalsAgainst = isHome ? goals.away : goals.home;
      const team = teams.get(teamId);
      return {
        fixture,
        teamId,
        opponentId,
        isHome,
        difficulty: isHome
          ? fixture.team_h_difficulty
          : fixture.team_a_difficulty,
        goalsFor,
        goalsAgainst,
        cleanSheetProbability: poissonZero(goalsAgainst),
        attackScale: team ? clamp(goalsFor / team.avgGoalsFor, 0.4, 2.5) : 1,
        concedeScale: team
          ? clamp(goalsAgainst / team.avgGoalsAgainst, 0.4, 2.5)
          : 1,
      };
    },
  };
}
