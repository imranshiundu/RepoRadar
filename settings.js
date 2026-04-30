import {
  applyEnvTextToSettings,
  clampNumber,
  envTextFromSettings,
  getCatalogRows,
  getSettings,
  saveSettings
} from "./runtime.js";

const els = {
  settingsStatus: document.getElementById("settingsStatus"),
  groqApiKey: document.getElementById("groqApiKey"),
  groqModel: document.getElementById("groqModel"),
  githubToken: document.getElementById("githubToken"),
  productHuntToken: document.getElementById("productHuntToken"),
  sourceGithub: document.getElementById("sourceGithub"),
  sourceHn: document.getElementById("sourceHn"),
  sourceReddit: document.getElementById("sourceReddit"),
  sourceDevto: document.getElementById("sourceDevto"),
  sourceNpm: document.getElementById("sourceNpm"),
  sourceProductHunt: document.getElementById("sourceProductHunt"),
  autoRefresh: document.getElementById("autoRefresh"),
  autoAnalyze: document.getElementById("autoAnalyze"),
  offlineMode: document.getElementById("offlineMode"),
  preferServer: document.getElementById("preferServer"),
  refreshMinutes: document.getElementById("refreshMinutes"),
  maxItems: document.getElementById("maxItems"),
  envTextarea: document.getElementById("envTextarea"),
  saveVaultBtn: document.getElementById("saveVaultBtn"),
  clearVaultBtn: document.getElementById("clearVaultBtn"),
  saveAutomationBtn: document.getElementById("saveAutomationBtn"),
  importEnvBtn: document.getElementById("importEnvBtn"),
  previewEnvBtn: document.getElementById("previewEnvBtn"),
  downloadEnvBtn: document.getElementById("downloadEnvBtn"),
  settingsDiagnostics: document.getElementById("settingsDiagnostics")
};

hydrate();
wireUi();
renderDiagnostics();

function hydrate() {
  const settings = getSettings();
  els.groqApiKey.value = settings.keys.groqApiKey;
  els.groqModel.value = settings.keys.groqModel;
  els.githubToken.value = settings.keys.githubToken;
  els.productHuntToken.value = settings.keys.productHuntToken;

  els.sourceGithub.checked = settings.sources.github;
  els.sourceHn.checked = settings.sources.hn;
  els.sourceReddit.checked = settings.sources.reddit;
  els.sourceDevto.checked = settings.sources.devto;
  els.sourceNpm.checked = settings.sources.npm;
  els.sourceProductHunt.checked = settings.sources.producthunt;

  els.autoRefresh.checked = settings.automation.autoRefresh;
  els.autoAnalyze.checked = settings.automation.autoAnalyze;
  els.offlineMode.checked = settings.automation.offlineMode;
  els.preferServer.checked = settings.automation.preferServer;
  els.refreshMinutes.value = settings.automation.refreshMinutes;
  els.maxItems.value = settings.automation.maxItems;
  els.envTextarea.value = envTextFromSettings(settings);
}

function wireUi() {
  els.saveVaultBtn.addEventListener("click", () => {
    const settings = getSettings();
    settings.keys.groqApiKey = els.groqApiKey.value.trim();
    settings.keys.groqModel = els.groqModel.value.trim() || "llama-3.3-70b-versatile";
    settings.keys.githubToken = els.githubToken.value.trim();
    settings.keys.productHuntToken = els.productHuntToken.value.trim();
    saveSettings(settings);
    els.envTextarea.value = envTextFromSettings(settings);
    setStatus("Local vault saved in this browser");
    renderDiagnostics();
  });

  els.clearVaultBtn.addEventListener("click", () => {
    const settings = getSettings();
    settings.keys.groqApiKey = "";
    settings.keys.githubToken = "";
    settings.keys.productHuntToken = "";
    saveSettings(settings);
    hydrate();
    setStatus("Secret fields cleared");
    renderDiagnostics();
  });

  els.saveAutomationBtn.addEventListener("click", () => {
    const settings = getSettings();
    settings.sources.github = els.sourceGithub.checked;
    settings.sources.hn = els.sourceHn.checked;
    settings.sources.reddit = els.sourceReddit.checked;
    settings.sources.devto = els.sourceDevto.checked;
    settings.sources.npm = els.sourceNpm.checked;
    settings.sources.producthunt = els.sourceProductHunt.checked;

    settings.automation.autoRefresh = els.autoRefresh.checked;
    settings.automation.autoAnalyze = els.autoAnalyze.checked;
    settings.automation.offlineMode = els.offlineMode.checked;
    settings.automation.preferServer = els.preferServer.checked;
    settings.automation.refreshMinutes = clampNumber(els.refreshMinutes.value, 1, 120, 15);
    settings.automation.maxItems = clampNumber(els.maxItems.value, 6, 80, 30);

    saveSettings(settings);
    els.envTextarea.value = envTextFromSettings(settings);
    setStatus("Source and automation settings saved");
    renderDiagnostics();
  });

  els.importEnvBtn.addEventListener("click", () => {
    const settings = applyEnvTextToSettings(getSettings(), els.envTextarea.value);
    saveSettings(settings);
    hydrate();
    setStatus("Env text imported into the local vault");
    renderDiagnostics();
  });

  els.previewEnvBtn.addEventListener("click", () => {
    els.envTextarea.value = envTextFromSettings(getSettings());
    setStatus("Current env preview refreshed");
  });

  els.downloadEnvBtn.addEventListener("click", () => {
    const blob = new Blob([envTextFromSettings(getSettings())], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = ".env.local";
    link.click();
    URL.revokeObjectURL(url);
    setStatus("Env snapshot downloaded");
  });
}

function renderDiagnostics() {
  const settings = getSettings();
  const rows = [
    ["Groq key", settings.keys.groqApiKey ? "stored locally" : "missing"],
    ["GitHub token", settings.keys.githubToken ? "stored locally" : "optional"],
    ["Product Hunt", settings.keys.productHuntToken ? "stored locally" : "optional"],
    ["Server preference", settings.automation.preferServer ? "browser then server fallback" : "browser direct only"],
    ["Refresh cycle", settings.automation.autoRefresh ? `${settings.automation.refreshMinutes} minutes` : "manual"],
    ["Catalog rows", String(getCatalogRows().length)]
  ];

  els.settingsDiagnostics.innerHTML = rows
    .map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`)
    .join("");
}

function setStatus(message) {
  els.settingsStatus.textContent = message;
}
