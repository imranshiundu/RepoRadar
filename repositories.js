import {
  formatTime,
  getAnalyses,
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
  view: "all",
  chip: "all",
  search: "",
  latestSnapshot: getLatestSnapshot()
};

const els = {
  syncStatus: document.getElementById("syncStatus"),
  refreshBtn: document.getElementById("refreshBtn"),
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
  state.items = mergeAnalysesIntoItems(snapshot.items, state.analyses);
}

async function syncData() {
  els.refreshBtn.disabled = true;
  els.syncStatus.textContent = "Syncing...";
  try {
    const payload = await discoverData(getSettings());
    state.items = mergeAnalysesIntoItems(payload.items || [], state.analyses);
    upsertCatalog(state.items);
    setLatestSnapshot({
      syncedAt: Date.now(),
      runtimeMode: payload.runtimeMode,
      items: state.items
    });
    els.syncStatus.textContent = "Ready";
    render();
  } catch (err) {
    els.syncStatus.textContent = "Error";
  } finally {
    els.refreshBtn.disabled = false;
  }
}

function visibleItems() {
  return state.items
    .filter(item => {
      if (state.chip === "all") return true;
      if (state.chip === "money") return item.tags?.includes("money");
      return item.tags?.includes(state.chip);
    })
    .filter(item => {
      if (!state.search) return true;
      const haystack = [item.name, item.owner, item.desc, ...(item.tags || [])].join(" ").toLowerCase();
      return haystack.includes(state.search);
    })
    .sort((a, b) => (b.scores?.trend || 0) - (a.scores?.trend || 0));
}

function render() {
  const items = visibleItems();
  els.repoGrid.innerHTML = "";
  
  if (!items.length) {
    els.repoGrid.innerHTML = '<div class="empty-state">No repositories found.</div>';
    return;
  }

  items.forEach(item => {
    const node = els.cardTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector(".source-pill").textContent = sourceLabel(item.source);
    node.querySelector(".metric-pill").textContent = `${item.metricLabel}: ${item.metricValue}`;
    node.querySelector(".repo-name").textContent = item.name;
    node.querySelector(".repo-owner").textContent = `${item.owner || "Unknown"} · ${item.language || "Mixed"}`;
    node.querySelector(".repo-desc").textContent = item.desc;

    // Tap on card for more info
    node.addEventListener("click", (e) => {
      if (e.target.closest(".action-row") || e.target.closest(".card-actions")) return;
      showModal(item);
    });

    els.repoGrid.appendChild(node);
  });
}

function showModal(item) {
  const isSaved = state.saved.has(item.id);
  const isQueued = state.queued.has(item.id);

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal-content">
      <button class="close-modal">&times;</button>
      <div class="card-top">
        <span class="source-pill">${sourceLabel(item.source)}</span>
        <span class="metric-pill">${item.metricLabel}: ${item.metricValue}</span>
      </div>
      <h2 class="repo-name">${item.name}</h2>
      <p class="repo-owner">${item.owner || "Unknown"} · ${item.language || "Mixed"}</p>
      <p class="repo-desc">${item.desc}</p>
      
      <div class="tag-row">
        ${(item.tags || []).map(t => `<span class="tag">${t}</span>`).join('')}
      </div>

      <div class="analysis-box">
        ${item.aiSummary || "AI summary not available. Tap 'Analyze' to generate one."}
      </div>

      <div class="score-row">
        <span class="score-pill">Trend ${Math.round(item.scores?.trend || 0)}</span>
        <span class="score-pill">Learn ${Math.round(item.scores?.learn || 0)}</span>
        <span class="score-pill">Money ${Math.round(item.scores?.money || 0)}</span>
      </div>

      <div class="card-actions" style="display: flex; gap: 0.5rem; margin-top: 1.5rem;">
        <button class="btn ${isSaved ? 'btn-strong' : ''}" id="modalSave">${isSaved ? 'Saved' : 'Save'}</button>
        <button class="btn ${isQueued ? 'btn-strong' : ''}" id="modalQueue">${isQueued ? 'Queued' : 'Queue'}</button>
        <button class="btn" id="modalAnalyze">Analyze</button>
        <button class="btn btn-strong" id="modalOpen">Open GitHub</button>
      </div>
    </div>
  `;

  overlay.querySelector(".close-modal").onclick = () => overlay.remove();
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

  overlay.querySelector("#modalSave").onclick = () => {
    toggleSetMembership(state.saved, item.id, setSavedSet);
    overlay.remove();
    render();
  };
  overlay.querySelector("#modalQueue").onclick = () => {
    toggleSetMembership(state.queued, item.id, setQueuedSet);
    overlay.remove();
    render();
  };
  overlay.querySelector("#modalAnalyze").onclick = async () => {
    const btn = overlay.querySelector("#modalAnalyze");
    btn.disabled = true;
    btn.textContent = "Analyzing...";
    try {
      const results = await analyzeWithAvailableRuntime([item], getSettings());
      if (results.length) {
        state.analyses[item.id] = results[0];
        setAnalyses(state.analyses);
        state.items = mergeAnalysesIntoItems(state.items, state.analyses);
        overlay.querySelector(".analysis-box").textContent = results[0].aiSummary;
      }
    } catch (err) {
      alert("Analysis failed");
    } finally {
      btn.disabled = false;
      btn.textContent = "Analyze";
    }
  };
  overlay.querySelector("#modalOpen").onclick = () => {
    window.open(item.url, "_blank", "noopener,noreferrer");
  };

  els.modalHost.appendChild(overlay);
}

function toggleSetMembership(set, id, persist) {
  if (set.has(id)) set.delete(id);
  else set.add(id);
  persist(set);
}
