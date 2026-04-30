export const STORAGE_KEYS = {
  settings: "repo-radar.settings.v2",
  saved: "repo-radar.saved.v2",
  queued: "repo-radar.queued.v2",
  ignored: "repo-radar.ignored.v1",
  analyses: "repo-radar.analyses.v2",
  analysisFailures: "repo-radar.analysis-failures.v1",
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

export function getIgnoredSet() {
  return new Set(loadJson(STORAGE_KEYS.ignored, []));
}

export function setIgnoredSet(set) {
  saveJson(STORAGE_KEYS.ignored, [...set]);
}

export function getAnalyses() {
  return loadJson(STORAGE_KEYS.analyses, {});
}

export function setAnalyses(map) {
  saveJson(STORAGE_KEYS.analyses, map);
}

export function getAnalysisFailures() {
  return loadJson(STORAGE_KEYS.analysisFailures, {});
}

export function setAnalysisFailures(map) {
  saveJson(STORAGE_KEYS.analysisFailures, map);
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
      translatedTitle: analysis.translatedTitle || item.translatedTitle || "",
      translatedSummary: analysis.translatedSummary || item.translatedSummary || "",
      aiSummary: analysis.summary || item.aiSummary || "",
      opportunity: analysis.opportunity || item.opportunity || "",
      audience: analysis.audience || item.audience || "",
      weekendMvp: analysis.weekendMvp || item.weekendMvp || "",
      useCases: Array.isArray(analysis.useCases) ? analysis.useCases : (item.useCases || []),
      whyNow: analysis.whyNow || item.whyNow || "",
      risks: Array.isArray(analysis.risks) ? analysis.risks : (item.risks || []),
      ignoreSignals: Array.isArray(analysis.ignoreSignals) ? analysis.ignoreSignals : (item.ignoreSignals || []),
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

export function analysisFingerprint(item) {
  return [
    item.id,
    item.name,
    item.desc,
    item.rawDesc,
    item.language,
    item.metricLabel,
    item.metricValue
  ].map((value) => String(value || "").trim()).join("|");
}

export function stampAnalysis(item, analysis) {
  return {
    ...analysis,
    _fingerprint: analysisFingerprint(item),
    _cachedAt: Date.now()
  };
}

export function getCachedAnalysis(item, analyses) {
  const analysis = analyses[item.id];
  if (!analysis) return null;

  const fingerprint = analysisFingerprint(item);
  if (analysis._fingerprint && analysis._fingerprint !== fingerprint) {
    return null;
  }

  return analysis;
}

export function hasRichAnalysis(item, analyses) {
  const analysis = getCachedAnalysis(item, analyses);
  if (!analysis) return false;

  const hasEnglishSummary = Boolean(analysis.translatedSummary || analysis.summary);
  const hasUseCases = Array.isArray(analysis.useCases) && analysis.useCases.length > 0;
  return hasEnglishSummary && hasUseCases;
}

export function recordAnalysisFailure(item, failures, message) {
  return {
    ...failures,
    [item.id]: {
      message: String(message || "Analysis failed"),
      fingerprint: analysisFingerprint(item),
      failedAt: Date.now()
    }
  };
}

export function clearAnalysisFailure(item, failures) {
  if (!failures[item.id]) return failures;
  const next = { ...failures };
  delete next[item.id];
  return next;
}

export function getRecentAnalysisFailure(item, failures, cooldownMs = 10 * 60 * 1000) {
  const entry = failures[item.id];
  if (!entry) return null;
  if (entry.fingerprint && entry.fingerprint !== analysisFingerprint(item)) return null;
  if (Date.now() - Number(entry.failedAt || 0) > cooldownMs) return null;
  return entry;
}

export function buildPreferenceProfile(catalogMap, savedSet, ignoredSet) {
  const profile = {
    sources: {},
    languages: {},
    tags: {},
    tokens: {}
  };

  for (const id of savedSet) {
    const item = catalogMap[id];
    if (!item) continue;
    applyPreferenceItem(profile, item, 1);
  }

  for (const id of ignoredSet) {
    const item = catalogMap[id];
    if (!item) continue;
    applyPreferenceItem(profile, item, -1);
  }

  return profile;
}

export function preferenceScoreForItem(item, profile) {
  const tags = item.tags || [];
  const tokens = tokenizePreferenceText(`${item.name || ""} ${item.desc || ""} ${tags.join(" ")}`);
  let score = 0;

  score += lookupPreference(profile.sources, item.source) * 2.2;
  score += lookupPreference(profile.languages, item.language) * 1.5;
  score += tags.reduce((sum, tag) => sum + lookupPreference(profile.tags, tag), 0) * 1.1;
  score += tokens.reduce((sum, token) => sum + lookupPreference(profile.tokens, token), 0) * 0.22;

  return Math.max(-30, Math.min(30, Math.round(score)));
}

function applyPreferenceItem(profile, item, direction) {
  bumpPreference(profile.sources, item.source, 2 * direction);
  bumpPreference(profile.languages, item.language, 1.5 * direction);
  for (const tag of item.tags || []) {
    bumpPreference(profile.tags, tag, 2.4 * direction);
  }
  for (const token of tokenizePreferenceText(`${item.name || ""} ${item.desc || ""} ${(item.tags || []).join(" ")}`)) {
    bumpPreference(profile.tokens, token, 1 * direction);
  }
}

function bumpPreference(bucket, key, delta) {
  if (!key) return;
  const normalized = String(key).trim().toLowerCase();
  if (!normalized) return;
  bucket[normalized] = (bucket[normalized] || 0) + delta;
}

function lookupPreference(bucket, key) {
  if (!key) return 0;
  return bucket[String(key).trim().toLowerCase()] || 0;
}

function tokenizePreferenceText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 4 && !STOP_WORDS.has(token))
    .slice(0, 20);
}

const STOP_WORDS = new Set([
  "this",
  "that",
  "with",
  "from",
  "have",
  "your",
  "about",
  "there",
  "their",
  "build",
  "built",
  "using",
  "into",
  "project",
  "projects",
  "developer",
  "developers",
  "repository",
  "repositories"
]);
