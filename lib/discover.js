"use strict";

const DAY_MS = 24 * 60 * 60 * 1000;
const REDDIT_SUBREDDITS = ["programming", "SideProject", "MachineLearning"];

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeout || 12000);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...options.headers
      }
    });

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function buildTags(text, language) {
  const tags = new Set();
  const value = `${text} ${language || ""}`.toLowerCase();

  if (/\b(ai|llm|agent|gpt|model|rag|prompt)\b/.test(value) && !/\b(not[- ]ai|non[- ]ai)\b/.test(value)) tags.add("ai");
  if (/\b(saas|billing|auth|analytics|crm|workflow|backend|api)\b/.test(value)) tags.add("saas");
  if (/\b(cli|terminal|shell|command)\b/.test(value)) tags.add("cli");
  if (/\b(pay|billing|revenue|pricing|marketplace|subscription|stripe)\b/.test(value)) tags.add("money");
  if (!tags.size && language) tags.add(language.toLowerCase());

  return [...tags];
}

function scoreItem(text, stars, sourceWeight) {
  const lower = text.toLowerCase();
  const aiBoost = /\b(ai|llm|agent|gpt|model|rag)\b/.test(lower) ? 12 : 0;
  const moneyBoost = /\b(api|workflow|backend|analytics|billing|saas|automation)\b/.test(lower) ? 15 : 0;
  const learnBoost = /\b(rust|go|python|typescript|zig|compiler|terminal|database)\b/.test(lower) ? 10 : 0;
  const base = Math.min(84, Math.max(18, Math.round(Math.log10((stars || 1) + 10) * 15 + sourceWeight)));

  return {
    trend: Math.min(100, base + aiBoost / 2),
    learn: Math.min(100, base - 4 + learnBoost),
    money: Math.min(100, base - 6 + moneyBoost)
  };
}

function relativeTime(iso) {
  if (!iso) return "recent";
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.max(1, Math.round(diff / (60 * 60 * 1000)));
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function normalizeGitHubRepo(repo) {
  const text = `${repo.name} ${repo.description || ""}`;
  return {
    id: `github:${repo.full_name}`,
    name: repo.name,
    owner: repo.owner?.login || repo.full_name?.split("/")[0] || "GitHub",
    desc: repo.description || "No description provided.",
    source: "github",
    url: repo.html_url,
    language: repo.language || "Mixed",
    tags: buildTags(text, repo.language),
    metricLabel: "Stars",
    metricValue: formatCount(repo.stargazers_count || 0),
    relativeTime: relativeTime(repo.pushed_at),
    scores: scoreItem(text, repo.stargazers_count || 0, 32),
    aiSummary: "",
    raw: {
      owner: repo.owner?.login || null,
      repo: repo.name || null
    }
  };
}

function normalizeHnStory(hit) {
  const text = `${hit.title || ""} ${hit.story_text || ""}`;
  return {
    id: `hn:${hit.objectID}`,
    name: hit.title || "Untitled HN post",
    owner: hit.author || "Hacker News",
    desc: hit.story_text || "Trending Hacker News discussion.",
    source: "hn",
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
  const text = `${data.title || ""} ${data.selftext || ""}`;
  return {
    id: `reddit:${data.subreddit || subreddit}:${data.id}`,
    name: data.title || "Untitled Reddit post",
    owner: `r/${data.subreddit || subreddit}`,
    desc: data.selftext?.slice(0, 220) || "Trending Reddit discussion.",
    source: "reddit",
    url: data.url_overridden_by_dest || `https://www.reddit.com${data.permalink}`,
    language: inferLanguage(text),
    tags: buildTags(text, inferLanguage(text)),
    metricLabel: "Upvotes",
    metricValue: formatCount(data.ups || 0),
    relativeTime: relativeTime(new Date((data.created_utc || 0) * 1000).toISOString()),
    scores: scoreItem(text, data.ups || 0, 21),
    aiSummary: ""
  };
}

function normalizeProductHuntPost(node) {
  const text = `${node.name || ""} ${node.tagline || ""}`;
  return {
    id: `producthunt:${node.id}`,
    name: node.name || "Untitled Product Hunt post",
    owner: "Product Hunt",
    desc: node.tagline || "Trending Product Hunt launch.",
    source: "producthunt",
    url: node.url || node.website || "https://www.producthunt.com",
    language: inferLanguage(text),
    tags: buildTags(text, inferLanguage(text)),
    metricLabel: "Votes",
    metricValue: formatCount(node.votesCount || 0),
    relativeTime: "today",
    scores: scoreItem(text, node.votesCount || 0, 23),
    aiSummary: ""
  };
}

function inferLanguage(text) {
  const value = text.toLowerCase();
  if (value.includes("rust")) return "Rust";
  if (value.includes("typescript")) return "TypeScript";
  if (value.includes("python")) return "Python";
  if (value.includes("go")) return "Go";
  if (value.includes("zig")) return "Zig";
  return "Mixed";
}

function formatCount(value) {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}m`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}

async function getGitHubRepos() {
  const since = new Date(Date.now() - 14 * DAY_MS).toISOString().slice(0, 10);
  const headers = {};

  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  headers["User-Agent"] = "RepoRadar";

  const payload = await fetchJson(
    `https://api.github.com/search/repositories?q=stars:%3E80+created:%3E%3D${since}&sort=stars&order=desc&per_page=8`,
    { headers }
  );

  return payload.items.map(normalizeGitHubRepo);
}

async function getHnStories() {
  const payload = await fetchJson("https://hn.algolia.com/api/v1/search_by_date?query=Show%20HN&tags=story&hitsPerPage=20");
  return payload.hits
    .filter((hit) => Number(hit.points || 0) > 3)
    .slice(0, 6)
    .map(normalizeHnStory);
}

async function getRedditPosts() {
  const bundles = await Promise.all(
    REDDIT_SUBREDDITS.map(async (subreddit) => {
      const payload = await fetchJson(`https://www.reddit.com/r/${subreddit}/hot.json?limit=3`);
      return payload.data.children.map((post) => normalizeRedditPost(post, subreddit));
    })
  );

  return bundles.flat().slice(0, 8);
}

async function getProductHuntPosts() {
  if (!process.env.PRODUCT_HUNT_BEARER_TOKEN) {
    return [];
  }

  const payload = await fetchJson("https://api.producthunt.com/v2/api/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.PRODUCT_HUNT_BEARER_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      query: `
        query HomePosts {
          posts(first: 6) {
            edges {
              node {
                id
                name
                tagline
                votesCount
                url
                website
              }
            }
          }
        }
      `
    })
  });

  return (payload.data?.posts?.edges || []).map((edge) => normalizeProductHuntPost(edge.node));
}

async function getDiscoverPayload(sourceNames) {
  const available = {
    github: getGitHubRepos,
    hn: getHnStories,
    reddit: getRedditPosts,
    producthunt: getProductHuntPosts
  };

  const activeSources = (sourceNames || ["github", "hn", "reddit"]).filter((name) => available[name]);
  const settled = await Promise.allSettled(activeSources.map(async (source) => ({
    source,
    records: await available[source]()
  })));

  const items = [];
  const sourceHealth = {};

  for (const result of settled) {
    if (result.status === "fulfilled") {
      const { source, records } = result.value;
      sourceHealth[source] = { ok: true, count: records.length };
      items.push(...records);
    } else {
      const source = activeSources[settled.indexOf(result)];
      sourceHealth[source] = { ok: false, error: result.reason?.message || "Unknown failure" };
    }
  }

  return {
    aiConfigured: Boolean(process.env.GROQ_API_KEY && !process.env.GROQ_API_KEY.startsWith("replace_")),
    sourceHealth,
    items: items
      .sort((left, right) => (right.scores?.trend || 0) - (left.scores?.trend || 0))
      .slice(0, 24)
  };
}

module.exports = {
  getDiscoverPayload
};
