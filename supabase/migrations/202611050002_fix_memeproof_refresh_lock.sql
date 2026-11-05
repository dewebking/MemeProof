create or replace function public.acquire_memeproof_refresh_lock(p_owner text, p_lease_seconds integer)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  insert into public.meme_cooking_refresh_locks(lock_key, owner, expires_at)
  values ('global', p_owner, now() + make_interval(secs => greatest(30, least(p_lease_seconds, 3600))))
  on conflict (lock_key) do update set owner = excluded.owner, expires_at = excluded.expires_at
  where public.meme_cooking_refresh_locks.expires_at < now();
  return found;
end;
$$;

revoke all on function public.acquire_memeproof_refresh_lock(text, integer) from public, anon, authenticated;
grant execute on function public.acquire_memeproof_refresh_lock(text, integer) to service_role;
