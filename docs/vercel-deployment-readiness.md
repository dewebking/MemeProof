# Vercel deployment readiness

MemeProof is intended to deploy to **NEAR testnet only**. This document prepares the existing npm workspace for a Vercel project; no Vercel project has been linked or deployed from this checkout.

## Project configuration

- Repository root: keep the root `package.json` and `package-lock.json` as the npm workspace source of truth.
- Vercel Root Directory: `apps/web` (include files outside this directory so the workspace root and shared package remain available).
- Framework: Next.js; the app uses Next.js 16 and `apps/web/next.config.ts` has no custom production overrides.
- Install: `npm install` from the repository workspace, using the committed root lockfile.
- Build: `npm run build --workspace @memeproof/web`.
- Output: leave the Next.js output directory at its default; do not configure a static export.
- Node.js: use Node 20.9 or later, consistent with the repository instructions.

The npm workspace scripts already delegate to `@memeproof/web`. Preserve the root lockfile and workspace package structure when configuring Vercel.

## Environment variables

Configure these in Vercel for the **Preview** and **Production** scopes as applicable. Do not paste secret values into this file or logs.

| Variable | Requirement | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_NEAR_NETWORK_ID` | Set to `testnet` | Public configuration; code defaults to testnet. Do not set to mainnet. |
| `NEXT_PUBLIC_NEAR_RPC_URL` | Optional | Public testnet RPC endpoint; code validates testnet endpoints and defaults to the public NEAR testnet RPC. |
| `NEXT_PUBLIC_REGISTRY_CONTRACT_ID` | Required | Deploy-time value: the existing NEAR testnet registry contract account ID. Must be supplied by the project owner; do not infer or invent it. |
| `NEXT_PUBLIC_SUPABASE_URL` | Optional for core app; required for Supabase-backed sync/projections | Public project URL, not a credential. |
| `SUPABASE_SERVICE_ROLE_KEY` | Required only when Supabase-backed server routes/sync are enabled | Secret server-side key. Never use a `NEXT_PUBLIC_` prefix. |
| `CRON_SECRET` | Required only if `/api/cron/sync` is scheduled or called | Secret bearer value; keep server-side and configure Vercel Cron authorization accordingly. |

`MARKET_REFRESH_INTERVAL_MINUTES` is read by the market freshness check and defaults to 60 minutes. The sync implementation also accepts `MEME_SYNC_INTERVAL_MINUTES` and `MARKET_REFRESH_BATCH_SIZE`; set these only when choosing an operational sync cadence and batch size. `NEAR_AI_API_KEY` appears in the example environment file but is not currently read by application code.

The public Supabase anonymous key is not used by the current app code. Do not add it as a deployment requirement unless a future implementation uses it.

## API route and operations notes

- Discovery is served by `/api/meme-cooking/meme` with dynamic/no-store response headers. Its Supabase snapshot may be fresh by the configured 15-minute sync freshness rule, but it remains a snapshot and the UI must label it as such. Direct upstream results are distinct from snapshot and stale fallback results.
- `/api/cron/sync` requires `CRON_SECRET`. There is no checked-in `vercel.json` schedule. Choose and confirm a cron cadence and Vercel plan limits before adding a schedule; do not silently create one.
- Market data freshness is configurable through `MARKET_REFRESH_INTERVAL_MINUTES` and defaults to 60 minutes.
- Keep secrets in Vercel server-side environment scopes. Only values required by browser code use the `NEXT_PUBLIC_` prefix.
- No `.vercel` project link, deployment, or contract deployment is part of this preparation.

## Remaining owner inputs before deployment

1. NEAR testnet registry contract ID for `NEXT_PUBLIC_REGISTRY_CONTRACT_ID`.
2. Whether to enable Supabase-backed sync, with the project URL and server-only service key configured in Vercel.
3. Whether to schedule `/api/cron/sync`, and at what cadence; if enabled, configure `CRON_SECRET` and the matching Vercel Cron authorization.
4. The intended Preview and Production environment scopes, while keeping both on NEAR testnet for the hackathon deployment.
