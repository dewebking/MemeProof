export type SupabaseServerKeyValidation = {
  valid: boolean;
  format: "legacy_jwt" | "secret_api_key" | "publishable_api_key" | "unknown";
  role: "service_role" | "anon" | "authenticated" | "other" | "unknown";
  matchesProject: boolean | null;
  issue: "none" | "missing" | "control_character" | "whitespace" | "quoted" | "public_key" | "wrong_role" | "wrong_project" | "malformed_jwt" | "unsupported_format";
};

export function validateSupabaseServerKey(value: unknown, projectRef: string): SupabaseServerKeyValidation {
  const invalid = (issue: SupabaseServerKeyValidation["issue"], format: SupabaseServerKeyValidation["format"] = "unknown", role: SupabaseServerKeyValidation["role"] = "unknown", matchesProject: boolean | null = null): SupabaseServerKeyValidation => ({ valid: false, format, role, matchesProject, issue });
  if (typeof value !== "string" || value.length === 0) return invalid("missing");
  if (/[\u0000-\u001f\u007f]/.test(value)) return invalid("control_character");
  if (/\s/.test(value)) return invalid("whitespace");
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) return invalid("quoted");
  if (value.startsWith("sb_publishable_")) return invalid("public_key", "publishable_api_key", "anon");
  if (value.startsWith("sb_secret_")) return { valid: true, format: "secret_api_key", role: "service_role", matchesProject: null, issue: "none" };

  const parts = value.split(".");
  if (parts.length !== 3 || parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) return invalid("unsupported_format");
  let claims: Record<string, unknown>;
  try {
    claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    return invalid("malformed_jwt", "legacy_jwt");
  }
  const role = claims.role === "service_role" || claims.role === "anon" || claims.role === "authenticated"
    ? claims.role
    : typeof claims.role === "string" ? "other" : "unknown";
  const matchesProject = typeof claims.ref === "string" ? claims.ref === projectRef : null;
  if (role === "anon") return invalid("public_key", "legacy_jwt", role, matchesProject);
  if (role !== "service_role") return invalid("wrong_role", "legacy_jwt", role, matchesProject);
  if (matchesProject === false) return invalid("wrong_project", "legacy_jwt", role, false);
  if (matchesProject === null) return invalid("malformed_jwt", "legacy_jwt", role, null);
  return { valid: true, format: "legacy_jwt", role, matchesProject: true, issue: "none" };
}
