import { handleRequest } from "./index.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function equal(actual: unknown, expected: unknown, message: string) {
  assert(JSON.stringify(actual) === JSON.stringify(expected), message + ": " + JSON.stringify(actual));
}
function jwt(sub = "user-123") {
  const payload = btoa(JSON.stringify({ sub, exp: 4_000_000_000 }))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return "Bearer e30." + payload + ".signature";
}

Deno.test("authenticated endpoint forwards Bearer token and client IP, returns ICE data without leaking token", async () => {
  const secret = "turnix-test-secret-never-return";
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  const iceServers = [
    { urls: ["stun:stun.turnix.io:3478"] },
    { urls: ["turn:eu.turnix.io:3478?transport=udp"], username: "ephemeral-user", credential: "ephemeral-password" },
  ];
  const request = new Request("https://project.supabase.co/functions/v1/voice-ice-servers", {
    method: "POST",
    headers: { Authorization: jwt(), "Content-Type": "application/json", "x-forwarded-for": "203.0.113.8, 10.0.0.1" },
    body: JSON.stringify({ room: "table 7!", initiator_client: "client:abc" }),
  });
  const response = await handleRequest(request, {
    token: secret,
    getClientIp: () => "203.0.113.8",
    fetchImpl: async (input, init) => {
      capturedUrl = String(input);
      capturedInit = init;
      return new Response(JSON.stringify({ iceServers, expiresAt: "2026-12-01T12:00:00.000Z" }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    },
  });
  const result = await response.json();
  assert(response.status === 200, "expected HTTP 200");
  assert(capturedUrl === "https://turnix.io/api/v1/credentials/ice", "wrong Turnix URL");
  const headers = new Headers(capturedInit?.headers);
  assert(headers.get("Authorization") === "Bearer " + secret, "Bearer token not forwarded");
  assert(headers.get("X-TURN-CLIENT-IP") === "203.0.113.8", "client IP not forwarded");
  equal(JSON.parse(String(capturedInit?.body)), {
    ttl: "3600", room: "table7", initiator_client: "clientabc",
  }, "wrong Turnix request body");
  equal(result.iceServers, iceServers, "ICE servers not returned");
  assert(result.expiresAt === "2026-12-01T12:00:00.000Z", "expiry not returned");
  assert(!JSON.stringify(result).includes(secret), "API token leaked in response");
});

Deno.test("missing authentication is rejected before calling Turnix", async () => {
  const response = await handleRequest(new Request("https://example.test", { method: "POST" }), {
    token: "unused",
    fetchImpl: async () => { throw new Error("must not call provider"); },
  });
  assert(response.status === 401, "unauthenticated request should be rejected");
});

Deno.test("Turnix 429 maps to 503 without returning provider details", async () => {
  const response = await handleRequest(new Request("https://example.test", {
    method: "POST", headers: { Authorization: jwt() }, body: "{}",
  }), {
    token: "secret",
    fetchImpl: async () => new Response(JSON.stringify({ error: "quota", limit: 10, used: 10 }), { status: 429 }),
  });
  assert(response.status === 503, "429 should map to 503");
  const body = await response.text();
  assert(body.includes("به حد مجاز استفاده TURN رسیده‌ایم"), "missing quota message");
  assert(!body.includes("secret"), "token leaked in error response");
});
