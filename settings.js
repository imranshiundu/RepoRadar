import {
  applyEnvTextToSettings,
  clampNumber,
  envTextFromSettings,
  getCatalogRows,
  getSettings,
  saveSettings
} from "./runtime.js";

const els = {
  saveBtn: document.getElementById("saveBtn"),
  groqKey: document.getElementById("groqKey"),
  groqModel: document.getElementById("groqModel"),
  githubToken: document.getElementById("githubToken"),
  productHuntToken: document.getElementById("productHuntToken"),
  sourceGithub: document.getElementById("sourceGithub"),
  sourceHackerNews: document.getElementById("sourceHackerNews"),
  sourceReddit: document.getElementById("sourceReddit"),
  sourceDevto: document.getElementById("sourceDevto"),
  sourceNpm: document.getElementById("sourceNpm"),
  sourceProductHunt: document.getElementById("sourceProductHunt"),
  autoRefresh: document.getElementById("autoRefresh"),
  autoAnalyze: document.getElementById("autoAnalyze"),
  preferServer: document.getElementById("preferServer"),
  offlineMode: document.getElementById("offlineMode"),
  refreshMinutes: document.getElementById("refreshMinutes"),
  maxItems: document.getElementById("maxItems"),
  watchlistEnabled: document.getElementById("watchlistEnabled"),
  browserNotifications: document.getElementById("browserNotifications"),
  watchMinTrend: document.getElementById("watchMinTrend"),
  watchMinMoney: document.getElementById("watchMinMoney"),
  watchKeywords: document.getElementById("watchKeywords"),
  blockedKeywords: document.getElementById("blockedKeywords"),
  notificationHint: document.getElementById("notificationHint"),
  envImport: document.getElementById("envImport"),
  exportData: document.getElementById("exportData"),
  exportEnv: document.getElementById("exportEnv"),
  clearData: document.getElementById("clearData")
};

hydrate();
wireUi();

function hydrate() {
  const settings = getSettings();
  els.groqKey.value = settings.keys.groqApiKey || "";
  els.groqModel.value = settings.keys.groqModel || "";
  els.githubToken.value = settings.keys.githubToken || "";
  els.productHuntToken.value = settings.keys.productHuntToken || "";
  els.sourceGithub.checked = settings.sources.github;
  els.sourceHackerNews.checked = settings.sources.hn;
  els.sourceReddit.checked = settings.sources.reddit;
  els.sourceDevto.checked = settings.sources.devto;
  els.sourceNpm.checked = settings.sources.npm;
  els.sourceProductHunt.checked = settings.sources.producthunt;

  els.autoRefresh.checked = settings.automation.autoRefresh;
  els.autoAnalyze.checked = settings.automation.autoAnalyze;
  els.preferServer.checked = settings.automation.preferServer;
  els.offlineMode.checked = settings.automation.offlineMode;
  els.refreshMinutes.value = settings.automation.refreshMinutes;
  els.maxItems.value = settings.automation.maxItems;
  els.watchlistEnabled.checked = settings.watchlist.enabled;
  els.browserNotifications.checked = settings.watchlist.browserNotifications;
  els.watchMinTrend.value = settings.watchlist.minTrend;
  els.watchMinMoney.value = settings.watchlist.minMoney;
  els.watchKeywords.value = settings.watchlist.keywords || "";
  els.blockedKeywords.value = settings.watchlist.blockedKeywords || "";
  els.envImport.value = envTextFromSettings(settings);
  refreshNotificationHint();
}

function wireUi() {
  els.saveBtn.addEventListener("click", async () => {
    let settings = getSettings();

    settings.keys.groqApiKey = els.groqKey.value.trim();
    settings.keys.groqModel = els.groqModel.value.trim() || "llama-3.3-70b-versatile";
    settings.keys.githubToken = els.githubToken.value.trim();
    settings.keys.productHuntToken = els.productHuntToken.value.trim();

    settings.sources.github = els.sourceGithub.checked;
    settings.sources.hn = els.sourceHackerNews.checked;
    settings.sources.reddit = els.sourceReddit.checked;
    settings.sources.devto = els.sourceDevto.checked;
    settings.sources.npm = els.sourceNpm.checked;
    settings.sources.producthunt = els.sourceProductHunt.checked;

    settings.automation.autoRefresh = els.autoRefresh.checked;
    settings.automation.autoAnalyze = els.autoAnalyze.checked;
    settings.automation.preferServer = els.preferServer.checked;
    settings.automation.offlineMode = els.offlineMode.checked;
    settings.automation.refreshMinutes = clampNumber(els.refreshMinutes.value, 1, 120, 30);
    settings.automation.maxItems = clampNumber(els.maxItems.value, 6, 80, 30);

    settings.watchlist.enabled = els.watchlistEnabled.checked;
    settings.watchlist.browserNotifications = els.browserNotifications.checked;
    settings.watchlist.minTrend = clampNumber(els.watchMinTrend.value, 1, 100, 75);
    settings.watchlist.minMoney = clampNumber(els.watchMinMoney.value, 1, 100, 70);
    settings.watchlist.keywords = els.watchKeywords.value.trim();
    settings.watchlist.blockedKeywords = els.blockedKeywords.value.trim();

    if (els.envImport.value.trim()) {
      settings = applyEnvTextToSettings(settings, els.envImport.value.trim());
    }

    if (settings.watchlist.enabled && settings.watchlist.browserNotifications) {
      await ensureNotificationPermission();
    }

    saveSettings(settings);
    hydrate();
    refreshNotificationHint();
    alert("Settings saved successfully.");
  });

  els.browserNotifications.addEventListener("change", refreshNotificationHint);

  els.exportData.addEventListener("click", () => {
    const data = {
      settings: getSettings(),
      catalog: getCatalogRows()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reporadar-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  els.exportEnv.addEventListener("click", () => {
    const blob = new Blob([envTextFromSettings(getSettings())], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reporadar-${new Date().toISOString().split("T")[0]}.env`;
    a.click();
    URL.revokeObjectURL(url);
  });

  els.clearData.addEventListener("click", () => {
    if (confirm("Are you sure you want to reset the system? This will clear all local data.")) {
      localStorage.clear();
      window.location.reload();
    }
  });
}

async function ensureNotificationPermission() {
  if (!("Notification" in window)) {
    return;
  }

  if (Notification.permission === "default") {
    await Notification.requestPermission();
  }
}

function refreshNotificationHint() {
  if (!("Notification" in window)) {
    els.notificationHint.textContent = "This browser does not support the Notification API.";
    return;
  }

  const permission = Notification.permission;
  if (!els.browserNotifications.checked) {
    els.notificationHint.textContent = "Notifications are off. Enable them here if you want local watchlist alerts.";
    return;
  }

  if (permission === "granted") {
    els.notificationHint.textContent = "Notifications are ready. Alerts will fire while a RepoRadar tab is open.";
    return;
  }

  if (permission === "denied") {
    els.notificationHint.textContent = "Notifications are blocked in this browser. Re-enable them in site settings to receive alerts.";
    return;
  }

  els.notificationHint.textContent = "Notifications need permission. Saving these settings will prompt the browser.";
}
