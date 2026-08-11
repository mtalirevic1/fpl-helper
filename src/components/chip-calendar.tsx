import { CHIP_LABEL, type ChipName } from "@/lib/fpl/rules";
import type { EventFixtureProfile } from "@/lib/fpl/dgw-calendar";

import { Badge, Card } from "./ui";

export function ChipCalendar({
  profiles,
}: {
  profiles: EventFixtureProfile[];
}) {
  return (
    <Card
      title="Blank / DGW chip calendar"
      subtitle="Teams with 0 / 1 / 2+ fixtures per gameweek. Chip flags use remaining availability windows."
    >
      <div className="flex gap-2 overflow-x-auto pb-1">
        {profiles.map((profile) => (
          <div
            key={profile.event}
            className="min-w-[7.5rem] shrink-0 rounded-xl border border-line bg-surface-2/50 px-3 py-2"
          >
            <div className="text-xs font-semibold tracking-wider text-ink-dim uppercase">
              GW{profile.event}
            </div>
            <div className="mt-1 text-sm tabular-nums">
              <span className="text-danger">{profile.teamsWithZero} blank</span>
              <span className="text-ink-dim"> · </span>
              <span>{profile.teamsWithOne}×1</span>
              <span className="text-ink-dim"> · </span>
              <span className="text-accent">
                {profile.teamsWithTwoPlus} DGW
              </span>
            </div>
            {profile.suggestedChips.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {profile.suggestedChips.map((chip) => (
                  <Badge key={chip} tone="info">
                    {shortChip(chip)}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

function shortChip(chip: ChipName): string {
  if (chip === "bboost") return "BB";
  if (chip === "3xc") return "3XC";
  if (chip === "freehit") return "FH";
  return CHIP_LABEL[chip] ?? chip;
}
