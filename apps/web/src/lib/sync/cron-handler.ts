import type { RefreshSummary } from "./core";

export async function handleCronPost(
  request: Request,
  dependencies: {
    authorized: boolean;
    configured: boolean;
    refresh(trigger: "scheduled" | "manual"): Promise<RefreshSummary>;
  },
): Promise<Response> {
  if (!dependencies.authorized) return Response.json({ error: "Unauthorized." }, { status: 401 });
  if (!dependencies.configured) return Response.json({ error: "Persistent synchronization is not configured." }, { status: 503 });
  let trigger: "scheduled" | "manual" = "scheduled";
  try {
    const body: unknown = await request.json();
    if (typeof body === "object" && body !== null && "trigger" in body) {
      if (body.trigger !== "scheduled" && body.trigger !== "manual") return Response.json({ error: "Invalid refresh trigger." }, { status: 400 });
      trigger = body.trigger;
    }
  } catch { /* Empty request bodies are valid scheduled calls. */ }
  try {
    const summary = await dependencies.refresh(trigger);
    return Response.json(summary, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Refresh could not be completed." }, { status: 503 });
  }
}
