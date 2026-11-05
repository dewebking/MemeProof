create table if not exists public.meme_cooking_tokens (
  meme_id bigint primary key check (meme_id > 0),
  token_id text,
  pool_id text,
  is_finalized boolean,
  source_created_at timestamptz,
  source_updated_at timestamptz,
  source_record jsonb not null,
  market_eligible boolean not null default false,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  market_next_refresh_at timestamptz,
  market_failure_count integer not null default 0,
  market_last_attempt_at timestamptz,
  market_last_attempt_status text
);
create index if not exists meme_cooking_tokens_due_market_idx
  on public.meme_cooking_tokens(market_next_refresh_at) where market_eligible = true;

create or replace function public.schedule_changed_meme_contract()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.market_eligible then new.market_next_refresh_at := now(); end if;
  elsif new.token_id is distinct from old.token_id or new.market_eligible is distinct from old.market_eligible then
    new.market_failure_count := 0;
    new.market_next_refresh_at := case when new.market_eligible then now() else null end;
  end if;
  return new;
end;
$$;
drop trigger if exists meme_contract_refresh_schedule on public.meme_cooking_tokens;
create trigger meme_contract_refresh_schedule before insert or update
on public.meme_cooking_tokens for each row execute function public.schedule_changed_meme_contract();

create table if not exists public.meme_cooking_sync_state (
  state_key text primary key default 'meme-list' check (state_key = 'meme-list'),
  last_success_at timestamptz,
  next_retry_at timestamptz,
  failure_count integer not null default 0
);
insert into public.meme_cooking_sync_state(state_key) values ('meme-list') on conflict do nothing;

create table if not exists public.market_data_snapshots (
  meme_id bigint primary key references public.meme_cooking_tokens(meme_id) on delete cascade,
  token_contract_address text not null,
  market_data jsonb,
  provider text,
  pair_address text,
  provider_url text,
  fetched_at timestamptz,
  last_successful_refresh_at timestamptz,
  last_attempt_at timestamptz,
  last_attempt_status text not null default 'pending',
  providers jsonb not null default '{}'::jsonb
);

create table if not exists public.meme_cooking_refresh_runs (
  id uuid primary key default gen_random_uuid(),
  trigger text not null check (trigger in ('scheduled', 'manual')),
  started_at timestamptz not null,
  finished_at timestamptz,
  summary jsonb,
  error_code text
);

create table if not exists public.meme_cooking_refresh_locks (
  lock_key text primary key,
  owner text not null,
  expires_at timestamptz not null
);

create or replace function public.acquire_memeproof_refresh_lock(p_owner text, p_lease_seconds integer)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  insert into meme_cooking_refresh_locks(lock_key, owner, expires_at)
  values ('global', p_owner, now() + make_interval(secs => greatest(30, least(p_lease_seconds, 3600))))
  on conflict (lock_key) do update set owner = excluded.owner, expires_at = excluded.expires_at
  where meme_cooking_refresh_locks.expires_at < now();
  return found;
end;
$$;

create or replace function public.release_memeproof_refresh_lock(p_owner text)
returns void language sql security definer set search_path = public as $$
  delete from meme_cooking_refresh_locks where lock_key = 'global' and owner = p_owner;
$$;

create or replace function public.record_memeproof_market_attempt(
  p_meme_id bigint, p_token_contract_address text, p_market_data jsonb,
  p_providers jsonb, p_status text, p_attempt_at timestamptz,
  p_next_refresh_at timestamptz, p_failure_count integer
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into market_data_snapshots(meme_id, token_contract_address, market_data, provider, pair_address,
    provider_url, fetched_at, last_successful_refresh_at, last_attempt_at, last_attempt_status, providers)
  values (p_meme_id, p_token_contract_address,
    case when p_status = 'available' then p_market_data else null end,
    case when p_status = 'available' then p_market_data->>'provider' else null end,
    case when p_status = 'available' then p_market_data->>'pairAddress' else null end,
    case when p_status = 'available' then p_market_data->>'providerUrl' else null end,
    case when p_status = 'available' then (p_market_data->>'fetchedAt')::timestamptz else null end,
    case when p_status = 'available' then p_attempt_at else null end,
    p_attempt_at, p_status, coalesce(p_providers, '{}'::jsonb))
  on conflict (meme_id) do update set
    token_contract_address = excluded.token_contract_address,
    market_data = case when p_status = 'available' then excluded.market_data when market_data_snapshots.token_contract_address = excluded.token_contract_address then market_data_snapshots.market_data else null end,
    provider = case when p_status = 'available' then excluded.provider when market_data_snapshots.token_contract_address = excluded.token_contract_address then market_data_snapshots.provider else null end,
    pair_address = case when p_status = 'available' then excluded.pair_address when market_data_snapshots.token_contract_address = excluded.token_contract_address then market_data_snapshots.pair_address else null end,
    provider_url = case when p_status = 'available' then excluded.provider_url when market_data_snapshots.token_contract_address = excluded.token_contract_address then market_data_snapshots.provider_url else null end,
    fetched_at = case when p_status = 'available' then excluded.fetched_at when market_data_snapshots.token_contract_address = excluded.token_contract_address then market_data_snapshots.fetched_at else null end,
    last_successful_refresh_at = case when p_status = 'available' then p_attempt_at when market_data_snapshots.token_contract_address = excluded.token_contract_address then market_data_snapshots.last_successful_refresh_at else null end,
    last_attempt_at = p_attempt_at, last_attempt_status = p_status, providers = coalesce(p_providers, '{}'::jsonb);

  update meme_cooking_tokens set market_next_refresh_at = p_next_refresh_at,
    market_failure_count = p_failure_count, market_last_attempt_at = p_attempt_at,
    market_last_attempt_status = p_status where meme_id = p_meme_id;
end;
$$;

alter table public.meme_cooking_tokens enable row level security;
alter table public.meme_cooking_sync_state enable row level security;
alter table public.market_data_snapshots enable row level security;
alter table public.meme_cooking_refresh_runs enable row level security;
alter table public.meme_cooking_refresh_locks enable row level security;
revoke all on public.meme_cooking_tokens, public.meme_cooking_sync_state, public.market_data_snapshots,
  public.meme_cooking_refresh_runs, public.meme_cooking_refresh_locks from anon, authenticated;
grant all on public.meme_cooking_tokens, public.meme_cooking_sync_state, public.market_data_snapshots,
  public.meme_cooking_refresh_runs, public.meme_cooking_refresh_locks to service_role;
revoke all on function public.acquire_memeproof_refresh_lock(text, integer) from public, anon, authenticated;
revoke all on function public.release_memeproof_refresh_lock(text) from public, anon, authenticated;
revoke all on function public.record_memeproof_market_attempt(bigint, text, jsonb, jsonb, text, timestamptz, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.acquire_memeproof_refresh_lock(text, integer) to service_role;
grant execute on function public.release_memeproof_refresh_lock(text) to service_role;
grant execute on function public.record_memeproof_market_attempt(bigint, text, jsonb, jsonb, text, timestamptz, timestamptz, integer) to service_role;
