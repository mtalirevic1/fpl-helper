import type { FixtureProjection } from "@/lib/model/projections";

import { DifficultyPill, FIXTURE_CHIP, cx } from "./ui";

/**
 * A player's or team's upcoming fixtures as difficulty-coloured pills. Two pills
 * under one gameweek means a double; a gap means a blank.
 */
export function FixtureStrip({
  fixtures,
  events,
  showEvent = false,
}: {
  fixtures: FixtureProjection[];
  events: number[];
  showEvent?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-start gap-1">
      {events.map((event) => {
        const inEvent = fixtures.filter((fixture) => fixture.event === event);
        if (!inEvent.length) {
          return (
            <div key={event} className="flex flex-col items-center gap-0.5">
              {showEvent && (
                <span className="text-[10px] leading-none text-ink-dim">
                  GW{event}
                </span>
              )}
              <span
                title={`No fixture in gameweek ${event}`}
                className={cx(
                  FIXTURE_CHIP,
                  "border border-dashed border-line font-normal text-ink-dim",
                )}
              >
                —
              </span>
            </div>
          );
        }
        return (
          <div key={event} className="flex flex-col items-center gap-0.5">
            {showEvent && (
              <span className="text-[10px] leading-none text-ink-dim">
                GW{event}
              </span>
            )}
            <div className="flex flex-col gap-0.5">
              {inEvent.map((fixture) => (
                <DifficultyPill
                  key={fixture.fixtureId}
                  difficulty={fixture.difficulty}
                  title={`GW${fixture.event} · ${
                    fixture.isHome ? "home" : "away"
                  } · difficulty ${fixture.difficulty} · ${fixture.xp} xP`}
                >
                  {fixture.opponentShort}
                  {fixture.isHome ? " (H)" : " (A)"}
                </DifficultyPill>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
