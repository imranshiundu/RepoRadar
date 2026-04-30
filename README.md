# RepoRadar

RepoRadar is a compact local-first discovery dashboard for finding promising repositories, developer tools, launches, and discussions without drowning in noisy feed items.

It now does more than fetch trending repos:

- Cleans raw source text before rendering cards
- Uses AI to translate non-English repository/news content into concise English
- Resolves repository links from discussion sources like Reddit when possible
- Scans Reddit thread comments for lightweight praise/complaint validation signals
- Generates deeper repository briefs with use cases, audience, opportunity, weekend MVP, timing notes, risks, and ignore signals
- Learns from `Save` and `Ignore` actions to rank future discoveries toward your taste
- Filters out exact ignored repos and downranks repo types that match patterns you repeatedly reject
- Preserves a local catalog and sync history in browser storage

## Runtime modes

1. Static browser mode
   Open the site directly and store settings locally in `localStorage`.

2. Optional server mode
   Run the Node server so `/api/discover` and `/api/analyze` can proxy discovery or AI analysis.

## Pages

- `/index.html`
  Compact dashboard with source health, AI picks, charts, live feed, and watchlist state
- `/recents.html`
  Recent discovery stream with equal-height cards, AI summaries, ignore controls, and detail-page navigation
- `/repositories.html`
  Repository library with saved/watchlist views, sorting, and ignore-aware ranking
- `/repo.html`
  Full AI repository brief page with translation, use cases, opportunity, risks, and action controls
- `/catalog.html`
  Historical local audit log
- `/settings.html`
  Source toggles, AI keys, watchlist rules, automation flags, and import/export

## Preference learning

RepoRadar builds a lightweight local preference profile from the repos you save and ignore.

- Saved repos boost related tags, languages, sources, and keywords
- Ignored repos penalize related tags, languages, sources, and keywords
- Exact ignored repos are hidden from future views
- New discoveries still get a freshness boost so the app keeps surfacing new items, just with fewer mismatches

This is local ranking logic, not a cloud profile.

## AI behavior

When AI analysis is available:

- Non-English content is translated into English
- HTML/link noise is cleaned before summarization
- Cards get short summaries
- The detail page expands into:
  - translated brief
  - audience
  - use cases
  - opportunity
  - weekend MVP
  - why-now reasoning
  - risk list
  - ignore-pattern hints

For discussion-driven sources such as Reddit:

- RepoRadar tries to resolve the actual repository/project link from the post body, outbound URL, and comments
- Comment threads are scanned for quick validation signals
- Positive discussion can boost ranking
- Repeated complaint signals can reduce ranking and influence the AI brief

AI briefs are cached locally after generation.

- Cached analyses are reused on cards and on `/repo.html`
- Each cached brief is fingerprinted against the repo content so stale mismatches are avoided
- Recent analysis failures are also cached temporarily to prevent repeated retries on every page open
- If AI is unavailable, RepoRadar falls back to a fast local brief instead of leaving the page empty

## Local run

1. Optionally copy `.env.example` to `.env`
2. Run:

```bash
npm start
```

3. Open:

```text
http://localhost:3000
```

You can also serve the root folder as a static site. In that mode the browser runtime still works, and settings are stored locally.

## Environment variables

- `GROQ_API_KEY`
- `GROQ_MODEL`
- `GITHUB_TOKEN`
- `PRODUCT_HUNT_BEARER_TOKEN`

## Notes

- Browser notifications are local only
- Ignore/save preference learning is local only
- The app works best when AI auto-analysis is enabled and a Groq key is configured
