import {
  buildPreferenceProfile,
  formatCount,
  getCatalogMap,
  getIgnoredSet,
  getSavedSet,
  preferenceScoreForItem,
  relativeTime,
  sourceLabel
} from "./runtime.js";

export async function discoverData(settings) {
  const activeSources = Object.entries(settings.sources)
    .filter(([, enabled]) => enabled)
    .map(([source]) => source);
  const serverSupported = ["github", "hn", "reddit", "producthunt"];
  const serverSources = activeSources.filter((source) => serverSupported.includes(source));
  const browserSources = activeSources.filter((source) => !serverSupported.includes(source));

  if (!activeSources.length) {
    return {
      items: [],
      sourceHealth: {},
      runtimeMode: "No active sources"
    };
  }

  if (settings.automation.preferServer) {
    try {
      const payload = serverSources.length
        ? await fetchServerDiscover(serverSources)
        : { items: [], sourceHealth: {} };
      const browserPayload = browserSources.length
        ? await fetchBrowserDiscover(browserSources, settings)
        : { items: [], sourceHealth: {} };

      return {
        items: rankAndFilterItems(
          [...normalizeServerItems(payload.items || []), ...(browserPayload.items || [])],
          settings
        ),
        sourceHealth: {
          ...(payload.sourceHealth || {}),
          ...(browserPayload.sourceHealth || {})
        },
        runtimeMode: browserSources.length ? "Hybrid server + browser" : "Server API"
      };
    } catch {
      // Fall through to browser mode.
    }
  }

  const { items, sourceHealth } = await fetchBrowserDiscover(activeSources, settings);
  return {
    items: rankAndFilterItems(items, settings),
    sourceHealth,
    runtimeMode: "Browser direct"
  };
}

export async function analyzeWithAvailableRuntime(items, settings) {
  if (settings.keys.groqApiKey) {
    return analyzeWithGroqBrowser(items, settings);
  }

  if (settings.automation.preferServer) {
    return analyzeWithServer(items);
  }

  throw new Error("Add a Groq key in Settings or run the optional server API");
}

async function fetchServerDiscover(activeSources) {
  const params = new URLSearchParams({ sources: activeSources.join(",") });
  const response = await fetch(`/api/discover?${params.toString()}`, { cache: "no-store" });
  const payload = await safeJsonResponse(response);
  if (!response.ok) throw new Error(payload.error || "Server discover failed");
  return payload;
}

async function analyzeWithServer(items) {
  const response = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items })
  });
  const payload = await safeJsonResponse(response);
  if (!response.ok) throw new Error(payload.error || "Server analysis failed");
  return payload.items || [];
}

async function analyzeWithGroqBrowser(items, settings) {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.keys.groqApiKey}`
    },
    body: JSON.stringify({
      model: settings.keys.groqModel || "llama-3.3-70b-versatile",
      temperature: 0.35,
      messages: [
        {
          role: "system",
          content: "Return valid JSON only. Produce an array of objects with keys id, translatedTitle, translatedSummary, summary, opportunity, audience, weekendMvp, useCases, whyNow, risks, ignoreSignals, scores. Translate non-English titles/descriptions into concise English. Remove HTML noise. summary must be compact and readable English. useCases and risks and ignoreSignals must be arrays of short English strings. scores must contain numeric trend, learn, money values from 1 to 100."
        },
        {
          role: "user",
          content: JSON.stringify(items.map((item) => ({
            id: item.id,
            name: item.name,
            owner: item.owner,
            source: item.source,
            desc: item.desc,
            language: item.language,
            tags: item.tags,
            metricLabel: item.metricLabel,
            metricValue: item.metricValue
          })))
        }
      ]
    })
  });

  const payload = await safeJsonResponse(response);
  if (!response.ok) {
    throw new Error(payload.error?.message || payload.error || "Groq browser request failed");
  }

  const rawContent = payload.choices?.[0]?.message?.content || "[]";
  const parsed = JSON.parse(extractJson(rawContent));
  return parsed.map((item) => ({
    id: item.id,
    translatedTitle: cleanText(item.translatedTitle || ""),
    translatedSummary: cleanText(item.translatedSummary || item.summary || ""),
    summary: item.summary || item.opportunity || "Summary unavailable.",
    opportunity: item.opportunity || "",
    audience: item.audience || "",
    weekendMvp: item.weekendMvp || "",
    useCases: normalizeStringArray(item.useCases),
    whyNow: cleanText(item.whyNow || ""),
    risks: normalizeStringArray(item.risks),
    ignoreSignals: normalizeStringArray(item.ignoreSignals),
    scores: normalizeScores(item.scores)
  }));
}

async function fetchBrowserDiscover(activeSources, settings) {
  const sourceFetchers = {
    github: () => fetchGitHubRepos(settings),
    hn: fetchHnStories,
    reddit: fetchRedditPosts,
    devto: fetchDevtoArticles,
    npm: fetchNpmPackages,
    producthunt: () => fetchProductHuntPosts(settings)
  };

  const sourceHealth = {};
  const settled = await Promise.allSettled(
    activeSources.map(async (source) => ({
      source,
      records: await sourceFetchers[source]()
    }))
  );

  const items = [];

  for (const result of settled) {
    if (result.status === "fulfilled") {
      sourceHealth[result.value.source] = { ok: true, count: result.value.records.length };
      items.push(...result.value.records);
    } else {
      const source = activeSources[settled.indexOf(result)];
      sourceHealth[source] = { ok: false, error: result.reason?.message || "Fetch failed" };
    }
  }

  return {
    items,
    sourceHealth
  };
}

async function fetchGitHubRepos(settings) {
  const since = new Date(Date.now() - 14 * 24 * 3600000).toISOString().slice(0, 10);
  const headers = { Accept: "application/vnd.github+json" };
  if (settings.keys.githubToken) {
    headers.Authorization = `Bearer ${settings.keys.githubToken}`;
  }

  const response = await fetch(
    `https://api.github.com/search/repositories?q=stars:%3E80+created:%3E%3D${since}&sort=stars&order=desc&per_page=10`,
    { headers }
  );
  const payload = await safeJsonResponse(response);
  if (!response.ok) throw new Error(payload.message || "GitHub fetch failed");
  return (payload.items || []).map(normalizeGitHubRepo);
}

async function fetchHnStories() {
  const response = await fetch("https://hn.algolia.com/api/v1/search_by_date?query=Show%20HN&tags=story&hitsPerPage=12");
  const payload = await safeJsonResponse(response);
  return (payload.hits || [])
    .filter((hit) => Number(hit.points || 0) > 3)
    .slice(0, 6)
    .map(normalizeHnStory);
}

async function fetchRedditPosts() {
  const subreddits = ["programming", "SideProject", "MachineLearning"];
  const settled = await Promise.allSettled(
    subreddits.map(async (subreddit) => {
      const response = await fetch(`https://www.reddit.com/r/${subreddit}/hot.json?raw_json=1&limit=3`);
      const payload = await safeJsonResponse(response);
      return (payload.data?.children || []).map((post) => normalizeRedditPost(post, subreddit));
    })
  );

  return settled
    .filter((entry) => entry.status === "fulfilled")
    .flatMap((entry) => entry.value)
    .slice(0, 8);
}

async function fetchDevtoArticles() {
  const response = await fetch("https://dev.to/api/articles?per_page=8&top=7");
  const payload = await safeJsonResponse(response);
  return (payload || []).map(normalizeDevtoArticle);
}

async function fetchNpmPackages() {
  const response = await fetch("https://registry.npmjs.org/-/v1/search?text=keywords:ai%20OR%20keywords:cli%20OR%20keywords:devtools&size=8");
  const payload = await safeJsonResponse(response);
  return (payload.objects || []).map(normalizeNpmPackage);
}

async function fetchProductHuntPosts(settings) {
  if (!settings.keys.productHuntToken) {
    return [];
  }

  const response = await fetch("https://api.producthunt.com/v2/api/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.keys.productHuntToken}`
    },
    body: JSON.stringify({
      query: `
        query RepoRadarPosts {
          posts(first: 6) {
            edges {
              node {
                id
                name
                tagline
                url
                website
                votesCount
              }
            }
          }
        }
      `
    })
  });

  const payload = await safeJsonResponse(response);
  if (!response.ok) throw new Error(payload.error || "Product Hunt request failed");
  return (payload.data?.posts?.edges || []).map((entry) => normalizeProductHuntPost(entry.node));
}

async function safeJsonResponse(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(text.slice(0, 140) || "Unexpected non-JSON response");
  }
}

function extractJson(content) {
  const fenced = content.match(/```json\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  const arrayMatch = content.match(/\[[\s\S]*\]/);
  if (arrayMatch) return arrayMatch[0];
  return content.trim();
}

function normalizeServerItems(items) {
  return items.map((item) => ({
    ...item,
    name: cleanText(item.name || ""),
    desc: compactDescription(item.desc || ""),
    rawDesc: cleanText(item.rawDesc || item.desc || ""),
    sourceName: sourceLabel(item.source),
    aiSummary: item.aiSummary || ""
  }));
}

function buildTags(text, language) {
  const tags = new Set();
  const value = `${text} ${language || ""}`.toLowerCase();
  if (/\b(ai|llm|agent|gpt|prompt|model|rag)\b/.test(value) && !/\b(not[- ]ai|non[- ]ai)\b/.test(value)) tags.add("ai");
  if (/\b(saas|auth|billing|workflow|crm|analytics|backend|api|automation)\b/.test(value)) tags.add("saas");
  if (/\b(cli|terminal|shell|command)\b/.test(value)) tags.add("cli");
  if (/\b(monetize|billing|pricing|revenue|subscription|marketplace|paid)\b/.test(value)) tags.add("money");
  if (!tags.size && language) tags.add(language.toLowerCase());
  return [...tags];
}

function scoreItem(text, volume, sourceWeight) {
  const lower = text.toLowerCase();
  const base = Math.min(85, Math.max(20, Math.round(Math.log10((volume || 1) + 10) * 15 + sourceWeight)));
  return {
    trend: Math.min(100, base + (/\b(show hn|launch|new|release|beta)\b/.test(lower) ? 10 : 0)),
    learn: Math.min(100, base - 5 + (/\b(rust|go|python|typescript|compiler|database|terminal)\b/.test(lower) ? 12 : 0)),
    money: Math.min(100, base - 6 + (/\b(api|workflow|auth|billing|saas|automation|analytics)\b/.test(lower) ? 16 : 0))
  };
}

function normalizeScores(scores = {}) {
  return {
    trend: clampScore(scores.trend),
    learn: clampScore(scores.learn),
    money: clampScore(scores.money)
  };
}

function clampScore(value) {
  const number = Number(value);
  if (Number.isNaN(number)) return 50;
  return Math.max(1, Math.min(100, Math.round(number)));
}

function normalizeGitHubRepo(repo) {
  const text = cleanText(`${repo.name} ${repo.description || ""}`);
  return {
    id: `github:${repo.full_name}`,
    name: cleanText(repo.name),
    owner: repo.owner?.login || "GitHub",
    desc: compactDescription(repo.description || "No description provided."),
    rawDesc: cleanText(repo.description || "No description provided."),
    source: "github",
    sourceName: "GitHub",
    url: repo.html_url,
    language: repo.language || "Mixed",
    tags: buildTags(text, repo.language),
    metricLabel: "Stars",
    metricValue: formatCount(repo.stargazers_count || 0),
    relativeTime: relativeTime(repo.pushed_at),
    scores: scoreItem(text, repo.stargazers_count || 0, 32),
    aiSummary: ""
  };
}

function normalizeHnStory(hit) {
  const text = cleanText(`${hit.title || ""} ${hit.story_text || ""}`);
  return {
    id: `hn:${hit.objectID}`,
    name: cleanText(hit.title || "Untitled HN post"),
    owner: hit.author || "Hacker News",
    desc: compactDescription(hit.story_text || "Trending Hacker News discussion."),
    rawDesc: cleanText(hit.story_text || "Trending Hacker News discussion."),
    source: "hn",
    sourceName: "Hacker News",
    url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
    language: inferLanguage(text),
    tags: buildTags(text, inferLanguage(text)),
    metricLabel: "Points",
    metricValue: formatCount(hit.points || 0),
    relativeTime: relativeTime(hit.created_at),
    scores: scoreItem(text, hit.points || 0, 25),
    aiSummary: ""
  };
}

function normalizeRedditPost(post, subreddit) {
  const data = post.data || {};
  const text = cleanText(`${data.title || ""} ${data.selftext || ""}`);
  return {
    id: `reddit:${data.subreddit || subreddit}:${data.id}`,
    name: cleanText(data.title || "Untitled Reddit post"),
    owner: `r/${data.subreddit || subreddit}`,
    desc: compactDescription(data.selftext || "Trending Reddit thread."),
    rawDesc: cleanText(data.selftext || "Trending Reddit thread."),
    source: "reddit",
    sourceName: "Reddit",
    url: data.url_overridden_by_dest || `https://www.reddit.com${data.permalink}`,
    language: inferLanguage(text),
    tags: buildTags(text, inferLanguage(text)),
    metricLabel: "Upvotes",
    metricValue: formatCount(data.ups || 0),
    relativeTime: relativeTime((data.created_utc || 0) * 1000),
    scores: scoreItem(text, data.ups || 0, 20),
    aiSummary: ""
  };
}

function normalizeDevtoArticle(article) {
  const text = cleanText(`${article.title || ""} ${article.description || ""}`);
  return {
    id: `devto:${article.id}`,
    name: cleanText(article.title || "Untitled article"),
    owner: article.user?.name || "Dev.to",
    desc: compactDescription(article.description || "Developer article from Dev.to."),
    rawDesc: cleanText(article.description || "Developer article from Dev.to."),
    source: "devto",
    sourceName: "Dev.to",
    url: article.url,
    language: inferLanguage(text),
    tags: buildTags(`${text} ${(article.tag_list || []).join(" ")}`, inferLanguage(text)),
    metricLabel: "Reactions",
    metricValue: formatCount(article.positive_reactions_count || 0),
    relativeTime: relativeTime(article.published_at),
    scores: scoreItem(text, article.positive_reactions_count || 0, 18),
    aiSummary: ""
  };
}

function normalizeNpmPackage(entry) {
  const pkg = entry.package || {};
  const text = cleanText(`${pkg.name || ""} ${pkg.description || ""} ${(pkg.keywords || []).join(" ")}`);
  return {
    id: `npm:${pkg.name}`,
    name: cleanText(pkg.name || "Untitled package"),
    owner: pkg.publisher?.username || "npm",
    desc: compactDescription(pkg.description || "npm package."),
    rawDesc: cleanText(pkg.description || "npm package."),
    source: "npm",
    sourceName: "npm",
    url: pkg.links?.npm || `https://www.npmjs.com/package/${pkg.name}`,
    language: inferLanguage(text),
    tags: buildTags(text, inferLanguage(text)),
    metricLabel: "Quality",
    metricValue: `${Math.round((entry.score?.final || 0) * 100)}%`,
    relativeTime: relativeTime(pkg.date),
    scores: scoreItem(text, Math.round((entry.score?.final || 0) * 1000), 16),
    aiSummary: ""
  };
}

function normalizeProductHuntPost(node) {
  const text = cleanText(`${node.name || ""} ${node.tagline || ""}`);
  return {
    id: `producthunt:${node.id}`,
    name: cleanText(node.name || "Untitled Product Hunt post"),
    owner: "Product Hunt",
    desc: compactDescription(node.tagline || "Product Hunt launch."),
    rawDesc: cleanText(node.tagline || "Product Hunt launch."),
    source: "producthunt",
    sourceName: "Product Hunt",
    url: node.url || node.website || "https://www.producthunt.com",
    language: inferLanguage(text),
    tags: buildTags(text, inferLanguage(text)),
    metricLabel: "Votes",
    metricValue: formatCount(node.votesCount || 0),
    relativeTime: "today",
    scores: scoreItem(text, node.votesCount || 0, 22),
    aiSummary: ""
  };
}

function inferLanguage(text) {
  const value = cleanText(text).toLowerCase();
  if (/[\u4e00-\u9fff]/.test(text)) return "Chinese";
  if (/[\u3040-\u30ff]/.test(text)) return "Japanese";
  if (/[\uac00-\ud7af]/.test(text)) return "Korean";
  if (value.includes("rust")) return "Rust";
  if (value.includes("typescript")) return "TypeScript";
  if (value.includes("python")) return "Python";
  if (value.includes("go")) return "Go";
  if (value.includes("zig")) return "Zig";
  if (value.includes("javascript")) return "JavaScript";
  return "Mixed";
}

function rankAndFilterItems(items, settings) {
  const catalogMap = getCatalogMap();
  const saved = getSavedSet();
  const ignored = getIgnoredSet();
  const profile = buildPreferenceProfile(catalogMap, saved, ignored);

  return items
    .map((item) => {
      const preferenceScore = preferenceScoreForItem(item, profile);
      const isNew = !catalogMap[item.id];
      return {
        ...item,
        preferenceScore,
        isNew,
        rawDesc: cleanText(item.rawDesc || item.desc || ""),
        desc: compactDescription(item.desc || item.rawDesc || "")
      };
    })
    .filter((item) => !ignored.has(item.id))
    .filter((item) => item.preferenceScore > -12)
    .sort((left, right) => rankValue(right) - rankValue(left))
    .slice(0, settings.automation.maxItems);
}

function rankValue(item) {
  return (
    (item.scores?.trend || 0) * 1.2 +
    (item.scores?.money || 0) * 0.55 +
    (item.preferenceScore || 0) +
    (item.isNew ? 9 : 0)
  );
}

function compactDescription(value) {
  const cleaned = cleanText(value);
  return truncateAtWord(cleaned || "No description provided.", 180);
}

function cleanText(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/&[#a-z0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateAtWord(value, limit) {
  const trimmed = String(value || "").trim();
  if (trimmed.length <= limit) return trimmed;
  const slice = trimmed.slice(0, limit);
  const lastSpace = slice.lastIndexOf(" ");
  return `${slice.slice(0, lastSpace > 80 ? lastSpace : limit).trim()}...`;
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => cleanText(entry))
    .filter(Boolean)
    .slice(0, 6);
}
