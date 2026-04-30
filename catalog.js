import {
  formatTime,
  getAnalyses,
  getCatalogRows,
  getQueuedSet,
  getSavedSet,
  setQueuedSet,
  setSavedSet,
  sourceLabel
} from "./runtime.js";

const state = {
  rows: getCatalogRows(),
  saved: getSavedSet(),
  queued: getQueuedSet(),
  analyses: getAnalyses(),
  search: "",
  filter: "all",
  sort: "seen"
};

const els = {
  catalogStatus: document.getElementById("catalogStatus"),
  catalogTotal: document.getElementById("catalogTotal"),
  catalogSaved: document.getElementById("catalogSaved"),
  catalogQueued: document.getElementById("catalogQueued"),
  catalogAi: document.getElementById("catalogAi"),
  catalogSearch: document.getElementById("catalogSearch"),
  catalogFilter: document.getElementById("catalogFilter"),
  catalogSort: document.getElementById("catalogSort"),
  catalogBody: document.getElementById("catalogBody")
};

wireUi();
render();

function wireUi() {
  els.catalogSearch.addEventListener("input", (event) => {
    state.search = event.target.value.trim().toLowerCase();
    render();
  });

  els.catalogFilter.addEventListener("change", (event) => {
    state.filter = event.target.value;
    render();
  });

  els.catalogSort.addEventListener("change", (event) => {
    state.sort = event.target.value;
    render();
  });
}

function render() {
  state.rows = getCatalogRows();
  const rows = filteredRows();

  els.catalogStatus.textContent = `${rows.length} visible rows from ${state.rows.length} locally stored`;
  els.catalogTotal.textContent = String(state.rows.length);
  els.catalogSaved.textContent = String(state.saved.size);
  els.catalogQueued.textContent = String(state.queued.size);
  els.catalogAi.textContent = String(Object.keys(state.analyses).length);

  els.catalogBody.innerHTML = "";
  if (!rows.length) {
    els.catalogBody.innerHTML = `<tr><td colspan="9"><div class="empty-state">No catalog rows match the current filters.</div></td></tr>`;
    return;
  }

  for (const row of rows) {
    const tr = document.createElement("tr");
    const isSaved = state.saved.has(row.id);
    const isQueued = state.queued.has(row.id);
    const status = [isSaved ? "saved" : "", isQueued ? "queued" : ""].filter(Boolean).join(", ") || "none";

    tr.innerHTML = `
      <td>
        <strong>${row.name}</strong>
        <div class="small-copy">${row.desc || ""}</div>
      </td>
      <td>${sourceLabel(row.source)}</td>
      <td>${row.language || "Mixed"}</td>
      <td>${Math.round(row.scores?.money || 0)}</td>
      <td>${Math.round(row.scores?.trend || 0)}</td>
      <td>${formatTime(row.firstSeenAt)}</td>
      <td>${formatTime(row.lastSeenAt)}</td>
      <td>${status}</td>
      <td>
        <div class="row-actions">
          <button class="btn" data-action="save">${isSaved ? "Unsave" : "Save"}</button>
          <button class="btn" data-action="queue">${isQueued ? "Unqueue" : "Queue"}</button>
          <a class="text-link" href="${row.url}" target="_blank" rel="noopener noreferrer">Open</a>
        </div>
      </td>
    `;

    tr.querySelector('[data-action="save"]').addEventListener("click", () => {
      toggleSetMembership(state.saved, row.id, setSavedSet);
      render();
    });

    tr.querySelector('[data-action="queue"]').addEventListener("click", () => {
      toggleSetMembership(state.queued, row.id, setQueuedSet);
      render();
    });

    els.catalogBody.appendChild(tr);
  }
}

function filteredRows() {
  return state.rows
    .filter(matchesFilter)
    .filter(matchesSearch)
    .sort(sortRows);
}

function matchesFilter(row) {
  if (state.filter === "all") return true;
  if (state.filter === "saved") return state.saved.has(row.id);
  if (state.filter === "queued") return state.queued.has(row.id);
  if (state.filter === "money") return (row.scores?.money || 0) >= 72;
  if (state.filter === "ai") return row.tags?.includes("ai");
  return true;
}

function matchesSearch(row) {
  if (!state.search) return true;
  const haystack = [
    row.name,
    row.owner,
    row.desc,
    row.source,
    ...(row.tags || [])
  ].join(" ").toLowerCase();
  return haystack.includes(state.search);
}

function sortRows(left, right) {
  if (state.sort === "money") return (right.scores?.money || 0) - (left.scores?.money || 0);
  if (state.sort === "trend") return (right.scores?.trend || 0) - (left.scores?.trend || 0);
  if (state.sort === "source") return sourceLabel(left.source).localeCompare(sourceLabel(right.source));
  return (right.lastSeenAt || 0) - (left.lastSeenAt || 0);
}

function toggleSetMembership(set, id, persist) {
  if (set.has(id)) {
    set.delete(id);
  } else {
    set.add(id);
  }
  persist(set);
}
