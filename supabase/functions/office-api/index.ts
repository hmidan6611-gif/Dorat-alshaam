// Server side of the standalone office (GitHub Pages + Supabase).
// Holds the secrets (ANTHROPIC_API_KEY, COMPOSIO_API_KEY): they are set in Supabase → Edge Functions → Secrets,
// never in the page. Every call needs a signed-in user; optional ALLOWED_EMAILS limits who may use the paid APIs,
// and DAILY_REQUEST_LIMIT caps requests per user per day.
import { createClient } from "npm:@supabase/supabase-js@2.119.2";
import Anthropic from "npm:@anthropic-ai/sdk@1.14.0";
import { Composio } from "npm:@composio/core@0.32.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const env = (k: string) => Deno.env.get(k) || "";
const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "content-type": "application/json" } });

// only what the office uses
const TOOLKITS = new Set(["gmail", "googledrive", "googlecalendar", "slack"]);
const SLUGS = new Set(["GMAIL_SEND_EMAIL", "GMAIL_FETCH_EMAILS", "GOOGLEDRIVE_CREATE_FILE_FROM_TEXT", "GOOGLECALENDAR_CREATE_EVENT", "GOOGLECALENDAR_EVENTS_LIST_ALL_CALENDARS", "SLACK_SEND_MESSAGE"]);
const EFFORT: Record<string, string> = { quick: "low", default: "medium", complex: "high" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ code: "bad_request" }, 405);
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: auth } = await admin.auth.getUser(token);
  const user = auth?.user;
  if (!user) return json({ code: "unauthorized", message: "سجّل الدخول أولاً." }, 401);
  const allowed = env("ALLOWED_EMAILS").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const permitted = !allowed.length || allowed.includes((user.email || "").toLowerCase());
  let body: Record<string, any>;
  try { body = await req.json(); } catch { return json({ code: "bad_request" }, 400); }

  if (body.route === "status") return json({ ai: !!env("ANTHROPIC_API_KEY") && permitted, composio: !!env("COMPOSIO_API_KEY") && permitted, permitted });
  if (!permitted) return json({ code: "not_granted", message: "حسابك غير مسموح له باستخدام الذكاء والخدمات في هذا المكتب." }, 403);
  const cap = Number(env("DAILY_REQUEST_LIMIT")) || 300;
  const { data: ok, error } = await admin.rpc("bump_usage", { p_user: user.id, p_cap: cap });
  if (error) return json({ code: "unavailable", message: "تعذّر التحقق من الاستخدام." }, 503);
  if (ok === false) return json({ code: "rate_limited", message: "وصلت إلى الحد اليومي للطلبات. جرّب غداً." }, 429);

  if (body.route === "sample") return sample(body);
  if (body.route === "composio") return composio(user.id, body);
  return json({ code: "bad_request" }, 400);
});

/** Claude: one round of a conversation, streamed back as NDJSON lines {t} (text delta) then {final} or {error}. */
function sample(body: Record<string, any>) {
  if (!env("ANTHROPIC_API_KEY")) return json({ code: "capability_disabled", message: "مفتاح Claude غير مضبوط في الخادم." }, 503);
  if (!Array.isArray(body.messages) || !body.messages.length) return json({ code: "bad_request" }, 400);
  const client = new Anthropic({ apiKey: env("ANTHROPIC_API_KEY") });
  const params: Record<string, unknown> = {
    model: "claude-opus-5-5",
    max_tokens: 32000,
    messages: body.messages,
    output_config: { effort: EFFORT[body.tier] || "medium" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  };
  if (typeof body.system === "string" && body.system) params.system = body.system;
  if (Array.isArray(body.tools) && body.tools.length) params.tools = body.tools.slice(0, 12).map((t: any) => ({ name: String(t.name), description: String(t.description || ""), input_schema: t.input_schema || { type: "object", properties: {} } }));
  const enc = new TextEncoder();
  // deno-lint-ignore no-explicit-any
  const stream = (client.beta.messages as any).stream(params);
  const out = new ReadableStream({
    async start(c) {
      const send = (o: unknown) => c.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      try {
        stream.on("text", (d: string) => send({ t: d }));
        const m = await stream.finalMessage();
        send({ final: { content: m.content, stop_reason: m.stop_reason, usage: m.usage } });
      } catch (e: any) {
        const status = e?.status;
        send({ error: { code: status === 429 ? "rate_limited" : status === 400 ? "invalid_request" : status === 401 ? "capability_disabled" : "unavailable", message: String(e?.message || e).slice(0, 300) } });
      }
      c.close();
    },
    cancel() { try { stream.abort(); } catch { /* already done */ } },
  });
  return new Response(out, { headers: { ...CORS, "content-type": "application/x-ndjson" } });
}

/** Composio with the server's key, acting as this signed-in user (their own connected accounts). */
async function composio(userId: string, body: Record<string, any>) {
  if (!env("COMPOSIO_API_KEY")) return json({ code: "server_not_connected", message: "مفتاح Composio غير مضبوط في الخادم." }, 503);
  const cx = new Composio({ apiKey: env("COMPOSIO_API_KEY") });
  try {
    if (body.action === "execute") {
      const slug = String(body.slug || "");
      if (!SLUGS.has(slug)) return json({ code: "blocked_by_policy", message: "هذه الأداة غير مسموحة." }, 403);
      const r = await cx.tools.execute(slug, { userId, arguments: body.arguments || {}, dangerouslySkipVersionCheck: true });
      return json({ successful: r.successful, data: r.data, error: r.error });
    }
    const toolkit = String(body.toolkit || "");
    if (!TOOLKITS.has(toolkit)) return json({ code: "blocked_by_policy", message: "هذه الخدمة غير مسموحة." }, 403);
    if (body.action === "list") {
      const r = await cx.connectedAccounts.list({ userIds: [userId], toolkitSlugs: [toolkit] });
      return json({ accounts: (r.items || []).map((i: any) => ({ id: i.id, status: i.status })) });
    }
    if (body.action === "connect") {
      const r = await cx.toolkits.authorize(userId, toolkit);
      return json({ redirect_url: r.redirectUrl });
    }
    return json({ code: "bad_request" }, 400);
  } catch (e: any) {
    return json({ code: "tool_error", message: String(e?.message || e).slice(0, 300) }, 502);
  }
}
