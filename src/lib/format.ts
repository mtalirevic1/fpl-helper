/** Formats a price given in tenths of a million, as the FPL API reports it. */
export function money(tenths: number): string {
  return `£${(tenths / 10).toFixed(1)}m`;
}

export function points(value: number, decimals = 1): string {
  return value.toFixed(decimals);
}

export function signed(value: number, decimals = 1): string {
  const formatted = value.toFixed(decimals);
  return value > 0 ? `+${formatted}` : formatted;
}

export function percent(fraction: number, decimals = 0): string {
  return `${(fraction * 100).toFixed(decimals)}%`;
}

export function compactNumber(value: number): string {
  return new Intl.NumberFormat("en-GB", { notation: "compact" }).format(value);
}

export function ordinal(value: number): string {
  const remainderTen = value % 10;
  const remainderHundred = value % 100;
  if (remainderTen === 1 && remainderHundred !== 11) return `${value}st`;
  if (remainderTen === 2 && remainderHundred !== 12) return `${value}nd`;
  if (remainderTen === 3 && remainderHundred !== 13) return `${value}rd`;
  return `${value}th`;
}

const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/London",
});

/** Kick-off and deadline times, always shown in UK time as FPL does. */
export function ukDateTime(iso: string | null): string {
  if (!iso) return "TBC";
  return `${DATE_FORMAT.format(new Date(iso))} UK`;
}

const SHORT_DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "Europe/London",
});

/** A bare day and month, e.g. "15 Sep", for return dates. */
export function shortDate(iso: string): string {
  return SHORT_DATE_FORMAT.format(new Date(iso));
}

export function statusLabel(status: string, news: string): string | null {
  if (status === "a" && !news) return null;
  if (news) return news;
  const labels: Record<string, string> = {
    d: "Doubtful",
    i: "Injured",
    s: "Suspended",
    u: "Unavailable",
    n: "Not in squad",
  };
  return labels[status] ?? null;
}
