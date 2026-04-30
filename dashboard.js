import {
  appendHistory,
  formatTime,
  getAnalyses,
  getCatalogMap,
  getCatalogRows,
  getHistory,
  getIgnoredSet,
  getLatestSnapshot,
  getQueuedSet,
  getSavedSet,
  getSettings,
  mergeAnalysesIntoItems,
  setAnalyses,
  setIgnoredSet,
  setLatestSnapshot,
  setSavedSet,
  sourceLabel,
  upsertCatalog
} from "./runtime.js";
import { analyzeWithAvailableRuntime, discoverData } from "./data.js";
import {
  decorateItemsWithWatchlist,
  findNewWatchlistMatches,
  publishWatchlistAlerts
} from "./watchlist.js";

const state = {
  settings: getSettings(),
  items: [],
  saved: getSavedSet(),
  ignored: getIgnoredSet(),
  queued: getQueuedSet(),
  analyses: getAnalyses(),
  history: getHistory(),
  latestSnapshot: getLatestSnapshot(),
  sourceHealth: {},
  refreshTimer: null,
  runtimeMode: "Waiting..."
};

const els = {
  syncStatus: document.getElementById("syncStatus"),
  refreshBtn: document.getElementById("refreshBtn"),
  analyzeTopBtn: document.getElementById("analyzeTopBtn"),
  aiStatus: document.getElementById("aiStatus"),
  aiBriefing: document.getElementById("aiBriefing"),
  automationStatus: document.getElementById("automationStatus"),
  lastSyncStatus: document.getElementById("lastSyncStatus"),
  runtimeMode: document.getElementById("runtimeMode"),
  statItems: document.getElementById("statItems"),
  statCatalog: document.getElementById("statCatalog"),
  statSources: document.getElementById("statSources"),
  statAnalyzed: document.getElementById("statAnalyzed"),
  statNew: document.getElementById("statNew"),
  savedCount: document.getElementById("savedCount"),
  queueCount: document.getElementById("queueCount"),
  watchlistCount: document.getElementById("watchlistCount"),
  moneyCount: document.getElementById("moneyCount"),
  personalizedGrid: document.getElementById("personalizedGrid"),
  sourceChart: document.getElementById("sourceChart"),
  historyChart: document.getElementById("historyChart"),
  trendingList: document.getElementById("trendingList"),
  sourceHealth: document.getElementById("sourceHealth"),
  newsFeed: document.getElementById("newsFeed")
};

boot();

function boot() {
  wireUi();
  hydrateCachedData();
  render();
  syncData({ manual: false });
  applyAutoRefresh();
}

function wireUi() {
  els.refreshBtn.addEventListener("click", () => syncData({ manual: true }));
  els.analyzeTopBtn.addEventListener("click", () => analyzeTopItems());
}

function hydrateCachedData() {
  const snapshot = getLatestSnapshot();
  if (!snapshot?.items?.length) return;
  state.items = decorateItemsWithWatchlist(
    mergeAnalysesIntoItems(snapshot.items, state.analyses),
    getSettings()
  );
  state.sourceHealth = snapshot.sourceHealth || {};
  state.runtimeMode = snapshot.runtimeMode || "Cached data";
}

async function syncData({ manual }) {
  setStatus(manual ? "Syncing..." : "Auto-sync...");
  els.refreshBtn.disabled = true;

  try {
    state.settings = getSettings();
    const previousCatalog = getCatalogMap();
    const payload = await discoverData(state.settings);
    state.runtimeMode = payload.runtimeMode;
    state.sourceHealth = payload.sourceHealth || {};
    state.items = decorateItemsWithWatchlist(
      mergeAnalysesIntoItems(payload.items || [], state.analyses),
      state.settings
    );

    const catalogResult = upsertCatalog(state.items);
    const watchlistHits = publishWatchlistAlerts(
      findNewWatchlistMatches(state.items, previousCatalog, state.settings),
      state.settings
    );

    state.latestSnapshot = {
      syncedAt: Date.now(),
      runtimeMode: state.runtimeMode,
      sourceHealth: state.sourceHealth,
      items: state.items,
      newCount: catalogResult.newCount
    };
    setLatestSnapshot(state.latestSnapshot);

    state.history = appendHistory({
      syncedAt: Date.now(),
      total: state.items.length,
      newCount: catalogResult.newCount,
      sources: summarizeSources(state.items)
    });

    setStatus(
      watchlistHits.length
        ? `Ready · ${watchlistHits.length} watch hit${watchlistHits.length === 1 ? "" : "s"}`
        : "Ready"
    );
    render(catalogResult.newCount);

    if (state.settings.automation.autoAnalyze) {
      analyzeTopItems({ silentIfUnavailable: true });
    }
  } catch (error) {
    setStatus(error.message || "Sync failed");
    render(0);
  } finally {
    els.refreshBtn.disabled = false;
  }
}

async function analyzeTopItems({ silentIfUnavailable = false } = {}) {
  const targets = [...state.items]
    .filter((item) => !state.analyses[item.id])
    .sort((a, b) => scoreForPersonalized(b) - scoreForPersonalized(a))
    .slice(0, 4);

  if (!targets.length) {
    updateAiStatus();
    return;
  }

  try {
    updateAiStatus("Analyzing...");
    const results = await analyzeWithAvailableRuntime(targets, getSettings());
    for (const item of results) {
      state.analyses[item.id] = item;
    }
    setAnalyses(state.analyses);
    state.items = decorateItemsWithWatchlist(
      mergeAnalysesIntoItems(state.items, state.analyses),
      getSettings()
    );
    const latest = getLatestSnapshot();
    if (latest?.items) {
      latest.items = state.items;
      setLatestSnapshot(latest);
    }
    render();
  } catch (error) {
    if (!silentIfUnavailable) {
      updateAiStatus(error.message || "AI error");
    } else {
      updateAiStatus();
    }
  }
}

function render(newCount = state.latestSnapshot?.newCount || 0) {
  const catalogRows = getCatalogRows();
  const watchlistMatches = state.items.filter((item) => item.matchesWatchlist);
  const highValue = state.items.filter((item) => (item.scores?.money || 0) >= 72);

  els.statItems.textContent = String(state.items.length);
  els.statCatalog.textContent = String(catalogRows.length);
  els.statSources.textContent = String(Object.values(getSettings().sources).filter(Boolean).length);
  els.statAnalyzed.textContent = String(Object.keys(state.analyses).length);
  els.statNew.textContent = String(newCount);
  els.savedCount.textContent = String(state.saved.size);
  els.queueCount.textContent = String(state.queued.size);
  els.watchlistCount.textContent = String(watchlistMatches.length);
  els.moneyCount.textContent = String(highValue.length);
  els.automationStatus.textContent = buildAutomationSummary(getSettings());
  els.lastSyncStatus.textContent = formatTime(state.latestSnapshot?.syncedAt);
  els.runtimeMode.textContent = state.runtimeMode;

  renderPersonalized(state.items);
  renderSourceChart(state.items);
  renderHistoryChart(state.history);
  renderTrending(state.items);
  renderSourceHealth(state.sourceHealth);
  renderNewsFeed(state.items);
  updateAiStatus();
  updateAiBriefing(state.items, watchlistMatches.length);
}

function renderPersonalized(items) {
  const recommendations = [...items]
    .filter((item) => !state.ignored.has(item.id))
    .sort((a, b) => scoreForPersonalized(b) - scoreForPersonalized(a))
    .slice(0, 4);

  els.personalizedGrid.innerHTML = "";
  if (!recommendations.length) {
    els.personalizedGrid.innerHTML = `<div class="panel">No recommendations yet. Run a sync.</div>`;
    return;
  }

  recommendations.forEach((item) => {
    const card = document.createElement("article");
    card.className = "ai-card";
    const isSaved = state.saved.has(item.id);
    card.innerHTML = `
      <div class="card-top">
        <span class="source-pill">${sourceLabel(item.source)}</span>
        <span class="metric-pill">${item.metricLabel}: ${item.metricValue}</span>
      </div>
      <div class="ai-card-title" style="margin-top: 0.35rem;">${item.name}</div>
      <div class="ai-card-title" style="display:none;">${item.translatedTitle || ""}</div>
      <div class="mini-copy">${item.owner || "Unknown"} · ${item.language || "Mixed"}</div>
      <div class="tag-row" style="margin-top: 0.45rem;">
        ${item.matchesWatchlist ? `<span class="tag" style="background: var(--brand-soft); color: var(--brand);">watchlist</span>` : ""}
        ${(item.tags || []).slice(0, 3).map((tag) => `<span class="tag">${tag}</span>`).join("")}
      </div>
      <div class="ai-card-note">${item.aiSummary || item.desc || "AI summary pending."}</div>
      <div class="score-row" style="margin-top: 0.45rem;">
        <span class="score-pill">Trend ${Math.round(item.scores?.trend || 0)}</span>
        <span class="score-pill">Money ${Math.round(item.scores?.money || 0)}</span>
      </div>
      <div class="card-actions">
        <button class="btn ${isSaved ? "btn-strong" : ""}" data-action="save" type="button">${isSaved ? "Saved" : "Save"}</button>
        <button class="btn" data-action="ignore" type="button">${state.ignored.has(item.id) ? "Ignored" : "Ignore"}</button>
        <button class="btn" data-action="ai" type="button">AI</button>
        <button class="btn btn-strong" data-action="open" type="button">Open</button>
      </div>
    `;

    card.querySelector('[data-action="save"]').addEventListener("click", () => {
      toggleSetMembership(state.saved, item.id, setSavedSet);
      render();
    });

    card.querySelector('[data-action="ai"]').addEventListener("click", async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      button.textContent = "...";
      try {
        const results = await analyzeWithAvailableRuntime([item], getSettings());
        if (results.length) {
          state.analyses[item.id] = results[0];
          setAnalyses(state.analyses);
          state.items = decorateItemsWithWatchlist(
            mergeAnalysesIntoItems(state.items, state.analyses),
            getSettings()
          );
          render();
        }
      } catch (error) {
        updateAiStatus(error.message || "AI error");
      } finally {
        button.disabled = false;
        button.textContent = "AI";
      }
    });

    card.querySelector('[data-action="ignore"]').addEventListener("click", () => {
      toggleSetMembership(state.ignored, item.id, setIgnoredSet);
      render();
    });

    card.querySelector('[data-action="open"]').addEventListener("click", () => {
      window.open(item.url, "_blank", "noopener,noreferrer");
    });

    card.addEventListener("click", (event) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("button")) return;
      window.location.href = `/repo.html?id=${encodeURIComponent(item.id)}`;
    });

    els.personalizedGrid.appendChild(card);
  });
}

function renderSourceChart(items) {
  if (!items.length) {
    els.sourceChart.innerHTML = `<div class="mini-copy" style="padding: 0.55rem;">No source data yet.</div>`;
    return;
  }

  const sourceCounts = Object.entries(summarizeSources(items));
  const max = Math.max(...sourceCounts.map(([, value]) => value), 1);
  const width = 400;
  const height = 140;
  const gap = 10;
  const barWidth = Math.floor((width - gap * (sourceCounts.length + 1)) / sourceCounts.length);

  const bars = sourceCounts.map(([source, count], index) => {
    const x = gap + index * (barWidth + gap);
    const barHeight = Math.round((count / max) * 92);
    const y = 110 - barHeight;
    return `
      <rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="4" class="svg-bar"></rect>
      <text x="${x + barWidth / 2}" y="108" text-anchor="middle" class="svg-label">${count}</text>
      <text x="${x + barWidth / 2}" y="128" text-anchor="middle" class="svg-label">${sourceLabel(source)}</text>
    `;
  }).join("");

  els.sourceChart.innerHTML = `<svg class="svg-chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">${bars}</svg>`;
}

function renderHistoryChart(history) {
  if (!history.length) {
    els.historyChart.innerHTML = `<div class="mini-copy" style="padding: 0.55rem;">No sync history yet.</div>`;
    return;
  }

  const width = 400;
  const height = 140;
  const values = history.map((entry) => entry.total);
  const max = Math.max(...values, 1);
  const stepX = width / Math.max(values.length - 1, 1);
  const points = values.map((value, index) => {
    const x = index * stepX;
    const y = 110 - (value / max) * 88;
    return [x, y];
  });
  const line = points.map(([x, y]) => `${x},${y}`).join(" ");
  const area = `0,110 ${line} ${width},110`;

  els.historyChart.innerHTML = `
    <svg class="svg-chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
      <polygon class="svg-area" points="${area}"></polygon>
      <polyline class="svg-line" points="${line}"></polyline>
    </svg>
  `;
}

function renderTrending(items) {
  const top = [...items]
    .filter((item) => !state.ignored.has(item.id))
    .sort((a, b) => (b.scores?.trend || 0) - (a.scores?.trend || 0))
    .slice(0, 5);

  els.trendingList.innerHTML = "";
  if (!top.length) {
    els.trendingList.innerHTML = `<div class="mini-copy">No movers yet.</div>`;
    return;
  }

  top.forEach((item) => {
    const node = document.createElement("div");
    node.className = "mini-item";
    node.innerHTML = `
      <div class="mini-title">${item.name}</div>
      <div class="mini-copy">${sourceLabel(item.source)} · Trend ${Math.round(item.scores?.trend || 0)} · ${item.metricValue}</div>
    `;
    els.trendingList.appendChild(node);
  });
}

function renderSourceHealth(sourceHealth) {
  els.sourceHealth.innerHTML = "";
  const entries = Object.entries(sourceHealth);
  if (!entries.length) {
    els.sourceHealth.innerHTML = `<div class="mini-copy">Waiting for health check.</div>`;
    return;
  }

  entries.forEach(([source, health]) => {
    const node = document.createElement("div");
    node.className = "mini-item";
    node.innerHTML = `
      <div class="mini-title">${sourceLabel(source)}</div>
      <div class="mini-copy" style="color: ${health.ok ? "var(--green)" : "var(--red)"};">
        ${health.ok ? `OK · ${health.count} rows` : `Error · ${health.error}`}
      </div>
    `;
    els.sourceHealth.appendChild(node);
  });
}

function renderNewsFeed(items) {
  const newest = [...items]
    .sort((a, b) => (b.scores?.trend || 0) - (a.scores?.trend || 0))
    .slice(0, 8);

  els.newsFeed.innerHTML = "";
  if (!newest.length) {
    els.newsFeed.innerHTML = `<div class="mini-copy">No recent discoveries yet.</div>`;
    return;
  }

  newest.forEach((item) => {
    if (state.ignored.has(item.id)) return;
    const node = document.createElement("article");
    node.className = "news-item";
    node.innerHTML = `
      <div class="news-item-title">${item.translatedTitle || item.name}</div>
      <div class="news-item-meta">${sourceLabel(item.source)} · ${item.metricLabel}: ${item.metricValue} · Trend ${Math.round(item.scores?.trend || 0)}</div>
      <div class="small-copy" style="margin-top: 0.25rem;">${item.translatedSummary || item.aiSummary || item.desc || "No description available."}</div>
    `;
    els.newsFeed.appendChild(node);
  });
}

function updateAiStatus(message = "") {
  if (message) {
    els.aiStatus.textContent = message;
    return;
  }
  els.aiStatus.textContent = state.settings.automation.autoAnalyze ? "Auto-analysis on" : "Ready";
}

function updateAiBriefing(items, watchlistCount) {
  if (!items.length) {
    els.aiBriefing.textContent = "No snapshot yet. Run a sync to populate the dashboard.";
    return;
  }

  const top = [...items].sort((a, b) => scoreForPersonalized(b) - scoreForPersonalized(a))[0];
  const analysesCount = Object.keys(state.analyses).length;
  els.aiBriefing.textContent = `${items.length} live items across ${Object.keys(summarizeSources(items)).length} active sources. ${analysesCount} AI notes are cached. Strongest signal: ${top.name} from ${sourceLabel(top.source)}. Watchlist matches: ${watchlistCount}.`;
}

function setStatus(message) {
  els.syncStatus.textContent = message;
}

function buildAutomationSummary(settings) {
  const mode = settings.automation.preferServer ? "hybrid" : "browser";
  return settings.automation.autoRefresh
    ? `${mode} · ${settings.automation.refreshMinutes}m`
    : `${mode} · manual`;
}

function summarizeSources(items) {
  return items.reduce((acc, item) => {
    acc[item.source] = (acc[item.source] || 0) + 1;
    return acc;
  }, {});
}

function scoreForPersonalized(item) {
  return (item.scores?.trend || 0) + (item.scores?.money || 0) * 0.45 + (item.aiSummary ? 8 : 0) + (item.matchesWatchlist ? 18 : 0);
}

function toggleSetMembership(set, id, persist) {
  if (set.has(id)) {
    set.delete(id);
  } else {
    set.add(id);
  }
  persist(set);
}

function applyAutoRefresh() {
  if (state.refreshTimer) clearInterval(state.refreshTimer);
  const settings = getSettings();
  if (!settings.automation.autoRefresh) return;

  state.refreshTimer = setInterval(() => {
    if (!document.hidden) syncData({ manual: false });
  }, settings.automation.refreshMinutes * 60 * 1000);
}
