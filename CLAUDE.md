# Watchlist App

Personal movie/TV watchlist app. No auth — designed for personal use by a couple.

## Tech Stack

- **Framework**: React Router v7 (SSR) on Cloudflare Workers
- **Database**: Cloudflare D1 (SQLite) + Drizzle ORM
- **UI**: Tailwind CSS v4 + shadcn/ui (new-york style, dark mode)
- **APIs**: TMDB (`tmdb-ts`) for content data, Google Gemini 2.0 Flash for "pick for me"
- **Deploy**: Cloudflare Pages/Workers via `wrangler`

## Getting Started

```bash
cp .dev.vars.example .dev.vars   # Add your TMDB_ACCESS_TOKEN and GEMINI_API_KEY
npm install
npm run db:migrate:local         # Create local D1 tables
npm run dev                      # Start dev server
```

## Project Structure

```
app/
├── components/
│   ├── poster-card.tsx          # Shared poster grid card
│   └── ui/                     # shadcn/ui components (do not edit directly)
├── db/
│   ├── schema.ts               # Drizzle schema (5 tables)
│   └── index.ts                # getDb() helper
├── lib/
│   ├── tmdb-image.ts           # TMDB image URL builder (shared client+server)
│   ├── types.ts                # Shared TypeScript types (TMDBSearchResult, etc.)
│   └── utils.ts                # cn() classname utility
├── services/                   # Server-only business logic
│   ├── tmdb.server.ts          # TMDB API wrapper (search, details, providers)
│   ├── watchlist.server.ts     # Watchlist CRUD operations
│   ├── episodes.server.ts      # Episode tracking + progress
│   └── gemini.server.ts        # AI recommendation engine
├── routes/
│   ├── _layout.tsx             # App shell (sidebar + bottom nav)
│   ├── _layout._index.tsx      # Home: "What to Watch"
│   ├── _layout.search.tsx      # Search TMDB + quick add
│   ├── _layout.following.tsx   # TV episode tracking + schedule
│   ├── _layout.item.$id.tsx    # Item detail page
│   ├── _layout.watchlist.tsx   # Full watchlist browse
│   ├── api.pick.tsx            # POST: Gemini pick-for-me
│   └── api.tmdb.search.tsx     # GET: TMDB search proxy
├── routes.ts                   # Route config
├── root.tsx                    # HTML shell + error boundary
└── app.css                     # Tailwind + CSS variables + scrollbar-hide
```

## Key Conventions

### Server vs Client Code Splitting

React Router auto-strips server code (`loader`, `action`) from the client bundle. **Critical rule**: route component code (JSX) must NOT import from `.server.ts` files. If you need a utility in both server and client code, put it in `app/lib/` (e.g., `tmdb-image.ts`, `types.ts`).

### Data Flow Pattern

Every route follows the same pattern:
1. `loader` fetches data via `getDb(context.cloudflare.env.DB)` + Drizzle queries
2. Component reads data with `useLoaderData<typeof loader>()`
3. Mutations use `useFetcher()` with `<fetcher.Form method="post">` — never `useSubmit` with full-page reloads
4. `action` handles form submissions and returns JSON
5. React Router auto-revalidates loaders after actions

### Database Access

```typescript
const db = getDb(context.cloudflare.env.DB);
const items = await db.query.watchlistItems.findMany({ where: eq(schema.watchlistItems.status, "to_watch") });
```

Always use Drizzle query builder, never raw SQL in app code.

### Environment Variables

Accessed via `context.cloudflare.env.VARIABLE_NAME` in loaders/actions. Defined in `wrangler.jsonc`, secrets in `.dev.vars` locally and Cloudflare dashboard in production.

| Variable | Purpose |
|----------|---------|
| `DB` | D1 database binding (auto from wrangler) |
| `TMDB_ACCESS_TOKEN` | TMDB API read access token |
| `GEMINI_API_KEY` | Google Gemini API key |

### Import Alias

`~/` resolves to `./app/`. Use it for all imports: `import { getDb } from "~/db"`.

### Styling

- Tailwind classes only, no inline styles
- Use `cn()` from `~/lib/utils` for conditional classes
- App is dark-mode only (class `dark` on `<html>`)
- `scrollbar-hide` class available for hiding scrollbars on horizontal scroll areas

## Database Schema

5 tables defined in `app/db/schema.ts`:

- **watchlist_items** — Core entity (tmdb_id, media_type, title, status, vibe, genres as JSON string)
- **watch_providers** — Cached streaming info per item (flatrate/rent/buy)
- **tv_progress** — Per-show viewing progress (current season/episode, air day, show status)
- **episodes** — Cached episode data for tracked shows (watched state, air dates)
- **genres** — TMDB genre lookup cache

All child tables cascade-delete when a watchlist item is removed.

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Local dev server with HMR |
| `npm run build` | Production build |
| `npm run typecheck` | Full type check (cf-typegen + react-router typegen + tsc) |
| `npm run deploy` | Build + deploy to Cloudflare |
| `npm run db:generate` | Generate new Drizzle migration after schema changes |
| `npm run db:migrate:local` | Apply migration to local D1 |

## Adding a New Route

1. Create the file in `app/routes/` following the `_layout.` prefix convention
2. Add it to `app/routes.ts`
3. Run `npx react-router typegen` to generate route types
4. Import the types: `import type { Route } from "./+types/your-route"`

## Common Gotchas

- **`wrangler types` must run after changing `wrangler.jsonc`** — the `Env` interface is auto-generated into `worker-configuration.d.ts`
- **Drizzle enum columns are type-strict** — when setting a column like `status`, cast the form value: `formData.get("status") as "to_watch" | "watching"`
- **TMDB images are hotlinked** from `image.tmdb.org` CDN — no proxying. Use `getTMDBImageUrl()` from `~/lib/tmdb-image`
- **`tmdb-ts` season details** takes an object `{ tvShowID, seasonNumber }`, not positional args
- **Genres are stored as a JSON string** on watchlist_items (e.g. `'["Drama","Thriller"]'`). Parse with `JSON.parse(item.genres || "[]")`
