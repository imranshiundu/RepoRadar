const STORAGE_KEYS = {
  discover: "repo-radar.discover-cache",
  analyses: "repo-radar.analyses-cache",
  saved: "repo-radar.saved-items",
  settings: "repo-radar.settings"
};

const DEFAULT_SETTINGS = {
  sources: {
    github: true,
    hn: true,
    reddit: true,
    producthunt: false
  },
  autoAnalyze: true,
  autoRefresh: true,
  offline: true
};

const state = {
  items: [],
  saved: new Set(loadJson(STORAGE_KEYS.saved, [])),
  analyses: loadJson(STORAGE_KEYS.analyses, {}),
  settings: { ...DEFAULT_SETTINGS, ...loadJson(STORAGE_KEYS.settings, {}) },
  view: "all",
  chip: "all",
  search: "",
  aiConfigured: false,
  sourceHealth: {},
  refreshTimer: null
};

const els = {
  configPanel: document.getElementById("configPanel"),
  configToggle: document.getElementById("configToggle"),
  refreshBtn: document.getElementById("refreshBtn"),
  syncStatus: document.getElementById("syncStatus"),
  aiStatus: document.getElementById("aiStatus"),
  cacheStatus: document.getElementById("cacheStatus"),
  backgroundStatus: document.getElementById("backgroundStatus"),
  searchInput: document.getElementById("searchInput"),
  repoGrid: document.getElementById("repoGrid"),
  trendingList: document.getElementById("trendingList"),
  cardTemplate: document.getElementById("cardTemplate"),
  statItems: document.getElementById("statItems"),
  statSources: document.getElementById("statSources"),
  statAnalyzed: document.getElementById("statAnalyzed"),
  statSaved: document.getElementById("statSaved"),
  allCount: document.getElementById("allCount"),
  moneyCount: document.getElementById("moneyCount"),
  savedCount: document.getElementById("savedCount"),
  aiCount: document.getElementById("aiCount")
};

init();

function init() {
  wireUi();
  hydrateFromCache();
  render();
  refreshData();
  applyRefreshSchedule();
  registerServiceWorker();
}

function wireUi() {
  els.configToggle.addEventListener("click", () => {
    const hidden = els.configPanel.hasAttribute("hidden");
    if (hidden) {
      els.configPanel.removeAttribute("hidden");
    } else {
      els.configPanel.setAttribute("hidden", "");
    }
  });

  els.refreshBtn.addEventListener("click", () => refreshData({ force: true }));
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

  document.querySelectorAll("[data-source]").forEach((input) => {
    input.checked = Boolean(state.settings.sources[input.dataset.source]);
    input.addEventListener("change", () => {
      state.settings.sources[input.dataset.source] = input.checked;
      persistSettings();
      refreshData({ force: true });
    });
  });

  const autoAnalyzeToggle = document.getElementById("autoAnalyzeToggle");
  autoAnalyzeToggle.checked = state.settings.autoAnalyze;
  autoAnalyzeToggle.addEventListener("change", () => {
    state.settings.autoAnalyze = autoAnalyzeToggle.checked;
    persistSettings();
    if (state.settings.autoAnalyze) {
      queueAutoAnalysis();
    }
  });

  const autoRefreshToggle = document.getElementById("autoRefreshToggle");
  autoRefreshToggle.checked = state.settings.autoRefresh;
  autoRefreshToggle.addEventListener("change", () => {
    state.settings.autoRefresh = autoRefreshToggle.checked;
    persistSettings();
    applyRefreshSchedule();
  });

  const offlineToggle = document.getElementById("offlineToggle");
  offlineToggle.checked = state.settings.offline;
  offlineToggle.addEventListener("change", () => {
    state.settings.offline = offlineToggle.checked;
    persistSettings();
  });
}

function hydrateFromCache() {
  const cached = loadJson(STORAGE_KEYS.discover, null);
  if (!cached?.items?.length) {
    els.cacheStatus.textContent = "No cache yet";
    return;
  }

  state.items = cached.items;
  state.aiConfigured = Boolean(cached.aiConfigured);
  state.sourceHealth = cached.sourceHealth || {};
  els.cacheStatus.textContent = formatTimestamp(cached.cachedAt);
  setStatus(`Loaded ${cached.items.length} cached items`);
}

async function refreshData({ force = false } = {}) {
  const activeSources = Object.entries(state.settings.sources)
    .filter(([, on]) => on)
    .map(([source]) => source);

  if (!activeSources.length) {
    setStatus("Select at least one source");
    state.items = [];
    render();
    return;
  }

  els.refreshBtn.disabled = true;
  els.refreshBtn.textContent = "Refreshing...";
  setStatus(force ? "Refreshing live sources..." : "Syncing live sources...");

  try {
    const params = new URLSearchParams({ sources: activeSources.join(",") });
    const response = await fetch(`/api/discover?${params.toString()}`, { cache: "no-store" });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "Unable to fetch data");
    }

    state.items = mergeAnalyses(payload.items || []);
    state.aiConfigured = Boolean(payload.aiConfigured);
    state.sourceHealth = payload.sourceHealth || {};

    persistJson(STORAGE_KEYS.discover, {
      cachedAt: Date.now(),
      aiConfigured: state.aiConfigured,
      sourceHealth: state.sourceHealth,
      items: state.items
    });

    els.cacheStatus.textContent = formatTimestamp(Date.now());
    setStatus(`Loaded ${state.items.length} live items from ${activeSources.length} source${activeSources.length === 1 ? "" : "s"}`);
    render();
    queueAutoAnalysis();
  } catch (error) {
    setStatus(error.message || "Refresh failed");
    render();
  } finally {
    els.refreshBtn.disabled = false;
    els.refreshBtn.textContent = "Refresh";
  }
}

function queueAutoAnalysis() {
  if (!state.settings.autoAnalyze || !state.aiConfigured) {
    updateAiStatus();
    return;
  }

  const pending = visibleItems()
    .filter((item) => !state.analyses[item.id])
    .slice(0, 4);

  if (!pending.length) {
    updateAiStatus();
    return;
  }

  analyzeItems(pending);
}

async function analyzeItems(items) {
  try {
    updateAiStatus("Analyzing top cards...");
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items })
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "AI analysis failed");
    }

    for (const item of payload.items || []) {
      state.analyses[item.id] = item;
    }

    persistJson(STORAGE_KEYS.analyses, state.analyses);
    state.items = mergeAnalyses(state.items);
    updateAiStatus();
    render();
  } catch (error) {
    updateAiStatus(error.message);
  }
}

function mergeAnalyses(items) {
  return items.map((item) => {
    const analysis = state.analyses[item.id];
    if (!analysis) {
      return item;
    }

    return {
      ...item,
      aiSummary: analysis.summary || item.aiSummary,
      opportunity: analysis.opportunity || item.opportunity,
      audience: analysis.audience || item.audience,
      weekendMvp: analysis.weekendMvp || item.weekendMvp,
      scores: analysis.scores || item.scores
    };
  });
}

function render() {
  const items = visibleItems();
  renderStats(items);
  renderCards(items);
  renderTrending(items);
  updateAiStatus();
  updateBackgroundStatus();
}

function visibleItems() {
  return state.items
    .filter((item) => matchesView(item))
    .filter((item) => matchesChip(item))
    .filter((item) => matchesSearch(item))
    .sort((left, right) => (right.scores?.trend || 0) - (left.scores?.trend || 0));
}

function matchesView(item) {
  if (state.view === "all") return true;
  if (state.view === "saved") return state.saved.has(item.id);
  if (state.view === "monetizable") return (item.scores?.money || 0) >= 72;
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

function renderStats(items) {
  const activeSources = Object.values(state.settings.sources).filter(Boolean).length;
  const analyzed = items.filter((item) => Boolean(state.analyses[item.id])).length;

  els.statItems.textContent = String(items.length);
  els.statSources.textContent = String(activeSources);
  els.statAnalyzed.textContent = String(analyzed);
  els.statSaved.textContent = String(state.saved.size);

  els.allCount.textContent = String(state.items.length);
  els.moneyCount.textContent = String(state.items.filter((item) => (item.scores?.money || 0) >= 72).length);
  els.savedCount.textContent = String(state.saved.size);
  els.aiCount.textContent = String(state.items.filter((item) => item.tags?.includes("ai")).length);
}

function renderCards(items) {
  els.repoGrid.innerHTML = "";

  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No items match the current filters yet.";
    els.repoGrid.appendChild(empty);
    return;
  }

  for (const item of items) {
    const node = els.cardTemplate.content.firstElementChild.cloneNode(true);
    const isSaved = state.saved.has(item.id);
    const analysisReady = Boolean(state.analyses[item.id] || item.aiSummary);

    node.querySelector(".source-badge").textContent = sourceLabel(item.source);
    node.querySelector(".score-badge").textContent = `${Math.round(item.scores?.money || 0)}% money`;
    node.querySelector(".repo-name").textContent = item.name;
    node.querySelector(".repo-owner").textContent = `${item.owner || "Unknown"} • ${item.language || "Mixed stack"}`;
    node.querySelector(".repo-desc").textContent = item.desc;

    const tagRow = node.querySelector(".tag-row");
    for (const tag of item.tags || []) {
      const tagEl = document.createElement("span");
      tagEl.className = "tag";
      tagEl.textContent = tag;
      tagRow.appendChild(tagEl);
    }

    const analysisBox = node.querySelector(".analysis-box");
    if (analysisReady) {
      analysisBox.textContent = item.aiSummary || item.opportunity || "AI summary ready.";
    } else {
      analysisBox.classList.add("loading");
      analysisBox.textContent = "Loading AI summary placeholder";
    }

    const meterRow = node.querySelector(".meter-row");
    meterRow.appendChild(makeMeter("TREND", item.scores?.trend || 0, "var(--red)"));
    meterRow.appendChild(makeMeter("LEARN", item.scores?.learn || 0, "var(--brand)"));
    meterRow.appendChild(makeMeter("MONEY", item.scores?.money || 0, "var(--gold)"));

    node.querySelector(".repo-meta").innerHTML = `
      <span>${item.metricLabel}: ${item.metricValue}</span>
      <span>${item.relativeTime || "fresh"}</span>
    `;

    const saveBtn = node.querySelector(".save-btn");
    saveBtn.textContent = isSaved ? "Saved" : "Save";
    saveBtn.classList.toggle("saved", isSaved);
    saveBtn.addEventListener("click", () => {
      toggleSave(item.id);
      render();
    });

    node.querySelector(".visit-btn").addEventListener("click", () => {
      window.open(item.url, "_blank", "noopener,noreferrer");
    });

    node.querySelector(".analyze-btn").addEventListener("click", async () => {
      await analyzeItems([item]);
    });

    els.repoGrid.appendChild(node);
  }
}

function renderTrending(items) {
  const trending = items.slice(0, 5);
  els.trendingList.innerHTML = "";

  for (const item of trending) {
    const wrap = document.createElement("div");
    wrap.className = "trend-item";
    wrap.innerHTML = `
      <p class="trend-name">${item.name}</p>
      <div class="trend-meta">${sourceLabel(item.source)} • ${item.metricValue} • trend ${Math.round(item.scores?.trend || 0)}</div>
    `;
    els.trendingList.appendChild(wrap);
  }
}

function makeMeter(label, value, color) {
  const wrap = document.createElement("div");
  wrap.className = "meter";
  wrap.innerHTML = `
    <span class="meter-label">${label}</span>
    <div class="meter-track"><div class="meter-fill" style="width:${Math.max(0, Math.min(100, value))}%;background:${color}"></div></div>
  `;
  return wrap;
}

function toggleSave(id) {
  if (state.saved.has(id)) {
    state.saved.delete(id);
  } else {
    state.saved.add(id);
  }

  persistJson(STORAGE_KEYS.saved, [...state.saved]);
}

function persistSettings() {
  persistJson(STORAGE_KEYS.settings, state.settings);
}

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function persistJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function setStatus(message) {
  els.syncStatus.textContent = message;
}

function updateAiStatus(message = "") {
  if (message) {
    els.aiStatus.textContent = message;
    return;
  }

  if (!state.aiConfigured) {
    els.aiStatus.textContent = "Groq key missing on server";
    return;
  }

  const count = Object.keys(state.analyses).length;
  els.aiStatus.textContent = `Groq connected, ${count} cached summary${count === 1 ? "" : "ies"}`;
}

function updateBackgroundStatus() {
  if (!("serviceWorker" in navigator)) {
    els.backgroundStatus.textContent = "Service workers unavailable in this browser";
    return;
  }

  els.backgroundStatus.textContent = state.settings.offline
    ? "Offline cache enabled, periodic sync is browser-dependent"
    : "Offline cache disabled in settings";
}

function formatTimestamp(timestamp) {
  if (!timestamp) return "No cache yet";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(timestamp));
}

function applyRefreshSchedule() {
  if (state.refreshTimer) {
    window.clearInterval(state.refreshTimer);
    state.refreshTimer = null;
  }

  if (!state.settings.autoRefresh) {
    return;
  }

  state.refreshTimer = window.setInterval(() => {
    if (!document.hidden) {
      refreshData();
    }
  }, 15 * 60 * 1000);
}

async function registerServiceWorker() {
  if (!state.settings.offline || !("serviceWorker" in navigator)) {
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register("/sw.js");
    if ("periodicSync" in registration) {
      try {
        await registration.periodicSync.register("repo-radar-refresh", {
          minInterval: 6 * 60 * 60 * 1000
        });
      } catch {
        // Best effort only.
      }
    }
  } catch {
    // Ignore registration failures and let the UI continue.
  }
}

function sourceLabel(source) {
  return {
    github: "GitHub",
    hn: "Hacker News",
    reddit: "Reddit",
    producthunt: "Product Hunt"
  }[source] || source;
}
