// Budgets: each agent has a daily limit of Claude requests and text volume. You get a warning near the limit,
// and work stops at the limit until you raise it. These are counts made by this page, not your real bill.
import { el, button, emit } from './util.js';
import { byKey } from './state.js';
import { saveAgentState } from './agents.js';
import { notify } from './notify.js';
import { openModal } from './modal.js';

export const DEFAULT_BUDGET = { requests: 40, kchars: 250 }; // per agent per day; kchars = thousands of characters in + out
const today = () => new Date().toISOString().slice(0, 10);
export function usageOf(ag) {
  const u = ag.a.usage;
  if (!u || u.d !== today()) ag.a.usage = { d: today(), req: 0, chars: 0, warned: false };
  return ag.a.usage;
}
export const budgetOf = ag => ({ ...DEFAULT_BUDGET, ...(ag.a.budget || {}) });
export function usageShare(ag) { const u = usageOf(ag), b = budgetOf(ag); return Math.max(u.req / b.requests, u.chars / 1000 / b.kchars); }

/** Call before asking Claude on an agent's behalf. Throws {code:'budget'} when the day's limit is reached. */
export function checkBudget(ag) {
  if (!ag) return;
  if (usageShare(ag) >= 1) {
    const e = { code: 'budget', message: `وصل ${ag.a.name} إلى حد الاستهلاك اليومي. ارفع الحد من لوحته (الميزانية) ليكمل.` };
    throw e;
  }
}
/** Call after the answer arrives. */
export function recordUsage(ag, inChars, outChars) {
  if (!ag) return;
  const u = usageOf(ag); u.req++; u.chars += (inChars || 0) + (outChars || 0);
  if (!u.warned && usageShare(ag) >= 0.8) { u.warned = true; notify({ text: `${ag.a.name} استهلك ${Math.round(usageShare(ag) * 100)}% من حده اليومي.`, kind: 'info', agentKey: ag.a.key }); }
  saveAgentState(ag); emit('usage-changed', ag);
}
export function restoreUsage(states) {
  (states || []).forEach(st => { const ag = byKey(st.id); if (!ag) return; if (st.usage?.d) ag.a.usage = st.usage; if (st.budget) ag.a.budget = st.budget; });
}
export function usageCard(ag) {
  const u = usageOf(ag), b = budgetOf(ag), share = usageShare(ag);
  const box = el('div', 'meter'); box.style.setProperty('--mc', share >= 1 ? '#ff6b6b' : share >= 0.8 ? '#ffc53d' : '#7b96ff');
  const bar = el('div', 'bar'); bar.append(el('i')); bar.firstChild.style.width = Math.min(100, Math.round(share * 100)) + '%';
  box.append(el('span', '', 'الاستهلاك'), bar, button('linkish', `${u.req}/${b.requests} طلب`, () => editBudget(ag)));
  return box;
}
export function editBudget(ag) {
  const b = budgetOf(ag), u = usageOf(ag);
  const req = el('input'); req.type = 'number'; req.min = 1; req.max = 1000; req.value = b.requests; req.id = 'bud-req';
  const kc = el('input'); kc.type = 'number'; kc.min = 10; kc.max = 5000; kc.value = b.kchars; kc.id = 'bud-kc';
  const f = (l, n) => { const x = el('label', 'field', l); x.append(n); return x; };
  const frag = document.createDocumentFragment();
  frag.append(el('p', 'lead', `اليوم: ${u.req} طلب و${Math.round(u.chars / 1000)} ألف حرف. يصلك تنبيه عند 80%، ويتوقف ${ag.a.name} عن طلب Claude عند 100% حتى ترفع الحد. الأرقام تقديرية من هذه الصفحة وليست فاتورتك الفعلية.`),
    f('حد الطلبات في اليوم', req), f('حد النص في اليوم (بالألف حرف)', kc));
  let close;
  const save = button('btn primary', 'احفظ الحد', () => { ag.a.budget = { requests: Math.max(1, +req.value || 1), kchars: Math.max(10, +kc.value || 10) }; usageOf(ag).warned = false; saveAgentState(ag); emit('usage-changed', ag); close(); });
  close = openModal(`ميزانية ${ag.a.name}`, frag, [save]);
}
