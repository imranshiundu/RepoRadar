"use strict";

const { analyzeItems } = require("../lib/analyze");
const { readJsonBody, sendJson } = require("../lib/http");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const items = Array.isArray(body.items) ? body.items : [];

    if (!items.length) {
      sendJson(res, 400, { error: "No items supplied for analysis" });
      return;
    }

    const payload = await analyzeItems(items);
    sendJson(res, 200, { items: payload });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Unable to analyze items" });
  }
};
