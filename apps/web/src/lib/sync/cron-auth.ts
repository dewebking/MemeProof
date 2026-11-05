import { timingSafeEqual } from "node:crypto";

export function isAuthorizedCronRequest(request: Request, secret = process.env.CRON_SECRET): boolean {
  if (!secret || secret.length < 32) return false;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!supplied || supplied.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(secret));
}
