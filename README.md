# RepoRadar

## Local run

1. Copy `.env.example` to `.env`
2. Add your keys
3. Run `npm start`
4. Open `http://localhost:3000`

## Hosting

- Vercel: recommended because the Groq key stays server-side in environment variables.
- GitHub Pages: fine for the static UI, but not for secure Groq proxying with `.env`.

## Environment variables

- `GROQ_API_KEY`: required for AI summaries
- `GROQ_MODEL`: optional override, defaults to `llama-3.3-70b-versatile`
- `GITHUB_TOKEN`: optional, improves GitHub API rate limits
- `PRODUCT_HUNT_BEARER_TOKEN`: optional, enables Product Hunt cards
