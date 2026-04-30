"use strict";

const { getDiscoverPayload } = require("../lib/discover");
const { sendJson } = require("../lib/http");

module.exports = async function handler(req, res) {
  try {
    const url = new URL(req.url, "http://localhost");
    const sourceNames = (url.searchParams.get("sources") || "github,hn,reddit")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    const payload = await getDiscoverPayload(sourceNames);
    sendJson(res, 200, payload);
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Unable to load discovery data" });
  }
};
