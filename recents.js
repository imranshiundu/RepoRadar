import {
  clearAnalysisFailure,
  getAnalysisFailures,
  getAnalyses,
  getCatalogMap,
  getRecentAnalysisFailure,
  hasRichAnalysis,
  getIgnoredSet,
  getLatestSnapshot,
  getSavedSet,
  getSettings,
  mergeAnalysesIntoItems,
  setAnalyses,
  setAnalysisFailures,
  setIgnoredSet,
  setLatestSnapshot,
  setSavedSet,
  stampAnalysis,
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
  analyses: getAnalyses(),
  analysisFailures: getAnalysisFailures(),
  chip: "all",
  search: "",
  sort: "new",
  latestSnapshot: getLatestSnapshot()
};

const els = {
  syncStatus: document.getElementById("syncStatus"),
  refreshBtn: document.getElementById("refreshBtn"),
  sortSelect: document.getElementById("sortSelect"),
  searchInput: document.getElementById("searchInput"),
  recentsGrid: document.getElementById("recentsGrid"),
  cardTemplate: document.getElementById("cardTemplate"),
  modalHost: document.getElementById("modalHost")
};

boot();

function boot() {
  wireUi();
  hydrateCachedData();
  render();
}

function wireUi() {
  els.refreshBtn.addEventListener("click", () => syncData());
  els.searchInput.addEventListener("input", (e) => {
    state.search = e.target.value.trim().toLowerCase();
    render();
  });
  els.sortSelect.addEventListener("change", (e) => {
    state.sort = e.target.value;
    render();
  });

  document.querySelectorAll("[data-chip]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-chip]").forEach((b) => b.classList.remove("chip-on"));
      btn.classList.add("chip-on");
      state.chip = btn.dataset.chip;
      render();
    });
  });
}

function hydrateCachedData() {
  const snapshot = getLatestSnapshot();
  if (!snapshot?.items?.length) return;
  state.items = decorateItemsWithWatchlist(
    mergeAnalysesIntoItems(snapshot.items, state.analyses),
    getSettings()
  );
}

async function syncData() {
  els.refreshBtn.disabled = true;
  els.syncStatus.textContent = "Syncing...";
  try {
    state.settings = getSettings();
    const previousCatalog = getCatalogMap();
    const payload = await discoverData(state.settings);
    state.items = decorateItemsWithWatchlist(
      mergeAnalysesIntoItems(payload.items || [], state.analyses),
      state.settings
    );
    upsertCatalog(state.items);
    state.latestSnapshot = {
      syncedAt: Date.now(),
      runtimeMode: payload.runtimeMode,
      items: state.items
    };
    setLatestSnapshot(state.latestSnapshot);
    const watchlistHits = publishWatchlistAlerts(
      findNewWatchlistMatches(state.items, previousCatalog, state.settings),
      state.settings
    );
    els.syncStatus.textContent = watchlistHits.length
      ? `Ready · ${watchlistHits.length} hit${watchlistHits.length === 1 ? "" : "s"}`
      : "Ready";
    render();
    if (state.settings.automation.autoAnalyze) {
      analyzePriorityItems().catch(console.error);
    }
  } catch (err) {
    els.syncStatus.textContent = "Error";
  } finally {
    els.refreshBtn.disabled = false;
  }
}

async function analyzePriorityItems() {
  const targets = visibleItems()
    .filter((item) => !hasRichAnalysis(item, state.analyses))
    .filter((item) => !getRecentAnalysisFailure(item, state.analysisFailures))
    .sort((a, b) => priorityForAnalysis(b) - priorityForAnalysis(a))
    .slice(0, 4);

  if (!targets.length) return;
  const results = await analyzeWithAvailableRuntime(targets, getSettings());
  for (const item of results) {
    const sourceItem = targets.find((entry) => entry.id === item.id);
    state.analyses[item.id] = stampAnalysis(sourceItem, item);
    state.analysisFailures = clearAnalysisFailure(sourceItem, state.analysisFailures);
  }
  setAnalyses(state.analyses);
  setAnalysisFailures(state.analysisFailures);
  state.items = decorateItemsWithWatchlist(
    mergeAnalysesIntoItems(state.items, state.analyses),
    getSettings()
  );
  render();
}

function visibleItems() {
  let filtered = state.items.filter((item) => !state.ignored.has(item.id));
  const catalog = getCatalogMap();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  if (state.chip === "today") {
    filtered = filtered.filter((item) => (catalog[item.id]?.lastSeenAt || 0) >= startOfToday.getTime());
  }

  if (state.chip === "new") {
    filtered = filtered.filter((item) => {
      const row = catalog[item.id];
      return row && row.firstSeenAt === row.lastSeenAt;
    });
  }

  if (state.chip === "watchlist") {
    filtered = filtered.filter((item) => item.matchesWatchlist);
  }

  if (state.search) {
    filtered = filtered.filter(item => {
      const haystack = [item.name, item.owner, item.desc, ...(item.tags || [])].join(" ").toLowerCase();
      return haystack.includes(state.search);
    });
  }

  return filtered.sort((a, b) => compareItems(a, b, catalog));
}

function render() {
  const items = visibleItems();
  els.recentsGrid.innerHTML = "";
  
  if (!items.length) {
    els.recentsGrid.innerHTML = '<div class="panel" style="grid-column: 1/-1; text-align: center;">No recent arrivals found. Try syncing.</div>';
    return;
  }

  items.forEach(item => {
    const node = els.cardTemplate.content.firstElementChild.cloneNode(true);
    const isSaved = state.saved.has(item.id);
    const isIgnored = state.ignored.has(item.id);

    node.querySelector(".source-pill").textContent = sourceLabel(item.source);
    node.querySelector(".metric-pill").textContent = `${item.metricLabel}: ${item.metricValue}`;
    node.querySelector(".repo-name").textContent = displayTitle(item);
    node.querySelector(".repo-owner").textContent = `${item.owner || "Unknown"} · ${item.language || "Mixed"}`;
    node.querySelector(".repo-desc").textContent = item.desc;

    const tagRow = node.querySelector(".tag-row");
    if (item.matchesWatchlist) {
      const span = document.createElement("span");
      span.className = "tag";
      span.style.background = "var(--brand-soft)";
      span.style.color = "var(--brand)";
      span.textContent = "watchlist";
      tagRow.appendChild(span);
    }
    (item.tags || []).forEach(tag => {
      const span = document.createElement("span");
      span.className = "tag";
      span.textContent = tag;
      tagRow.appendChild(span);
    });

    const analysisBox = node.querySelector(".analysis-box");
    if (item.aiSummary) {
      analysisBox.textContent = item.translatedSummary || item.aiSummary;
      analysisBox.className = "analysis-box";
    } else if (item.language === "Chinese" || item.language === "Japanese" || item.language === "Korean") {
      analysisBox.textContent = "Non-English source detected. Tap AI or open the detail page for an English brief.";
      analysisBox.className = "analysis-box small-copy";
    } else {
      analysisBox.textContent = "AI Summary Pending";
      analysisBox.className = "analysis-box small-copy";
    }

    const scoreRow = node.querySelector(".score-row");
    scoreRow.innerHTML = `
      <span class="score-pill">Trend ${Math.round(item.scores?.trend || 0)}</span>
      <span class="score-pill">Money ${Math.round(item.scores?.money || 0)}</span>
    `;

    const saveBtn = node.querySelector(".save-btn");
    saveBtn.classList.toggle("active-state", isSaved);
    saveBtn.textContent = isSaved ? "Saved" : "Save";
    saveBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleSetMembership(state.saved, item.id, setSavedSet);
      render();
    });

    const ignoreBtn = node.querySelector(".ignore-btn");
    ignoreBtn.classList.toggle("btn-strong", isIgnored);
    ignoreBtn.textContent = isIgnored ? "Ignored" : "Ignore";
    ignoreBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleSetMembership(state.ignored, item.id, setIgnoredSet);
      render();
    });

    node.querySelector(".analyze-btn").addEventListener("click", async (e) => {
      e.stopPropagation();
      const btn = e.target;
      btn.disabled = true;
      btn.textContent = "...";
      try {
        const results = await analyzeWithAvailableRuntime([item], getSettings());
        if (results.length) {
          state.analyses[item.id] = stampAnalysis(item, results[0]);
          state.analysisFailures = clearAnalysisFailure(item, state.analysisFailures);
          setAnalyses(state.analyses);
          setAnalysisFailures(state.analysisFailures);
          state.items = decorateItemsWithWatchlist(
            mergeAnalysesIntoItems(state.items, state.analyses),
            getSettings()
          );
          render();
        }
      } catch (err) {
        state.analysisFailures[item.id] = {
          message: String(err.message || "Analysis failed"),
          failedAt: Date.now()
        };
        setAnalysisFailures(state.analysisFailures);
        console.error(err);
      } finally {
        btn.disabled = false;
        btn.textContent = "AI";
      }
    });

    node.querySelector(".visit-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      window.open(item.url, "_blank", "noopener,noreferrer");
    });

    node.addEventListener("click", () => {
      window.location.href = `/repo.html?id=${encodeURIComponent(item.id)}`;
    });

    els.recentsGrid.appendChild(node);
  });
}

function toggleSetMembership(set, id, persist) {
  if (set.has(id)) set.delete(id);
  else set.add(id);
  persist(set);
}

function displayTitle(item) {
  return item.translatedTitle || item.name;
}

function compareItems(a, b, catalog) {
  if (state.sort === "trend") {
    return (b.scores?.trend || 0) - (a.scores?.trend || 0);
  }

  if (state.sort === "money") {
    return (b.scores?.money || 0) - (a.scores?.money || 0);
  }

  if (state.sort === "name") {
    return a.name.localeCompare(b.name);
  }

  return (catalog[b.id]?.lastSeenAt || 0) - (catalog[a.id]?.lastSeenAt || 0);
}

function priorityForAnalysis(item) {
  const translationBoost = ["Chinese", "Japanese", "Korean"].includes(item.language) ? 30 : 0;
  return (item.scores?.trend || 0) + (item.preferenceScore || 0) + translationBoost + (item.matchesWatchlist ? 18 : 0);
}
