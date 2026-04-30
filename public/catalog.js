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
  searchInput: document.getElementById("searchInput"),
  catalogTableHost: document.getElementById("catalogTableHost")
};

wireUi();
render();

function wireUi() {
  els.searchInput.addEventListener("input", (event) => {
    state.search = event.target.value.trim().toLowerCase();
    render();
  });
}

function render() {
  state.rows = getCatalogRows();
  const rows = filteredRows();

  els.catalogTableHost.innerHTML = "";

  if (!rows.length) {
    els.catalogTableHost.innerHTML = `<div class="mini-item" style="text-align: center; padding: 2rem;">No logs match your search.</div>`;
    return;
  }

  const table = document.createElement("table");
  table.className = "audit-table";
  table.style.width = "100%";
  table.style.borderCollapse = "collapse";
  table.style.fontSize = "0.85rem";

  table.innerHTML = `
    <thead>
      <tr style="text-align: left; color: var(--muted); border-bottom: 1px solid var(--border);">
        <th style="padding: 0.75rem 0.5rem;">Repository</th>
        <th style="padding: 0.75rem 0.5rem;">Source</th>
        <th style="padding: 0.75rem 0.5rem;">Trend</th>
        <th style="padding: 0.75rem 0.5rem;">Money</th>
        <th style="padding: 0.75rem 0.5rem;">First Seen</th>
        <th style="padding: 0.75rem 0.5rem;">Last Seen</th>
        <th style="padding: 0.75rem 0.5rem; text-align: right;">Action</th>
      </tr>
    </thead>
    <tbody id="catalogBody"></tbody>
  `;

  const tbody = table.querySelector("#catalogBody");

  for (const row of rows) {
    const tr = document.createElement("tr");
    tr.style.borderBottom = "1px solid var(--border)";
    const isSaved = state.saved.has(row.id);

    tr.innerHTML = `
      <td data-label="Repository" style="padding: 1rem 0.5rem;">
        <div class="repo-name" style="font-weight: 600;">${row.name}</div>
        <div class="small-copy repo-description" style="max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${row.desc || "No description"}</div>
      </td>
      <td data-label="Source" style="padding: 1rem 0.5rem;"><span class="source-pill" style="font-size: 0.65rem;">${sourceLabel(row.source)}</span></td>
      <td data-label="Trend" style="padding: 1rem 0.5rem;">${Math.round(row.scores?.trend || 0)}</td>
      <td data-label="Money" style="padding: 1rem 0.5rem;">${Math.round(row.scores?.money || 0)}</td>
      <td data-label="First Seen" style="padding: 1rem 0.5rem; color: var(--muted);">${formatTime(row.firstSeenAt)}</td>
      <td data-label="Last Seen" style="padding: 1rem 0.5rem; color: var(--muted);">${formatTime(row.lastSeenAt)}</td>
      <td data-label="Action" class="catalog-action-cell" style="padding: 1rem 0.5rem; text-align: right;">
        <button class="btn ${isSaved ? 'btn-strong' : ''}" data-action="save" style="font-size: 0.7rem;">${isSaved ? "Saved" : "Save"}</button>
      </td>
    `;

    tr.querySelector('[data-action="save"]').addEventListener("click", () => {
      toggleSetMembership(state.saved, row.id, setSavedSet);
      render();
    });

    tbody.appendChild(tr);
  }

  const tableWrap = document.createElement("div");
  tableWrap.className = "audit-table-wrap";
  tableWrap.appendChild(table);

  els.catalogTableHost.appendChild(tableWrap);
}

function filteredRows() {
  return state.rows
    .filter(matchesSearch)
    .sort((a, b) => (b.lastSeenAt || 0) - (a.lastSeenAt || 0));
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

function toggleSetMembership(set, id, persist) {
  if (set.has(id)) {
    set.delete(id);
  } else {
    set.add(id);
  }
  persist(set);
}
