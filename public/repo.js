import {
  clearAnalysisFailure,
  formatTime,
  getAnalysisFailures,
  getAnalyses,
  getCachedAnalysis,
  getCatalogMap,
  getIgnoredSet,
  getRecentAnalysisFailure,
  hasRichAnalysis,
  getLatestSnapshot,
  getSavedSet,
  getSettings,
  mergeAnalysesIntoItems,
  recordAnalysisFailure,
  setAnalyses,
  setAnalysisFailures,
  setIgnoredSet,
  setLatestSnapshot,
  setSavedSet,
  stampAnalysis,
  sourceLabel
} from "./runtime.js";
import { analyzeWithAvailableRuntime, getAnalysisRuntime } from "./data.js";

const state = {
  itemId: new URLSearchParams(window.location.search).get("id") || "",
  analyses: getAnalyses(),
  analysisFailures: getAnalysisFailures(),
  saved: getSavedSet(),
  ignored: getIgnoredSet(),
  latestSnapshot: getLatestSnapshot(),
  item: null
};

const els = {
  detailStatus: document.getElementById("detailStatus"),
  detailTitle: document.getElementById("detailTitle"),
  detailSubtitle: document.getElementById("detailSubtitle"),
  detailSource: document.getElementById("detailSource"),
  detailMetric: document.getElementById("detailMetric"),
  detailTags: document.getElementById("detailTags"),
  detailScores: document.getElementById("detailScores"),
  detailDesc: document.getElementById("detailDesc"),
  translatedSummary: document.getElementById("translatedSummary"),
  detailOpportunity: document.getElementById("detailOpportunity"),
  detailAudience: document.getElementById("detailAudience"),
  detailWhyNow: document.getElementById("detailWhyNow"),
  detailMvp: document.getElementById("detailMvp"),
  useCasesList: document.getElementById("useCasesList"),
  risksList: document.getElementById("risksList"),
  validationSummary: document.getElementById("validationSummary"),
  validationHighlights: document.getElementById("validationHighlights"),
  ignoreSignalsList: document.getElementById("ignoreSignalsList"),
  detailOwner: document.getElementById("detailOwner"),
  detailLanguage: document.getElementById("detailLanguage"),
  detailFirstSeen: document.getElementById("detailFirstSeen"),
  detailLastSeen: document.getElementById("detailLastSeen"),
  saveBtn: document.getElementById("saveBtn"),
  ignoreBtn: document.getElementById("ignoreBtn"),
  analyzeBtn: document.getElementById("analyzeBtn"),
  openBtn: document.getElementById("openBtn"),
  discussionBtn: document.getElementById("discussionBtn")
};

boot();

async function boot() {
  if (!state.itemId) {
    els.detailStatus.textContent = "Missing id";
    els.detailSubtitle.textContent = "No repository id was supplied.";
    return;
  }

  wireUi();
  hydrateItem();
  render();

  if (state.item && shouldAutoAnalyze(state.item)) {
    await analyzeCurrentItem();
  }
}

function wireUi() {
  els.saveBtn.addEventListener("click", () => {
    toggleSetMembership(state.saved, state.itemId, setSavedSet);
    render();
  });

  els.ignoreBtn.addEventListener("click", () => {
    toggleSetMembership(state.ignored, state.itemId, setIgnoredSet);
    render();
  });

  els.analyzeBtn.addEventListener("click", () => analyzeCurrentItem());

  els.openBtn.addEventListener("click", () => {
    if (state.item?.repoUrl || state.item?.url) {
      window.open(state.item.repoUrl || state.item.url, "_blank", "noopener,noreferrer");
    }
  });

  els.discussionBtn.addEventListener("click", () => {
    if (state.item?.discussionUrl) {
      window.open(state.item.discussionUrl, "_blank", "noopener,noreferrer");
    }
  });
}

function hydrateItem() {
  const catalogMap = getCatalogMap();
  const latestItems = state.latestSnapshot?.items || [];
  const latestItem = latestItems.find((item) => item.id === state.itemId);
  const catalogItem = catalogMap[state.itemId];
  const merged = mergeAnalysesIntoItems(
    [catalogItem || latestItem].filter(Boolean),
    state.analyses
  );
  state.item = merged[0] || null;
}

function render() {
  const item = state.item;
  if (!item) {
    els.detailStatus.textContent = "Not found";
    els.detailTitle.textContent = "Repository not found";
    els.detailSubtitle.textContent = "This repo is not available in the current local snapshot.";
    return;
  }

  els.detailStatus.textContent = detailStatusLabel(item);
  els.detailTitle.textContent = item.translatedTitle || item.name;
  els.detailSubtitle.textContent = item.aiSummary || buildLocalSummary(item);
  els.detailSource.textContent = sourceLabel(item.source);
  els.detailMetric.textContent = `${item.metricLabel}: ${item.metricValue}`;
  els.detailDesc.textContent = item.rawDesc || item.desc || "No description provided.";
  els.translatedSummary.textContent = item.translatedSummary || item.aiSummary || buildLocalSummary(item);
  els.detailOpportunity.textContent = item.opportunity || buildLocalOpportunity(item);
  els.detailAudience.textContent = item.audience || buildLocalAudience(item);
  els.detailWhyNow.textContent = item.whyNow || buildLocalWhyNow(item);
  els.detailMvp.textContent = item.weekendMvp || buildLocalMvp(item);
  els.detailOwner.textContent = item.owner || "-";
  els.detailLanguage.textContent = item.language || "-";

  const catalogMap = getCatalogMap();
  const row = catalogMap[item.id];
  els.detailFirstSeen.textContent = formatTime(row?.firstSeenAt);
  els.detailLastSeen.textContent = formatTime(row?.lastSeenAt);

  els.saveBtn.textContent = state.saved.has(item.id) ? "Saved" : "Save";
  els.saveBtn.classList.toggle("btn-strong", state.saved.has(item.id));
  els.ignoreBtn.textContent = state.ignored.has(item.id) ? "Ignored" : "Ignore";
  els.ignoreBtn.classList.toggle("btn-strong", state.ignored.has(item.id));
  els.openBtn.textContent = item.repoUrl ? "Open Repo" : "Open Source";
  els.discussionBtn.disabled = !item.discussionUrl;

  renderTags(item);
  renderScores(item);
  renderList(els.useCasesList, item.useCases, localUseCases(item));
  renderList(els.risksList, item.risks, localRisks(item));
  els.validationSummary.textContent = item.validation?.summary || localValidationSummary(item);
  renderList(els.validationHighlights, item.validation?.highlights, localValidationHighlights(item));
  renderList(els.ignoreSignalsList, item.ignoreSignals, localIgnoreSignals(item));
}

async function analyzeCurrentItem() {
  if (!state.item) return;
  if (hasRichAnalysis(state.item, state.analyses)) {
    els.detailStatus.textContent = "Cached AI brief";
    return;
  }

  els.analyzeBtn.disabled = true;
  els.detailStatus.textContent = "Analyzing...";
  try {
    const results = await analyzeWithAvailableRuntime([state.item], getSettings());
    if (results.length) {
      state.analyses[state.item.id] = stampAnalysis(state.item, results[0]);
      setAnalyses(state.analyses);
      state.analysisFailures = clearAnalysisFailure(state.item, state.analysisFailures);
      setAnalysisFailures(state.analysisFailures);
      updateLatestSnapshotItem(state.item.id, results[0]);
      hydrateItem();
      render();
      els.detailStatus.textContent = "Cached AI brief";
    }
  } catch (error) {
    state.analysisFailures = recordAnalysisFailure(state.item, state.analysisFailures, error.message);
    setAnalysisFailures(state.analysisFailures);
    els.detailStatus.textContent = error.message || "AI error";
    render();
  } finally {
    els.analyzeBtn.disabled = false;
  }
}

function updateLatestSnapshotItem(itemId, analysis) {
  const latest = getLatestSnapshot();
  if (!latest?.items?.length) return;
  latest.items = mergeAnalysesIntoItems(latest.items, { [itemId]: analysis });
  setLatestSnapshot(latest);
  state.latestSnapshot = latest;
}

function renderTags(item) {
  els.detailTags.innerHTML = "";
  const tags = [];
  if (item.matchesWatchlist) tags.push("watchlist");
  tags.push(...(item.tags || []));
  tags.forEach((tag) => {
    const span = document.createElement("span");
    span.className = "tag";
    span.textContent = tag;
    els.detailTags.appendChild(span);
  });
}

function renderScores(item) {
  els.detailScores.innerHTML = `
    <span class="score-pill">Trend ${Math.round(item.scores?.trend || 0)}</span>
    <span class="score-pill">Learn ${Math.round(item.scores?.learn || 0)}</span>
    <span class="score-pill">Money ${Math.round(item.scores?.money || 0)}</span>
  `;
}

function renderList(host, values, emptyMessage) {
  host.innerHTML = "";
  const normalizedValues = Array.isArray(values) && values.length ? values : Array.isArray(emptyMessage) ? emptyMessage : [emptyMessage];
  if (!normalizedValues.length) {
    const li = document.createElement("li");
    li.textContent = "No details available.";
    host.appendChild(li);
    return;
  }

  normalizedValues.forEach((value) => {
    const li = document.createElement("li");
    li.textContent = value;
    host.appendChild(li);
  });
}

function toggleSetMembership(set, id, persist) {
  if (set.has(id)) {
    set.delete(id);
  } else {
    set.add(id);
  }
  persist(set);
}

function shouldAutoAnalyze(item) {
  const settings = getSettings();
  if (getAnalysisRuntime(settings) === "none") return false;
  if (hasRichAnalysis(item, state.analyses)) return false;
  if (getRecentAnalysisFailure(item, state.analysisFailures)) return false;
  return true;
}

function detailStatusLabel(item) {
  if (state.ignored.has(item.id)) return "Ignored";
  if (hasRichAnalysis(item, state.analyses)) return "Cached AI brief";
  const recentFailure = getRecentAnalysisFailure(item, state.analysisFailures);
  if (recentFailure) return `${recentFailure.message} · cooling down`;
  if (getAnalysisRuntime(getSettings()) === "none") return "AI not configured";
  return "Ready";
}

function buildLocalSummary(item) {
  const validation = item.validation?.summary ? ` ${item.validation.summary}` : "";
  return `${item.translatedTitle || item.name} is currently surfaced from ${sourceLabel(item.source)} with ${item.metricLabel?.toLowerCase() || "activity"} at ${item.metricValue}. This is the fast local brief while waiting for or reusing AI analysis.${validation}`;
}

function buildLocalOpportunity(item) {
  if (item.tags?.includes("saas") || item.tags?.includes("money")) {
    return "This looks commercially relevant because the source text and tags suggest workflow, API, automation, or monetizable utility demand.";
  }
  return "This looks more like a capability, tooling, or learning signal than a direct monetization play.";
}

function buildLocalAudience(item) {
  return `${item.owner || "Developers"} and people tracking ${item.tags?.join(", ") || "emerging developer tools"} are the most likely audience based on the current metadata.`;
}

function buildLocalWhyNow(item) {
  return `It is ranking now because ${sourceLabel(item.source)} activity and the current trend score (${Math.round(item.scores?.trend || 0)}) indicate fresh interest.`;
}

function buildLocalMvp(item) {
  return `Use the source summary and tags to prototype a smaller version first, then validate whether the strongest angle is tooling, automation, or content utility.`;
}

function localUseCases(item) {
  const values = [];
  if (item.tags?.includes("ai")) values.push("Translate the core idea into an AI-assisted workflow or agent utility.");
  if (item.tags?.includes("cli")) values.push("Turn the core capability into a terminal-first utility or developer automation step.");
  if (item.tags?.includes("saas")) values.push("Package the strongest workflow into a hosted product or internal tool.");
  values.push(`Review the original source to decide whether ${item.translatedTitle || item.name} is better as inspiration, integration, or direct adoption.`);
  return values.slice(0, 4);
}

function localRisks(item) {
  return [
    "Current detail view may still reflect source hype rather than long-term product value.",
    "Without AI analysis, these notes are metadata-driven and should be treated as provisional.",
    `Source-specific popularity from ${sourceLabel(item.source)} may not translate into lasting adoption.`
  ];
}

function localIgnoreSignals(item) {
  return [
    `If you ignore this repo, RepoRadar will downrank similar ${item.language || "mixed-language"} items over time.`,
    `Tags like ${(item.tags || []).join(", ") || "general devtools"} will influence future ranking preferences.`,
    "Exact ignored repos are hidden from future discovery views."
  ];
}

function localValidationSummary(item) {
  if (item.repoUrl && item.discussionUrl) {
    return "Repo link resolved from the discussion, but no comment sentiment summary is cached yet.";
  }
  if (item.discussionUrl) {
    return "Discussion thread is available, but a concrete repo link was not confirmed from source text or comments.";
  }
  return "No discussion evidence is available for this source.";
}

function localValidationHighlights(item) {
  const values = [];
  if (item.repoUrl) values.push(`Resolved project link: ${item.repoUrl}`);
  if (item.discussionUrl) values.push("You can open the original discussion thread for manual validation.");
  if (!values.length) values.push("No validation highlights available yet.");
  return values;
}
