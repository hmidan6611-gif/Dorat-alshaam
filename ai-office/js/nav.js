// Walking grid per floor: walls and furniture block cells, A* finds a path, and the path is straightened.
import { obstacles, roomMax } from './layout.js';

const CELL = 0.15, MIN = -8, N = Math.round(20 / CELL), EDGE = 7.75;
const grids = new Map(); // floorId -> Uint8Array (1 = blocked)
const toCell = v => Math.max(0, Math.min(N - 1, Math.floor((v - MIN) / CELL)));
const center = i => MIN + (i + 0.5) * CELL;

export function rebuildNav(floor) {
  const g = new Uint8Array(N * N), hi = roomMax(floor) - 0.25;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = center(i), z = center(j);
    if (x < -EDGE || x > hi || z < -EDGE || z > hi) g[j * N + i] = 1;
  }
  for (const o of floor.objects) for (const r of obstacles(o)) {
    const i1 = toCell(r.x1 - r.pad), i2 = toCell(r.x2 + r.pad), j1 = toCell(r.z1 - r.pad), j2 = toCell(r.z2 + r.pad);
    for (let j = j1; j <= j2; j++) for (let i = i1; i <= i2; i++) {
      const x = center(i), z = center(j);
      if (x >= r.x1 - r.pad && x <= r.x2 + r.pad && z >= r.z1 - r.pad && z <= r.z2 + r.pad) g[j * N + i] = 1;
    }
  }
  grids.set(floor.id, g);
}
export function isFree(floorId, x, z) {
  const g = grids.get(floorId); if (!g) return true;
  return !g[toCell(z) * N + toCell(x)];
}

function blockedFn(g, extra) {
  if (!extra?.length) return idx => g[idx] === 1;
  return idx => {
    if (g[idx]) return true;
    const x = center(idx % N), z = center((idx / N) | 0);
    return extra.some(e => (x - e.x) ** 2 + (z - e.z) ** 2 < e.r * e.r);
  };
}
function nearestFree(blocked, i0, j0) {
  if (!blocked(j0 * N + i0)) return [i0, j0];
  for (let r = 1; r < 14; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
    if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
    const i = i0 + di, j = j0 + dj;
    if (i >= 0 && j >= 0 && i < N && j < N && !blocked(j * N + i)) return [i, j];
  }
  return [i0, j0];
}

/* binary heap keyed by f-score */
class Heap {
  constructor() { this.a = []; this.f = []; }
  push(v, f) { const a = this.a, F = this.f; a.push(v); F.push(f); let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (F[p] <= F[i]) break; [a[p], a[i]] = [a[i], a[p]]; [F[p], F[i]] = [F[i], F[p]]; i = p; } }
  pop() { const a = this.a, F = this.f, top = a[0], last = a.pop(), lf = F.pop();
    if (a.length) { a[0] = last; F[0] = lf; let i = 0;
      for (;;) { const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < a.length && F[l] < F[m]) m = l; if (r < a.length && F[r] < F[m]) m = r;
        if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; [F[m], F[i]] = [F[i], F[m]]; i = m; } }
    return top; }
  get size() { return this.a.length; }
}

/** Path from -> to on a floor as [{x, z}], ending exactly at `to`. extra: [{x, z, r}] temporary blockers. */
export function findPath(floorId, from, to, extra) {
  const g = grids.get(floorId); if (!g) return [to];
  const blocked = blockedFn(g, extra);
  const [si, sj] = nearestFree(blocked, toCell(from.x), toCell(from.z));
  const [ti, tj] = nearestFree(blocked, toCell(to.x), toCell(to.z));
  const start = sj * N + si, goal = tj * N + ti;
  if (start === goal) return [to];
  const gs = new Float32Array(N * N).fill(Infinity), came = new Int32Array(N * N).fill(-1), closed = new Uint8Array(N * N);
  const h = idx => { const dx = Math.abs(idx % N - ti), dz = Math.abs(((idx / N) | 0) - tj); return (dx + dz) + (Math.SQRT2 - 2) * Math.min(dx, dz); };
  const open = new Heap(); gs[start] = 0; open.push(start, h(start));
  let found = false, guard = 0;
  while (open.size && guard++ < 40000) {
    const cur = open.pop(); if (closed[cur]) continue; closed[cur] = 1;
    if (cur === goal) { found = true; break; }
    const ci = cur % N, cj = (cur / N) | 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= N || j >= N) continue;
      const nb = j * N + i; if (closed[nb] || blocked(nb)) continue;
      if (di && dj && (blocked(cj * N + i) || blocked(j * N + ci))) continue; // no corner cutting
      const ng = gs[cur] + (di && dj ? Math.SQRT2 : 1);
      if (ng < gs[nb]) { gs[nb] = ng; came[nb] = cur; open.push(nb, ng + h(nb)); }
    }
  }
  if (!found) return null;
  const cells = []; for (let c = goal; c !== -1; c = came[c]) cells.push(c);
  cells.reverse();
  const pts = cells.map(c => ({ x: center(c % N), z: center((c / N) | 0) }));
  // straighten: keep only the points needed to see the next stretch
  const out = []; let k = 0;
  while (k < pts.length - 1) {
    let far = k + 1;
    for (let m = pts.length - 1; m > k + 1; m--) if (lineFree(blocked, pts[k], pts[m])) { far = m; break; }
    out.push(pts[far]); k = far;
  }
  if (out.length) out[out.length - 1] = { x: to.x, z: to.z }; else out.push({ x: to.x, z: to.z });
  return out;
}
function lineFree(blocked, a, b) {
  const d = Math.hypot(b.x - a.x, b.z - a.z), n = Math.ceil(d / (CELL * 0.5));
  for (let s = 1; s < n; s++) {
    const x = a.x + (b.x - a.x) * s / n, z = a.z + (b.z - a.z) * s / n;
    if (blocked(toCell(z) * N + toCell(x))) return false;
  }
  return true;
}
/** Is a rectangle (floor coords) free of other objects' footprints? used for placing offices. */
export const GRID = { CELL, N, MIN };
