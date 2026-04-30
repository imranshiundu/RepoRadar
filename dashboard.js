import {
  appendHistory,
  formatTime,
  getAnalyses,
  getCatalogRows,
  getHistory,
  getLatestSnapshot,
  getQueuedSet,
  getSavedSet,
  getSettings,
  mergeAnalysesIntoItems,
  setAnalyses,
  setLatestSnapshot,
  setQueuedSet,
  setSavedSet,
  sourceLabel,
  upsertCatalog
} from "./runtime.js";
import { analyzeWithAvailableRuntime, discoverData } from "./data.js";

const state = {
  settings: getSettings(),
  items: [],
  saved: getSavedSet(),
  queued: getQueuedSet(),
  analyses: getAnalyses(),
  history: getHistory(),
  latestSnapshot: getLatestSnapshot(),
  sourceHealth: {},
  view: "all",
  chip: "all",
  search: "",
  refreshTimer: null,
  runtimeMode: "Waiting..."
};

const els = {
  syncStatus: document.getElementById("syncStatus"),
  refreshBtn: document.getElementById("refreshBtn"),
  analyzeTopBtn: document.getElementById("analyzeTopBtn"),
  runtimeMode: document.getElementById("runtimeMode"),
  aiStatus: document.getElementById("aiStatus"),
  lastSyncStatus: document.getElementById("lastSyncStatus"),
  automationStatus: document.getElementById("automationStatus"),
  searchInput: document.getElementById("searchInput"),
  repoGrid: document.getElementById("repoGrid"),
  cardTemplate: document.getElementById("cardTemplate"),
  sourceChart: document.getElementById("sourceChart"),
  historyChart: document.getElementById("historyChart"),
  liveFeed: document.getElementById("liveFeed"),
  trendingList: document.getElementById("trendingList"),
  sourceHealth: document.getElementById("sourceHealth"),
  statItems: document.getElementById("statItems"),
  statCatalog: document.getElementById("statCatalog"),
  statSources: document.getElementById("statSources"),
  statAnalyzed: document.getElementById("statAnalyzed"),
  statNew: document.getElementById("statNew"),
  allCount: document.getElementById("allCount"),
  savedCount: document.getElementById("savedCount"),
  queueCount: document.getElementById("queueCount"),
  moneyCount: document.getElementById("moneyCount"),
  aiCount: document.getElementById("aiCount")
};

boot();

function boot() {
  wireUi();
  hydrateCachedData();
  render();
  syncData({ manual: false });
  applyAutoRefresh();
  registerServiceWorker();
}

function wireUi() {
  els.refreshBtn.addEventListener("click", () => syncData({ manual: true }));
  els.analyzeTopBtn.addEventListener("click", () => analyzeTopItems());
  els.searchInput.addEventListener("input", (event) => {
    state.search = event.target.value.trim().toLowerCase();
    render();
  });

  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll("[data-view]").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      state.view = button.dataset.view;
      render();
    });
  });

  document.querySelectorAll("[data-chip]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll("[data-chip]").forEach((item) => item.classList.remove("chip-on"));
      button.classList.add("chip-on");
      state.chip = button.dataset.chip;
      render();
    });
  });
}

function hydrateCachedData() {
  const snapshot = getLatestSnapshot();
  if (!snapshot?.items?.length) return;
  state.items = mergeAnalysesIntoItems(snapshot.items, state.analyses);
  state.sourceHealth = snapshot.sourceHealth || {};
  state.runtimeMode = snapshot.runtimeMode || "Cached data";
}

async function syncData({ manual }) {
  setStatus(manual ? "Refreshing live sources..." : "Syncing live sources...");
  els.refreshBtn.disabled = true;

  try {
    state.settings = getSettings();
    const payload = await discoverData(state.settings);
    state.runtimeMode = payload.runtimeMode;
    state.sourceHealth = payload.sourceHealth || {};
    state.items = mergeAnalysesIntoItems(payload.items || [], state.analyses);

    const catalogResult = upsertCatalog(state.items);
    state.latestSnapshot = {
      syncedAt: Date.now(),
      runtimeMode: state.runtimeMode,
      sourceHealth: state.sourceHealth,
      items: state.items
    };
    setLatestSnapshot(state.latestSnapshot);

    state.history = appendHistory({
      syncedAt: Date.now(),
      total: state.items.length,
      newCount: catalogResult.newCount,
      sources: summarizeSources(state.items)
    });

    setStatus(`Loaded ${state.items.length} rows using ${state.runtimeMode}`);
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
  const targets = visibleItems()
    .filter((item) => !state.analyses[item.id])
    .slice(0, 4);

  if (!targets.length) {
    updateAiStatus();
    return;
  }

  try {
    updateAiStatus("Analyzing top cards...");
    const results = await analyzeWithAvailableRuntime(targets, getSettings());
    for (const item of results) {
      state.analyses[item.id] = item;
    }
    setAnalyses(state.analyses);
    state.items = mergeAnalysesIntoItems(state.items, state.analyses);

    const latest = getLatestSnapshot();
    if (latest?.items) {
      latest.items = state.items;
      setLatestSnapshot(latest);
    }

    const catalog = upsertCatalog(state.items);
    render(catalog.newCount);
  } catch (error) {
    if (!silentIfUnavailable) {
      updateAiStatus(error.message || "AI analysis failed");
    } else {
      updateAiStatus();
    }
  }
}

function visibleItems() {
  return state.items
    .filter(matchesView)
    .filter(matchesChip)
    .filter(matchesSearch)
    .sort((left, right) => (right.scores?.trend || 0) - (left.scores?.trend || 0));
}

function matchesView(item) {
  if (state.view === "all") return true;
  if (state.view === "saved") return state.saved.has(item.id);
  if (state.view === "queued") return state.queued.has(item.id);
  if (state.view === "money") return (item.scores?.money || 0) >= 72;
  if (state.view === "ai") return item.tags?.includes("ai");
  return item.source === state.view;
}

function matchesChip(item) {
  if (state.chip === "all") return true;
  if (state.chip === "money") return item.tags?.includes("money");
  return item.tags?.includes(state.chip);
}

function matchesSearch(item) {
  if (!state.search) return true;
  const haystack = [
    item.name,
    item.owner,
    item.desc,
    item.aiSummary,
    item.source,
    ...(item.tags || [])
  ].join(" ").toLowerCase();
  return haystack.includes(state.search);
}

function render(newCount = state.latestSnapshot?.newCount || 0) {
  const items = visibleItems();
  const catalogRows = getCatalogRows();

  els.runtimeMode.textContent = state.runtimeMode;
  els.lastSyncStatus.textContent = formatTime(state.latestSnapshot?.syncedAt);
  els.automationStatus.textContent = buildAutomationSummary(getSettings());

  els.statItems.textContent = String(items.length);
  els.statCatalog.textContent = String(catalogRows.length);
  els.statSources.textContent = String(Object.values(getSettings().sources).filter(Boolean).length);
  els.statAnalyzed.textContent = String(Object.keys(state.analyses).length);
  els.statNew.textContent = String(newCount);

  els.allCount.textContent = String(state.items.length);
  els.savedCount.textContent = String(state.saved.size);
  els.queueCount.textContent = String(state.queued.size);
  els.moneyCount.textContent = String(state.items.filter((item) => (item.scores?.money || 0) >= 72).length);
  els.aiCount.textContent = String(state.items.filter((item) => item.tags?.includes("ai")).length);

  if (els.repoGrid) renderCards(items);
  renderSourceChart(state.items);
  renderHistoryChart(state.history);
  renderFeed(state.items);
  renderTrending(items);
  renderSourceHealth(state.sourceHealth);
  updateAiStatus();
}

function renderCards(items) {
  els.repoGrid.innerHTML = "";
  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No rows match the current filters yet.";
    els.repoGrid.appendChild(empty);
    return;
  }

  for (const item of items) {
    const node = els.cardTemplate.content.firstElementChild.cloneNode(true);
    const isSaved = state.saved.has(item.id);
    const isQueued = state.queued.has(item.id);

    node.querySelector(".source-pill").textContent = sourceLabel(item.source);
    node.querySelector(".metric-pill").textContent = `${item.metricLabel}: ${item.metricValue}`;
    node.querySelector(".repo-name").textContent = item.name;
    node.querySelector(".repo-owner").textContent = `${item.owner || "Unknown"} · ${item.language || "Mixed"}`;
    node.querySelector(".repo-desc").textContent = item.desc;

    const tagRow = node.querySelector(".tag-row");
    for (const tag of item.tags || []) {
      const tagEl = document.createElement("span");
      tagEl.className = "tag";
      tagEl.textContent = tag;
      tagRow.appendChild(tagEl);
    }

    const analysis = node.querySelector(".analysis-box");
    if (item.aiSummary) {
      analysis.textContent = item.aiSummary;
    } else {
      analysis.classList.add("loading");
      analysis.textContent = "Pending AI summary";
    }

    const scoreRow = node.querySelector(".score-row");
    scoreRow.appendChild(makeScorePill("Trend", item.scores?.trend || 0));
    scoreRow.appendChild(makeScorePill("Learn", item.scores?.learn || 0));
    scoreRow.appendChild(makeScorePill("Money", item.scores?.money || 0));

    node.querySelector(".meta-row").innerHTML = `
      <span>${item.relativeTime || "recent"}</span>
      <span>${item.url ? "open link ready" : "no link"}</span>
    `;

    const saveBtn = node.querySelector(".save-btn");
    saveBtn.classList.toggle("active-state", isSaved);
    saveBtn.textContent = isSaved ? "Saved" : "Save";
    saveBtn.addEventListener("click", () => {
      toggleSetMembership(state.saved, item.id, setSavedSet);
      render();
    });

    const queueBtn = node.querySelector(".queue-btn");
    queueBtn.classList.toggle("active-state", isQueued);
    queueBtn.textContent = isQueued ? "Queued" : "Queue";
    queueBtn.addEventListener("click", () => {
      toggleSetMembership(state.queued, item.id, setQueuedSet);
      render();
    });

    node.querySelector(".analyze-btn").addEventListener("click", async () => {
      try {
        updateAiStatus("Analyzing one card...");
        const results = await analyzeWithAvailableRuntime([item], getSettings());
        for (const result of results) {
          state.analyses[result.id] = result;
        }
        setAnalyses(state.analyses);
        state.items = mergeAnalysesIntoItems(state.items, state.analyses);
        upsertCatalog(state.items);
        render();
      } catch (error) {
        updateAiStatus(error.message || "Analysis failed");
      }
    });

    node.querySelector(".visit-btn").addEventListener("click", () => {
      window.open(item.url, "_blank", "noopener,noreferrer");
    });

    els.repoGrid.appendChild(node);
  }
}

function renderSourceChart(items) {
  if (!items.length) {
    els.sourceChart.innerHTML = `<div class="empty-state">Source chart will appear after the first sync.</div>`;
    return;
  }

  const sourceCounts = Object.entries(summarizeSources(items));
  const max = Math.max(...sourceCounts.map(([, value]) => value), 1);
  const width = 560;
  const height = 180;
  const gap = 18;
  const barWidth = Math.max(44, Math.floor((width - gap * (sourceCounts.length + 1)) / sourceCounts.length));

  const bars = sourceCounts.map(([source, count], index) => {
    const x = gap + index * (barWidth + gap);
    const barHeight = Math.round((count / max) * 120);
    const y = 140 - barHeight;
    return `
      <rect class="svg-bar" x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="12"></rect>
      <text class="svg-label" x="${x + barWidth / 2}" y="158" text-anchor="middle">${sourceLabel(source)}</text>
      <text class="svg-label" x="${x + barWidth / 2}" y="${y - 8}" text-anchor="middle">${count}</text>
    `;
  }).join("");

  els.sourceChart.innerHTML = `
    <svg class="svg-chart" viewBox="0 0 ${width} ${height}" aria-label="Source chart">
      ${bars}
    </svg>
  `;
}

function renderHistoryChart(history) {
  if (!history.length) {
    els.historyChart.innerHTML = `<div class="empty-state">Sync history will appear after the first refresh.</div>`;
    return;
  }

  const width = 560;
  const height = 180;
  const values = history.map((entry) => entry.total);
  const max = Math.max(...values, 1);
  const stepX = width / Math.max(values.length - 1, 1);

  const points = values.map((value, index) => {
    const x = index * stepX;
    const y = 145 - (value / max) * 110;
    return [x, y];
  });

  const line = points.map(([x, y]) => `${x},${y}`).join(" ");
  const area = `0,145 ${line} ${width},145`;
  const dots = points.map(([x, y]) => `<circle class="svg-dot" cx="${x}" cy="${y}" r="4"></circle>`).join("");
  const labels = history.map((entry, index) => {
    const x = index * stepX;
    return `<text class="svg-label" x="${x}" y="170" text-anchor="${index === 0 ? "start" : index === history.length - 1 ? "end" : "middle"}">${new Date(entry.syncedAt).getHours()}:00</text>`;
  }).join("");

  els.historyChart.innerHTML = `
    <svg class="svg-chart" viewBox="0 0 ${width} ${height}" aria-label="Sync history chart">
      <polygon class="svg-area" points="${area}"></polygon>
      <polyline class="svg-line" points="${line}"></polyline>
      ${dots}
      ${labels}
    </svg>
  `;
}

function renderFeed(items) {
  const newest = [...items].slice(0, 6);
  els.liveFeed.innerHTML = "";
  if (!newest.length) {
    els.liveFeed.innerHTML = `<div class="empty-state">The live feed will populate after the first sync.</div>`;
    return;
  }

  for (const item of newest) {
    const node = document.createElement("article");
    node.className = "feed-item";
    node.innerHTML = `
      <p class="feed-title">${item.name}</p>
      <div class="feed-copy">${sourceLabel(item.source)} · ${item.metricLabel}: ${item.metricValue} · ${item.relativeTime}</div>
      <div class="feed-copy">${item.desc}</div>
    `;
    els.liveFeed.appendChild(node);
  }
}

function renderTrending(items) {
  const top = items.slice(0, 5);
  els.trendingList.innerHTML = "";
  if (!top.length) {
    els.trendingList.innerHTML = `<div class="mini-item">No top movers yet.</div>`;
    return;
  }

  for (const item of top) {
    const node = document.createElement("div");
    node.className = "mini-item";
    node.innerHTML = `
      <p class="mini-title">${item.name}</p>
      <div class="small-copy">${item.metricValue} · money ${item.scores?.money || 0}</div>
    `;
    els.trendingList.appendChild(node);
  }
}

function renderSourceHealth(sourceHealth) {
  els.sourceHealth.innerHTML = "";
  const entries = Object.entries(sourceHealth);
  if (!entries.length) {
    els.sourceHealth.innerHTML = `<div class="mini-item">Waiting for source health.</div>`;
    return;
  }

  for (const [source, health] of entries) {
    const node = document.createElement("div");
    node.className = "mini-item";
    node.innerHTML = `
      <p class="mini-title">${sourceLabel(source)}</p>
      <div class="small-copy">${health.ok ? `ok · ${health.count} rows` : `error · ${health.error}`}</div>
    `;
    els.sourceHealth.appendChild(node);
  }
}

function makeScorePill(label, value) {
  const node = document.createElement("span");
  node.className = "score-pill";
  node.textContent = `${label} ${Math.round(value)}`;
  return node;
}

function summarizeSources(items) {
  return items.reduce((accumulator, item) => {
    accumulator[item.source] = (accumulator[item.source] || 0) + 1;
    return accumulator;
  }, {});
}

function updateAiStatus(message = "") {
  if (message) {
    els.aiStatus.textContent = message;
    return;
  }

  const hasLocalGroq = Boolean(getSettings().keys.groqApiKey);
  if (hasLocalGroq) {
    els.aiStatus.textContent = `${Object.keys(state.analyses).length} cached AI notes`;
    return;
  }

  els.aiStatus.textContent = "Add a Groq key in Settings to enable AI summaries";
}

function setStatus(message) {
  els.syncStatus.textContent = message;
}

function buildAutomationSummary(settings) {
  const mode = settings.automation.autoRefresh
    ? `refresh every ${settings.automation.refreshMinutes}m`
    : "manual refresh";
  const analysis = settings.automation.autoAnalyze ? "auto analyze on" : "auto analyze off";
  return `${mode}, ${analysis}, max ${settings.automation.maxItems} rows`;
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
  if (state.refreshTimer) {
    window.clearInterval(state.refreshTimer);
    state.refreshTimer = null;
  }

  const settings = getSettings();
  if (!settings.automation.autoRefresh) return;

  state.refreshTimer = window.setInterval(() => {
    if (!document.hidden) {
      syncData({ manual: false });
    }
  }, settings.automation.refreshMinutes * 60 * 1000);
}

async function registerServiceWorker() {
  const settings = getSettings();
  if (!settings.automation.offlineMode || !("serviceWorker" in navigator)) return;

  try {
    await navigator.serviceWorker.register("/sw.js");
  } catch {
    // Ignore registration issues.
  }
}
