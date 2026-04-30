export const STORAGE_KEYS = {
  settings: "repo-radar.settings.v2",
  saved: "repo-radar.saved.v2",
  queued: "repo-radar.queued.v2",
  analyses: "repo-radar.analyses.v2",
  latest: "repo-radar.latest.v2",
  catalog: "repo-radar.catalog.v2",
  history: "repo-radar.history.v2",
  lastAlerts: "repo-radar.last-alerts.v1"
};

export const DEFAULT_SETTINGS = {
  keys: {
    groqApiKey: "",
    groqModel: "llama-3.3-70b-versatile",
    githubToken: "",
    productHuntToken: ""
  },
  sources: {
    github: true,
    hn: true,
    reddit: true,
    devto: true,
    npm: true,
    producthunt: false
  },
  automation: {
    autoRefresh: true,
    autoAnalyze: true,
    offlineMode: true,
    preferServer: true,
    refreshMinutes: 15,
    maxItems: 30
  },
  watchlist: {
    enabled: false,
    browserNotifications: false,
    minTrend: 75,
    minMoney: 70,
    keywords: "",
    blockedKeywords: ""
  }
};

export function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function getSettings() {
  const stored = loadJson(STORAGE_KEYS.settings, {});
  return {
    keys: { ...DEFAULT_SETTINGS.keys, ...(stored.keys || {}) },
    sources: { ...DEFAULT_SETTINGS.sources, ...(stored.sources || {}) },
    automation: { ...DEFAULT_SETTINGS.automation, ...(stored.automation || {}) },
    watchlist: { ...DEFAULT_SETTINGS.watchlist, ...(stored.watchlist || {}) }
  };
}

export function saveSettings(settings) {
  saveJson(STORAGE_KEYS.settings, settings);
}

export function getSavedSet() {
  return new Set(loadJson(STORAGE_KEYS.saved, []));
}

export function setSavedSet(set) {
  saveJson(STORAGE_KEYS.saved, [...set]);
}

export function getQueuedSet() {
  return new Set(loadJson(STORAGE_KEYS.queued, []));
}

export function setQueuedSet(set) {
  saveJson(STORAGE_KEYS.queued, [...set]);
}

export function getAnalyses() {
  return loadJson(STORAGE_KEYS.analyses, {});
}

export function setAnalyses(map) {
  saveJson(STORAGE_KEYS.analyses, map);
}

export function getLatestSnapshot() {
  return loadJson(STORAGE_KEYS.latest, null);
}

export function setLatestSnapshot(snapshot) {
  saveJson(STORAGE_KEYS.latest, snapshot);
}

export function getCatalogMap() {
  return loadJson(STORAGE_KEYS.catalog, {});
}

export function setCatalogMap(map) {
  saveJson(STORAGE_KEYS.catalog, map);
}

export function getCatalogRows() {
  return Object.values(getCatalogMap());
}

export function upsertCatalog(items) {
  const now = Date.now();
  const catalog = getCatalogMap();
  const beforeIds = new Set(Object.keys(catalog));
  let newCount = 0;

  for (const item of items) {
    const existing = catalog[item.id];
    if (!existing) {
      newCount += 1;
      catalog[item.id] = {
        ...item,
        firstSeenAt: now,
        lastSeenAt: now,
        seenCount: 1
      };
      continue;
    }

    catalog[item.id] = {
      ...existing,
      ...item,
      firstSeenAt: existing.firstSeenAt || now,
      lastSeenAt: now,
      seenCount: (existing.seenCount || 0) + 1
    };
  }

  setCatalogMap(catalog);
  return {
    rows: Object.values(catalog),
    newCount,
    previousCount: beforeIds.size
  };
}

export function appendHistory(entry) {
  const history = loadJson(STORAGE_KEYS.history, []);
  history.push(entry);
  const trimmed = history.slice(-24);
  saveJson(STORAGE_KEYS.history, trimmed);
  return trimmed;
}

export function getHistory() {
  return loadJson(STORAGE_KEYS.history, []);
}

export function getLastAlerts() {
  return loadJson(STORAGE_KEYS.lastAlerts, {});
}

export function setLastAlerts(map) {
  saveJson(STORAGE_KEYS.lastAlerts, map);
}

export function mergeAnalysesIntoItems(items, analyses) {
  return items.map((item) => {
    const analysis = analyses[item.id];
    if (!analysis) return item;
    return {
      ...item,
      aiSummary: analysis.summary || item.aiSummary || "",
      opportunity: analysis.opportunity || item.opportunity || "",
      audience: analysis.audience || item.audience || "",
      weekendMvp: analysis.weekendMvp || item.weekendMvp || "",
      scores: analysis.scores || item.scores
    };
  });
}

export function sourceLabel(source) {
  return {
    github: "GitHub",
    hn: "Hacker News",
    reddit: "Reddit",
    devto: "Dev.to",
    npm: "npm",
    producthunt: "Product Hunt"
  }[source] || source;
}

export function formatCount(value) {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}m`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}

export function formatTime(timestamp) {
  if (!timestamp) return "Never";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(timestamp));
}

export function relativeTime(input) {
  if (!input) return "recent";
  const time = typeof input === "number" ? input : new Date(input).getTime();
  const diff = Date.now() - time;
  const hours = Math.max(1, Math.round(diff / 3600000));
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function envTextFromSettings(settings) {
  return [
    `GROQ_API_KEY=${settings.keys.groqApiKey || ""}`,
    `GROQ_MODEL=${settings.keys.groqModel || ""}`,
    `GITHUB_TOKEN=${settings.keys.githubToken || ""}`,
    `PRODUCT_HUNT_BEARER_TOKEN=${settings.keys.productHuntToken || ""}`,
    `REPORADAR_REFRESH_MINUTES=${settings.automation.refreshMinutes}`,
    `REPORADAR_MAX_ITEMS=${settings.automation.maxItems}`
  ].join("\n");
}

export function applyEnvTextToSettings(settings, text) {
  const next = structuredClone(settings);
  const lines = text.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();

    if (key === "GROQ_API_KEY") next.keys.groqApiKey = value;
    if (key === "GROQ_MODEL") next.keys.groqModel = value;
    if (key === "GITHUB_TOKEN") next.keys.githubToken = value;
    if (key === "PRODUCT_HUNT_BEARER_TOKEN") next.keys.productHuntToken = value;
    if (key === "REPORADAR_REFRESH_MINUTES") next.automation.refreshMinutes = clampNumber(value, 1, 120, next.automation.refreshMinutes);
    if (key === "REPORADAR_MAX_ITEMS") next.automation.maxItems = clampNumber(value, 6, 80, next.automation.maxItems);
  }

  return next;
}

export function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function watchlistMatches(item, settings) {
  const watchlist = settings.watchlist || DEFAULT_SETTINGS.watchlist;
  if (!watchlist.enabled) return false;

  const trend = Number(item.scores?.trend || 0);
  const money = Number(item.scores?.money || 0);
  if (trend < clampNumber(watchlist.minTrend, 1, 100, 75)) return false;
  if (money < clampNumber(watchlist.minMoney, 1, 100, 70)) return false;

  const keywords = parseKeywordList(watchlist.keywords);
  const blocked = parseKeywordList(watchlist.blockedKeywords);
  const haystack = [
    item.name,
    item.owner,
    item.desc,
    item.language,
    ...(item.tags || [])
  ].join(" ").toLowerCase();

  if (keywords.length && !keywords.some((keyword) => haystack.includes(keyword))) {
    return false;
  }

  if (blocked.some((keyword) => haystack.includes(keyword))) {
    return false;
  }

  return true;
}

export function parseKeywordList(value) {
  return String(value || "")
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}
