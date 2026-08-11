/**
 * Typed localStorage helpers shared across client features. Keys are namespaced
 * under fpl-edge so they do not collide with other sites on the same origin.
 */

const PREFIX = "fpl-edge:";

export const STORAGE_KEYS = {
  teamId: `${PREFIX}team-id`,
  legacyTeamId: "fpl-helper:team-id",
  watchlist: `${PREFIX}watchlist`,
  builderHistory: `${PREFIX}builder-history`,
  advancedPrefs: `${PREFIX}advanced-prefs`,
} as const;

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function storageGet(key: string): string | null {
  if (!canUseStorage()) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function storageSet(key: string, value: string) {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Quota or private mode — ignore.
  }
}

export function storageRemove(key: string) {
  if (!canUseStorage()) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function getStoredTeamId(): number | null {
  const raw =
    storageGet(STORAGE_KEYS.teamId) ?? storageGet(STORAGE_KEYS.legacyTeamId);
  if (!raw) return null;
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export function setStoredTeamId(id: number) {
  storageSet(STORAGE_KEYS.teamId, String(id));
}

export function getWatchlist(): number[] {
  const raw = storageGet(STORAGE_KEYS.watchlist);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((value) => Number(value))
      .filter((id) => Number.isFinite(id) && id > 0);
  } catch {
    return [];
  }
}

export function setWatchlist(ids: number[]) {
  storageSet(STORAGE_KEYS.watchlist, JSON.stringify([...new Set(ids)]));
}

export function toggleWatchlist(id: number): number[] {
  const current = getWatchlist();
  const next = current.includes(id)
    ? current.filter((value) => value !== id)
    : [...current, id];
  setWatchlist(next);
  return next;
}

export function getBuilderHistory(): string[] {
  const raw = storageGet(STORAGE_KEYS.builderHistory);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

export function pushBuilderHistory(query: string, max = 20) {
  const current = getBuilderHistory().filter((entry) => entry !== query);
  const next = [...current, query].slice(-max);
  storageSet(STORAGE_KEYS.builderHistory, JSON.stringify(next));
}

export function popBuilderHistory(): string | null {
  const current = getBuilderHistory();
  if (current.length < 2) return null;
  const previous = current[current.length - 2];
  storageSet(
    STORAGE_KEYS.builderHistory,
    JSON.stringify(current.slice(0, -1)),
  );
  return previous;
}
