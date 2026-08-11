import type {
  FplBootstrap,
  FplClassicLeagueStandings,
  FplElementSummary,
  FplEntry,
  FplEntryHistory,
  FplEntryPicks,
  FplFixture,
  FplLive,
} from "./types";

const BASE = "https://fantasy.premierleague.com/api";

/** Live-ish data: prices, injuries, ownership. Five minutes is plenty. */
const REVALIDATE_LIVE = 300;
/** Season-long history changes at most once a gameweek. */
const REVALIDATE_HISTORY = 60 * 60 * 24;

export class FplApiError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
  ) {
    super(`FPL API request failed (${status}): ${url}`);
    this.name = "FplApiError";
  }
}

/**
 * Deduplicates identical requests made while rendering a single page. Next's own
 * data cache handles caching across requests; this only avoids the same payload
 * being fetched twice by different components, and keeps the standalone scripts
 * in `scripts/` from hammering the API.
 */
const inFlight = new Map<string, { at: number; promise: Promise<unknown> }>();
const DEDUPE_MS = 5_000;

async function get<T>(path: string, revalidate: number): Promise<T> {
  const cached = inFlight.get(path);
  if (cached && Date.now() - cached.at < DEDUPE_MS) {
    return cached.promise as Promise<T>;
  }

  const url = `${BASE}${path}`;
  const promise = (async () => {
    const res = await fetch(url, {
      // The API rejects requests that do not look like a browser.
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; fpl-edge/1.0; +https://github.com/mtalirevic1/fpl-helper)",
        Accept: "application/json",
      },
      // Caching is opt-in from Next 16 onwards, so it is requested explicitly
      // rather than relying on the revalidate window alone.
      cache: "force-cache",
      next: { revalidate },
    });
    if (!res.ok) throw new FplApiError(res.status, url);
    return (await res.json()) as T;
  })();

  inFlight.set(path, { at: Date.now(), promise });
  promise.catch(() => inFlight.delete(path));
  return promise;
}

/** Players, teams, gameweeks, game settings and chip windows in one payload. */
export function getBootstrap(): Promise<FplBootstrap> {
  return get<FplBootstrap>("/bootstrap-static/", REVALIDATE_LIVE);
}

/** All 380 fixtures, including results and per-team difficulty ratings. */
export function getFixtures(): Promise<FplFixture[]> {
  return get<FplFixture[]>("/fixtures/", REVALIDATE_LIVE);
}

/** Per-gameweek history, past-season totals and upcoming fixtures for one player. */
export function getElementSummary(
  elementId: number,
): Promise<FplElementSummary> {
  return get<FplElementSummary>(
    `/element-summary/${elementId}/`,
    REVALIDATE_HISTORY,
  );
}

/** Live points for an in-progress gameweek. */
export function getLive(event: number): Promise<FplLive> {
  return get<FplLive>(`/event/${event}/live/`, 60);
}

/** A public manager profile. */
export function getEntry(entryId: number): Promise<FplEntry> {
  return get<FplEntry>(`/entry/${entryId}/`, REVALIDATE_LIVE);
}

/** A manager's squad for a given gameweek, with selling prices where exposed. */
export function getEntryPicks(
  entryId: number,
  event: number,
): Promise<FplEntryPicks> {
  return get<FplEntryPicks>(`/entry/${entryId}/event/${event}/picks/`, 60);
}

/** A manager's gameweek-by-gameweek record and the chips they have played. */
export function getEntryHistory(entryId: number): Promise<FplEntryHistory> {
  return get<FplEntryHistory>(`/entry/${entryId}/history/`, 60);
}

/** Classic mini-league standings (public). */
export function getClassicLeagueStandings(
  leagueId: number,
  page = 1,
): Promise<FplClassicLeagueStandings> {
  return get<FplClassicLeagueStandings>(
    `/leagues-classic/${leagueId}/standings/?page_standings=${page}`,
    120,
  );
}
