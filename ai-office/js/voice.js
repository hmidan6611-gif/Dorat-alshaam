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
  const clean = lines.filter(l => l.text && l.text.trim()).map(l => ({ text: l.text.slice(0, 2000), voice: l.voice || 'buttery' }));
  if (!clean.length) return;
  stopVoice();
  if (tts) {
    try { await tts.speak(clean); return; }
    catch (e) {
      if (e?.code === 'not_granted' || e?.code === 'unavailable') { tts = null; updateVoiceUI(); }
      else return;
    }
  }
  if (synth) clean.forEach(l => { const u = new SpeechSynthesisUtterance(l.text); u.lang = 'ar-SA'; synth.speak(u); });
}
export function playButton(getText, voice) {
  const b = el('button', 'play', '▶ استمع'); b.type = 'button'; b.hidden = !canSpeak();
  b.onclick = () => speakLines([{ text: getText(), voice }]);
  return b;
}

/* dictation into the chat input */
let dict = null, dictBase = '';
export let listening = false;
export const stopDictation = () => { if (listening) dict?.stop().catch(() => {}); };
export const resetDictation = () => { dictBase = ''; };

export function initVoice() {
  $('tts-toggle').onclick = () => {
    autoRead = !autoRead; try { localStorage.setItem('deskhive:autoRead', autoRead ? '1' : '0'); } catch {}
    updateVoiceUI(); if (!autoRead) stopVoice();
  };
  $('mic').onclick = () => {
    if (!dict) return;
    if (listening) { dict.stop().catch(() => {}); return; }
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
    d.onPartial(({ text }) => { $('msg-input').value = (dictBase + ' ' + text).trim(); });
    d.onFinal(({ text }) => { dictBase = (dictBase + ' ' + text).trim(); $('msg-input').value = dictBase; });
    d.onState(({ state, reason }) => {
      listening = state !== 'idle'; $('mic').classList.toggle('rec', listening);
      if (state === 'idle' && (reason === 'unavailable' || reason === 'not_granted')) $('mic').hidden = true;
    });
  }).catch(() => {});
}
