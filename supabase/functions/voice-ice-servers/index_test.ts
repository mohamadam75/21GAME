import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleRequest } from "./index.ts";

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
  assertEquals(response.status, 200);
  assertEquals(capturedUrl, "https://turnix.io/api/v1/credentials/ice");
  const headers = new Headers(capturedInit?.headers);
  assertEquals(headers.get("Authorization"), "Bearer " + secret);
  assertEquals(headers.get("X-TURN-CLIENT-IP"), "203.0.113.8");
  assertEquals(JSON.parse(String(capturedInit?.body)), {
    ttl: "3600", room: "table7", initiator_client: "clientabc",
  });
  assertEquals(result.iceServers, iceServers);
  assertEquals(result.expiresAt, "2026-12-01T12:00:00.000Z");
  assertEquals(JSON.stringify(result).includes(secret), false);
});

Deno.test("missing authentication is rejected before calling Turnix", async () => {
  const response = await handleRequest(new Request("https://example.test", { method: "POST" }), {
    token: "unused",
    fetchImpl: async () => { throw new Error("must not call provider"); },
  });
  assertEquals(response.status, 401);
});

Deno.test("Turnix 429 maps to 503 without returning provider details", async () => {
  const response = await handleRequest(new Request("https://example.test", {
    method: "POST", headers: { Authorization: jwt() }, body: "{}",
  }), {
    token: "secret",
    fetchImpl: async () => new Response(JSON.stringify({ error: "quota", limit: 10, used: 10 }), { status: 429 }),
  });
  assertEquals(response.status, 503);
  const body = await response.text();
  assertStringIncludes(body, "به حد مجاز استفاده TURN رسیده‌ایم");
  assertEquals(body.includes("secret"), false);
});
