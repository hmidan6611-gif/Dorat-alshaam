// The reception desk: the approvals box lives here. A floating counter shows how many requests wait,
// and clicking the desk opens the box.
import { THREE, camera, renderer, onFrame } from './scene.js';
import { S } from './state.js';
import { FL } from './floors.js';
import { on } from './util.js';
import { openInbox, pending } from './approvals.js';

let sign, ctx, tex, count = -1;
function makeSign() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; ctx = c.getContext('2d');
  tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  sign = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.65), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
  sign.renderOrder = 4;
}
function draw(n) {
  if (!ctx) makeSign();
  count = n; const x = ctx;
  x.clearRect(0, 0, 256, 128);
  x.fillStyle = n ? 'rgba(229,72,77,.92)' : 'rgba(13,19,42,.9)'; x.beginPath(); x.roundRect(4, 4, 248, 120, 24); x.fill();
  x.strokeStyle = '#ffd166'; x.lineWidth = 4; x.stroke();
  x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.direction = 'rtl';
  x.font = '700 30px "Cairo", sans-serif'; x.fillText('الموافقات', 128, 40);
  x.font = '700 44px "Cairo", sans-serif'; x.fillText(n ? String(n) : '✓', 128, 88);
  tex.needsUpdate = true;
}
const deskRec = () => [...FL.drawn.values()].find(r => r.obj.type === 'reception');
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
let down = null;

export function initReception() {
  draw(pending().length);
  on('approvals-changed', () => draw(pending().length));
  renderer.domElement.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener('pointerup', e => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6 || S.editing || S.replay) return;
    const r = deskRec(); if (!r || !r.group.parent?.visible) return;
    ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
    if (ray.intersectObject(r.group, true).length) openInbox();
  });
  onFrame((dt, t) => {
    const r = deskRec(); if (!r) return;
    if (sign.parent !== r.group) r.group.add(sign);
    sign.position.set(0, 2.75 + Math.sin(t * 2) * 0.05, 0);
    sign.quaternion.copy(camera.quaternion); sign.quaternion.premultiply(r.group.quaternion.clone().invert());
    sign.scale.setScalar(count ? 1 + Math.sin(t * 5) * 0.04 : 1);
    if (r.parts.bot) r.parts.bot.rotation.y = Math.sin(t * 0.6) * 0.5;
  });
}
