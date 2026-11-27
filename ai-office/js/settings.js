// Settings menu: sounds, music, volume, graphics quality; on phones also the camera, editor and rebuild buttons.
import { $, on } from './util.js';
import { setAudio, audioPrefs } from './audio.js';
import { setQuality, qualityMode, currentLevel, fps } from './quality.js';
import { runBuild } from './scene.js';
import { openReplay } from './replay.js';
import { THEMES, themeMode, setTheme } from './themes.js';
import { briefAuto, setBriefAuto } from './brief.js';
import { lightPrefs, setLight } from './lighting.js';

const LABEL = { low: 'منخفضة', balanced: 'متوازنة', high: 'عالية' };
function sync() {
  const p = audioPrefs();
  $('set-sfx').checked = p.sfx; $('set-music').checked = p.music; $('set-vol').value = Math.round(p.volume * 100);
  $('set-quality').value = qualityMode(); $('set-theme').value = themeMode(); $('set-brief').checked = briefAuto();
  const lp = lightPrefs(); $('set-bright').value = Math.round(lp.bright * 100); $('set-bright-v').textContent = Math.round(lp.bright * 100) + '%'; $('set-warmth').value = lp.warmth;
  $('set-q-now').textContent = `الآن: ${LABEL[currentLevel()]} · ≈ ${fps.now} إطار/ث`;
  $('sound-on').hidden = !(p.sfx || p.music);
}
export function initSettings() {
  const pop = $('settings-pop');
  $('settings-btn').onclick = () => { pop.hidden = !pop.hidden; if (!pop.hidden) sync(); };
  $('settings-close').onclick = () => { pop.hidden = true; };
  $('set-sfx').onchange = e => { setAudio({ sfx: e.target.checked }); sync(); };
  $('set-music').onchange = e => { setAudio({ music: e.target.checked }); sync(); };
  $('set-vol').oninput = e => setAudio({ volume: e.target.value / 100 });
  $('set-quality').onchange = e => { setQuality(e.target.value); sync(); };
  Object.entries(THEMES).forEach(([v, l]) => $('set-theme').append(new Option(l, v)));
  $('set-theme').onchange = e => setTheme(e.target.value);
  $('set-brief').onchange = e => setBriefAuto(e.target.checked);
  $('set-bright').oninput = e => { setLight({ bright: e.target.value / 100 }); $('set-bright-v').textContent = e.target.value + '%'; };
  $('set-warmth').onchange = e => setLight({ warmth: e.target.value });
  $('set-cam').onclick = () => { $('cam-btn').click(); pop.hidden = true; };
  $('set-edit').onclick = () => { $('edit-btn').click(); pop.hidden = true; };
  $('set-replay').onclick = () => { runBuild(); pop.hidden = true; };
  $('set-timeline').onclick = () => { pop.hidden = true; openReplay(); };
  on('fps', () => { if (!pop.hidden) sync(); });
  on('quality-changed', () => { if (!pop.hidden) sync(); });
  // sounds were on last time: they resume on the first tap anywhere (browsers need a gesture)
  const p = audioPrefs();
  if (p.sfx || p.music) addEventListener('pointerdown', () => setAudio({}), { once: true });
  sync();
}
