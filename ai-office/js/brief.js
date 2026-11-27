// Morning brief: the first time you open the office each day, the CEO greets you with what got done since
// your last visit, what waits for your approval, what is due today or late, and the plan for today.
import { el, button, clip } from './util.js';
import { S, byKey } from './state.js';
import { AI, aiReady, identity } from './ai.js';
import { showBubble } from './agents.js';
import { focusOn, THREE } from './scene.js';
import { openModal } from './modal.js';
import { speakAs, canSpeak } from './voice.js';
import { pending } from './approvals.js';
import { isOverdue, isDueToday, projectById } from './projects.js';
import { describe } from './routines.js';
import { checkBudget, recordUsage } from './usage.js';

const KEY = 'deskhive:brief', AUTO = 'deskhive:brief-auto';
const get = k => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private window */ } };
export const briefAuto = () => get(AUTO) !== '0';
export const setBriefAuto = on => set(AUTO, on ? '1' : '0');

function greeting() { const h = new Date().getHours(); return h < 12 ? 'صباح الخير' : h < 17 ? 'مساء الخير' : 'مساء النور'; }

/** The facts, gathered from the office (no AI needed). */
function facts() {
  const since = Number(get(KEY + ':at')) || Date.now() - 86400000;
  const done = S.tasks.filter(t => t.status === 'done' && (t.doneAt || 0) > since);
  const review = S.tasks.filter(t => t.status === 'review');
  const late = S.tasks.filter(isOverdue), today = S.tasks.filter(isDueToday);
  const doing = S.tasks.filter(t => t.status === 'doing' || (t.status === 'todo' && t.chain.length && !t.paused));
  const stuck = S.tasks.filter(t => t.status === 'todo' && t.paused);
  const routines = S.routines.filter(r => r.enabled);
  const nameOf = t => byKey(t.chain[t.chain.length - 1])?.a.name || '';
  const proj = t => projectById(t.projectId)?.name;
  return {
    since, done, review, late, today, doing, stuck, approvals: pending(), routines,
    lines: [
      done.length ? `أُنجز منذ آخر زيارة: ${done.slice(0, 6).map(t => `«${clip(t.title, 40)}» (${nameOf(t)})`).join('، ')}` : 'لم تُنجز مهام جديدة منذ آخر زيارة.',
      review.length ? `بانتظار موافقتك على العمل: ${review.slice(0, 5).map(t => `«${clip(t.title, 40)}»`).join('، ')}` : '',
      pending().length ? `في صندوق الموافقات: ${pending().slice(0, 5).map(a => clip(a.title, 50)).join('، ')}` : '',
      late.length ? `متأخرة: ${late.slice(0, 5).map(t => `«${clip(t.title, 40)}»${proj(t) ? ` في ${proj(t)}` : ''}`).join('، ')}` : '',
      today.length ? `تسليم اليوم: ${today.slice(0, 5).map(t => `«${clip(t.title, 40)}»`).join('، ')}` : '',
      doing.length ? `قيد العمل الآن: ${doing.length} مهام` : '',
      stuck.length ? `متوقفة تحتاج نظرة: ${stuck.slice(0, 3).map(t => `«${clip(t.title, 40)}»`).join('، ')}` : '',
      routines.length ? `المهام المتكررة: ${routines.slice(0, 4).map(r => `${r.title} (${describe(r)})`).join('، ')}` : '',
      S.goals.some(g => !['done', 'error'].includes(g.status)) ? `أهداف جارية: ${S.goals.filter(g => !['done', 'error'].includes(g.status)).slice(0, 3).map(g => `«${clip(g.text, 50)}»`).join('، ')}` : '',
    ].filter(Boolean),
  };
}

/** Show the brief (from a click, or automatically once a day). */
export async function openBrief(auto = false) {
  const boss = byKey('ceo'); if (!boss) return;
  const f = facts();
  set(KEY, new Date().toDateString()); set(KEY + ':at', String(Date.now()));
  if (S.viewFloor === boss.a.floorId && !auto) focusOn(boss.robot.getWorldPosition(new THREE.Vector3()).setY(1), 1.6);
  showBubble(boss, `${greeting()}! عندي لك إيجاز`, 3500);
  const frag = document.createDocumentFragment();
  const out = el('div', 'doc brief', f.lines.map(l => '• ' + l).join('\n'));
  const chips = el('div', 'briefchips');
  const chip = (n, label, cls = '') => { if (n) chips.append(el('span', 'bchip ' + cls, `${n} ${label}`)); };
  chip(f.done.length, 'أُنجزت'); chip(f.review.length + f.approvals.length, 'تنتظرك', 'wait'); chip(f.late.length, 'متأخرة', 'late'); chip(f.today.length, 'تسليم اليوم');
  frag.append(el('p', 'lead', `${greeting()}، أنا نادر. هذا وضع المكتب${auto ? ' اليوم' : ''}:`), chips, out);
  let text = f.lines.join('. ');
  const listen = button('btn', '▶ استمع', () => speakAs(boss.a, `${greeting()}. ${text}`)); listen.hidden = !canSpeak();
  const tasks = button('btn primary', 'افتح المهام', () => { close(); document.getElementById('tab-tasks')?.click(); });
  const off = el('label', 'check'); const cb = el('input'); cb.type = 'checkbox'; cb.checked = briefAuto(); cb.onchange = () => setBriefAuto(cb.checked);
  off.append(cb, document.createTextNode('اعرض الإيجاز تلقائياً أول كل يوم')); frag.append(off);
  const close = openModal('إيجاز اليوم', frag, [listen, tasks]);
  if (!aiReady()) return;
  // Claude turns the facts into a short, human brief with priorities
  try {
    checkBudget(boss);
    const prompt = `${identity(boss)}

اكتب للمستخدم إيجاز ${new Date().getHours() < 12 ? 'الصباح' : 'اليوم'} عن مكتبه، بصوتك كمدير تنفيذي، من هذه الحقائق فقط:
${f.lines.map(l => '- ' + l).join('\n')}

- 4 إلى 7 أسطر قصيرة، كل سطر يبدأ بـ • ونص عادي بلا Markdown.
- ابدأ بأهم شيء يحتاج قراره، ثم ما أُنجز، ثم خطة اليوم المقترحة بالأولوية.
- لا تخترع مهاماً أو أرقاماً غير موجودة. إذا كان اليوم هادئاً فاقترح هدفاً مفيداً للفريق في جملة.`;
    const r = await AI.sample(prompt, { modelTier: 'quick', onText: ({ text: x }) => { out.textContent = x; } });
    text = r.text.trim().replace(/•\s*/g, ''); out.textContent = r.text.trim(); recordUsage(boss, prompt.length, r.text.length);
  } catch { out.textContent = f.lines.map(l => '• ' + l).join('\n'); }
}

/** Called once the office has loaded its saved work. */
export function maybeBrief() {
  if (!briefAuto() || get(KEY) === new Date().toDateString()) return;
  if (!S.tasks.length && !S.goals.length) { set(KEY, new Date().toDateString()); return; } // nothing to report yet
  setTimeout(() => { if (!document.querySelector('.modal')) openBrief(true); }, 7000);
}
