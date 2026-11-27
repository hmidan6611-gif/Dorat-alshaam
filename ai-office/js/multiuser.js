// Colleagues in the office: everyone who has the page open appears as a holographic avatar with their name,
// walks to the agent they are talking to, and you see them live. Shares only presence (position, floor,
// who they talk to); each person's tasks and chats stay private to them.
import { THREE, onFrame, camera, renderer, glow, mesh, std } from './scene.js';
import { S, byKey } from './state.js';
import { FL, floorById } from './floors.js';
import { findPath } from './nav.js';
import { officeDoorOut, roomMax } from './layout.js';
import { $, el, button, on, isPhone } from './util.js';
import { openModal } from './modal.js';

const ARTIFACT_URL = 'https://claude.ai/artifact/4qqVdf8fXWjufGWxNkkesh';
const COLORS = ['#22d3ee', '#a3e635', '#f472b6', '#facc15', '#fb923c', '#c084fc'];
let room = null, user = null, me = null;
const avatars = new Map(); // peer id -> {g, tag, target, path, floor}
const names = new Map();   // user id -> display name

function makeAvatar(color) {
  const g = new THREE.Group();
  const mat = glow(color, 0.55);
  mesh(new THREE.CapsuleGeometry(0.22, 0.7, 6, 14), mat, 0, 0.75, 0, g).castShadow = false;
  mesh(new THREE.SphereGeometry(0.2, 18, 14), glow(color, 0.75), 0, 1.45, 0, g).castShadow = false;
  const ring = mesh(new THREE.RingGeometry(0.32, 0.4, 32), glow(color, 0.8), 0, 0.02, 0, g); ring.rotation.x = -Math.PI / 2; ring.castShadow = false;
  const tag = el('div', 'tag'); tag.style.setProperty('--c', color);
  const pill = el('div', 'pill'); pill.append(el('span', 'dot'), el('span', 'nm', '')); const say = el('div', 'bubble');
  tag.append(say, pill); $('labels').append(tag);
  return { g, tag, pill, say, path: [], pos: new THREE.Vector3(6, 0, -3.6), floor: 'main' };
}
function place(av, floor) { const grp = FL.groups.get(floor); if (grp && av.g.parent !== grp) grp.add(av.g); av.floor = floor; }

/* ------------------------------------------------------------------ my own avatar */
function myColor() { let h = 0; for (const c of (me?.id || 'me')) h = (h * 31 + c.charCodeAt(0)) >>> 0; return COLORS[h % COLORS.length]; }
let mine = null, lastSent = 0;
function walkMine(x, z) {
  if (!mine) return;
  mine.path = findPath(S.viewFloor, { x: mine.pos.x, z: mine.pos.z }, { x, z }) || [{ x, z }];
  if (mine.floor !== S.viewFloor) { place(mine, S.viewFloor); }
  share();
}
function share(extra = {}) {
  if (!room || !mine) return;
  const t = mine.path[mine.path.length - 1] || mine.pos;
  room.presence({ x: +t.x.toFixed(2), z: +t.z.toFixed(2), floor: mine.floor, color: mine.color, talking: S.focused?.a.key || null, ...extra }).catch(() => {});
}

/* ------------------------------------------------------------------ peers */
async function nameOf(peer) {
  if (!peer.by) return 'زائر';
  if (names.has(peer.by)) return names.get(peer.by);
  try { const ps = await user.profiles([peer.by]); const n = ps?.[peer.by]?.name || 'زميل'; names.set(peer.by, n); return n; } catch { return 'زميل'; }
}
function onPeers({ peers }) {
  const seen = new Set();
  peers.filter(p => !p.isMe && p.kind === 'viewer').forEach(p => {
    seen.add(p.peer);
    let av = avatars.get(p.peer);
    const pr = p.presence || {};
    if (!av) { av = makeAvatar(typeof pr.color === 'string' && /^#[0-9a-f]{6}$/i.test(pr.color) ? pr.color : '#22d3ee'); avatars.set(p.peer, av); nameOf(p).then(n => { av.pill.querySelector('.nm').textContent = n; av.name = n; renderPeople(); }); }
    const floor = typeof pr.floor === 'string' && FL.groups.has(pr.floor) ? pr.floor : 'main';
    place(av, floor);
    if (typeof pr.x === 'number' && typeof pr.z === 'number') av.path = findPath(floor, { x: av.pos.x, z: av.pos.z }, { x: pr.x, z: pr.z }) || [{ x: pr.x, z: pr.z }];
    const ag = typeof pr.talking === 'string' ? byKey(pr.talking) : null;
    av.say.textContent = ag ? `يتحدث مع ${ag.a.name}` : ''; av.say.classList.toggle('on', !!ag);
  });
  for (const [id, av] of avatars) if (!seen.has(id)) { av.g.parent?.remove(av.g); av.tag.remove(); avatars.delete(id); }
  renderPeople();
}
function renderPeople() {
  const chip = $('people'); if (!chip) return;
  const n = avatars.size;
  chip.hidden = !room;
  chip.textContent = n ? `في المكتب الآن: أنت و${n === 1 ? 'زميل واحد' : n === 2 ? 'زميلان' : n + ' زملاء'}` : 'أنت وحدك في المكتب';
  chip.title = [...avatars.values()].map(a => a.name || 'زميل').join('، ');
}

/* ------------------------------------------------------------------ frame: move and label avatars */
const v = new THREE.Vector3();
function step(av, dt) {
  const t = av.path[0]; if (!t) return;
  const dx = t.x - av.pos.x, dz = t.z - av.pos.z, d = Math.hypot(dx, dz), s = 2.2 * dt;
  if (d <= s) { av.pos.set(t.x, 0, t.z); av.path.shift(); } else { av.pos.x += dx / d * s; av.pos.z += dz / d * s; av.g.rotation.y = Math.atan2(dx, dz); }
}
onFrame((dt, time) => {
  const all = mine ? [mine, ...avatars.values()] : [...avatars.values()];
  all.forEach(av => {
    step(av, dt);
    av.g.position.set(av.pos.x, Math.sin(time * 2 + av.pos.x) * 0.05, av.pos.z);
    if (av.floor !== S.viewFloor || S.replay) { av.tag.style.opacity = 0; return; }
    v.set(av.pos.x, 2.05, av.pos.z).project(camera);
    av.tag.style.transform = `translate(${(v.x * 0.5 + 0.5) * innerWidth}px, ${(-v.y * 0.5 + 0.5) * innerHeight}px) translate(-50%, -100%)`;
    av.tag.style.opacity = 1;
  });
  if (mine && performance.now() - lastSent > 4000) { lastSent = performance.now(); share(); }
});

/* ------------------------------------------------------------------ invite */
export function openInvite() {
  const frag = document.createDocumentFragment();
  frag.append(el('p', 'lead', 'لدعوة زملائك: افتح قائمة «مشاركة» (Share) في claude.ai وأعطهم صلاحية الوصول، ثم أرسل لهم هذا الرابط. سيظهر كل من يفتح المكتب كأفاتار باسمه، ويرى الوكلاء ويكلمهم.'));
  const link = el('div', 'doc', ARTIFACT_URL); link.dir = 'ltr'; frag.append(link);
  frag.append(el('p', 'lead', 'مهام كل زميل ومحادثاته خاصة به، وردود الوكلاء له تُحتسب من حسابه هو في Claude.'));
  const copy = button('btn primary', 'انسخ الرابط', async () => {
    try { await navigator.clipboard.writeText(ARTIFACT_URL); copy.textContent = 'نُسخ'; }
    catch { const r = document.createRange(); r.selectNodeContents(link); const s = getSelection(); s.removeAllRanges(); s.addRange(r); copy.textContent = 'الرابط محدد، انسخه'; }
  });
  openModal('ادعُ زملاءك', frag, [copy]);
}

export async function initMultiuser() {
  if (!window.claude?.use) return;
  try { [room, user] = await Promise.all([window.claude.use('room'), window.claude.use('user')]); } catch { return; }
  if (!room) return;
  try { me = user ? await user.me() : null; } catch { me = null; }
  mine = makeAvatar(myColor()); mine.color = myColor(); mine.name = 'أنت';
  mine.pill.querySelector('.nm').textContent = 'أنت'; place(mine, S.viewFloor);
  room.onPeers(onPeers);
  share(); renderPeople();
  // you walk to whoever you talk to; clicking empty floor walks you there (not in edit or manager mode)
  on('agents-changed', () => { if (S.focused && mine) { const d = officeDoorOut(S.focused.rec.obj); if (Math.hypot(d.x - mine.pos.x, d.z - mine.pos.z) > 0.5 && !mine.path.length) walkMine(d.x, d.z); } });
  on('floor-changed', id => { if (mine) { place(mine, id); mine.path = []; share(); } });
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
  let down = null;
  renderer.domElement.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener('pointerup', e => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6 || S.editing || S.manager || S.replay || isPhone() && S.panel) return;
    setTimeout(() => {
      if (S.focused) return; // the click opened an agent
      ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
      const hi = roomMax(floorById(S.viewFloor)) - 0.3;
      if (ray.ray.intersectPlane(plane, hit) && hit.x > -7.7 && hit.z > -7.7 && hit.x < hi && hit.z < hi) walkMine(hit.x, hit.z);
    }, 60);
  });
}
export { std };
