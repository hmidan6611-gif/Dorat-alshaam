// Live screens: a holographic panel above each desk shows the agent's real work as it is being written
// (task output, chat replies, plans). It always faces the camera, so it can be read when you zoom in.
import { THREE, camera, onFrame } from './scene.js';
import { S } from './state.js';
import { toFloor, OFFICE } from './layout.js';

const W = 768, H = 470, PAD = 26;
const FONT = '"IBM Plex Sans Arabic", "Segoe UI", Tahoma, sans-serif', MONO = '"JetBrains Mono", ui-monospace, monospace';

function makeHolo(ag) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 2.7 * H / W), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
  mesh.renderOrder = 5; mesh.visible = false;
  return { c, ctx: c.getContext('2d'), tex, mesh, dirty: true, last: 0, title: '', text: '', kind: '', until: 0 };
}

/** Wrap text to lines that fit the width; Arabic is drawn right-to-left. */
function wrap(ctx, text, maxW) {
  const out = [];
  for (const para of text.split('\n')) {
    if (!para.trim()) { out.push(''); continue; }
    let line = '';
    for (const w of para.split(/\s+/)) {
      const t = line ? line + ' ' + w : w;
      if (ctx.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t;
    }
    out.push(line);
  }
  return out;
}
function draw(ag) {
  const h = ag.holo, x = h.ctx, color = ag.a.color;
  x.clearRect(0, 0, W, H);
  // panel
  x.fillStyle = 'rgba(6,10,26,0.88)'; x.strokeStyle = color; x.lineWidth = 4;
  x.beginPath(); x.roundRect(4, 4, W - 8, H - 8, 22); x.fill(); x.stroke();
  x.fillStyle = color; x.globalAlpha = 0.14; x.fillRect(4, 4, W - 8, 70); x.globalAlpha = 1;
  // header: who and what
  x.direction = 'rtl'; x.textAlign = 'right'; x.textBaseline = 'middle';
  x.fillStyle = color; x.font = `700 30px ${FONT}`;
  x.fillText(`${ag.a.name} · ${h.kind}`, W - PAD, 40);
  x.fillStyle = '#e9edff'; x.font = `500 24px ${FONT}`; x.textAlign = 'left'; x.direction = 'ltr';
  const pct = ag.progress >= 0 ? Math.round(ag.progress * 100) + '%' : '';
  x.fillText(pct, PAD, 40);
  // title
  x.direction = 'rtl'; x.textAlign = 'right'; x.fillStyle = '#ffffff'; x.font = `600 27px ${FONT}`;
  x.fillText(h.title.length > 46 ? h.title.slice(0, 45) + '…' : h.title, W - PAD, 102);
  // body: the newest lines of the work, code in a monospace face
  const code = /```|[{};]\s*$|^\s*(const|function|import|def|class)\b/m.test(h.text);
  x.font = code ? `400 22px ${MONO}` : `400 25px ${FONT}`;
  const lh = code ? 30 : 36;
  const lines = wrap(x, h.text.replace(/```\w*/g, ''), W - PAD * 2);
  const max = Math.floor((H - 150) / lh), view = lines.slice(-max);
  x.fillStyle = 'rgba(233,237,255,0.92)';
  if (code) { x.direction = 'ltr'; x.textAlign = 'left'; }
  view.forEach((l, i) => x.fillText(l, code ? PAD : W - PAD, 150 + i * lh));
  // blinking cursor while writing
  if (h.kind !== 'انتهى' && Math.floor(performance.now() / 500) % 2) {
    x.fillStyle = color; const y = 150 + (view.length - 1) * lh;
    x.fillRect(code ? PAD + x.measureText(view[view.length - 1] || '').width + 6 : W - PAD - x.measureText(view[view.length - 1] || '').width - 16, y - 13, 10, 26);
  }
  h.tex.needsUpdate = true; h.dirty = false;
}

/** Show live work on an agent's screen. kind: what it is ("مهمة", "محادثة", "خطة", "تقرير"). */
export function setLive(ag, { title, text, kind }) {
  if (!ag) return;
  ag.holo ||= makeHolo(ag);
  const h = ag.holo;
  if (title != null) h.title = title; if (text != null) h.text = text; if (kind) h.kind = kind;
  h.until = Infinity; h.dirty = true;
}
/** Work is finished: keep it on screen a little longer, then fade out. */
export function endLive(ag, ms = 9000) { if (ag?.holo) { ag.holo.kind = 'انتهى'; ag.holo.until = performance.now() + ms; ag.holo.dirty = true; } }

const v = new THREE.Vector3();
onFrame(dt => {
  const t = performance.now();
  S.agents.forEach(ag => {
    const h = ag.holo; if (!h) return;
    if (!h.mesh.parent || h.mesh.parent !== ag.robot.parent) ag.robot.parent?.add(h.mesh);
    const on = t < h.until && ag.curFloor === S.viewFloor;
    const target = on ? 0.95 : 0;
    h.mesh.material.opacity += (target - h.mesh.material.opacity) * Math.min(1, dt * 4);
    h.mesh.visible = h.mesh.material.opacity > 0.02;
    if (!h.mesh.visible) return;
    // above the desk, a bit towards the camera side
    const o = ag.rec.obj, p = toFloor(o, 0, OFFICE.DESK_Z + 0.4);
    h.mesh.position.set(p.x, 3.45, p.z);
    h.mesh.quaternion.copy(camera.quaternion);
    if ((h.dirty || h.kind !== 'انتهى') && t - h.last > 250) { h.last = t; draw(ag); }
  });
  void v;
});

/** World position of an agent's screen (for "read the screen" zoom). */
export function holoPos(ag) { const p = toFloor(ag.rec.obj, 0, OFFICE.DESK_Z + 0.4); return new THREE.Vector3(p.x, 3.45, p.z); }
/** Bring the screen back for a while (to read it), with the last work or a short note if there is none yet. */
export function showHolo(ag, ms = 25000) {
  if (!ag.holo || !ag.holo.text) setLive(ag, { title: ag.a.role, text: 'لا يوجد عمل حي الآن. أسند مهمة أو تحدث مع الوكيل لترى عمله يُكتب هنا.', kind: 'جاهز' });
  ag.holo.until = performance.now() + ms; ag.holo.dirty = true;
}
