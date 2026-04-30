"use strict";

async function analyzeItems(items) {
  const apiKey = process.env.GROQ_API_KEY;
  const model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

  if (!apiKey || apiKey.startsWith("replace_")) {
    throw new Error("GROQ_API_KEY is not configured on the server");
  }

  const promptItems = items.map((item) => ({
    id: item.id,
    name: item.name,
    owner: item.owner,
    source: item.source,
    desc: item.desc,
    language: item.language,
    tags: item.tags,
    metricLabel: item.metricLabel,
    metricValue: item.metricValue
  }));

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: 0.35,
      messages: [
        {
          role: "system",
          content:
            "You analyze trending developer projects for a local-first dashboard. Return valid JSON only. The response must be an array of objects with keys: id, translatedTitle, translatedSummary, summary, opportunity, audience, weekendMvp, useCases, whyNow, risks, ignoreSignals, scores. Translate non-English text into concise English. Remove HTML noise. summary must be compact readable English. useCases, risks, and ignoreSignals must be short English string arrays. scores must have numeric trend, learn, money values from 1 to 100."
        },
        {
          role: "user",
          content: JSON.stringify(promptItems)
        }
      ]
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Groq request failed: ${response.status} ${body}`);
  }

  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content || "[]";
  const parsed = JSON.parse(extractJson(content));

  return parsed.map((item) => ({
    id: item.id,
    translatedTitle: cleanText(item.translatedTitle || ""),
    translatedSummary: cleanText(item.translatedSummary || item.summary || ""),
    summary: cleanText(item.summary || item.opportunity || "Summary unavailable."),
    opportunity: cleanText(item.opportunity || ""),
    audience: cleanText(item.audience || ""),
    weekendMvp: cleanText(item.weekendMvp || ""),
    useCases: normalizeStringArray(item.useCases),
    whyNow: cleanText(item.whyNow || ""),
    risks: normalizeStringArray(item.risks),
    ignoreSignals: normalizeStringArray(item.ignoreSignals),
    scores: normalizeScores(item.scores)
  }));
}

function extractJson(content) {
  const fenced = content.match(/```json\s*([\s\S]*?)```/i);
  if (fenced) {
    return fenced[1].trim();
  }

  const arrayMatch = content.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    return arrayMatch[0];
  }

  return content.trim();
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

function cleanText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => cleanText(entry))
    .filter(Boolean)
    .slice(0, 6);
}

module.exports = {
  analyzeItems
};
