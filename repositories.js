import {
  getAnalyses,
  getCatalogMap,
  getIgnoredSet,
  getLatestSnapshot,
  getQueuedSet,
  getSavedSet,
  getSettings,
  mergeAnalysesIntoItems,
  setAnalyses,
  setIgnoredSet,
  setLatestSnapshot,
  setQueuedSet,
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
  view: "all",
  chip: "all",
  search: "",
  sort: "trend",
  latestSnapshot: getLatestSnapshot()
};

const els = {
  syncStatus: document.getElementById("syncStatus"),
  refreshBtn: document.getElementById("refreshBtn"),
  sortSelect: document.getElementById("sortSelect"),
  searchInput: document.getElementById("searchInput"),
  repoGrid: document.getElementById("repoGrid"),
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
    setLatestSnapshot({
      syncedAt: Date.now(),
      runtimeMode: payload.runtimeMode,
      items: state.items
    });
    const watchlistHits = publishWatchlistAlerts(
      findNewWatchlistMatches(state.items, previousCatalog, state.settings),
      state.settings
    );
    els.syncStatus.textContent = watchlistHits.length
      ? `Ready · ${watchlistHits.length} hit${watchlistHits.length === 1 ? "" : "s"}`
      : "Ready";
    render();
  } catch (err) {
    els.syncStatus.textContent = "Error";
  } finally {
    els.refreshBtn.disabled = false;
  }
}

function visibleItems() {
  const catalog = getCatalogMap();
  return state.items
    .filter(item => {
      if (state.ignored.has(item.id)) return false;
      if (state.chip === "all") return true;
      if (state.chip === "saved") return state.saved.has(item.id);
      if (state.chip === "money") return (item.scores?.money || 0) >= 72;
      if (state.chip === "watchlist") return item.matchesWatchlist;
      return item.tags?.includes(state.chip);
    })
    .filter(item => {
      if (!state.search) return true;
      const haystack = [item.name, item.owner, item.desc, ...(item.tags || [])].join(" ").toLowerCase();
      return haystack.includes(state.search);
    })
    .sort((a, b) => compareItems(a, b, catalog));
}

function render() {
  const items = visibleItems();
  els.repoGrid.innerHTML = "";
  
  if (!items.length) {
    els.repoGrid.innerHTML = '<div class="panel" style="grid-column: 1/-1; text-align: center;">No repositories match your criteria.</div>';
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
    node.querySelector(".repo-desc").textContent = displayCardSummary(item);

    const tagRow = node.querySelector(".tag-row");
    if (item.matchesWatchlist) {
      const span = document.createElement("span");
      span.className = "tag";
      span.style.background = "var(--brand-soft)";
      span.style.color = "var(--brand)";
      span.textContent = "watchlist";
      tagRow.appendChild(span);
    }
    (item.tags || []).slice(0, 3).forEach(tag => {
      const span = document.createElement("span");
      span.className = "tag";
      span.textContent = tag;
      tagRow.appendChild(span);
    });

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
          state.analyses[item.id] = results[0];
          setAnalyses(state.analyses);
          state.items = decorateItemsWithWatchlist(
            mergeAnalysesIntoItems(state.items, state.analyses),
            getSettings()
          );
          render();
        }
      } catch (err) {
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

    els.repoGrid.appendChild(node);
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

function displayCardSummary(item) {
  return item.translatedSummary || item.aiSummary || item.desc || "No description available.";
}

function compareItems(a, b, catalog) {
  if (state.sort === "money") {
    return (b.scores?.money || 0) - (a.scores?.money || 0);
  }

  if (state.sort === "new") {
    return (catalog[b.id]?.lastSeenAt || 0) - (catalog[a.id]?.lastSeenAt || 0);
  }

  if (state.sort === "name") {
    return a.name.localeCompare(b.name);
  }

  return (b.scores?.trend || 0) - (a.scores?.trend || 0);
}
