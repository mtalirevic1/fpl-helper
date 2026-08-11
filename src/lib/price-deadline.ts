/**
 * FPL does not publish a price-change timestamp. Price moves typically land
 * around 01:30 UK time on days when the market is open. This is a labelled
 * heuristic for countdown UI only — not an official deadline.
 */

const LONDON = "Europe/London";

function londonParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: LONDON,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

/** Instant when London local wall-clock matches the given Y-M-D H:M. */
function londonWallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): number {
  // Binary-search UTC so the London wall clock matches the target.
  let lo = Date.UTC(year, month - 1, day - 1, 0, 0);
  let hi = Date.UTC(year, month - 1, day + 1, 23, 59);
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const parts = londonParts(new Date(mid));
    const ahead =
      parts.year > year ||
      (parts.year === year && parts.month > month) ||
      (parts.year === year && parts.month === month && parts.day > day) ||
      (parts.year === year &&
        parts.month === month &&
        parts.day === day &&
        (parts.hour > hour ||
          (parts.hour === hour && parts.minute >= minute)));
    if (ahead) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/** Next typical ~01:30 UK price-change window from `now`. */
export function nextPriceChangeHeuristic(now = Date.now()): number {
  const parts = londonParts(new Date(now));
  let year = parts.year;
  let month = parts.month;
  let day = parts.day;
  let candidate = londonWallTimeToUtc(year, month, day, 1, 30);
  if (candidate <= now) {
    const next = new Date(Date.UTC(year, month - 1, day + 1));
    // Re-read calendar day in London after advancing UTC day.
    const advanced = londonParts(next);
    year = advanced.year;
    month = advanced.month;
    day = advanced.day;
    // If advancing UTC day didn't move London day (rare), step again.
    if (day === parts.day && month === parts.month && year === parts.year) {
      const further = londonParts(
        new Date(Date.UTC(year, month - 1, day + 2)),
      );
      year = further.year;
      month = further.month;
      day = further.day;
    }
    candidate = londonWallTimeToUtc(year, month, day, 1, 30);
    if (candidate <= now) {
      const dayAfter = new Date(candidate + 36 * 3600 * 1000);
      const p = londonParts(dayAfter);
      candidate = londonWallTimeToUtc(p.year, p.month, p.day, 1, 30);
    }
  }
  return candidate;
}
