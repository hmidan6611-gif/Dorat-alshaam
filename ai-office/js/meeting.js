// Team meeting: every agent discusses one topic, then a shared plan with an owner for each step.
import { $, el, button, pick, gsap, D, fmtTime, clip, emit } from './util.js';
import { S, byKey, isFemale } from './state.js';
import { put } from './store.js';
import { AI, aiReady, errText, noteFatal, ERR } from './ai.js';
import { goHome, showBubble, walkTo } from './agents.js';
import { spotsOn, mainFloor } from './floors.js';
import { sendPulse, boost, stormEvent } from './scene.js';
import { addLog } from './log.js';
import { speakLines, stopVoice, canSpeak, isAutoRead } from './voice.js';
import { createTask } from './tasks.js';
import { askBookEvent, askPostSlack } from './workspace.js';

const meeting = S.meeting;
const mp = () => $('meet-pane');
const EXAMPLES = ['كيف نطلق ميزة الاشتراك الشهري خلال شهر؟', 'خطة لتقليل شكاوى العملاء بنسبة 30%', 'حملة تسويق بميزانية 5,000 دولار'];
let ui = {};

export function renderMeetHome() {
  const box = mp(); box.replaceChildren();
  box.append(el('p', 'lead', 'اكتب مهمة أو سؤالاً، وسيناقشه كل الوكلاء من زاوية تخصصهم، ثم تحصل على خطة مشتركة فيها مسؤول عن كل خطوة. يمكنك تحويل الخطة إلى مهام على اللوحة بضغطة واحدة.'));
  const ta = el('textarea'); ta.id = 'meet-topic'; ta.rows = 3; ta.maxLength = 600; ta.placeholder = 'مثلاً: كيف نزيد مبيعات المتجر في رمضان؟';
  const ex = el('div', 'chips'); ex.style.padding = '0';
  EXAMPLES.forEach(x => ex.append(button('', x, () => { ta.value = x; ta.focus(); })));
  const row = el('div', 'row');
  row.append(button('btn primary', 'ابدأ الاجتماع', () => { const v = ta.value.trim(); if (v) runMeeting(v); else ta.focus(); }));
  box.append(ta, ex, row);
  if (!aiReady()) box.append(el('p', 'lead', 'الاجتماع يحتاج Claude، وهو غير متاح في هذه الصفحة الآن. افتح الصفحة من claude.ai واسمح لها باستخدام Claude.'));
  if (S.meetings.length) {
    box.append(el('h3', '', 'اجتماعات سابقة'));
    const ul = el('ul', 'past');
    S.meetings.forEach(m => {
      const li = el('li'), b = button('', null, () => renderMeetResult(m, false));
      b.append(document.createTextNode(clip(m.topic, 70)), el('time', '', fmtTime(m.at)));
      li.append(b); ul.append(li);
    });
    box.append(ul);
  }
}
function lineEl(name, color, text) {
  const d = el('div', 'line'); d.style.setProperty('--c', color);
  const ava = el('span', 'ava'); ava.append(el('i'));
  const body = el('div'); body.append(el('b', '', name), document.createTextNode(text));
  d.append(ava, body); return d;
}
const agentInfo = key => { const ag = byKey(key); return ag ? { name: ag.a.name, color: ag.a.color, voice: ag.a.voice } : null; };
function planEl(m) {
  const box = el('div', 'plan');
  box.append(el('b', '', 'الخطة المشتركة'));
  if (m.summary) box.append(el('p', '', m.summary));
  const ol = el('ol');
  (m.plan || []).forEach(p => {
    const li = el('li', '', p.step + ' ');
    const who = agentInfo(p.owner) || (p.ownerName ? { name: p.ownerName, color: '' } : null);
    if (who) { const em = el('em', '', `— ${who.name}`); if (who.color) em.style.setProperty('--c', who.color); li.append(em); }
    ol.append(li);
  });
  box.append(ol); return box;
}
function listenButton(m) {
  const b = button('btn', '▶ استمع للاجتماع', () => speakLines([
    ...m.lines.map(l => ({ text: `${l.name}: ${l.text}`, voice: agentInfo(l.key)?.voice || 'buttery' })),
    { text: 'الخطة المشتركة. ' + (m.summary || '') + ' ' + (m.plan || []).map((p, k) => `${k + 1}. ${p.step}`).join(' '), voice: 'buttery' },
  ]));
  b.hidden = !canSpeak(); return b;
}
function toTasksButton(m) {
  const b = button('btn', 'حوّل الخطة إلى مهام', () => {
    (m.plan || []).forEach(p => createTask({ title: clip(p.step, 110), desc: `من اجتماع: ${m.topic}\n\n${m.summary || ''}`, chain: byKey(p.owner) ? [p.owner] : [], approval: true }));
    b.disabled = true; b.textContent = 'أُضيفت إلى لوحة المهام';
  });
  if (!(m.plan || []).length) b.hidden = true;
  return b;
}
function renderMeetResult(m, fresh) {
  const box = mp(); box.replaceChildren();
  box.append(el('div', 'topic', m.topic));
  m.lines.forEach(l => box.append(lineEl(l.name, agentInfo(l.key)?.color || '#94a3b8', l.text)));
  box.append(planEl(m));
  const row = el('div', 'row');
  const planText = `${m.summary || ''}\n\n${(m.plan || []).map((p, k) => `${k + 1}. ${p.step}${agentInfo(p.owner) ? ` — ${agentInfo(p.owner).name}` : ''}`).join('\n')}`.trim();
  row.append(button('btn primary', fresh ? 'اجتماع جديد' : 'رجوع', renderMeetHome), toTasksButton(m), listenButton(m),
    button('btn', 'موعد متابعة', () => askBookEvent({ agentKey: 'ceo', summary: `متابعة: ${clip(m.topic, 80)}`, description: planText })),
    button('btn', 'شارك في Slack', () => askPostSlack({ agentKey: 'ceo', text: `*اجتماع الفريق: ${m.topic}*\n\n${planText}`, title: `خطة «${clip(m.topic, 30)}»` })));
  box.append(row);
  if (!fresh) box.scrollTop = 0;
}
function meetingPrompt(topic) {
  const n = S.agents.length;
  const members = S.agents.map(o => `- key: ${o.a.key} | الاسم: ${o.a.name} | الدور: ${o.a.role} | ${isFemale(o.a) ? 'أنثى' : 'ذكر'} | ${o.a.desc || o.a.intro}`).join('\n');
  return `أنت تدير اجتماع عمل لفريق من وكلاء الذكاء الاصطناعي في «خلية المكتب». أعضاء الفريق:
${members}

المهمة التي طرحها المستخدم على الفريق:
«${topic}»

اكتب نقاشاً واقعياً وعميقاً بين الأعضاء حول هذه المهمة:
- يتكلم كل عضو مرة واحدة على الأقل من زاوية تخصصه، بأفكار محددة وأرقام تقديرية أو أمثلة عند الحاجة.
- يمكن أن يرد عضو على زميل باسمه، أو يعترض على فكرة ويقترح بديلاً.
- كل مداخلة من جملتين إلى أربع جمل، والمجموع بين ${Math.min(n + 2, 12)} و${Math.min(n * 2, 14)} مداخلة.
- العضوات يتكلمن بصيغة المؤنث، والأعضاء بصيغة المذكر.
- ثم خطة مشتركة من 4 إلى 7 خطوات عملية مرتبة، لكل خطوة عضو مسؤول.
- عربية بسيطة، نص عادي بلا Markdown. لا تدّعِ أن أحداً نفّذ شيئاً حقيقياً خارج الاجتماع.

أعد JSON فقط بهذا الشكل بالضبط:
{"discussion":[{"key":"مفتاح العضو","text":"..."}],"plan":[{"step":"...","owner":"مفتاح العضو"}],"summary":"جملتان تلخصان القرار"}`;
}

/** Everyone walks to the meeting table; those without a chair stand around it. */
function seatEveryone() {
  const fid = mainFloor().id, seats = spotsOn(fid, ['table']), table = seats[0]?.obj;
  S.agents.forEach((o, i) => {
    if (o.task) return; // busy agents stay at their desks
    if (seats[i]) return walkTo(o, { ...seats[i], floor: fid, kind: 'table', until: Infinity }, 2.2);
    if (!table) return goHome(o, true);
    const ang = -Math.PI / 2 + (i - seats.length) * 0.55, x = table.x + Math.cos(ang) * 2.1, z = table.z + Math.sin(ang) * 1.9;
    walkTo(o, { x, z, face: Math.atan2(table.x - x, table.z - z), floor: fid, kind: 'table', sit: false, until: Infinity }, 2.2);
  });
}
const everyoneBack = () => S.agents.forEach(o => { if (o.mv.dest?.kind === 'table') goHome(o); });

export async function runMeeting(topic) {
  if (meeting.running) return;
  if (!aiReady()) { renderMeetHome(); return; }
  meeting.running = true; ui.setTabState('meet'); stopVoice();
  seatEveryone();
  const box = mp(); box.replaceChildren();
  box.append(el('div', 'topic', topic));
  const status = el('div', 'status', 'الفريق يتناقش… قد يستغرق ذلك دقيقة أو أكثر.');
  const stop = button('btn', 'إيقاف', () => meeting.ctl.abort());
  const row = el('div', 'row'); row.append(stop);
  box.append(status, row);
  meeting.ctl = new AbortController();
  const fidget = setInterval(() => { const o = pick(S.agents); o.kick = 1; showBubble(o, isFemale(o.a) ? 'تفكّر…' : 'يفكّر…'); sendPulse(o); }, 1500);
  let res;
  try {
    res = await AI.sample.json(meetingPrompt(topic), { modelTier: 'complex', signal: meeting.ctl.signal });
  } catch (e) {
    clearInterval(fidget); meeting.running = false; everyoneBack(); emit('meeting-ended');
    renderMeetHome();
    if (e?.code !== 'cancelled') { mp().prepend(el('p', 'lead', errText(e))); noteFatal(e); }
    return;
  }
  clearInterval(fidget);
  const lines = (Array.isArray(res?.discussion) ? res.discussion : [])
    .filter(l => l && byKey(l.key) && typeof l.text === 'string' && l.text.trim())
    .map(l => ({ key: l.key, name: byKey(l.key).a.name, text: l.text.trim().slice(0, 900) }));
  const plan = (Array.isArray(res?.plan) ? res.plan : [])
    .filter(p => p && typeof p.step === 'string' && p.step.trim())
    .map(p => ({ step: p.step.trim().slice(0, 300), owner: typeof p.owner === 'string' ? p.owner : '', ownerName: byKey(p.owner)?.a.name || '' })).slice(0, 8);
  if (!lines.length) { meeting.running = false; everyoneBack(); emit('meeting-ended'); renderMeetHome(); mp().prepend(el('p', 'lead', ERR.invalid_json)); return; }
  const m = { id: 'm' + Date.now().toString(36), topic, lines, plan, summary: typeof res.summary === 'string' ? res.summary.slice(0, 500) : '', at: Date.now() };

  status.textContent = 'الاجتماع جارٍ';
  stop.textContent = 'عرض الكل';
  meeting.skipAll = false;
  stop.onclick = () => { meeting.skipAll = true; meeting.skip?.(); };
  for (const l of lines) {
    const ag = byKey(l.key); if (!ag) continue;
    S.speaker = ag;
    S.agents.forEach(o => gsap.to(o, { selA: o === ag ? 1 : 0, duration: D(0.4) }));
    ag.kick = 1; showBubble(ag, isFemale(ag.a) ? 'تتحدث…' : 'يتحدث…'); sendPulse(ag); boost(ag, 0.8, 1);
    mp().insertBefore(lineEl(l.name, ag.a.color, l.text), status);
    mp().scrollTop = mp().scrollHeight;
    if (!meeting.skipAll) await new Promise(r => { meeting.skip = r; setTimeout(r, Math.min(5200, 1400 + l.text.length * 28)); });
  }
  S.speaker = null; meeting.skip = null;
  S.agents.forEach(o => gsap.to(o, { selA: 0, duration: D(0.4) }));
  stormEvent(null, '#c9a6ff', 0.6);
  plan.forEach(p => { const ag = byKey(p.owner); if (ag) addLog(ag, p.step); });
  S.meetings = [m, ...S.meetings.filter(x => x.id !== m.id)].slice(0, 12);
  put('meetings', m.id, m);
  meeting.running = false; everyoneBack(); emit('meeting-ended');
  renderMeetResult(m, true);
  mp().scrollTop = mp().scrollHeight;
  if (isAutoRead()) listenButton(m).click();
}

export function initMeeting(hooks) {
  ui = hooks;
  $('meet-close').onclick = () => {
    if (meeting.running) { meeting.ctl?.abort(); meeting.skipAll = true; meeting.skip?.(); }
    hooks.setTab('office');
  };
}
