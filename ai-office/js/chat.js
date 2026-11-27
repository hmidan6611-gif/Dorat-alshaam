// Chat with one agent (the "محادثة" tab of the agent panel).
import { $, el, button, gsap, D, pick, emit, on } from './util.js';
import { S, isFemale } from './state.js';
import { put } from './store.js';
import { AI, aiReady, persona, errText, noteFatal } from './ai.js';
import { goHome, showBubble } from './agents.js';
import { sendPulse, stormEvent } from './scene.js';
import { addLog } from './log.js';
import { playButton, speakLines, stopVoice, isAutoRead, stopDictation, resetDictation } from './voice.js';

let ctl = null, busy = false;
const msgs = () => $('msgs');
function bubble(text, cls = '') {
  const d = el('div', 'msg ' + cls); d.append(el('span', 'txt', text));
  msgs().appendChild(d); msgs().scrollTop = msgs().scrollHeight; return d;
}
const setTxt = (d, t) => { d.querySelector('.txt').textContent = t; };
const agentBubble = (ag, text) => { const d = bubble(text); d.append(playButton(() => d.querySelector('.txt').textContent, ag.a.voice)); return d; };
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

async function ask(q) {
  const ag = S.focused; if (!ag || busy) return;
  const a = ag.a, f = isFemale(a);
  msgs().querySelector('.confirm')?.remove();
  bubble(q, 'me');
  const t = bubble('', 'typing'); t.querySelector('.txt').innerHTML = '<i></i><i></i><i></i>';
  goHome(ag, true);
  ag.kick = 1; showBubble(ag, f ? 'تفكّر…' : 'يفكّر…');

  if (!aiReady()) {
    gsap.delayedCall(D(0.9), () => {
      t.remove();
      const reply = a.chips[q] || `تمام. سأعمل على «${q}» وأضع النتيجة في المخرجات عند الانتهاء.`;
      agentBubble(ag, reply);
      a.history.push({ role: 'user', content: q }, { role: 'assistant', content: reply }); saveChat(a);
      showBubble(ag, pick(a.tasks)); celebrate(ag, reply);
      if (isAutoRead()) speakLines([{ text: reply, voice: a.voice }]);
    });
    return;
  }
  a.history.push({ role: 'user', content: q });
  const turns = [{ role: 'user', content: persona(ag) }, ...a.history.slice(-16)];
  ctl = new AbortController(); setBusy(true);
  let out = null;
  const ensureOut = () => { if (!out) { t.remove(); out = agentBubble(ag, ''); showBubble(ag, f ? 'تكتب…' : 'يكتب…'); } return out; };
  try {
    const { text } = await AI.sample(turns, { modelTier: 'complex', cache: false, signal: ctl.signal,
      onText: ({ text }) => { setTxt(ensureOut(), text); msgs().scrollTop = msgs().scrollHeight; } });
    const reply = text.trim() || '…';
    setTxt(ensureOut(), reply);
    a.history.push({ role: 'assistant', content: reply }); saveChat(a);
    showBubble(ag, pick(a.tasks)); celebrate(ag, reply);
    if (isAutoRead() && S.focused === ag) speakLines([{ text: reply, voice: a.voice }]);
  } catch (e) {
    if (e?.text) { setTxt(ensureOut(), e.text); a.history.push({ role: 'assistant', content: e.text }); }
    else { t.remove(); if (out && !out.querySelector('.txt').textContent) out.remove(); }
    saveChat(a);
    if (e?.code !== 'cancelled') { note(errText(e)); noteFatal(e); }
  } finally {
    setBusy(false); msgs().scrollTop = msgs().scrollHeight;
  }
}

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
