# Pulumi Dashboard

A self-hosted web dashboard for browsing Pulumi stack state stored in S3 — resources, outputs, and update history — secured with Google OAuth.

## Prerequisites

- Node.js 22+
- An AWS account with an S3 bucket containing Pulumi state (the bucket your `pulumi login s3://...` points to)
- A Google OAuth app (for sign-in)

## 1. Clone and install

```bash
git clone <repo-url>
cd pulumi-dashboard
npm install
```

## 2. Configure environment variables

Create a `.env.local` file in the project root:

```bash
# Auth.js secret — generate one with: npx auth secret
AUTH_SECRET=

# Google OAuth credentials
# Create at: https://console.developers.google.com/apis/credentials
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=

# Only users with this email domain can sign in
AUTH_ALLOWED_DOMAIN=yourcompany.com

# AWS region (defaults to us-east-1 if omitted)
AWS_REGION=us-east-1

# S3 bucket containing your Pulumi state
PULUMI_STATE_BUCKET=your-pulumi-state-bucket
```

### Google OAuth setup

1. Go to [Google Cloud Console → Credentials](https://console.developers.google.com/apis/credentials)
2. Create an **OAuth 2.0 Client ID** (Web application)
3. Add `http://localhost:3000/api/auth/callback/google` to **Authorized redirect URIs**
4. Copy the Client ID and Secret into `.env.local`

### AWS credentials

The app uses the default AWS credential chain. For local development the easiest options are:

- **AWS CLI profile** — run `aws configure` or set `AWS_PROFILE`
- **Environment variables** — set `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`
- **IAM role** — automatically used when running on ECS or EC2

The IAM principal needs `s3:GetObject` and `s3:ListBucket` on the state bucket.

### Multiple buckets (optional)

To show stacks from multiple S3 buckets (e.g. per environment), use `PULUMI_STATE_BUCKET_<ENV>` instead of the single `PULUMI_STATE_BUCKET`:

```bash
PULUMI_STATE_BUCKET_PROD=my-pulumi-state-prod
PULUMI_STATE_BUCKET_STAGING=my-pulumi-state-staging
```

Each suffix becomes an environment label in the UI. `PULUMI_STATE_BUCKET` and `PULUMI_STATE_BUCKET_<ENV>` are mutually exclusive — use one form or the other.

## 3. Start the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You will be redirected to the login page and prompted to sign in with Google.

## Architecture

### How it works

The dashboard reads Pulumi's native S3 backend layout — the same bucket structure created by `pulumi login s3://...`. It never modifies any S3 objects; all access is read-only.

```
Request flow:

Browser ──▶ Next.js (SSR) ──▶ In-memory index ──▶ S3 (on cache miss)
                │
                ▼
         Auth.js (Google OAuth)
```

### System overview

```
┌─────────────────────────────────────────────────────────────┐
│  Next.js Server                                             │
│                                                             │
│  ┌──────────────┐    ┌──────────────────────────────────┐   │
│  │ instrumen-   │    │  Stack Index (globalThis)         │   │
│  │ tation.ts    │───▶│                                   │   │
│  │              │    │  stackMap: project/stack → meta   │   │
│  │ • buildIndex │    │  historyFilesMap: file listings   │   │
│  │   on startup │    │  initialized: boolean             │   │
│  │ • setInterval│    └──────────┬───────────────────────┘   │
│  │   for sync   │               │                           │
│  └──────────────┘               │ reads from                │
│                                 ▼                           │
│  ┌──────────────┐    ┌──────────────────────────────────┐   │
│  │ Route        │    │  S3 API Layer (s3.ts)             │   │
│  │ Handlers     │───▶│                                   │   │
│  │              │    │  • listStacks (from index)        │   │
│  │ (dashboard)/ │    │  • listHistory (from index)       │   │
│  │  page.tsx    │    │  • getCheckpoint (direct key)     │   │
│  │  stacks/...  │    │  • getStackState (direct key)     │   │
│  └──────────────┘    └──────────┬───────────────────────┘   │
│                                 │                           │
│                      ┌──────────▼───────────────────────┐   │
│                      │  LRU Cache (cache.ts)             │   │
│                      │  50 MB default, immutable files   │   │
│                      └──────────┬───────────────────────┘   │
│                                 │ on miss                   │
└─────────────────────────────────┼───────────────────────────┘
                                  │
                       ┌──────────▼───────────────────────┐
                       │  AWS S3                           │
                       │  .pulumi/stacks/...               │
                       │  .pulumi/history/...              │
                       └──────────────────────────────────┘
```

### Startup and caching

On server start, the `register()` hook in `instrumentation.ts` runs:

1. **Builds the full stack index** — lists all `.pulumi/stacks/*.json` files across configured buckets, reads each stack state for resource count and last update time, and fetches the latest history entry for each stack's result status (succeeded/failed).

2. **Caches all history file keys** — lists all files under `.pulumi/history/` for every stack, parsing epochs and types (history vs checkpoint) into an in-memory map.

3. **Schedules background sync** — a `setInterval` runs `refreshStaleStacks()` every 15 minutes (configurable via `SYNC_INTERVAL_MS`). This re-lists the stacks prefix, compares each file's `LastModified` timestamp against the cached value, and only re-enriches stacks that have changed. It also detects and removes deleted stacks.

All state lives on `globalThis` to survive Next.js module isolation between the instrumentation hook and request handlers.

### Request handling

Once the index is built, page requests are fast:

- **Stack listing** (`/`) — pure in-memory filter and paginate from the cached index. Zero S3 calls.
- **Stack detail** (`/stacks/:project/:stack`) — stack state fetched from S3 (for resources/outputs), history paginated from cached file list, individual history entries fetched from S3 with LRU caching.
- **Checkpoint view** (`/stacks/:project/:stack/checkpoint/:epoch`) — S3 key constructed directly from the deterministic path pattern (`{stack}-{epoch}.checkpoint.json`). No listing needed.

History and checkpoint files are immutable once written by Pulumi, so they are cached aggressively in a byte-limited LRU cache (default 50 MB, configurable via `HISTORY_CACHE_MAX_BYTES`).

### Authentication

Auth.js v5 with Google OAuth. The middleware (`proxy.ts`) protects all routes except `/login` and `/api/auth/*`. Sign-in is restricted to a single email domain via `AUTH_ALLOWED_DOMAIN`. Sessions use JWT cookies — no database required.

## S3 state structure

The app expects the standard Pulumi S3 backend layout:

```
<bucket>/
  .pulumi/
    stacks/<project>/<stack>.json          # current state
    history/<project>/<stack>/<stack>-<epoch>.history.json
    history/<project>/<stack>/<stack>-<epoch>.checkpoint.json
```

Files under `history/` are immutable once written. The epoch in filenames is a nanosecond timestamp used for ordering.

## Project structure

```
src/
  app/
    (dashboard)/              # Protected route group
      page.tsx                # Stack listing
      stacks/[project]/[stack]/
        page.tsx              # Stack detail (history, resources, outputs)
        checkpoint/[epochMs]/
          page.tsx            # Snapshot diff view
    login/page.tsx            # Public login page
    api/auth/[...nextauth]/   # Auth.js route handler
    actions.ts                # Server actions (refresh index/stack)
  instrumentation.ts          # Server startup hook + background sync
  auth.ts                     # Auth.js config (Google OAuth, domain restriction)
  proxy.ts                    # Middleware (route protection)
  lib/
    stack-index.ts            # Stack discovery, enrichment, incremental sync
    s3.ts                     # Public API (listStacks, listHistory, getCheckpoint)
    s3-client.ts              # Low-level S3 primitives (listKeysWithMeta, s3JsonSafe)
    cache.ts                  # LRU cache for immutable S3 files
    buckets.ts                # Multi-bucket configuration from env vars
    pulumi-types.ts           # TypeScript types for Pulumi state files
    logger.ts                 # Structured debug logging
  components/
    ui/                       # shadcn/ui (auto-generated, do not edit)
    resource-tree.tsx          # Hierarchical resource tree view
    stack-outputs.tsx          # Stack outputs key-value display
    pagination.tsx             # Page navigation
    stack-search.tsx           # Search input with debounce
    relative-time.tsx          # "2 hours ago" time display
    status-icon.tsx            # Result status indicator
    theme-toggle.tsx           # Dark mode toggle
    clickable-row.tsx          # Table row as link
```

## Configuration reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `AUTH_SECRET` | Yes | — | Auth.js session encryption key |
| `AUTH_GOOGLE_ID` | Yes | — | Google OAuth client ID |
| `AUTH_GOOGLE_SECRET` | Yes | — | Google OAuth client secret |
| `AUTH_ALLOWED_DOMAIN` | Yes | — | Email domain restriction (e.g. `yourcompany.com`) |
| `PULUMI_STATE_BUCKET` | Yes* | — | S3 bucket name (single-bucket mode) |
| `PULUMI_STATE_BUCKET_<ENV>` | Yes* | — | Per-environment buckets (multi-bucket mode) |
| `AWS_REGION` | No | `us-east-1` | AWS region for S3 |
| `SYNC_INTERVAL_MS` | No | `900000` | Background sync interval in ms (15 min) |
| `HISTORY_CACHE_MAX_BYTES` | No | `52428800` | LRU cache size for history files (50 MB) |
| `DEBUG` | No | — | Enable debug logs (`1` or `true`) |

*One of `PULUMI_STATE_BUCKET` or `PULUMI_STATE_BUCKET_<ENV>` is required.

## Available scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run check` | Format, lint, and sort imports (Biome) |
| `npm run typecheck` | TypeScript type check |
| `npm run depcheck` | Check for unused/missing dependencies (knip) |
