// Chat with one agent (the "محادثة" tab of the agent panel).
import { $, el, button, gsap, D, pick, emit, on } from './util.js';
import { S, isFemale } from './state.js';
import { put } from './store.js';
import { AI, aiReady, persona, errText, noteFatal } from './ai.js';
import { goHome, showBubble } from './agents.js';
import { sendPulse, stormEvent } from './scene.js';
import { addLog } from './log.js';
import { setLive, endLive } from './holo.js';
import { remember } from './growth.js';
import { checkBudget, recordUsage } from './usage.js';
import { playButton, speakAs, stopVoice, isAutoRead, stopDictation, resetDictation } from './voice.js';

let ctl = null, busy = false;
const msgs = () => $('msgs');
function bubble(text, cls = '') {
  const d = el('div', 'msg ' + cls); d.append(el('span', 'txt', text));
  msgs().appendChild(d); msgs().scrollTop = msgs().scrollHeight; return d;
}
const setTxt = (d, t) => { d.querySelector('.txt').textContent = t; };
const agentBubble = (ag, text) => { const d = bubble(text); d.append(playButton(() => d.querySelector('.txt').textContent, ag.a)); return d; };
const note = text => bubble(text, 'note');
on('chat-note', note);
export const saveChat = a => put('chats', a.key, { turns: a.history.slice(-40), at: Date.now() });

export function renderChat(ag) {
  const a = ag.a;
  ctl?.abort(); stopVoice(); stopDictation();
  msgs().replaceChildren(); agentBubble(ag, a.intro);
  a.history.forEach(t => (t.role === 'user' ? bubble(t.content, 'me') : agentBubble(ag, t.content)));
  const chips = $('chips'); chips.replaceChildren(); chips.style.setProperty('--c', a.color);
  Object.keys(a.chips).forEach(q => chips.appendChild(button('', q, () => ask(q))));
  setBusy(false);
}
export function stopChat() { ctl?.abort(); stopVoice(); stopDictation(); }
function setBusy(b) {
  busy = b;
  $('send-btn').setAttribute('aria-label', b ? 'إيقاف' : 'إرسال');
  $('send-btn').classList.toggle('stop', b);
  $('chips').querySelectorAll('button').forEach(x => { x.disabled = b; });
}
function celebrate(ag, reply) {
  const a = ag.a;
  if (!a.working) { a.working = true; emit('agents-changed'); }
  sendPulse(ag);
  gsap.delayedCall(D(1.1), () => stormEvent(ag, a.color, 0.7));
  S.tasksDoneToday++; emit('stats');
  addLog(ag, reply.split(/(?<=[.!؟?])\s/)[0]);
}

async function ask(q, spoken = false) {
  const ag = S.focused; if (!ag || busy) return;
  const a = ag.a, f = isFemale(a);
  msgs().querySelector('.confirm')?.remove();
  bubble(q, 'me');
  const memo = q.match(/^\s*تذك[ّ]?ر\s*(?:أن|ان)?[:،,]?\s*(.+)/s); if (memo) remember(ag, memo[1], 'chat');
  const t = bubble('', 'typing'); t.querySelector('.txt').innerHTML = '<i></i><i></i><i></i>';
  goHome(ag, true);
  ag.kick = 1; showBubble(ag, f ? 'تفكّر…' : 'يفكّر…');

  if (!aiReady()) {
    gsap.delayedCall(D(0.9), () => {
      t.remove();
      const reply = a.chips[q] || `تمام. سأعمل على «${q}» وأضع النتيجة في المخرجات عند الانتهاء.`;
      agentBubble(ag, reply);
      a.history.push({ role: 'user', content: q }, { role: 'assistant', content: reply }); saveChat(a);
      showBubble(ag, pick(a.tasks)); celebrate(ag, reply); emit('chat-replied', ag);
      if (spoken || isAutoRead()) speakAs(a, reply);
    });
    return;
  }
  try { checkBudget(ag); } catch (e) { t.remove(); note(e.message); return; }
  a.history.push({ role: 'user', content: q });
  const turns = [{ role: 'user', content: persona(ag, q) }, ...a.history.slice(-16)];
  ctl = new AbortController(); setBusy(true);
  let out = null;
  const ensureOut = () => { if (!out) { t.remove(); out = agentBubble(ag, ''); showBubble(ag, f ? 'تكتب…' : 'يكتب…'); } return out; };
  try {
    const { text } = await AI.sample(turns, { modelTier: 'complex', cache: false, signal: ctl.signal,
      onText: ({ text }) => { setTxt(ensureOut(), text); msgs().scrollTop = msgs().scrollHeight; setLive(ag, { title: q, text, kind: 'محادثة' }); } });
    const reply = text.trim() || '…';
    recordUsage(ag, turns.reduce((n, x) => n + x.content.length, 0), reply.length);
    setTxt(ensureOut(), reply);
    a.history.push({ role: 'assistant', content: reply }); saveChat(a); endLive(ag);
    showBubble(ag, pick(a.tasks)); celebrate(ag, reply); emit('chat-replied', ag);
    if ((spoken || isAutoRead()) && S.focused === ag) speakAs(a, reply);
  } catch (e) {
    if (e?.text) { setTxt(ensureOut(), e.text); a.history.push({ role: 'assistant', content: e.text }); }
    else { t.remove(); if (out && !out.querySelector('.txt').textContent) out.remove(); }
    saveChat(a);
    if (e?.code !== 'cancelled') { note(errText(e)); noteFatal(e); }
  } finally {
    setBusy(false); msgs().scrollTop = msgs().scrollHeight;
  }
}

// speaking to an agent: the chat mic sends to the open agent; the top-bar mic picks the agent by name
const strip = s => s.replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
on('voice-said', ({ target, text }) => {
  if (target === 'chat') { if (!S.focused) return; $('msg-input').value = ''; resetDictation(); ask(text, true); return; }
  const words = strip(text).split(/\s+/).slice(0, 4).map(w => w.replace(/^يا/, '').replace(/[،,.!؟?]/g, ''));
  const ag = S.agents.find(o => words.some(w => w && strip(o.a.name).startsWith(w) && w.length >= 2)) || S.focused || S.agents.find(o => o.a.ceo);
  if (!ag) return;
  const rest = text.replace(new RegExp('^\\s*(يا\\s*)?' + ag.a.name + '[،,\\s]*'), '').trim() || text;
  resetDictation();
  emit('select-agent', ag);
  setTimeout(() => { emit('open-tab', 'chat'); ask(rest, true); }, 350);
});

export function initChat({ onDeleteAgent }) {
  $('send').addEventListener('submit', e => {
    e.preventDefault();
    if (busy) { ctl?.abort(); return; }
    stopDictation();
    const v = $('msg-input').value.trim(); if (v) { ask(v); $('msg-input').value = ''; resetDictation(); }
  });
  // clear chat / delete a custom agent, confirmed inside the page
  $('chat-clear').onclick = () => {
    const ag = S.focused; if (!ag || busy) return;
    msgs().querySelector('.confirm')?.remove();
    const bar = el('div', 'confirm');
    bar.append(el('span', '', ag.a.custom ? `ماذا تريد أن تحذف من ${ag.a.name}؟` : `مسح محادثتك مع ${ag.a.name}؟ لا يمكن التراجع.`));
    bar.append(button('btn danger', 'مسح المحادثة', () => { ag.a.history = []; saveChat(ag.a); renderChat(ag); }));
    if (ag.a.custom) bar.append(button('btn danger', 'حذف الوكيل', () => onDeleteAgent(ag)));
    bar.append(button('btn', 'إلغاء', () => bar.remove()));
    msgs().append(bar); msgs().scrollTop = msgs().scrollHeight;
  };
}
