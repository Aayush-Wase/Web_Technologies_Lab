import type { ClassNode, RelationType, Relationship } from '../model/types';
import { layoutNode } from './measure';
import { findPath, polylineHitsAny } from './avoid';

export interface Pt {
  x: number;
  y: number;
}
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export type Side = 'top' | 'right' | 'bottom' | 'left';
export type Routing = 'orthogonal' | 'straight';

export interface Route {
  points: Pt[];
}

export function rectOf(c: ClassNode): Rect {
  const l = layoutNode(c);
  return { x: c.x, y: c.y, w: l.w, h: l.h };
}

export function sideMid(r: Rect, side: Side): Pt {
  switch (side) {
    case 'top':
      return { x: r.x + r.w / 2, y: r.y };
    case 'bottom':
      return { x: r.x + r.w / 2, y: r.y + r.h };
    case 'left':
      return { x: r.x, y: r.y + r.h / 2 };
    case 'right':
      return { x: r.x + r.w, y: r.y + r.h / 2 };
  }
}

const opposite: Record<Side, Side> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };

interface Attach {
  relId: string;
  end: 's' | 't';
  side: Side;
  nodeId: string;
  /** coordinate of the far end used to order anchors along the side */
  sortKey: number;
}

/**
 * Compute the polyline for every relationship. Edges that meet the same side of
 * a node get their anchors spread along that side so they never stack.
 */
export function routeAll(
  rels: Relationship[],
  nodes: Map<string, ClassNode>,
  mode: Routing,
  avoid = true,
): Map<string, Route> {
  const rects = new Map<string, Rect>();
  nodes.forEach((n, id) => rects.set(id, rectOf(n)));

  const attaches: Attach[] = [];
  const loops: Relationship[] = [];
  const sidesOf = new Map<string, { s: Side; t: Side }>();

  for (const r of rels) {
    const a = rects.get(r.source);
    const b = rects.get(r.target);
    if (!a || !b) continue;
    if (r.source === r.target) {
      loops.push(r);
      continue;
    }
    const dx = b.x + b.w / 2 - (a.x + a.w / 2);
    const dy = b.y + b.h / 2 - (a.y + a.h / 2);
    const horiz = Math.abs(dx) / (a.w / 2 + b.w / 2) > Math.abs(dy) / (a.h / 2 + b.h / 2);
    const s: Side = horiz ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'bottom' : 'top';
    const t = opposite[s];
    sidesOf.set(r.id, { s, t });
    const vertical = s === 'left' || s === 'right';
    attaches.push({
      relId: r.id,
      end: 's',
      side: s,
      nodeId: r.source,
      sortKey: vertical ? b.y + b.h / 2 : b.x + b.w / 2,
    });
    attaches.push({
      relId: r.id,
      end: 't',
      side: t,
      nodeId: r.target,
      sortKey: vertical ? a.y + a.h / 2 : a.x + a.w / 2,
    });
  }

  // spread anchors
  const groups = new Map<string, Attach[]>();
  for (const at of attaches) {
    const k = `${at.nodeId}:${at.side}`;
    groups.set(k, [...(groups.get(k) ?? []), at]);
  }
  const anchor = new Map<string, Pt>();
  groups.forEach((list, key) => {
    const [nodeId, side] = key.split(':') as [string, Side];
    const r = rects.get(nodeId)!;
    list.sort((p, q) => p.sortKey - q.sortKey || p.relId.localeCompare(q.relId));
    const horizontalSide = side === 'top' || side === 'bottom';
    const len = horizontalSide ? r.w : r.h;
    const margin = Math.min(22, len / 4);
    list.forEach((at, i) => {
      const t = list.length === 1 ? 0.5 : i / (list.length - 1);
      const along = margin + t * (len - margin * 2);
      const p: Pt =
        side === 'top'
          ? { x: r.x + along, y: r.y }
          : side === 'bottom'
            ? { x: r.x + along, y: r.y + r.h }
            : side === 'left'
              ? { x: r.x, y: r.y + along }
              : { x: r.x + r.w, y: r.y + along };
      anchor.set(`${at.relId}:${at.end}`, p);
    });
  });

  const routes = new Map<string, Route>();
  for (const r of rels) {
    const sides = sidesOf.get(r.id);
    if (!sides) continue;
    const p1 = anchor.get(`${r.id}:s`)!;
    const p2 = anchor.get(`${r.id}:t`)!;
    if (mode === 'straight') {
      routes.set(r.id, { points: [p1, p2] });
      continue;
    }
    const horiz = sides.s === 'left' || sides.s === 'right';
    let pts: Pt[];
    if (horiz) {
      const mx = (p1.x + p2.x) / 2;
      pts = Math.abs(p1.y - p2.y) < 1 ? [p1, p2] : [p1, { x: mx, y: p1.y }, { x: mx, y: p2.y }, p2];
    } else {
      const my = (p1.y + p2.y) / 2;
      pts = Math.abs(p1.x - p2.x) < 1 ? [p1, p2] : [p1, { x: p1.x, y: my }, { x: p2.x, y: my }, p2];
    }
    if (avoid && rects.size <= 60) {
      const others: Rect[] = [];
      rects.forEach((rc, id) => id !== r.source && id !== r.target && others.push(rc));
      const own = [rects.get(r.source)!, rects.get(r.target)!];
      const blocked = polylineHitsAny(pts, others, -6) || polylineHitsAny(pts, own, 2);
      if (blocked) {
        const alt = findPath(p1, sides.s, p2, sides.t, [...others, ...own]);
        if (alt) pts = alt;
      }
    }
    routes.set(r.id, { points: pts });
  }

  loops.forEach((r, i) => {
    const b = rects.get(r.source)!;
    const out = 34 + i * 14;
    const y1 = b.y + Math.min(28, b.h * 0.3);
    const y2 = y1 + 30;
    routes.set(r.id, {
      points: [
        { x: b.x + b.w, y: y1 },
        { x: b.x + b.w + out, y: y1 },
        { x: b.x + b.w + out, y: y2 },
        { x: b.x + b.w, y: y2 },
      ],
    });
  });

  return routes;
}

export function polylinePath(pts: Pt[], radius = 10): string {
  if (pts.length < 2) return '';
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1];
    const cur = pts[i];
    const next = pts[i + 1];
    const l1 = Math.hypot(cur.x - prev.x, cur.y - prev.y);
    const l2 = Math.hypot(next.x - cur.x, next.y - cur.y);
    const r = Math.min(radius, l1 / 2, l2 / 2);
    if (r < 1) {
      d += ` L${cur.x},${cur.y}`;
      continue;
    }
    const a = { x: cur.x - ((cur.x - prev.x) / l1) * r, y: cur.y - ((cur.y - prev.y) / l1) * r };
    const b = { x: cur.x + ((next.x - cur.x) / l2) * r, y: cur.y + ((next.y - cur.y) / l2) * r };
    d += ` L${a.x},${a.y} Q${cur.x},${cur.y} ${b.x},${b.y}`;
  }
  const last = pts[pts.length - 1];
  return d + ` L${last.x},${last.y}`;
}

export function pathMidpoint(pts: Pt[]): { p: Pt; angle: number } {
  let total = 0;
  const segs: number[] = [];
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    segs.push(l);
    total += l;
  }
  let remain = total / 2;
  for (let i = 0; i < segs.length; i++) {
    if (remain <= segs[i] || i === segs.length - 1) {
      const t = segs[i] ? remain / segs[i] : 0;
      const a = pts[i];
      const b = pts[i + 1];
      return {
        p: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t },
        angle: Math.atan2(b.y - a.y, b.x - a.x),
      };
    }
    remain -= segs[i];
  }
  return { p: pts[0], angle: 0 };
}

export type EndMarker = 'triangle' | 'diamond-hollow' | 'diamond-filled' | 'arrow' | 'none';

export interface EdgeStyle {
  dashed: boolean;
  /** marker at the source end */
  sourceMarker: EndMarker;
  /** marker at the target end */
  targetMarker: EndMarker;
}

export const EDGE_STYLES: Record<RelationType, EdgeStyle> = {
  inheritance: { dashed: false, sourceMarker: 'none', targetMarker: 'triangle' },
  realization: { dashed: true, sourceMarker: 'none', targetMarker: 'triangle' },
  association: { dashed: false, sourceMarker: 'none', targetMarker: 'arrow' },
  aggregation: { dashed: false, sourceMarker: 'diamond-hollow', targetMarker: 'none' },
  composition: { dashed: false, sourceMarker: 'diamond-filled', targetMarker: 'none' },
  dependency: { dashed: true, sourceMarker: 'none', targetMarker: 'arrow' },
};

/** SVG path for a marker whose tip sits at the origin and points along +x. */
export function markerPath(m: EndMarker): string {
  switch (m) {
    case 'triangle':
      return 'M0,0 L-15,-8 L-15,8 Z';
    case 'diamond-hollow':
    case 'diamond-filled':
      return 'M0,0 L-11,-6.5 L-22,0 L-11,6.5 Z';
    case 'arrow':
      return 'M-13,-7 L0,0 L-13,7';
    default:
      return '';
  }
}

/** How far the line must be shortened so it does not poke through a marker. */
export function markerInset(m: EndMarker): number {
  return m === 'triangle' ? 15 : m === 'diamond-hollow' || m === 'diamond-filled' ? 22 : 0;
}

export function insetEnds(pts: Pt[], startInset: number, endInset: number): Pt[] {
  const out = pts.map((p) => ({ ...p }));
  const move = (from: Pt, toward: Pt, amount: number) => {
    const l = Math.hypot(toward.x - from.x, toward.y - from.y) || 1;
    return { x: from.x + ((toward.x - from.x) / l) * amount, y: from.y + ((toward.y - from.y) / l) * amount };
  };
  if (startInset && out.length > 1) out[0] = move(out[0], out[1], startInset);
  if (endInset && out.length > 1) out[out.length - 1] = move(out[out.length - 1], out[out.length - 2], endInset);
  return out;
}

export function boundsOf(nodes: ClassNode[], pad = 0): Rect | null {
  if (!nodes.length) return null;
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const n of nodes) {
    const r = rectOf(n);
    x1 = Math.min(x1, r.x);
    y1 = Math.min(y1, r.y);
    x2 = Math.max(x2, r.x + r.w);
    y2 = Math.max(y2, r.y + r.h);
  }
  return { x: x1 - pad, y: y1 - pad, w: x2 - x1 + pad * 2, h: y2 - y1 + pad * 2 };
}
