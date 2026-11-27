// The CEO: you give a big goal; the CEO plans it with Claude, splits it into tasks for the right specialists,
// walks to each office to hand them over, follows progress, then writes a final report for your approval.
import { $, el, button, uid, wait, clip, emit, on, fmtTime } from './util.js';
import { S, byKey, isFemale } from './state.js';
import { put } from './store.js';
import { AI, aiReady, identity, errText, noteFatal } from './ai.js';
import { goVisit, goHome, goWork, showBubble, nudgeMood } from './agents.js';
import { handoffBeam, stormEvent } from './scene.js';
import { createTask, schedule, taskById } from './tasks.js';
import { addEvent } from './log.js';
import { notify, registerActions } from './notify.js';
import { openModal, openFile } from './modal.js';
import { setLive, endLive } from './holo.js';
import { remember } from './growth.js';
import { checkBudget, recordUsage } from './usage.js';

export const ceo = () => byKey('ceo');
const saveGoal = g => { g.updatedAt = Date.now(); put('goals', g.id, g); emit('goals-changed', g); };
const STATUS = { planning: 'يخطط', handing: 'يوزّع المهام', running: 'الفريق يعمل', reporting: 'يكتب التقرير', review: 'بانتظار موافقتك', done: 'منجز', error: 'متوقف' };
const goalTasks = g => g.taskIds.map(taskById).filter(Boolean);
export const goalProgress = g => { const ts = goalTasks(g); return ts.length ? ts.filter(t => t.status === 'done').length / ts.length : 0; };

/* ------------------------------------------------------------------ planning */
function planPrompt(g, boss) {
  const team = S.agents.filter(o => o !== boss).map(o => `- key: ${o.a.key} | ${o.a.name} | ${o.a.role}${o.a.desc ? ' | ' + o.a.desc : ''}`).join('\n');
  return `${identity(boss, g.text)}

أعطاك المستخدم هدفاً كبيراً. خطّط لتنفيذه بفريقك:
«${g.text}»

أعضاء فريقك (لا تُسند مهمة لنفسك):
${team}

قسّم الهدف إلى 3 إلى 6 مهام عملية، كل مهمة لعضو واحد يناسب تخصصه تماماً.
- اكتب لكل مهمة عنواناً قصيراً ووصفاً واضحاً لما يجب تسليمه بالضبط.
- إذا احتاجت مهمة نتيجة مهمة أخرى فاذكر رقمها في after (الترقيم يبدأ من 0)، وإلا اجعلها فارغة حتى تعمل المهام بالتوازي.
- عربية بسيطة، نص عادي بلا Markdown.

أعد JSON فقط بهذا الشكل:
{"summary":"جملتان عن الخطة","tasks":[{"title":"...","desc":"...","owner":"مفتاح العضو","after":[0]}]}`;
}

export async function startGoal(text) {
  const boss = ceo(); if (!boss) return null;
  const g = { id: uid('g'), text, status: 'planning', summary: '', taskIds: [], reportId: '', feedback: '', error: '', at: Date.now() };
  S.goals.unshift(g); saveGoal(g);
  addEvent(boss, `استلم هدفاً جديداً: «${clip(text, 80)}»`);
  runGoal(g);
  return g;
}

async function runGoal(g) {
  const boss = ceo(); if (!boss) return;
  if (!aiReady()) { g.status = 'error'; g.error = 'المدير يحتاج Claude ليخطط. افتح الصفحة من claude.ai واسمح لها باستخدام Claude.'; saveGoal(g); return; }
  await goWork(boss);
  boss.task = 'goal:' + g.id; boss.progress = 0.05; emit('agents-changed');
  showBubble(boss, 'أفكّر في الخطة…', 3000);
  setLive(boss, { title: g.text, text: 'أحلل الهدف وأختار الأنسب من الفريق لكل جزء…', kind: 'خطة' });
  let res;
  const tick = setInterval(() => { boss.progress = Math.min(0.9, boss.progress + 0.02); }, 1000);
  try {
    checkBudget(boss);
    res = await AI.sample.json(planPrompt(g, boss), { modelTier: 'complex', onText: ({ text }) => setLive(boss, { text }) });
  } catch (e) {
    clearInterval(tick); boss.task = null; boss.progress = -1; endLive(boss, 3000);
    noteFatal(e); g.status = 'error'; g.error = errText(e); saveGoal(g);
    notify({ text: `${boss.a.name}: تعذّر التخطيط لـ«${clip(g.text, 60)}». ${g.error}`, kind: 'error', agentKey: 'ceo' });
    return;
  }
  clearInterval(tick); recordUsage(boss, 4000, JSON.stringify(res || {}).length);
  const items = (Array.isArray(res?.tasks) ? res.tasks : []).filter(x => x && typeof x.title === 'string' && byKey(x.owner) && x.owner !== 'ceo').slice(0, 6);
  if (!items.length) { boss.task = null; boss.progress = -1; endLive(boss); g.status = 'error'; g.error = 'جاءت الخطة بشكل غير مفهوم. أعد المحاولة.'; saveGoal(g); return; }
  g.summary = typeof res.summary === 'string' ? res.summary.slice(0, 400) : '';
  setLive(boss, { text: `الخطة:\n${g.summary}\n\n${items.map((x, i) => `${i + 1}. ${x.title} — ${byKey(x.owner).a.name}`).join('\n')}`, kind: 'خطة' });
  // create the tasks on hold; they start once the CEO has handed each one over
  const ids = [];
  items.forEach((x, i) => {
    const deps = (Array.isArray(x.after) ? x.after : []).filter(n => Number.isInteger(n) && n >= 0 && n < i).map(n => ids[n]);
    const t = createTask({ title: clip(x.title.trim(), 110), desc: typeof x.desc === 'string' ? x.desc.slice(0, 1200) : '', chain: [x.owner], approval: false, goalId: g.id, deps, hold: true });
    ids.push(t.id);
  });
  g.taskIds = ids; g.status = 'handing'; saveGoal(g);
  boss.progress = -1; boss.task = null; endLive(boss, 15000);
  addEvent(boss, `قسّم «${clip(g.text, 60)}» إلى ${ids.length} مهام ويوزعها على الفريق`);

  // walk to each office and hand the task over
  for (const id of ids) {
    const t = taskById(id); if (!t) continue;
    const who = byKey(t.chain[0]); if (!who) continue;
    await goVisit(boss, who, `مهمة لـ${who.a.name}`, true);
    handoffBeam(boss, who, 2.6);
    showBubble(boss, `«${clip(t.title, 30)}» عليك يا ${who.a.name}`, 2600);
    await wait(1300);
    showBubble(who, isFemale(who.a) ? 'تمام، سأبدأ' : 'تمام، سأبدأ', 2200); who.kick = 1;
    t.hold = false; t.updatedAt = Date.now(); put('tasks', t.id, t); emit('tasks-changed', t);
    schedule();
    await wait(1200);
  }
  goHome(boss);
  g.status = 'running'; saveGoal(g);
  check(g);
}

/* ------------------------------------------------------------------ following progress */
on('task-done', t => {
  if (!t.goalId) return;
  const g = S.goals.find(x => x.id === t.goalId); if (!g) return;
  const boss = ceo(), who = byKey(t.chain[t.chain.length - 1]);
  if (boss && who) { showBubble(boss, `أحسنت يا ${who.a.name}`, 2400); boss.kick = 1; nudgeMood(who, 4); }
  emit('goals-changed', g);
  check(g);
});
function check(g) {
  if (g.status !== 'running') return;
  const ts = goalTasks(g);
  if (ts.length && ts.every(t => t.status === 'done')) writeReport(g);
}

async function writeReport(g) {
  const boss = ceo(); if (!boss) return;
  g.status = 'reporting'; saveGoal(g);
  await goWork(boss);
  boss.task = 'goal:' + g.id; boss.progress = 0.05; emit('agents-changed');
  showBubble(boss, 'أجمع النتائج في تقرير', 2600);
  const files = goalTasks(g).map(t => S.files.find(f => f.id === t.outputs[t.outputs.length - 1])).filter(Boolean);
  const prev = g.reportId && S.files.find(f => f.id === g.reportId);
  const prompt = `${identity(boss)}

أنت تسلّم المستخدم التقرير النهائي للهدف: «${g.text}»
خطتك كانت: ${g.summary}

هذا ما أنجزه الفريق:
${files.map(f => `\n— ${f.agentName}: «${f.title}»\n${clip(f.content, 6000)}`).join('\n')}
${g.feedback && prev ? `\nملاحظات المستخدم على نسختك السابقة من التقرير: ${g.feedback}\nطبّقها في هذه النسخة.\n` : ''}
اكتب تقريراً تنفيذياً متكاملاً:
- ابدأ بسطر عنوان، ثم ملخص من 3 جمل للنتيجة.
- ثم أهم المخرجات مجمّعة ومنسّقة (لا تكرر كل شيء حرفياً، اختر الأهم وادمجه في خطة واحدة متماسكة).
- ثم الخطوات التالية المقترحة مرقمة، ومن المسؤول عن كل خطوة من الفريق.
- نص عادي بلا Markdown، بالعربية، من 300 إلى 900 كلمة.`;
  let text = '';
  const tick = setInterval(() => { boss.progress = Math.min(0.92, boss.progress + 0.015); }, 1000);
  try {
    checkBudget(boss);
    const r = await AI.sample(prompt, { modelTier: 'complex', cache: false, onText: ({ text: x }) => { setLive(boss, { title: 'التقرير النهائي: ' + g.text, text: x, kind: 'تقرير' }); boss.progress = Math.max(boss.progress, Math.min(0.92, x.length / 4000)); } });
    text = r.text.trim(); recordUsage(boss, prompt.length, text.length);
  } catch (e) {
    clearInterval(tick); boss.task = null; boss.progress = -1; endLive(boss, 3000);
    noteFatal(e); g.status = 'error'; g.error = errText(e); saveGoal(g);
    notify({ text: `${boss.a.name}: تعذّر كتابة التقرير. ${g.error}`, kind: 'error', agentKey: 'ceo' });
    return;
  }
  clearInterval(tick);
  const title = clip((text.split('\n')[0] || 'التقرير النهائي').replace(/^[#*\s]+|[*\s]+$/g, '') || 'التقرير النهائي', 80);
  const file = { id: uid('f'), goalId: g.id, agentKey: 'ceo', agentName: boss.a.name, title, content: text, at: Date.now() };
  S.files.unshift(file); put('files', file.id, file); emit('files-changed', boss);
  g.reportId = file.id; g.feedback = ''; g.status = 'review'; saveGoal(g);
  boss.task = null; boss.progress = -1; endLive(boss);
  addEvent(boss, `سلّم التقرير النهائي لـ«${clip(g.text, 60)}»`);
  stormEvent(boss, boss.a.color, 0.8);
  notify({ text: `${boss.a.name} أنهى «${clip(g.text, 60)}» وسلّمك التقرير النهائي.`, kind: 'goal', taskId: g.id, agentKey: 'ceo' });
}

export function approveGoal(g) {
  if (g.status !== 'review') return;
  g.status = 'done'; g.doneAt = Date.now(); saveGoal(g);
  const boss = ceo(); if (boss) { showBubble(boss, 'شكراً لثقتك!', 2400); nudgeMood(boss, 12); addEvent(boss, `وافقت على تقرير «${clip(g.text, 60)}»`); }
  goalTasks(g).forEach(t => { const o = byKey(t.chain[0]); if (o) nudgeMood(o, 6); });
  emit('goal-approved', g);
}
export function reviseGoal(g) {
  const ta = el('textarea'); ta.rows = 4; ta.id = 'goal-revise'; ta.placeholder = 'مثلاً: ركّز أكثر على الميزانية واختصر المقدمة';
  const frag = document.createDocumentFragment(); frag.append(el('p', 'lead', 'ما الذي تريد تغييره في التقرير؟'), ta);
  let close;
  const go = button('btn primary', 'أرسل للمدير', () => { const v = ta.value.trim(); if (!v) return ta.focus(); g.feedback = v; const b = ceo(); if (b) remember(b, v, 'feedback'); close(); writeReport(g); });
  close = openModal('تعديل التقرير', frag, [go]);
}
registerActions('goal', n => {
  const g = S.goals.find(x => x.id === n.taskId); if (!g || g.status !== 'review') return [];
  const f = S.files.find(x => x.id === g.reportId);
  return [{ label: 'عرض التقرير', cls: 'primary', run: () => f && openFile(f) }, { label: 'موافقة', run: () => approveGoal(g) }, { label: 'طلب تعديل', run: () => reviseGoal(g) }];
});

/* ------------------------------------------------------------------ UI */
export function openNewGoal() {
  const frag = document.createDocumentFragment();
  const ta = el('textarea'); ta.id = 'goal-text'; ta.rows = 4; ta.maxLength = 800; ta.placeholder = 'مثلاً: جهّز حملة تسويق لإطلاق تطبيقنا الجديد خلال شهر';
  const ex = el('div', 'chips'); ex.style.padding = '0';
  ['جهّز حملة تسويق لإطلاق منتج جديد', 'خطة لتقليل شكاوى العملاء 30% خلال ربع سنة', 'دراسة جدوى لفتح فرع في مدينة جديدة'].forEach(x => ex.append(button('', x, () => { ta.value = x; })));
  frag.append(el('p', 'lead', 'اكتب هدفاً كبيراً. سيقسّمه المدير إلى مهام، ويمشي إلى مكاتب الفريق ليسلّمهم، ويتابعهم، ثم يسلّمك تقريراً نهائياً للموافقة.'), ex, ta);
  if (!aiReady()) frag.append(el('p', 'lead', 'المدير يحتاج Claude ليخطط، وهو غير متاح في هذه الصفحة الآن.'));
  let close;
  const go = button('btn primary', 'سلّم الهدف للمدير', () => { const v = ta.value.trim(); if (!v) return ta.focus(); startGoal(v); close(); emit('show-goals'); });
  close = openModal('هدف جديد للمدير', frag, [go]);
}
export function openGoal(g) {
  const frag = document.createDocumentFragment();
  frag.append(el('div', 'muted', `${STATUS[g.status] || g.status} · ${fmtTime(g.at)}`));
  if (g.summary) frag.append(el('p', 'lead', g.summary));
  if (g.error) frag.append(el('p', 'lead', g.error));
  const ul = el('ul', 'tlist');
  goalTasks(g).forEach(t => {
    const li = el('li'), who = byKey(t.chain[0]);
    li.append(el('b', '', t.title), el('small', '', `${who?.a.name || ''} · ${{ todo: t.hold ? 'لم تُسلَّم بعد' : 'بالانتظار', doing: 'قيد التنفيذ', review: 'مراجعة', done: 'منجزة' }[t.status] || t.status}`));
    const f = S.files.find(x => x.id === t.outputs[t.outputs.length - 1]); if (f) li.append(button('linkish', 'عرض الملف', () => openFile(f)));
    ul.append(li);
  });
  frag.append(ul);
  const footer = [];
  const rep = S.files.find(x => x.id === g.reportId);
  if (rep) footer.push(button('btn primary', 'عرض التقرير النهائي', () => openFile(rep)));
  if (g.status === 'review') footer.push(button('btn', 'موافقة', () => { approveGoal(g); close(); }), button('btn', 'طلب تعديل', () => { close(); reviseGoal(g); }));
  if (g.status === 'error') footer.push(button('btn', 'أعد المحاولة', () => { g.error = ''; g.status = 'planning'; saveGoal(g); close(); g.taskIds.length ? (g.status = 'running', check(g)) : runGoal(g); }));
  const close = openModal(g.text, frag, footer);
}
export function renderGoalsBar() {
  const bar = $('goals'); if (!bar) return;
  bar.replaceChildren();
  const list = S.goals.filter(g => g.status !== 'done').slice(0, 4);
  bar.hidden = !list.length;
  list.forEach(g => {
    const b = button('goalchip', null, () => openGoal(g));
    const bar2 = el('span', 'bar'); bar2.append(el('i')); bar2.firstChild.style.width = Math.round(goalProgress(g) * 100) + '%';
    b.append(el('b', '', clip(g.text, 40)), el('small', '', STATUS[g.status] || g.status), bar2);
    bar.append(b);
  });
}
/** After a reload: goals that were mid-way stop and wait for you to resume them. */
export function restoreGoals() {
  S.goals.forEach(g => {
    if (g.status === 'planning' || g.status === 'reporting') { g.status = 'error'; g.error = 'توقف بسبب تحديث الصفحة. اضغط «أعد المحاولة».'; }
    if (g.status === 'handing') { goalTasks(g).forEach(t => { t.hold = false; }); g.status = 'running'; }
  });
  renderGoalsBar();
}
export function initGoals() {
  ['goals-changed', 'tasks-changed'].forEach(n => on(n, renderGoalsBar));
  renderGoalsBar();
}
