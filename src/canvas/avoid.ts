import type { Pt, Rect, Side } from './geometry';

const NORMAL: Record<Side, Pt> = {
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const INFLATE = 14;
const STUB = 26;
const BEND_COST = 36;
const DIRS: Pt[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

/** Does an axis-aligned segment pass through the (open) interior of a rect? */
export function segmentHits(a: Pt, b: Pt, r: Rect, shrink = 0): boolean {
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);
  return (
    maxX > r.x + shrink &&
    minX < r.x + r.w - shrink &&
    maxY > r.y + shrink &&
    minY < r.y + r.h - shrink
  );
}

export function polylineHitsAny(pts: Pt[], rects: Rect[], shrink = 0): boolean {
  for (let i = 1; i < pts.length; i++) {
    for (const r of rects) if (segmentHits(pts[i - 1], pts[i], r, shrink)) return true;
  }
  return false;
}

class MinHeap {
  private keys: number[] = [];
  private vals: number[] = [];
  get size() {
    return this.keys.length;
  }
  push(key: number, val: number) {
    const k = this.keys;
    const v = this.vals;
    let i = k.length;
    k.push(key);
    v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= k[i]) break;
      [k[p], k[i]] = [k[i], k[p]];
      [v[p], v[i]] = [v[i], v[p]];
      i = p;
    }
  }
  pop(): number {
    const k = this.keys;
    const v = this.vals;
    const top = v[0];
    const lastK = k.pop()!;
    const lastV = v.pop()!;
    if (k.length) {
      k[0] = lastK;
      v[0] = lastV;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < k.length && k[l] < k[m]) m = l;
        if (r < k.length && k[r] < k[m]) m = r;
        if (m === i) break;
        [k[m], k[i]] = [k[i], k[m]];
        [v[m], v[i]] = [v[i], v[m]];
        i = m;
      }
    }
    return top;
  }
}

const uniqSorted = (vals: number[]) => [...new Set(vals.map((v) => Math.round(v * 2) / 2))].sort((a, b) => a - b);

function withChannels(vals: number[]): number[] {
  const out = [...vals];
  for (let i = 1; i < vals.length; i++) {
    if (vals[i] - vals[i - 1] > 3 * INFLATE) out.push((vals[i] + vals[i - 1]) / 2);
  }
  return uniqSorted(out);
}

/**
 * Find an orthogonal path from anchor p1 (leaving through side s1) to anchor p2
 * (entering through side s2) that avoids every obstacle rect. Returns null when
 * no route exists on the candidate grid.
 */
export function findPath(p1: Pt, s1: Side, p2: Pt, s2: Side, obstacles: Rect[]): Pt[] | null {
  const n1 = NORMAL[s1];
  const n2 = NORMAL[s2];
  const S: Pt = { x: p1.x + n1.x * STUB, y: p1.y + n1.y * STUB };
  const T: Pt = { x: p2.x + n2.x * STUB, y: p2.y + n2.y * STUB };

  const rects = obstacles.map((r) => ({
    x: r.x - INFLATE,
    y: r.y - INFLATE,
    w: r.w + INFLATE * 2,
    h: r.h + INFLATE * 2,
  }));
  const inside = (x: number, y: number) =>
    rects.some((r) => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h);
  if (inside(S.x, S.y) || inside(T.x, T.y)) return null;

  const xs = withChannels(uniqSorted([...rects.flatMap((r) => [r.x, r.x + r.w]), S.x, T.x]));
  const ys = withChannels(uniqSorted([...rects.flatMap((r) => [r.y, r.y + r.h]), S.y, T.y]));
  const nx = xs.length;
  const ny = ys.length;
  const xi = (x: number) => xs.findIndex((v) => Math.abs(v - x) < 0.51);
  const yi = (y: number) => ys.findIndex((v) => Math.abs(v - y) < 0.51);
  const sx = xi(S.x);
  const sy = yi(S.y);
  const tx = xi(T.x);
  const ty = yi(T.y);
  if (sx < 0 || sy < 0 || tx < 0 || ty < 0) return null;

  const idx = (x: number, y: number, d: number) => (y * nx + x) * 4 + d;
  const dist = new Float32Array(nx * ny * 4).fill(Infinity);
  const prev = new Int32Array(nx * ny * 4).fill(-1);
  const heap = new MinHeap();
  const startDir = DIRS.findIndex((d) => d.x === n1.x && d.y === n1.y);
  // direction in which the path must arrive at T so it enters p2 straight
  const arriveDir = DIRS.findIndex((d) => d.x === -n2.x && d.y === -n2.y);

  const h = (x: number, y: number) => Math.abs(xs[x] - T.x) + Math.abs(ys[y] - T.y);
  const start = idx(sx, sy, startDir);
  dist[start] = 0;
  heap.push(h(sx, sy), start);

  let goal = -1;
  let guard = 0;
  while (heap.size && guard++ < 60000) {
    const cur = heap.pop();
    const d = cur % 4;
    const cell = (cur - d) / 4;
    const cx = cell % nx;
    const cy = (cell - cx) / nx;
    if (cx === tx && cy === ty && d === arriveDir) {
      goal = cur;
      break;
    }
    const base = dist[cur];
    for (let nd = 0; nd < 4; nd++) {
      if (nd === (d + 2) % 4) continue; // no U-turns
      const ax = cx + DIRS[nd].x;
      const ay = cy + DIRS[nd].y;
      if (ax < 0 || ay < 0 || ax >= nx || ay >= ny) continue;
      const mx = (xs[cx] + xs[ax]) / 2;
      const my = (ys[cy] + ys[ay]) / 2;
      if (inside(mx, my) || inside(xs[ax], ys[ay])) continue;
      const len = Math.abs(xs[ax] - xs[cx]) + Math.abs(ys[ay] - ys[cy]);
      const cost = base + len + (nd === d ? 0 : BEND_COST);
      const ni = idx(ax, ay, nd);
      if (cost < dist[ni]) {
        dist[ni] = cost;
        prev[ni] = cur;
        heap.push(cost + h(ax, ay), ni);
      }
    }
  }
  if (goal < 0) return null;

  const path: Pt[] = [];
  for (let c = goal; c !== -1; c = prev[c]) {
    const d = c % 4;
    const cell = (c - d) / 4;
    const cx = cell % nx;
    path.push({ x: xs[cx], y: ys[(cell - cx) / nx] });
  }
  path.reverse();

  // assemble, dropping collinear / duplicate points
  const raw = [p1, ...path, p2];
  const out: Pt[] = [];
  for (const p of raw) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - p.x) < 0.01 && Math.abs(last.y - p.y) < 0.01) continue;
    out.push(p);
    while (out.length >= 3) {
      const a = out[out.length - 3];
      const b = out[out.length - 2];
      const c = out[out.length - 1];
      const collinear = (Math.abs(a.x - b.x) < 0.01 && Math.abs(b.x - c.x) < 0.01) || (Math.abs(a.y - b.y) < 0.01 && Math.abs(b.y - c.y) < 0.01);
      if (!collinear) break;
      out.splice(out.length - 2, 1);
    }
  }
  return out;
}
