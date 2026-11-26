// Supabase Edge Function: authenticated Turnix TURN/STUN credentials.
// Deploy with: supabase functions deploy voice-ice-servers
// Required secret: TURNIX_API_TOKEN (never expose it to the browser).
// Keep JWT verification enabled in supabase/config.toml.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function safeIdentifier(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 128);
  return normalized || undefined;
}

function jwtSubject(authorization: string): string | undefined {
  try {
    const part = authorization.slice("Bearer ".length).trim().split(".")[1];
    if (!part) return undefined;
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")));
    return typeof payload.sub === "string" ? payload.sub : undefined;
  } catch {
    return undefined;
  }
}

// Supabase Edge ingress supplies the forwarded client address. Never accept
// an IP from the JSON body and never log the address.
function clientIp(request: Request): string | undefined {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const candidate = request.headers.get("cf-connecting-ip")?.trim()
    || request.headers.get("x-real-ip")?.trim()
    || forwarded;
  if (!candidate || candidate.length > 64) return undefined;
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(candidate)) {
    const octets = candidate.split(".").map(Number);
    return octets.every((n) => n >= 0 && n <= 255) ? candidate : undefined;
  }
  if (candidate.includes(":") && /^[0-9a-fA-F:.]+$/.test(candidate)) {
    try {
      new URL("http://[" + candidate + "]/");
      return candidate;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

type Dependencies = {
  token?: string;
  fetchImpl?: typeof fetch;
  getClientIp?: (request: Request) => string | undefined;
};

export async function handleRequest(request: Request, deps: Dependencies = {}): Promise<Response> {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authorization = request.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ") || !jwtSubject(authorization)) {
    return json({ error: "authentication_required" }, 401);
  }

  const token = deps.token ?? Deno.env.get("TURNIX_API_TOKEN") ?? "";
  if (!token.trim()) {
    console.error("TURN credentials unavailable: TURNIX_API_TOKEN is not configured");
    return json({ error: "turn_service_not_configured" }, 500);
  }

  let input: Record<string, unknown> = {};
  try {
    const parsed = await request.json();
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) input = parsed;
  } catch {
    return json({ error: "invalid_request_body" }, 400);
  }

  const subject = jwtSubject(authorization);
  const room = safeIdentifier(input.room);
  const initiatorClient = safeIdentifier(input.initiator_client) || safeIdentifier(subject);
  const body: Record<string, string> = { ttl: "3600" };
  if (room) body.room = room;
  if (initiatorClient) body.initiator_client = initiatorClient;

  const headers: Record<string, string> = {
    Authorization: "Bearer " + token,
    "Content-Type": "application/json",
  };
  const ip = (deps.getClientIp || clientIp)(request);
  if (ip) headers["X-TURN-CLIENT-IP"] = ip;

  try {
    const response = await (deps.fetchImpl || fetch)(
      "https://turnix.io/api/v1/credentials/ice",
      {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      },
    );

    if (response.status === 401) {
      console.error("Turnix API token is invalid");
      return json({ error: "turn_provider_auth_failed" }, 502);
    }
    if (response.status === 429) {
      console.error("Turnix TURN usage limit reached");
      return json({ error: "به حد مجاز استفاده TURN رسیده‌ایم" }, 503);
    }
    if (!response.ok) {
      console.error("Turnix credentials request failed:", response.status);
      return json({ error: "turn_provider_unavailable" }, 502);
    }

    const payload = await response.json();
    if (!Array.isArray(payload?.iceServers) || !payload.iceServers.length ||
        typeof payload?.expiresAt !== "string" || !Number.isFinite(Date.parse(payload.expiresAt))) {
      console.error("Turnix returned an invalid ICE credentials payload");
      return json({ error: "invalid_turn_response" }, 502);
    }

    return json({ iceServers: payload.iceServers, expiresAt: payload.expiresAt });
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "TimeoutError";
    console.error(timedOut ? "Turnix credentials request timed out" : "Turnix credentials request failed");
    return json({ error: timedOut ? "turn_provider_timeout" : "turn_provider_unavailable" }, 502);
  }
}

if (import.meta.main) Deno.serve((request) => handleRequest(request));
