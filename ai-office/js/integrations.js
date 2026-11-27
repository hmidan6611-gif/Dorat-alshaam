// Connections to outside services through the viewer's own claude.ai connectors (no keys in this page).
// Each integration lists the connector name and the tools the office uses. Anything that sends, publishes,
// pays or calls goes through the approvals box first (see approvals.js).
import { emit } from './util.js';

export const INTEGRATIONS = {
  gmail: { label: 'Gmail', server: 'Gmail', tools: ['search_threads', 'create_draft', 'send_message'], about: 'قراءة البريد، كتابة مسودات، وإرسال رسائل بعد موافقتك' },
  drive: { label: 'Google Drive', server: 'Google Drive', tools: ['search_files', 'create_file'], about: 'البحث في الملفات وحفظ مخرجات الوكلاء بعد موافقتك' },
  phone: { label: 'مكالمات Bland', server: 'blan', tools: ['list_phone_numbers', 'send_call', 'get_call_log'], about: 'مكالمات هاتفية حقيقية لوكلاء المبيعات والدعم، ولا تُجرى إلا بعد موافقتك' },
  calendar: { label: 'التقويم', server: '', tools: [], about: 'غير متصل بعد: أضف موصل التقويم في إعدادات الموصلات في claude.ai' },
  slack: { label: 'Slack', server: '', tools: [], about: 'غير متصل بعد: أضف موصل Slack في إعدادات الموصلات في claude.ai' },
};
// what the page declares to the artifact runtime (kept in one place)
export const MCP_MANIFEST = Object.values(INTEGRATIONS).filter(i => i.server).map(i => ({ server: i.server, tools: i.tools }));

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
  const r = await mcp.callTool(i.server, tool, input);
  status[id] = 'ready'; emit('integrations-changed');
  return r.payload ?? r.json ?? r.content?.map(c => c.text).join('\n');
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
