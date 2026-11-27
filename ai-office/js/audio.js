// Office sounds, all synthesized with Web Audio (no files): keyboard clicks, footsteps, pouring coffee or water,
// and a calm generative office tune. Everything is off until the viewer turns it on.
import { onFrame } from './scene.js';
import { S } from './state.js';

let ctx = null, master, sfxBus, musicBus, noiseBuf;
const prefs = { sfx: false, music: false, volume: 0.6 };
try { Object.assign(prefs, JSON.parse(localStorage.getItem('deskhive:audio') || '{}')); } catch {}
const savePrefs = () => { try { localStorage.setItem('deskhive:audio', JSON.stringify(prefs)); } catch {} };
export const audioPrefs = () => ({ ...prefs });

function ensure() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = prefs.volume; master.connect(ctx.destination);
  sfxBus = ctx.createGain(); sfxBus.gain.value = prefs.sfx ? 1 : 0; sfxBus.connect(master);
  musicBus = ctx.createGain(); musicBus.gain.value = prefs.music ? 0.5 : 0; musicBus.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return true;
}
/** Call from a click: sounds may only start after the viewer interacts. */
export function setAudio(next) {
  Object.assign(prefs, next); savePrefs();
  if (!(prefs.sfx || prefs.music) && !ctx) return;
  if (!ensure()) return;
  const t = ctx.currentTime;
  master.gain.setTargetAtTime(prefs.volume, t, 0.05);
  sfxBus.gain.setTargetAtTime(prefs.sfx ? 1 : 0, t, 0.1);
  musicBus.gain.setTargetAtTime(prefs.music ? 0.5 : 0, t, 0.6);
  if (prefs.music && !musicTimer) startMusic();
}

/* ------------------------------------------------------------------ effects */
function noise(dur, { freq = 2000, q = 1, type = 'bandpass', gain = 0.2, attack = 0.002, at = 0 } = {}) {
  const t = ctx.currentTime + at;
  const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(sfxBus);
  src.start(t, Math.random()); src.stop(t + dur + 0.05);
  return { f, t };
}
const keyClick = (vol = 1) => noise(0.035, { freq: 2600 + Math.random() * 1800, q: 3, gain: 0.05 * vol });
const footstep = (vol = 1) => noise(0.09, { freq: 160 + Math.random() * 60, type: 'lowpass', q: 0.7, gain: 0.16 * vol, attack: 0.004 });
function pour() {
  const { f, t } = noise(1.4, { freq: 900, q: 6, gain: 0.07, attack: 0.08 });
  f.frequency.setValueAtTime(700, t); f.frequency.linearRampToValueAtTime(1500, t + 1.3);
}
function chime() { // a soft two-note ping, used when work is finished
  [880, 1318.5].forEach((hz, i) => {
    const t = ctx.currentTime + i * 0.12, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = hz; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.06, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 1);
  });
}
export function playChime() { if (ctx && prefs.sfx) chime(); }

/* ------------------------------------------------------------------ calm generative music */
let musicTimer = 0, step = 0;
const CHORDS = [[57, 60, 64, 67], [53, 57, 60, 64], [48, 52, 55, 59], [55, 59, 62, 65]]; // Am7 Fmaj7 Cmaj7 G7
const hz = m => 440 * Math.pow(2, (m - 69) / 12);
function pad(notes, t, dur) {
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.connect(musicBus);
  notes.forEach((m, i) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = i % 2 ? 'triangle' : 'sine'; o.frequency.value = hz(m); o.detune.value = (Math.random() - 0.5) * 8;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.045, t + 1.2); g.gain.setValueAtTime(0.045, t + dur - 1.2); g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g); g.connect(lp); o.start(t); o.stop(t + dur + 0.1);
  });
}
function pluck(m, t) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'triangle'; o.frequency.value = hz(m + 12);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.035, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
  o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + 1.2);
}
function startMusic() {
  const bar = 4.8;
  const schedule = () => {
    if (!prefs.music) { musicTimer = 0; return; }
    const t = ctx.currentTime + 0.1, chord = CHORDS[step % CHORDS.length];
    pad(chord, t, bar + 0.6);
    [0, 1, 2, 3, 2, 1].forEach((k, i) => { if (Math.random() < 0.7) pluck(chord[k], t + 0.4 + i * 0.7); });
    step++; musicTimer = setTimeout(schedule, bar * 1000);
  };
  schedule();
}

/* ------------------------------------------------------------------ react to what happens on the viewed floor */
const lastStep = new Map();
let keyAcc = 0;
onFrame(dt => {
  if (!ctx || !prefs.sfx || ctx.state !== 'running') return;
  const here = S.agents.filter(o => o.curFloor === S.viewFloor);
  // typing: a light patter whose density follows how many are working
  const typing = here.filter(o => o.mv.state === 'desk' && (o.a.working || o.task)).length;
  keyAcc += dt * typing * 2.2;
  while (keyAcc > 1) { keyAcc -= 1; if (Math.random() < 0.8) keyClick(S.focused && S.focused.mv.state === 'desk' ? 1.3 : 0.7); }
  // footsteps: one soft step each time a leg swings through
  here.forEach(o => {
    if (o.mv.state !== 'walk') { lastStep.delete(o); return; }
    const n = Math.floor(o.mv.phase / Math.PI), prev = lastStep.get(o);
    if (prev !== undefined && n !== prev) footstep(S.follow === o ? 1.4 : 0.6);
    lastStep.set(o, n);
    // pouring when someone reaches the coffee corner or the water cooler
  });
  here.forEach(o => {
    const k = o.mv.state === 'away' ? o.mv.dest?.kind : null;
    if ((k === 'coffee' || k === 'cooler') && !o._poured) { o._poured = true; pour(); }
    if (!k) o._poured = false;
  });
});
