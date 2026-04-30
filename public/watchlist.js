import {
  getLastAlerts,
  setLastAlerts,
  sourceLabel,
  watchlistMatches
} from "./runtime.js";

export function decorateItemsWithWatchlist(items, settings) {
  return items.map((item) => ({
    ...item,
    matchesWatchlist: watchlistMatches(item, settings)
  }));
}

export function findNewWatchlistMatches(items, previousCatalog, settings) {
  if (!settings.watchlist?.enabled) {
    return [];
  }

  return items.filter((item) => !previousCatalog[item.id] && watchlistMatches(item, settings));
}

export function publishWatchlistAlerts(matches, settings) {
  if (!settings.watchlist?.enabled || !matches.length) {
    return [];
  }

  const seen = getLastAlerts();
  const freshMatches = matches.filter((item) => !seen[item.id]);
  if (!freshMatches.length) {
    return [];
  }

  const nextSeen = { ...seen };
  const now = Date.now();
  for (const item of freshMatches) {
    nextSeen[item.id] = now;
  }
  setLastAlerts(nextSeen);

  if (
    settings.watchlist.browserNotifications &&
    typeof Notification !== "undefined" &&
    Notification.permission === "granted"
  ) {
    for (const item of freshMatches.slice(0, 3)) {
      new Notification(`RepoRadar watchlist: ${item.name}`, {
        body: `${sourceLabel(item.source)} · Trend ${Math.round(item.scores?.trend || 0)} · Money ${Math.round(item.scores?.money || 0)}`,
        tag: `repo-radar-watch-${item.id}`
      });
    }
  }

  return freshMatches;
}
