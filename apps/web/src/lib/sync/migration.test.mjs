import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("failed refresh SQL preserves the last successful market payload and timestamps", async () => {
  const sql = await readFile(new URL("../../../../../supabase/migrations/202611050001_meme_cooking_sync.sql", import.meta.url), "utf8");
  assert.match(sql, /market_data = case when p_status = 'available' then excluded\.market_data when market_data_snapshots\.token_contract_address = excluded\.token_contract_address then market_data_snapshots\.market_data else null end/);
  assert.match(sql, /fetched_at = case when p_status = 'available' then excluded\.fetched_at when market_data_snapshots\.token_contract_address = excluded\.token_contract_address then market_data_snapshots\.fetched_at else null end/);
  assert.match(sql, /last_successful_refresh_at = case when p_status = 'available' then p_attempt_at when market_data_snapshots\.token_contract_address = excluded\.token_contract_address then market_data_snapshots\.last_successful_refresh_at else null end/);
  assert.match(sql, /last_attempt_at = p_attempt_at, last_attempt_status = p_status/);
});

test("refresh lock acquisition reports only a lock this call inserted or reclaimed", async () => {
  const sql = await readFile(new URL("../../../../../supabase/migrations/202611050002_fix_memeproof_refresh_lock.sql", import.meta.url), "utf8");
  assert.match(sql, /on conflict \(lock_key\) do update set owner = excluded\.owner, expires_at = excluded\.expires_at\s+where public\.meme_cooking_refresh_locks\.expires_at < now\(\);\s+return found;/);
  assert.match(sql, /revoke all on function public\.acquire_memeproof_refresh_lock\(text, integer\) from public, anon, authenticated;/);
  assert.match(sql, /grant execute on function public\.acquire_memeproof_refresh_lock\(text, integer\) to service_role;/);
});
