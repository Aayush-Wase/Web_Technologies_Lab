import type { ClassNode, Relationship } from '../model/types';
import { layoutNode } from './measure';

/**
 * Layered auto-layout.
 *
 * Only structural relationships (inheritance, realization, aggregation,
 * composition) force vertical ordering — supertypes and "wholes" sit above their
 * subtypes and parts. Plain associations/dependencies are soft: they pull a node
 * toward its neighbours' row so diagrams stay wide and short instead of tall.
 */
export function autoLayout(classes: ClassNode[], rels: Relationship[]): Map<string, { x: number; y: number }> {
  const ids = classes.map((c) => c.id);
  const idSet = new Set(ids);
  const upperOf = new Map<string, Set<string>>();
  const neighbours = new Map<string, Set<string>>();
  const hardTouched = new Set<string>();
  for (const id of ids) {
    upperOf.set(id, new Set());
    neighbours.set(id, new Set());
  }

  const hard: [string, string][] = []; // [upper, lower]
  for (const r of rels) {
    if (!idSet.has(r.source) || !idSet.has(r.target) || r.source === r.target) continue;
    neighbours.get(r.source)!.add(r.target);
    neighbours.get(r.target)!.add(r.source);
    if (r.type === 'inheritance' || r.type === 'realization') hard.push([r.target, r.source]);
    else if (r.type === 'aggregation' || r.type === 'composition') hard.push([r.source, r.target]);
  }

  // break cycles with a DFS: ignore back edges
  const adj = new Map<string, string[]>();
  for (const [u, v] of hard) adj.set(u, [...(adj.get(u) ?? []), v]);
  const state = new Map<string, number>();
  const kept: [string, string][] = [];
  const dfs = (u: string) => {
    state.set(u, 1);
    for (const v of adj.get(u) ?? []) {
      if (state.get(v) === 1) continue;
      kept.push([u, v]);
      if (!state.get(v)) dfs(v);
    }
    state.set(u, 2);
  };
  const hasIncoming = new Set(hard.map(([, v]) => v));
  for (const id of ids) if (!hasIncoming.has(id) && !state.get(id)) dfs(id);
  for (const id of ids) if (!state.get(id)) dfs(id);
  for (const [u, v] of kept) {
    upperOf.get(v)!.add(u);
    hardTouched.add(u);
    hardTouched.add(v);
  }

  // longest-path layering over the hard edges
  const level = new Map<string, number>();
  const compute = (id: string): number => {
    const known = level.get(id);
    if (known !== undefined) return known;
    level.set(id, 0);
    let l = 0;
    for (const u of upperOf.get(id)!) l = Math.max(l, compute(u) + 1);
    level.set(id, l);
    return l;
  };
  ids.filter((id) => hardTouched.has(id)).forEach(compute);

  // free nodes (only soft links): sit in the row of their neighbours
  const placed = new Set(hardTouched);
  let progress = true;
  while (progress) {
    progress = false;
    for (const id of ids) {
      if (placed.has(id)) continue;
      const ls = [...neighbours.get(id)!].filter((n) => placed.has(n)).map((n) => level.get(n)!);
      if (!ls.length) continue;
      level.set(id, Math.round(ls.reduce((a, b) => a + b, 0) / ls.length));
      placed.add(id);
      progress = true;
    }
  }
  for (const id of ids) if (!placed.has(id)) level.set(id, 0);

  const maxLevel = Math.max(0, ...level.values());
  const rows: string[][] = Array.from({ length: maxLevel + 1 }, () => []);
  ids.forEach((id) => rows[level.get(id)!].push(id));

  // barycenter ordering sweeps (all links contribute)
  const index = new Map<string, number>();
  const reindex = () => rows.forEach((row) => row.forEach((id, i) => index.set(id, i - (row.length - 1) / 2)));
  reindex();
  const bary = (id: string) => {
    const xs = [...neighbours.get(id)!].map((n) => index.get(n)).filter((v): v is number => v !== undefined);
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : index.get(id)!;
  };
  for (let pass = 0; pass < 4; pass++) {
    const order = pass % 2 === 0 ? rows.map((_, i) => i) : rows.map((_, i) => rows.length - 1 - i);
    for (const l of order) {
      const keyed = rows[l].map((id) => [id, bary(id)] as const);
      keyed.sort((a, b) => a[1] - b[1]);
      rows[l] = keyed.map(([id]) => id);
      reindex();
    }
  }

  const byId = new Map(classes.map((c) => [c.id, c]));
  const GAP_X = 80;
  const GAP_Y = 120;
  const MAX_ROW_W = 1700;
  const pos = new Map<string, { x: number; y: number }>();
  let y = 0;
  for (const row of rows) {
    if (!row.length) continue;
    const chunks: string[][] = [[]];
    let w = 0;
    for (const id of row) {
      const nw = layoutNode(byId.get(id)!).w;
      if (w + nw > MAX_ROW_W && chunks[chunks.length - 1].length) {
        chunks.push([]);
        w = 0;
      }
      chunks[chunks.length - 1].push(id);
      w += nw + GAP_X;
    }
    for (const chunk of chunks) {
      const widths = chunk.map((id) => layoutNode(byId.get(id)!).w);
      const total = widths.reduce((a, b) => a + b, 0) + GAP_X * (chunk.length - 1);
      let x = -total / 2;
      let maxH = 0;
      chunk.forEach((id, i) => {
        pos.set(id, { x: Math.round(x / 10) * 10, y: Math.round(y / 10) * 10 });
        x += widths[i] + GAP_X;
        maxH = Math.max(maxH, layoutNode(byId.get(id)!).h);
      });
      y += maxH + GAP_Y;
    }
  }
  return pos;
}
