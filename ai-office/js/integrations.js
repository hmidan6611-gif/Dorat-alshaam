// Connections to outside services through the viewer's own claude.ai connectors (no keys in this page).
// Each integration lists the connector name and the tools the office uses. Anything that sends, publishes,
// pays or calls goes through the approvals box first (see approvals.js).
import { emit } from './util.js';

const COMPOSIO = 'Composio';
export const INTEGRATIONS = {
  gmail: { label: 'Gmail', server: 'Gmail', tools: ['search_threads', 'create_draft', 'send_message'], about: 'قراءة البريد، كتابة مسودات، وإرسال رسائل بعد موافقتك' },
  drive: { label: 'Google Drive', server: 'Google Drive', tools: ['search_files', 'create_file'], about: 'البحث في الملفات وحفظ مخرجات الوكلاء بعد موافقتك' },
  phone: { label: 'مكالمات Bland', server: 'blan', tools: ['list_phone_numbers', 'send_call', 'get_call_log'], about: 'مكالمات هاتفية حقيقية لوكلاء المبيعات والدعم، ولا تُجرى إلا بعد موافقتك' },
  // Google Calendar and Slack go through the viewer's Composio connector: one claude.ai connector that runs
  // the app tools with the viewer's own Composio accounts (connected once from the services screen).
  calendar: { label: 'Google Calendar', server: COMPOSIO, toolkit: 'googlecalendar', about: 'قراءة مواعيدك وحجز الاجتماعات في تقويمك بعد موافقتك (عبر Composio)' },
  slack: { label: 'Slack', server: COMPOSIO, toolkit: 'slack', about: 'إرسال تحديثات الفريق إلى قنوات Slack بعد موافقتك (عبر Composio)' },
};
// what the page declares to the artifact runtime (kept in one place)
export const MCP_MANIFEST = [
  ...Object.values(INTEGRATIONS).filter(i => i.server && !i.toolkit).map(i => ({ server: i.server, tools: i.tools })),
  { server: COMPOSIO, tools: ['COMPOSIO_MULTI_EXECUTE_TOOL', 'COMPOSIO_MANAGE_CONNECTIONS'] },
];

let mcp = null;
const status = {}; // id -> 'unknown' | 'ready' | 'off' | 'none'
Object.keys(INTEGRATIONS).forEach(k => { status[k] = INTEGRATIONS[k].server ? 'unknown' : 'none'; });
export const integrationStatus = id => status[id];

export async function initIntegrations() {
  if (!window.claude?.use) { Object.keys(status).forEach(k => { if (status[k] === 'unknown') status[k] = 'off'; }); return; }
  try { mcp = await window.claude.use('mcp'); } catch { mcp = null; }
  if (!mcp) Object.keys(status).forEach(k => { if (status[k] === 'unknown') status[k] = 'off'; });
  emit('integrations-changed');
}
/** Check which connectors this viewer has; asks for consent the first time, so call it from a click. */
export async function checkConnections() {
  if (!mcp) return status;
  await Promise.all(Object.entries(INTEGRATIONS).filter(([, i]) => i.server).map(async ([k, i]) => {
    if (i.toolkit) { status[k] = await composioActive(i.toolkit); return; }
    try { const r = await mcp.listTools(i.server); status[k] = (r?.tools || r || []).length ? 'ready' : 'off'; }
    catch { status[k] = 'off'; }
  }));
  emit('integrations-changed');
  return status;
}
/** Call a connector tool; returns the parsed payload. Throws {code, message}. */
export async function callIntegration(id, tool, input) {
  const i = INTEGRATIONS[id];
  if (!i?.server) throw { code: 'server_not_connected', message: `${i?.label || id} غير متصل.` };
  if (!mcp) throw { code: 'capability_disabled', message: 'الربط بالخدمات الخارجية غير متاح في هذه الصفحة. افتحها من claude.ai.' };
  if (i.toolkit) return composioRun(id, tool, input);
  const r = await mcp.callTool(i.server, tool, input);
  status[id] = 'ready'; emit('integrations-changed');
  return r.payload ?? r.json ?? r.content?.map(c => c.text).join('\n');
}

/* ------------------------------------------------------------------ Composio (Calendar, Slack) */
const payloadOf = r => { let p = r?.payload ?? r?.json ?? r?.content?.map(c => c.text).join('\n'); if (typeof p === 'string') { try { p = JSON.parse(p); } catch { /* text */ } } return p; };
async function composioConnections(toolkit, action) {
  const r = await mcp.callTool(COMPOSIO, 'COMPOSIO_MANAGE_CONNECTIONS', { toolkits: [{ name: toolkit, action }] });
  const p = payloadOf(r); return p?.data?.results?.[toolkit] || p?.results?.[toolkit] || p?.data || p || {};
}
async function composioActive(toolkit) {
  try { const t = await composioConnections(toolkit, 'list'); return (t.accounts || []).some(a => /active/i.test(a?.status || '')) ? 'ready' : 'off'; }
  catch { return 'off'; }
}
/** Start connecting a Composio app; resolves an https link the viewer opens to sign in, or null. */
export async function composioConnect(id) {
  const i = INTEGRATIONS[id]; if (!mcp || !i?.toolkit) return null;
  const t = await composioConnections(i.toolkit, 'add');
  const find = o => { if (!o || typeof o !== 'object') return null; for (const [k, v] of Object.entries(o)) { if (typeof v === 'string' && /url|link/i.test(k) && v.startsWith('https://')) return v; const d = find(v); if (d) return d; } return null; };
  return find(t);
}
async function composioRun(id, slug, args) {
  if (!mcp) throw { code: 'capability_disabled', message: 'الربط بالخدمات الخارجية غير متاح في هذه الصفحة. افتحها من claude.ai.' };
  const r = await mcp.callTool(COMPOSIO, 'COMPOSIO_MULTI_EXECUTE_TOOL', { tools: [{ tool_slug: slug, arguments: args }], sync_response_to_workbench: false, thought: 'Deskhive office action approved by the user' });
  const p = payloadOf(r);
  const res = p?.data?.results?.[0] || p?.results?.[0] || p?.data || p;
  const inner = res?.response ?? res;
  const err = inner?.error || (inner?.successful === false && (inner?.data?.error || 'failed')) || (p?.successful === false && p?.error);
  if (err) {
    const msg = typeof err === 'string' ? err : JSON.stringify(err);
    if (/connect|auth|account/i.test(msg)) { status[id] = 'off'; emit('integrations-changed'); throw { code: 'server_not_connected', message: `${INTEGRATIONS[id].label} غير مربوط في Composio بعد. اربطه من «الخدمات المربوطة».` }; }
    throw { code: 'tool_error', message: `رفضت الخدمة الطلب: ${msg.slice(0, 160)}` };
  }
  status[id] = 'ready'; emit('integrations-changed');
  return inner?.data ?? inner;
}
export const MCP_ERR = {
  server_not_connected: 'الموصل غير متصل. اربطه من إعدادات الموصلات في claude.ai ثم أعد المحاولة.',
  server_not_found: 'الموصل غير موجود في حسابك.',
  needs_reauth: 'انتهت صلاحية الربط. أعد تسجيل الدخول للموصل من claude.ai.',
  not_granted: 'لم يُسمح للصفحة باستخدام هذا الموصل.',
  consent_required: 'يحتاج الموصل إذنك أولاً.',
  blocked_by_policy: 'هذه الأداة ممنوعة في حسابك.',
  rate_limited: 'كثرة طلبات. انتظر قليلاً ثم أعد المحاولة.',
  tool_error: 'رفضت الخدمة الطلب.',
};
export const mcpErrText = e => MCP_ERR[e?.code] || e?.message || 'تعذّر الاتصال بالخدمة.';
