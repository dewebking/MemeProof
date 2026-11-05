# Automatic Meme.Cooking and market refresh

## Persistence and setup

Apply `supabase/migrations/202611050001_meme_cooking_sync.sql` to the configured Supabase project. The service uses Supabase PostgREST directly, so no additional package is required. Configure these server-side variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (server only; never use a `NEXT_PUBLIC_` name)
- `CRON_SECRET` (at least 32 characters)
- Optional `MEME_SYNC_INTERVAL_MINUTES` (default 15; 1–1440)
- Optional `MARKET_REFRESH_INTERVAL_MINUTES` (default 60; 5–10080)
- Optional `MARKET_REFRESH_BATCH_SIZE` (default 5; 1–25)

The migration creates unique meme-ID token records, source sync state, market snapshots, run history, and an expiring refresh lock. Market refresh failures update attempt state but do not replace the last successful market payload. Token records are upserted and never deleted during synchronization.

## Scheduling and manual trigger

The project has no Vercel configuration or existing platform cron. `.github/workflows/meme-sync.yml` provides a GitHub Actions schedule every five minutes and a `workflow_dispatch` trigger. Add repository secrets `MEMEPROOF_BASE_URL` (deployed origin) and `CRON_SECRET`, deploy the application and migration, enable Actions, then verify a successful workflow run. The endpoint existing in source does not mean a production scheduler is active.

The endpoint is `POST /api/cron/sync` with `Authorization: Bearer <CRON_SECRET>`. A manual request body may use `{"trigger":"manual"}`. Example PowerShell:

```powershell
$headers = @{ Authorization = "Bearer $env:CRON_SECRET" }
Invoke-RestMethod -Method Post -Uri "$env:MEMEPROOF_BASE_URL/api/cron/sync" -Headers $headers -ContentType "application/json" -Body '{"trigger":"manual"}'
```

Meme.Cooking list synchronization is due every 15 minutes by default. The five-minute schedule checks due work; a maximum of five eligible token contracts are refreshed serially per run, and each successful/no-match check is scheduled 60 minutes later by default. Temporary provider/source errors use exponential retries beginning at five minutes and capped at six hours. Only valid token contract addresses are market queried; `pool_id` and symbols are not used as provider identities.

## Discover and Passport behavior

When configured, Discover and token detail routes read the persistent source projection, retaining already known records during a source outage. Before the first successful sync, routes retain their direct Meme.Cooking behavior. Market data is served from the persistent snapshot after a token is synchronized. If the last attempt failed after a prior success, that prior snapshot remains visible with a stale label and its successful timestamp. Without a matching pair or a contract address, the Passport retains its token record and reports the corresponding unavailable state.

The repository workflow is implemented but is not configured or running against a production deployment until the migration, environment values, GitHub secrets, and Actions workflow are activated.
