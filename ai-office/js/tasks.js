// Real work: the Kanban board, assigning tasks (drag onto a robot), Claude doing the work,
// hand-offs between agents, review and approval.
import { teamView, renderTeamBoard, initTeamBoard } from './teamboard.js';
import { $, el, button, uid, wait, clip, emit, on, gsap, D } from './util.js';
import { S, byKey, isFemale } from './state.js';
import { STATUS } from './data.js';
import { put, del } from './store.js';
import { AI, aiReady, identity, errText, noteFatal } from './ai.js';
import { goWork, goVisit, goHome, showBubble, walkTo, nudgeMood } from './agents.js';
import { spotsOn, mainFloor } from './floors.js';
import { THREE, camera, renderer, handoffBeam, sendPulse, stormEvent } from './scene.js';
import { addEvent } from './log.js';
import { notify, registerActions } from './notify.js';
import { openModal, openFile } from './modal.js';
import { setLive, endLive } from './holo.js';
import { skillsPrompt, remember } from './growth.js';
import { checkBudget, recordUsage } from './usage.js';
import { taskTools, toolsAvailable, toolsHint, finalText } from './agenttools.js';
import { stars, askRating, rateTask, qaReview } from './rating.js';
import { projectById, projectSelect, dueLabel, isOverdue } from './projects.js';

const runs = new Map(); // taskId -> AbortController of the running step
export const taskById = id => S.tasks.find(t => t.id === id);
export const currentKey = t => t.chain[t.step] || '';
const nameOf = key => byKey(key)?.a.name || 'وكيل محذوف';
const save = t => { t.updatedAt = Date.now(); put('tasks', t.id, t); emit('tasks-changed', t); };

/* ------------------------------------------------------------------ model */
export function createTask({ title, desc = '', chain = [], approval = true, goalId = '', deps = [], hold = false, after = null, parentId = '', projectId = '', due = '', qa = false, routineId = '' }) {
  const t = { id: uid('t'), title, desc, status: 'todo', chain: chain.filter(Boolean), step: 0, progress: 0, approval,
    outputs: [], feedback: '', error: '', paused: false, goalId, deps, hold, after, parentId, projectId, due, qa, routineId, createdAt: Date.now(), updatedAt: Date.now() };
  S.tasks.unshift(t); save(t);
  schedule();
  return t;
}
function assign(t, key) {
  if (t.status === 'done') return;
  stop(t);
  if (!t.chain.length) t.chain = [key];
  else t.chain[t.step] = key;
  t.paused = false; t.error = ''; t.status = 'todo';
  save(t); schedule();
}
function stop(t) {
  runs.get(t.id)?.abort(); runs.delete(t.id);
  S.agents.forEach(o => { if (o.task === t.id) { o.task = null; o.progress = -1; } });
}
function removeTask(t) {
  stop(t);
  S.tasks.splice(S.tasks.indexOf(t), 1);
  del('tasks', t.id); emit('tasks-changed', t);
}
function moveTo(t, status) {
  if (status === t.status) return;
  if (status === 'doing') { if (!t.chain.length) return flashHint('أسند المهمة لوكيل أولاً'); t.paused = false; t.error = ''; t.status = 'todo'; save(t); return schedule(); }
  if (status === 'review' && !t.outputs.length) return flashHint('لا يوجد ناتج لمراجعته بعد');
  stop(t);
  t.status = status; t.paused = status === 'todo' && t.chain.length > 0;
  if (status === 'done') finishDone(t, true); else save(t);
}

/** Start any waiting task whose agent is free. */
export function schedule() {
  if (S.meeting.running) return;
  for (const t of [...S.tasks].reverse()) {
    if (t.status !== 'todo' || t.paused || t.hold || !t.chain.length) continue;
    if ((t.deps || []).some(id => taskById(id) && taskById(id).status !== 'done')) continue; // waits for the tasks it builds on
    const ag = byKey(currentKey(t));
    if (ag && !ag.task) runStep(t, ag);
  }
}

/* ------------------------------------------------------------------ doing the work */
function goalLine(t) {
  const g = t.goalId && S.goals.find(x => x.id === t.goalId); if (!g) return '';
  const deps = (t.deps || []).map(taskById).filter(Boolean).map(d => S.files.find(f => f.id === d.outputs[d.outputs.length - 1])).filter(Boolean);
  const mem = deps.map(f => `\nمن عمل ${f.agentName} («${f.title}»):\n«${clip(f.content, 5000)}»`).join('\n');
  return `الهدف الكبير: ${g.text}\n${mem ? 'ابنِ على ما أنجزه زملاؤك:' + mem + '\n' : ''}`;
}
function stepPrompt(t, ag, tools = false) {
  const prev = t.outputs.length ? S.files.find(f => f.id === t.outputs[t.outputs.length - 1]) : null;
  const next = byKey(t.chain[t.step + 1]);
  const prevAgent = prev ? byKey(prev.agentKey) : null;
  const redo = t.feedback && prev && prev.agentKey === ag.a.key;
  return `${identity(ag, `${t.title} ${t.desc || ''}`)}

لديك مهمة عمل حقيقية${t.goalId ? ' كلّفك بها المدير التنفيذي ضمن هدف أكبر' : ' من المستخدم'}. نفّذها الآن بنفسك وسلّم الناتج كاملاً.
${goalLine(t)}عنوان المهمة: ${t.title}
${t.desc ? `التفاصيل: ${t.desc}\n` : ''}${prev && !redo ? `\nهذا ما سلّمه لك ${prev.agentName}${prevAgent ? ` (${prevAgent.a.role})` : ''}، ابنِ عليه:\n«${clip(prev.content, 12000)}»\n` : ''}${redo ? `\nهذه نسختك السابقة:\n«${clip(prev.content, 12000)}»\nوملاحظات المستخدم عليها: ${t.feedback}\nأعد كتابة الناتج كاملاً مع تطبيق الملاحظات.\n` : ''}${next ? `\nبعد أن تنتهي سيستلم عملك ${next.a.name} (${next.a.role})، فاجعل الناتج واضحاً ومفيداً له.\n` : ''}
اكتب الناتج النهائي نفسه، وليس وصفاً لما ستفعله.
- ابدأ بسطر واحد هو عنوان الملف، ثم سطر فارغ، ثم المحتوى.
- نظّم المحتوى بفقرات قصيرة وقوائم مرقمة عند الحاجة، بنص عادي بلا Markdown (لا # ولا **).
- الطول المناسب من 150 إلى 700 كلمة حسب حجم المهمة.
- اكتب بالعربية إلا إذا طلبت المهمة لغة أخرى.${skillsPrompt(ag)}${tools ? toolsHint() : ''}`;
}

async function runStep(t, ag) {
  t.status = 'doing'; t.progress = 0; t.error = ''; ag.task = t.id; ag.progress = 0; save(t);
  emit('agents-changed');
  const f = isFemale(ag.a);
  addEvent(ag, `${f ? 'بدأت' : 'بدأ'} العمل على «${t.title}»`, t.id);
  if (t.step === 0 && !t.kickedOff && new Set(t.chain).size > 1 && !S.meeting.running) await kickoff(t);
  await goWork(ag);
  if (taskById(t.id) !== t || ag.task !== t.id || t.status !== 'doing') { if (ag.task === t.id) { ag.task = null; ag.progress = -1; } return; }
  ag.kick = 1; showBubble(ag, 'بدأت العمل', 2200);
  const entry = { key: ag.a.key, start: Date.now(), end: 0 }; (t.log ||= []).push(entry); // for the dashboard
  const ctl = new AbortController(); runs.set(t.id, ctl);
  const t0 = Date.now(); let streamed = 0;
  const tick = setInterval(() => {
    const p = Math.min(0.92, Math.max((Date.now() - t0) / 70000, 0.12 + 0.8 * Math.min(1, streamed / 2600)));
    ag.progress = t.progress = p; emit('progress', t);
  }, 400);
  let text;
  try {
    if (aiReady()) {
      checkBudget(ag);
      const useTools = S.agentTools !== false && await toolsAvailable();
      const prompt = stepPrompt(t, ag, useTools);
      const opts = { modelTier: 'complex', signal: ctl.signal, onText: ({ text }) => { streamed = text.length; setLive(ag, { title: t.title, text: useTools ? finalText(text) || text : text, kind: 'مهمة' }); } };
      if (useTools) opts.tools = taskTools(t, ag, { createTask }); else opts.cache = false;
      const res = await AI.sample(prompt, opts);
      text = useTools ? finalText(res.text) : res.text.trim(); recordUsage(ag, prompt.length, res.text.length);
    } else {
      // no Claude here: simulate the work so the flow can still be seen, and say so in the file
      for (let k = 0; k < 20 && !ctl.signal.aborted; k++) { await wait(400); streamed += 130; setLive(ag, { title: t.title, text: `أعمل على «${t.title}»…\n`.repeat(1 + (k >> 2)), kind: 'مهمة' }); }
      if (ctl.signal.aborted) throw { code: 'cancelled' };
      text = `${t.title}\n\nنسخة تجريبية: Claude غير متاح في هذه الصفحة الآن، لذلك لم يكتب ${ag.a.name} محتوى حقيقياً.\nافتح الصفحة من claude.ai واسمح لها باستخدام Claude، ثم أعد تشغيل المهمة.`;
    }
  } catch (e) {
    clearInterval(tick); runs.delete(t.id); endLive(ag, 3000);
    if (ag.task === t.id) { ag.task = null; ag.progress = -1; }
    emit('agents-changed');
    if (e?.code === 'cancelled' || !taskById(t.id)) { schedule(); return; }
    noteFatal(e);
    t.status = 'todo'; t.paused = true; t.error = errText(e); save(t);
    addEvent(ag, `تعذّر إكمال «${t.title}»: ${t.error}`, t.id);
    notify({ text: `${ag.a.name}: تعذّر إكمال «${t.title}». ${t.error}`, kind: 'error', taskId: t.id, agentKey: ag.a.key });
    schedule(); return;
  }
  clearInterval(tick); runs.delete(t.id);
  if (!taskById(t.id)) { ag.task = null; ag.progress = -1; schedule(); return; }

  // the result becomes a file
  const lines = text.split('\n');
  const title = clip((lines[0] || t.title).replace(/^[#*\s]+|[*\s]+$/g, '') || t.title, 80);
  const file = { id: uid('f'), taskId: t.id, agentKey: ag.a.key, agentName: ag.a.name, title, content: text, at: Date.now() };
  S.files.unshift(file); put('files', file.id, file); emit('files-changed', ag); emit('step-done', ag);
  entry.end = Date.now(); entry.words = text.split(/\s+/).length;
  t.outputs.push(file.id); t.feedback = ''; ag.progress = t.progress = 1; emit('progress', t);
  addEvent(ag, `${f ? 'أنهت' : 'أنهى'} «${t.title}» وكتب${f ? 'ت' : ''} ملف «${title}»`, t.id);
  sendPulse(ag);
  await wait(700);
  ag.task = null; ag.progress = -1; endLive(ag);

  const next = byKey(t.chain[t.step + 1]);
  // the CEO checks the final result first; work that falls short goes back once with notes
  if (!next && t.qa) {
    const r = await qaReview(t, ag, file);
    if (r) {
      file.qa = r; put('files', file.id, file);
      const boss = byKey('ceo');
      if (!r.ok && !t.qaRedo && taskById(t.id)) {
        t.qaRedo = true; t.feedback = `ملاحظات المدير التنفيذي بعد مراجعة الجودة (${r.score}/10): ${r.notes || 'ارفع المستوى ليلبي المطلوب بالكامل.'}`;
        t.status = 'todo'; save(t);
        if (boss) { showBubble(boss, `${r.score}/10، نحتاج تحسيناً`, 2800); addEvent(boss, `أعاد «${clip(t.title, 50)}» إلى ${ag.a.name} للتحسين (${r.score}/10)`, t.id); }
        emit('agents-changed'); schedule(); return;
      }
      if (boss) { showBubble(boss, `${r.score}/10 ✓`, 2400); addEvent(boss, `اعتمد جودة «${clip(t.title, 50)}» (${r.score}/10)`, t.id); }
    }
  }
  if (next) return handoff(t, ag, next);
  if (t.approval) {
    t.status = 'review'; save(t);
    notify({ text: `${ag.a.name} ${f ? 'أنهت' : 'أنهى'} «${t.title}» وينتظر موافقتك.`, kind: 'approve', taskId: t.id, agentKey: ag.a.key });
  } else finishDone(t);
  emit('agents-changed');
  schedule();
}

/** Shared task: everyone on it meets at the meeting table first, agrees who does what, then goes back to work. */
async function kickoff(t) {
  t.kickedOff = true; save(t);
  const seats = spotsOn(mainFloor().id, ['table']);
  const members = [...new Set(t.chain)].map(byKey).filter(o => o && (!o.task || o.task === t.id));
  if (!seats.length || members.length < 2) return;
  addEvent(members[0], `اجتماع قصير حول «${t.title}» على طاولة الاجتماعات`, t.id);
  const arrive = Promise.all(members.map((o, i) => walkTo(o, { ...seats[i % seats.length], floor: mainFloor().id, kind: 'table', until: Infinity }, 1.9)));
  await Promise.race([arrive, wait(45000)]);
  const say = [m => `سأبدأ بـ«${clip(t.title, 26)}»`, () => 'وأنا أكمل بعدك', () => 'وأنا أراجع وأسلّم'];
  for (let i = 0; i < members.length; i++) { showBubble(members[i], say[Math.min(i, 2)](members[i]), 2600); members[i].kick = 1; await wait(1500); }
  await wait(900);
  members.forEach(o => goHome(o));
}

async function handoff(t, from, to) {
  const f = isFemale(from.a);
  t.step++; t.status = 'doing'; save(t);
  addEvent(from, `${f ? 'سلّمت' : 'سلّم'} «${t.title}» إلى ${to.a.name}`, t.id);
  await goVisit(from, to, `أسلّم ${to.a.name}`);
  handoffBeam(from, to, 3.2);
  showBubble(from, `تفضّل${isFemale(to.a) ? 'ي' : ''} يا ${to.a.name}`, 2600);
  await wait(1400);
  showBubble(to, 'استلمت، شكراً!', 2600); to.kick = 1;
  await wait(1800);
  goHome(from);
  if (!taskById(t.id)) return;
  t.status = 'todo'; save(t);
  emit('agents-changed');
  schedule();
}

function finishDone(t, manual = false) {
  t.status = 'done'; t.paused = false; t.error = ''; t.doneAt = Date.now(); save(t);
  S.tasksDoneToday++; emit('stats');
  const ag = byKey(t.chain[t.chain.length - 1]);
  if (ag && !manual && t.after) emit('deliver', t);
  if (ag && !manual) {
    stormEvent(ag, ag.a.color, 0.5);
    // tasks that belong to a goal are reported to the CEO, not to you
    if (!t.goalId) notify({ text: `«${t.title}» منجزة.`, kind: 'done', taskId: t.id, agentKey: ag.a.key });
  }
  emit('task-done', t);
}
export function approve(t) {
  if (!t || t.status !== 'review') return;
  const ag = byKey(t.chain[t.chain.length - 1]);
  if (ag) addEvent(ag, `وافقت على «${t.title}»`, t.id);
  emit('task-approved', t);
  t.chain.forEach(k => { const o = byKey(k); if (o) { nudgeMood(o, 10); showBubble(o, 'رائع، شكراً!', 2200); } });
  finishDone(t);
  if (!t.rating) setTimeout(() => askRating(t), 600);
}
export function revise(t) {
  if (!t) return;
  const ta = el('textarea'); ta.rows = 4; ta.id = 'revise-text'; ta.placeholder = 'مثلاً: اختصره إلى نصف الطول وأضف أرقاماً تقديرية';
  const frag = document.createDocumentFragment(); frag.append(el('p', 'lead', `ما الذي تريد تعديله في «${t.title}»؟`), ta);
  let close;
  const send = button('btn primary', 'أرسل الملاحظات', () => {
    const v = ta.value.trim(); if (!v) return ta.focus();
    const k = currentKey(t); (t.revBy ||= {})[k] = (t.revBy[k] || 0) + 1;
    t.feedback = v; t.status = 'todo'; t.paused = false; t.error = ''; save(t);
    const who = byKey(currentKey(t)); if (who) remember(who, v, 'feedback');
    const ag = byKey(currentKey(t)); if (ag) { addEvent(ag, `طلبت تعديلات على «${t.title}»`, t.id); nudgeMood(ag, -8); }
    close(); schedule();
  });
  close = openModal('طلب تعديل', frag, [send]);
}

registerActions('approve', n => {
  const t = taskById(n.taskId); if (!t || t.status !== 'review') return [];
  const file = S.files.find(f => f.id === t.outputs[t.outputs.length - 1]);
  return [
    { label: 'موافقة', cls: 'primary', run: () => approve(t) },
    { label: 'طلب تعديل', run: () => revise(t) },
    ...(file ? [{ label: 'عرض الملف', run: () => openFile(file) }] : []),
  ];
});
registerActions('done', n => {
  const t = taskById(n.taskId); const file = t && S.files.find(f => f.id === t.outputs[t.outputs.length - 1]);
  return file ? [{ label: 'عرض الملف', run: () => openFile(file) }] : [];
});

/* ------------------------------------------------------------------ new task form */
const EXAMPLES = [
  { title: 'تحليل منافسينا وخطة عمل للربع القادم', desc: 'ابحث عن 3 منافسين مباشرين ونقاط قوتهم وضعفهم، ثم حوّل النتائج إلى خطة عمل من خطوات واضحة.', chain: ['mira', 'juno'] },
  { title: 'رد على شكوى عميل خُصم منه مرتين', desc: 'اكتب رداً لطيفاً واضحاً للعميل، ثم راجع أثر الاسترداد على حسابات الشهر.', chain: ['sage', 'pip'] },
  { title: 'تصميم شاشة ترحيب للتطبيق', desc: 'اقترح محتوى وترتيب شاشة الترحيب، ثم راجعها تقنياً وحدد ما يلزم لتنفيذها.', chain: ['nova', 'otto'] },
];
export function openNewTask(presetKey = '') {
  const frag = document.createDocumentFragment();
  const title = el('input'); title.id = 'task-title'; title.maxLength = 120; title.required = true; title.placeholder = 'مثلاً: تقرير عن منافسينا';
  const desc = el('textarea'); desc.id = 'task-desc'; desc.rows = 3; desc.maxLength = 1500; desc.placeholder = 'ماذا تريد أن يسلّمك الوكيل بالضبط؟';
  const sel = (id, first) => { const s = el('select'); s.id = id; s.append(new Option(first, '')); S.agents.forEach(o => s.append(new Option(`${o.a.name} — ${o.a.role}`, o.a.key))); return s; };
  const who = sel('task-who', 'بدون (تبقى في القائمة)'); who.value = presetKey;
  const h1 = sel('task-h1', 'لا أحد'), h2 = sel('task-h2', 'لا أحد');
  const appr = el('input'); appr.type = 'checkbox'; appr.id = 'task-approval'; appr.checked = true;
  const field = (label, node) => { const l = el('label', 'field', label); l.append(node); return l; };
  const ex = el('div', 'chips'); ex.style.padding = '0';
  EXAMPLES.forEach(x => ex.append(button('', x.title, () => {
    title.value = x.title; desc.value = x.desc;
    const keys = x.chain.filter(byKey); who.value = keys[0] || ''; h1.value = keys[1] || ''; h2.value = keys[2] || '';
  })));
  const after = el('select'); after.id = 'task-after';
  [['', 'لا شيء'], ['email', 'أرسل الناتج بالبريد'], ['drive', 'احفظ الناتج في Google Drive'], ['slack', 'أرسل الناتج إلى قناة Slack']].forEach(([v, l]) => after.append(new Option(l, v)));
  const afterTo = el('input'); afterTo.type = 'email'; afterTo.dir = 'ltr'; afterTo.id = 'task-after-to'; afterTo.placeholder = 'name@example.com'; afterTo.hidden = true;
  after.onchange = () => { afterTo.hidden = !['email', 'slack'].includes(after.value); afterTo.type = after.value === 'slack' ? 'text' : 'email'; afterTo.placeholder = after.value === 'slack' ? 'اسم القناة، مثل general' : 'name@example.com'; };
  const chk = el('label', 'check'); chk.append(appr, document.createTextNode('تحتاج موافقتي قبل أن تُعتبر منجزة'));
  const qa = el('input'); qa.type = 'checkbox'; qa.id = 'task-qa'; qa.checked = !!byKey('ceo');
  const qaChk = el('label', 'check'); qaChk.append(qa, document.createTextNode('يراجع المدير التنفيذي الجودة قبل أن تصلني'));
  const proj = projectSelect('task-project', S.lastProject || '');
  const due = el('input'); due.type = 'date'; due.id = 'task-due';
  const when = el('div', 'row'); when.append(field('المشروع', proj), field('موعد التسليم (اختياري)', due));
  frag.append(el('h3', '', 'أمثلة'), ex, field('عنوان المهمة', title), field('التفاصيل', desc), field('المسؤول', who),
    field('ثم يسلّمها إلى (اختياري)', h1), field('ثم إلى (اختياري)', h2), field('بعد الإنجاز (ينتظر موافقتك)', after), afterTo, when, chk, qaChk);
  let close;
  const go = button('btn primary', 'أنشئ المهمة', () => {
    const v = title.value.trim(); if (!v) return title.focus();
    const chain = [who.value, h1.value, h2.value].filter(Boolean);
    const projectId = $('task-project').value.replace('__new', ''); S.lastProject = projectId;
    createTask({ title: v, desc: desc.value.trim(), chain, approval: appr.checked, after: after.value ? { kind: after.value, to: afterTo.value.trim() } : null,
      projectId, due: due.value || '', qa: qa.checked });
    close();
  });
  close = openModal('مهمة جديدة', frag, [go]);
}
function openTask(t) {
  const frag = document.createDocumentFragment();
  if (t.desc) frag.append(el('p', 'lead', t.desc));
  frag.append(el('div', 'muted', 'المسار: ' + (t.chain.map(nameOf).join(' ← ') || 'غير مسندة')));
  const meta = el('div', 'row');
  const proj = projectSelect('edit-project', t.projectId || ''); const due = el('input'); due.type = 'date'; due.id = 'edit-due'; due.value = t.due || '';
  const commit = () => { t.projectId = $('edit-project').value.replace('__new', ''); t.due = due.value || ''; save(t); };
  proj.addEventListener('change', commit); due.addEventListener('change', commit);
  const fl = (l, n) => { const x = el('label', 'field', l); x.append(n); return x; };
  meta.append(fl('المشروع', proj), fl('موعد التسليم', due)); frag.append(meta);
  if (t.status === 'done' && byKey(t.chain[t.chain.length - 1])) {
    const rate = el('div', 'rate'); const drawRate = () => rate.replaceChildren(el('span', 'muted', 'تقييمك: '), stars(t.rating?.stars || 0, n => { rateTask(t, n, t.rating?.note || ''); drawRate(); }), button('linkish', 'أضف ملاحظة', () => askRating(t)));
    drawRate(); frag.append(rate);
  }
  const files = t.outputs.map(id => S.files.find(f => f.id === id)).filter(Boolean);
  if (files.length) {
    frag.append(el('h3', '', 'الملفات'));
    const ul = el('ul', 'tlist');
    files.forEach(f => { const li = el('li'); li.append(button('linkish', f.title, () => openFile(f)), el('small', '', f.agentName)); ul.append(li); });
    frag.append(ul);
  }
  let close;
  const delBtn = button('btn danger', 'حذف المهمة', () => {
    if (delBtn.dataset.sure) { removeTask(t); close(); } else { delBtn.dataset.sure = '1'; delBtn.textContent = 'اضغط مرة أخرى للتأكيد'; }
  });
  close = openModal(t.title, frag, [delBtn]);
}

/* ------------------------------------------------------------------ board */
const STATUS_TEXT = t => t.error ? t.error : t.paused ? 'متوقفة' : t.status === 'todo' && t.chain.length ? `بانتظار ${nameOf(currentKey(t))}` : '';
export function renderBoard() {
  const cols = $('cols'); if (!cols) return;
  if (teamView()) { renderTeamBoard(cols); return; }
  const scroll = [...cols.children].map(c => c.scrollTop);
  cols.replaceChildren();
  const q = ($('board-q')?.value || '').trim().toLowerCase(), who = $('board-agent')?.value || '';
  const sel = $('board-agent');
  if (sel && sel.options.length !== S.agents.length + 1) { const v = sel.value; sel.length = 1; S.agents.forEach(o => sel.append(new Option(o.a.name, o.a.key))); sel.value = v; }
  const pf = $('board-project'); if (pf) { const v = pf.value; pf.length = 1; S.projects.forEach(p => pf.append(new Option(p.name, p.id))); pf.value = v; pf.hidden = !S.projects.length; }
  const proj = pf?.value || '';
  const keep = t => (!q || (t.title + ' ' + t.desc).toLowerCase().includes(q)) && (!who || t.chain.includes(who)) && (!proj || t.projectId === proj);
  STATUS.forEach((s, i) => {
    const list = S.tasks.filter(t => t.status === s.id && keep(t));
    const col = el('div', 'col'); col.dataset.status = s.id;
    const h = el('h3'); h.append(el('span', '', s.label), el('span', '', String(list.length)));
    col.append(h);
    if (!list.length && s.id === 'todo') col.append(el('p', 'empty', 'لا مهام بعد. اضغط «+ مهمة جديدة» أو جرّب أحد الأمثلة.'));
    list.forEach(t => col.append(card(t)));
    cols.append(col); col.scrollTop = scroll[i] || 0;
  });
}
function card(t) {
  const ag = byKey(currentKey(t));
  const c = el('div', 'card'); c.dataset.task = t.id; if (ag) c.style.setProperty('--c', ag.a.color);
  const top = el('div', 'top');
  const grip = button('grip', '⠿'); grip.setAttribute('aria-label', 'اسحب المهمة'); grip.title = 'اسحب المهمة إلى وكيل أو عمود';
  grip.addEventListener('pointerdown', e => startDrag(e, t, c));
  const ttl = button('linkish', t.title, () => openTask(t)); ttl.style.color = 'var(--fg)'; ttl.style.fontWeight = '600';
  top.append(grip, ttl); c.append(top);
  const pj = projectById(t.projectId), dl = dueLabel(t);
  if (pj || dl || t.rating || t.parentId) {
    const tags = el('div', 'tags');
    if (pj) { const x = el('span', 'ptag', pj.name); x.style.setProperty('--c', pj.color); tags.append(x); }
    if (dl) tags.append(el('span', 'due' + (isOverdue(t) ? ' late' : ''), dl));
    if (t.parentId) tags.append(el('span', 'sub', 'متابعة'));
    if (t.rating) tags.append(stars(t.rating.stars));
    c.append(tags);
  }
  if (t.chain.length) {
    const who = el('div', 'who');
    t.chain.forEach((k, i) => {
      const o = byKey(k); const s = el('span'); const dot = el('i'); dot.style.setProperty('--c', o?.a.color || '#94a3b8');
      s.append(dot, document.createTextNode(nameOf(k))); if (i === t.step && t.status !== 'done') s.style.color = 'var(--fg)';
      who.append(s); if (i < t.chain.length - 1) who.append(document.createTextNode('←'));
    });
    c.append(who);
  }
  if (t.status === 'doing') { const b = el('div', 'bar'); b.dataset.prog = t.id; b.append(el('i')); b.firstChild.style.width = Math.round((t.progress || 0) * 100) + '%'; c.append(b); }
  const st = STATUS_TEXT(t); if (st) c.append(el('div', t.error ? 'err' : 'muted', st));
  const acts = el('div', 'acts');
  if (t.status === 'todo' && !t.chain.length) {
    const s = el('select'); s.setAttribute('aria-label', 'أسند إلى'); s.append(new Option('أسند إلى…', ''));
    S.agents.forEach(o => s.append(new Option(o.a.name, o.a.key)));
    s.onchange = () => s.value && assign(t, s.value); acts.append(s);
  }
  if (t.status === 'todo' && t.paused) acts.append(button('btn primary', t.error ? 'أعد المحاولة' : 'استئناف', () => { t.paused = false; t.error = ''; save(t); schedule(); }));
  if (t.status === 'doing') acts.append(button('btn', 'إيقاف', () => moveTo(t, 'todo')));
  if (t.status === 'review') { acts.append(button('btn primary', 'موافقة', () => approve(t)), button('btn', 'طلب تعديل', () => revise(t))); }
  const last = S.files.find(f => f.id === t.outputs[t.outputs.length - 1]);
  if (last) acts.append(button('btn', 'عرض الملف', () => openFile(last)));
  if (acts.children.length) c.append(acts);
  return c;
}
on('tasks-changed', () => renderBoard());
on('progress', t => {
  document.querySelectorAll(`[data-prog="${t.id}"] i`).forEach(i => { i.style.width = Math.round((t.progress || 0) * 100) + '%'; });
});
function flashHint(text) { const h = $('board-hint'); h.textContent = text; h.style.color = '#ffb4b6'; clearTimeout(flashHint.t); flashHint.t = setTimeout(() => { h.textContent = 'اسحب المهمة من ⠿ وأفلتها على روبوت أو على اسم وكيل'; h.style.color = ''; }, 2500); }

/* ------------------------------------------------------------------ drag a card onto an agent or a column */
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function agentAt(x, y) {
  const elAt = document.elementFromPoint(x, y);
  const m = elAt?.closest?.('[data-key]'); if (m) return byKey(m.dataset.key);
  if (elAt === renderer.domElement) {
    ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
    return ray.intersectObjects(S.hitMeshes)[0]?.object.userData.ag || null;
  }
  return null;
}
function startDrag(e, t, cardEl) {
  e.preventDefault();
  const ghost = cardEl.cloneNode(true); ghost.classList.add('ghost'); document.body.append(ghost);
  const move = ev => { ghost.style.left = ev.clientX + 'px'; ghost.style.top = ev.clientY + 'px'; highlight(ev.clientX, ev.clientY); };
  let lastTarget = null;
  const highlight = (x, y) => {
    lastTarget?.classList?.remove('droptarget', 'over'); S.agents.forEach(o => { o.dropHover = false; });
    const elAt = document.elementFromPoint(x, y);
    const colEl = elAt?.closest?.('.col'); const ag = agentAt(x, y);
    if (colEl) { colEl.classList.add('over'); lastTarget = colEl; }
    else if (ag) { ag.dropHover = true; lastTarget = ag.memberBtn || null; lastTarget?.classList.add('droptarget'); gsap.to(ag, { selA: 1, duration: D(0.2) }); }
    S.agents.forEach(o => { if (!o.dropHover && o !== S.focused) gsap.to(o, { selA: 0, duration: D(0.2) }); });
  };
  move(e);
  const up = ev => {
    removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
    ghost.remove(); lastTarget?.classList?.remove('droptarget', 'over');
    S.agents.forEach(o => { o.dropHover = false; if (o !== S.focused) gsap.to(o, { selA: 0, duration: D(0.2) }); });
    if (ev.type === 'pointercancel') return;
    const colEl = document.elementFromPoint(ev.clientX, ev.clientY)?.closest?.('.col');
    if (colEl) return moveTo(t, colEl.dataset.status);
    const ag = agentAt(ev.clientX, ev.clientY);
    if (ag) { assign(t, ag.a.key); showBubble(ag, 'حاضر، سأبدأ', 2200); ag.kick = 1; }
  };
  addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
}

/* ------------------------------------------------------------------ after a reload */
export function restoreTasks() {
  S.tasks.forEach(t => {
    if (t.status === 'doing') { t.status = 'todo'; t.paused = true; t.error = ''; }
    if (!Array.isArray(t.chain)) t.chain = [];
    if (!Array.isArray(t.outputs)) t.outputs = [];
  });
  renderBoard();
}
export function initBoard() {
  initTeamBoard(renderBoard);
  $('task-new').onclick = () => openNewTask();
  $('board-q').addEventListener('input', renderBoard); $('board-agent').addEventListener('change', renderBoard); $('board-project').addEventListener('change', renderBoard);
  on('projects-changed', renderBoard);
  renderBoard();
}
