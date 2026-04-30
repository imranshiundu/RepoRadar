# RepoRadar

RepoRadar now supports two runtime styles:

1. Static browser mode
   Users open the site, paste keys into the dedicated Settings page, and the app stores those values in localStorage as a local runtime vault.

2. Optional server mode
   Local Node or Vercel can still use `.env` and the `/api/*` routes as a fallback or proxy.

## Pages

- `/index.html` dashboard
- `/settings.html` local env vault, source toggles, automation settings, env import/export
- `/catalog.html` database-style local catalog of all fetched rows

## Local run

1. Copy `.env.example` to `.env` if you want server mode
2. Run `npm start`
3. Open `http://localhost:3000`

You can also serve the root folder as a plain static site. In that case, the dashboard falls back to browser-side API requests and the Settings page stores keys locally.

## Environment variables

- `GROQ_API_KEY`
- `GROQ_MODEL`
- `GITHUB_TOKEN`
- `PRODUCT_HUNT_BEARER_TOKEN`
