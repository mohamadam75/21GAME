// Supabase Edge Function: returns short-lived Twilio TURN/STUN credentials.
 // Deploy with: supabase functions deploy voice-ice-servers
 // Required secrets: TWILIO_ACCOUNT_SID, TWILIO_API_KEY, TWILIO_API_SECRET
 // Supabase Edge Functions must keep JWT verification enabled for this function.

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

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  // The Supabase Edge gateway validates the user's JWT (verify_jwt=true).
  if (!request.headers.get("Authorization")?.startsWith("Bearer ")) {
    return json({ error: "authentication_required" }, 401);
  }

  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const apiKey = Deno.env.get("TWILIO_API_KEY");
  const apiSecret = Deno.env.get("TWILIO_API_SECRET");
  if (!accountSid || !apiKey || !apiSecret) {
    return json({ error: "turn_service_not_configured" }, 503);
  }

  try {
    const credentials = btoa(`${apiKey}:${apiSecret}`);
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Tokens.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ Ttl: "3600" }),
      },
    );

    if (!response.ok) {
      // Do not return Twilio's raw response or credentials to the browser.
      console.error("Twilio NTS token request failed:", response.status);
      return json({ error: "turn_provider_unavailable" }, 502);
    }

    const payload = await response.json();
    if (!Array.isArray(payload.ice_servers) ||
        !payload.ice_servers.some((server: { urls?: string | string[] }) =>
          (Array.isArray(server.urls) ? server.urls : [server.urls || ""])
            .some((url) => url.startsWith("turn:"))
        )) {
      return json({ error: "invalid_turn_response" }, 502);
    }

    return json({ iceServers: payload.ice_servers, ttl: 3600 });
  } catch (error) {
    console.error("TURN token request error:", error);
    return json({ error: "turn_provider_unavailable" }, 502);
  }
});
