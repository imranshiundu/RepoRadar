"use strict";

const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");

const ROOT = __dirname;
const discoverHandler = require("./api/discover");
const analyzeHandler = require("./api/analyze");

loadDotEnv();
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");

    if (url.pathname === "/api/discover") {
      await discoverHandler(req, res);
      return;
    }

    if (url.pathname === "/api/analyze") {
      await analyzeHandler(req, res);
      return;
    }

    serveStatic(url.pathname, res);
  } catch (error) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end(error.message || "Server error");
  }
});

const port = Number(process.env.PORT || 3000);
server.listen(port, () => {
  console.log(`RepoRadar running at http://localhost:${port}`);
});

function serveStatic(pathname, res) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.join(ROOT, safePath.replace(/^\/+/, ""));

  if (!filePath.startsWith(ROOT)) {
    res.statusCode = 403;
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.statusCode = 404;
      res.end("Not found");
      return;
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", MIME_TYPES[path.extname(filePath)] || "application/octet-stream");
    res.end(data);
  });
}

function loadDotEnv() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) {
    return;
  }

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separator = trimmed.indexOf("=");
    if (separator === -1) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}
