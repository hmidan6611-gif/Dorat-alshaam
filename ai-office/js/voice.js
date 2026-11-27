// Voice: replies read aloud (Claude voices, or the browser's voice as a fallback) and dictation into the chat box.
import { $, el, emit } from './util.js';

let tts = null, autoRead = false;
const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
try { autoRead = localStorage.getItem('deskhive:autoRead') === '1'; } catch {}

export const canSpeak = () => !!tts || !!synth;
export const isAutoRead = () => autoRead && canSpeak();

export function updateVoiceUI() {
  const b = $('tts-toggle'); b.hidden = !canSpeak(); b.setAttribute('aria-pressed', String(isAutoRead()));
  document.querySelectorAll('.play').forEach(p => { p.hidden = !canSpeak(); });
}
export function stopVoice() { try { tts?.stop().catch(() => {}); } catch {} try { synth?.cancel(); } catch {} }

/** lines: [{text, voice}] — handed over as one reading so speakers alternate. */
export async function speakLines(lines) {
  const clean = lines.filter(l => l.text && l.text.trim()).map(l => ({ text: l.text.slice(0, 2000), voice: l.voice || 'buttery', ...(l.rate ? { rate: l.rate } : {}) }));
  if (!clean.length) return;
  stopVoice();
  if (tts) {
    try { await tts.speak(clean); return; }
    catch (e) {
      if (e?.code === 'not_granted' || e?.code === 'unavailable') { tts = null; updateVoiceUI(); }
      else return;
    }
  }
  if (synth) clean.forEach(l => { const u = new SpeechSynthesisUtterance(l.text); u.lang = 'ar-SA'; u.rate = l.rate || 1; u.pitch = l.pitch || 1; synth.speak(u); });
}
/** Each agent sounds different: one of the four voices plus its own pace and pitch. */
export function voiceOf(a) {
  let h = 0; for (const ch of a.key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return { voice: a.voice || 'buttery', rate: 0.9 + (h % 7) * 0.035, pitch: a.gender === 'f' ? 1.1 + (h % 3) * 0.05 : 0.85 + (h % 3) * 0.05 };
}
export const speakAs = (a, text) => speakLines([{ text, ...voiceOf(a) }]);
export function playButton(getText, voiceOrAgent) {
  const b = el('button', 'play', '▶ استمع'); b.type = 'button'; b.hidden = !canSpeak();
  b.onclick = () => (typeof voiceOrAgent === 'object' ? speakAs(voiceOrAgent, getText()) : speakLines([{ text: getText(), voice: voiceOrAgent }]));
  return b;
}

/* dictation into the chat input */
let dict = null, dictBase = '', target = 'chat', heard = false; // target: 'chat' (agent panel) or 'talk' (top-bar mic)
export const hasDictation = () => !!dict;
export let listening = false;
export const stopDictation = () => { if (listening) dict?.stop().catch(() => {}); };
export const resetDictation = () => { dictBase = ''; };

export function initVoice() {
  $('tts-toggle').onclick = () => {
    autoRead = !autoRead; try { localStorage.setItem('deskhive:autoRead', autoRead ? '1' : '0'); } catch {}
    updateVoiceUI(); if (!autoRead) stopVoice();
  };
  // top-bar mic: say "يا ميرا ..." and it goes to that agent
  $('talk-btn').onclick = () => {
    if (!dict) return;
    if (listening) { dict.stop().catch(() => {}); return; }
    target = 'talk'; heard = false; dictBase = ''; $('talk-text').textContent = 'تكلّم الآن… ابدأ باسم الوكيل، مثل: يا ميرا لخّصي لي السوق';
    $('talk-pop').hidden = false;
    dict.start().catch(e => { $('talk-pop').hidden = true; if (e?.code === 'not_granted' || e?.code === 'unavailable') $('talk-btn').hidden = true; });
  };
  $('mic').onclick = () => {
    if (!dict) return;
    if (listening) { dict.stop().catch(() => {}); return; }
    target = 'chat'; heard = false;
    dictBase = $('msg-input').value.trim();
    dict.start().catch(e => {
      if (e?.code === 'not_granted' || e?.code === 'unavailable') $('mic').hidden = true;
      if (!['stopped', 'dismissed', 'no_gesture'].includes(e?.code)) emit('chat-note', e?.code === 'not_granted' ? 'لم يُسمح باستخدام الميكروفون.' : 'الإملاء الصوتي غير متاح الآن.');
    });
  };
  updateVoiceUI();
  if (!window.claude?.use) return;
  window.claude.use('tts').then(t => { tts = t; updateVoiceUI(); }).catch(() => {});
  window.claude.use('dictation').then(d => {
    if (!d) return;
    dict = d; $('mic').hidden = false;
    const out = () => (target === 'chat' ? $('msg-input') : $('talk-text'));
    d.onPartial(({ text }) => { heard = true; const o = out(); if (o.tagName === 'INPUT') o.value = (dictBase + ' ' + text).trim(); else o.textContent = (dictBase + ' ' + text).trim(); });
    d.onFinal(({ text }) => { heard = true; dictBase = (dictBase + ' ' + text).trim(); const o = out(); if (o.tagName === 'INPUT') o.value = dictBase; else o.textContent = dictBase; });
    d.onState(({ state, reason }) => {
      const was = listening;
      listening = state !== 'idle';
      $('mic').classList.toggle('rec', listening && target === 'chat'); $('talk-btn').classList.toggle('rec', listening && target === 'talk');
      $('talk-pop').hidden = !(listening && target === 'talk') && !$('talk-pop').dataset.keep;
      if (state === 'idle' && (reason === 'unavailable' || reason === 'not_granted')) { $('mic').hidden = true; $('talk-btn').hidden = true; }
      // finished speaking: send what was heard (spoken replies come back in the agent's voice)
      if (was && state === 'idle' && heard && dictBase.trim()) { emit('voice-said', { target, text: dictBase.trim() }); heard = false; }
    });
    $('talk-btn').hidden = false;
  }).catch(() => {});
}
