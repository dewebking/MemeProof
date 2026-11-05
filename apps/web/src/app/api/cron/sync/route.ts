import { handleCronPost } from "@/lib/sync/cron-handler";
import { isAuthorizedCronRequest } from "@/lib/sync/cron-auth";
import { refreshMemeProof } from "@/lib/sync/service";
import { isSyncStoreConfigured } from "@/lib/sync/supabase-store";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  return handleCronPost(request, { authorized: isAuthorizedCronRequest(request), configured: isSyncStoreConfigured(), refresh: refreshMemeProof });
}
