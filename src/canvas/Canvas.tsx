import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type PointerEvent as RPointerEvent,
  type ReactNode,
  type Ref,
} from 'react';
import type { ClassKind, ClassNode, Diagram, Issue, RelationType } from '../model/types';
import type { ChangeFn } from '../model/store';
import { ClassNodeView } from './ClassNodeView';
import { EdgeView } from './EdgeView';
import { boundsOf, rectOf, routeAll, sideMid, type Pt, type Routing, type Side } from './geometry';

export type Tool = 'select' | 'hand' | 'connect';

export interface Viewport {
  x: number;
  y: number;
  z: number;
}

export interface CanvasHandle {
  fit: (ids?: string[]) => void;
  zoomBy: (factor: number) => void;
  setZoom: (z: number) => void;
  focus: (id: string) => void;
  center: () => Pt;
  exportSvg: (background: boolean) => { svg: string; width: number; height: number } | null;
}

interface Props {
  ref?: Ref<CanvasHandle>;
  doc: Diagram;
  selected: string[];
  onSelect: (ids: string[]) => void;
  tool: Tool;
  relType: RelationType;
  onToolChange: (t: Tool) => void;
  routing: Routing;
  snap: boolean;
  issues: Issue[];
  change: ChangeFn;
  onConnect: (source: string, target: string, type: RelationType) => void;
  onConnectNew: (source: string, at: Pt, type: RelationType) => void;
  onAddClassAt: (kind: ClassKind, at: Pt) => void;
  onEditName: (id: string) => void;
  onZoom: (z: number) => void;
  children?: ReactNode;
}

const MIN_Z = 0.15;
const MAX_Z = 2.5;
const GRID = 10;
const DIAGRAM_TOKENS = [
  '--d-node-bg', '--d-node-border', '--d-divider', '--d-text', '--d-text-muted', '--d-edge', '--d-label-bg',
  '--d-class', '--d-abstract', '--d-interface', '--d-enum', '--d-accent', '--d-error', '--d-warn',
  '--d-vis-public', '--d-vis-private', '--d-vis-protected', '--d-vis-package', '--d-canvas',
  '--d-shadow-a', '--d-shadow-b',
];

type Drag =
  | { kind: 'pan'; startX: number; startY: number; vx: number; vy: number }
  | { kind: 'marquee'; start: Pt; additive: boolean; base: string[] }
  | {
      kind: 'move';
      ids: string[];
      starts: Map<string, Pt>;
      origin: Pt;
      screen: Pt;
      moved: boolean;
      collapseTo: string | null;
    }
  | { kind: 'connect'; from: string; side?: Side; viaHandle: boolean; screen: Pt };

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export function Canvas(props: Props) {
  const {
    doc, selected, onSelect, tool, relType, onToolChange, routing, snap, issues, change,
    onConnect, onConnectNew, onAddClassAt, onEditName, onZoom, children,
  } = props;

  const wrapRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<SVGGElement>(null);
  const [vp, setVp] = useState<Viewport>({ x: 120, y: 80, z: 1 });
  const vpRef = useRef(vp);
  vpRef.current = vp;
  const drag = useRef<Drag | null>(null);
  const [marquee, setMarquee] = useState<{ a: Pt; b: Pt } | null>(null);
  const [preview, setPreview] = useState<{ from: Pt; to: Pt; hover: string | null } | null>(null);
  const [space, setSpace] = useState(false);
  const [panning, setPanning] = useState(false);
  const [moving, setMoving] = useState(false);

  const nodes = useMemo(() => new Map(doc.classes.map((c) => [c.id, c])), [doc.classes]);
  const routes = useMemo(() => routeAll(doc.relationships, nodes, routing, !moving), [doc.relationships, nodes, routing, moving]);
  const routesRef = useRef(routes);
  routesRef.current = routes;
  const docRef = useRef(doc);
  docRef.current = doc;

  const issueByClass = useMemo(() => {
    const m = new Map<string, Issue[]>();
    for (const i of issues) if (i.classId) m.set(i.classId, [...(m.get(i.classId) ?? []), i]);
    return m;
  }, [issues]);

  useEffect(() => onZoom(vp.z), [vp.z, onZoom]);

  // ---- coordinates ----
  const toWorld = useCallback((cx: number, cy: number): Pt => {
    const r = wrapRef.current!.getBoundingClientRect();
    const v = vpRef.current;
    return { x: (cx - r.left - v.x) / v.z, y: (cy - r.top - v.y) / v.z };
  }, []);

  const zoomAt = useCallback((factor: number, sx?: number, sy?: number) => {
    const r = wrapRef.current!.getBoundingClientRect();
    const px = sx ?? r.width / 2;
    const py = sy ?? r.height / 2;
    setVp((v) => {
      const z = clamp(v.z * factor, MIN_Z, MAX_Z);
      const k = z / v.z;
      return { z, x: px - (px - v.x) * k, y: py - (py - v.y) * k };
    });
  }, []);

  const fit = useCallback((ids?: string[]) => {
    const r = wrapRef.current!.getBoundingClientRect();
    const list = ids?.length
      ? docRef.current.classes.filter((c) => ids.includes(c.id))
      : docRef.current.classes;
    const b = boundsOf(list);
    if (!b) {
      setVp({ x: r.width / 2, y: r.height / 2, z: 1 });
      return;
    }
    const pad = 90;
    const z = clamp(Math.min((r.width - pad * 2) / b.w, (r.height - pad * 2) / b.h), MIN_Z, 1.1);
    setVp({ z, x: (r.width - b.w * z) / 2 - b.x * z, y: (r.height - b.h * z) / 2 - b.y * z });
  }, []);

  useImperativeHandle(
    props.ref,
    () => ({
      fit,
      zoomBy: (f) => zoomAt(f),
      setZoom: (z) => zoomAt(z / vpRef.current.z),
      focus: (id) => {
        const c = docRef.current.classes.find((k) => k.id === id);
        if (!c) return;
        const r = wrapRef.current!.getBoundingClientRect();
        const rc = rectOf(c);
        setVp((v) => ({ ...v, x: r.width / 2 - (rc.x + rc.w / 2) * v.z, y: r.height / 2 - (rc.y + rc.h / 2) * v.z }));
      },
      center: () => {
        const r = wrapRef.current!.getBoundingClientRect();
        return toWorld(r.left + r.width / 2, r.top + r.height / 2);
      },
      exportSvg: (background) => {
        const world = worldRef.current;
        const d = docRef.current;
        if (!world || !d.classes.length) return null;
        let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
        for (const c of d.classes) {
          const r = rectOf(c);
          x1 = Math.min(x1, r.x); y1 = Math.min(y1, r.y);
          x2 = Math.max(x2, r.x + r.w); y2 = Math.max(y2, r.y + r.h);
        }
        routesRef.current.forEach((rt) =>
          rt.points.forEach((p) => {
            x1 = Math.min(x1, p.x - 30); y1 = Math.min(y1, p.y - 30);
            x2 = Math.max(x2, p.x + 30); y2 = Math.max(y2, p.y + 30);
          }),
        );
        const pad = 40;
        const x = x1 - pad, y = y1 - pad, w = x2 - x1 + pad * 2, h = y2 - y1 + pad * 2;
        const clone = world.cloneNode(true) as SVGGElement;
        clone.removeAttribute('transform');
        clone.querySelectorAll('[data-export-ignore], .cf-select-ring, [data-hit]').forEach((el) => el.remove());
        const cs = getComputedStyle(document.documentElement);
        const vars = DIAGRAM_TOKENS.map((t) => `${t}:${cs.getPropertyValue(t).trim()}`).join(';');
        const bg = background ? `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${cs.getPropertyValue('--d-canvas').trim()}"/>` : '';
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(w)}" height="${Math.ceil(h)}" viewBox="${x} ${y} ${w} ${h}" style="${vars}">${bg}${clone.innerHTML}</svg>`;
        return { svg, width: Math.ceil(w), height: Math.ceil(h) };
      },
    }),
    [fit, zoomAt, toWorld],
  );

  // ---- wheel: ctrl/⌘ zooms, plain wheel pans ----
  useEffect(() => {
    const el = wrapRef.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const r = el.getBoundingClientRect();
        zoomAt(Math.exp(-e.deltaY * 0.0022), e.clientX - r.left, e.clientY - r.top);
      } else {
        setVp((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  // ---- space = temporary hand tool ----
  useEffect(() => {
    const typing = (t: EventTarget | null) =>
      t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !typing(e.target)) {
        e.preventDefault();
        setSpace(true);
      }
    };
    const up = (e: KeyboardEvent) => e.code === 'Space' && setSpace(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // ---- hit testing ----
  const nodeAt = useCallback((p: Pt): string | null => {
    const list = docRef.current.classes;
    for (let i = list.length - 1; i >= 0; i--) {
      const r = rectOf(list[i]);
      if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) return list[i].id;
    }
    return null;
  }, []);

  const anchorFor = useCallback((id: string, toward: Pt, side?: Side): Pt => {
    const c = nodes.get(id)!;
    const r = rectOf(c);
    if (side) return sideMid(r, side);
    const dx = toward.x - (r.x + r.w / 2);
    const dy = toward.y - (r.y + r.h / 2);
    const horiz = Math.abs(dx) / (r.w / 2) > Math.abs(dy) / (r.h / 2);
    return sideMid(r, horiz ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'bottom' : 'top');
  }, [nodes]);

  // ---- pointer interaction ----
  const onPointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.button === 2) return;
    const target = e.target as Element;
    if (target.closest('[data-overlay]')) return;
    const world = toWorld(e.clientX, e.clientY);
    const wrap = wrapRef.current!;

    if (e.button === 1 || tool === 'hand' || space) {
      e.preventDefault();
      drag.current = { kind: 'pan', startX: e.clientX, startY: e.clientY, vx: vpRef.current.x, vy: vpRef.current.y };
      setPanning(true);
      wrap.setPointerCapture(e.pointerId);
      return;
    }

    const handleEl = target.closest('[data-handle]');
    const nodeEl = target.closest('[data-node-id]');
    const nodeId = nodeEl?.getAttribute('data-node-id') ?? null;

    if (handleEl && nodeId) {
      drag.current = {
        kind: 'connect',
        from: nodeId,
        side: handleEl.getAttribute('data-handle') as Side,
        viaHandle: true,
        screen: { x: e.clientX, y: e.clientY },
      };
      const a = anchorFor(nodeId, world, handleEl.getAttribute('data-handle') as Side);
      setPreview({ from: a, to: world, hover: null });
      wrap.setPointerCapture(e.pointerId);
      return;
    }

    if (tool === 'connect') {
      if (nodeId) {
        drag.current = { kind: 'connect', from: nodeId, viaHandle: false, screen: { x: e.clientX, y: e.clientY } };
        setPreview({ from: anchorFor(nodeId, world), to: world, hover: null });
        wrap.setPointerCapture(e.pointerId);
      } else {
        const edgeEl = target.closest('[data-edge-id]');
        if (edgeEl) onSelect([edgeEl.getAttribute('data-edge-id')!]);
      }
      return;
    }

    if (nodeId) {
      let ids = selected;
      let collapseTo: string | null = null;
      if (e.shiftKey) {
        ids = selected.includes(nodeId) ? selected.filter((i) => i !== nodeId) : [...selected, nodeId];
        onSelect(ids);
        if (!ids.includes(nodeId)) return;
      } else if (!selected.includes(nodeId)) {
        ids = [nodeId];
        onSelect(ids);
      } else if (selected.length > 1) {
        collapseTo = nodeId;
      }
      const movable = ids.filter((i) => nodes.has(i));
      drag.current = {
        kind: 'move',
        ids: movable,
        starts: new Map(movable.map((i) => [i, { x: nodes.get(i)!.x, y: nodes.get(i)!.y }])),
        origin: world,
        screen: { x: e.clientX, y: e.clientY },
        moved: false,
        collapseTo,
      };
      wrap.setPointerCapture(e.pointerId);
      return;
    }

    const edgeEl = target.closest('[data-edge-id]');
    if (edgeEl) {
      const id = edgeEl.getAttribute('data-edge-id')!;
      onSelect(e.shiftKey ? [...new Set([...selected, id])] : [id]);
      return;
    }

    // empty canvas → marquee
    if (!e.shiftKey) onSelect([]);
    drag.current = { kind: 'marquee', start: world, additive: e.shiftKey, base: e.shiftKey ? selected : [] };
    setMarquee({ a: world, b: world });
    wrap.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: RPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const world = toWorld(e.clientX, e.clientY);

    if (d.kind === 'pan') {
      setVp((v) => ({ ...v, x: d.vx + e.clientX - d.startX, y: d.vy + e.clientY - d.startY }));
    } else if (d.kind === 'marquee') {
      setMarquee({ a: d.start, b: world });
      const x1 = Math.min(d.start.x, world.x), x2 = Math.max(d.start.x, world.x);
      const y1 = Math.min(d.start.y, world.y), y2 = Math.max(d.start.y, world.y);
      const hits = docRef.current.classes
        .filter((c) => {
          const r = rectOf(c);
          return r.x < x2 && r.x + r.w > x1 && r.y < y2 && r.y + r.h > y1;
        })
        .map((c) => c.id);
      onSelect([...new Set([...d.base, ...hits])]);
    } else if (d.kind === 'move') {
      if (!d.moved && Math.hypot(e.clientX - d.screen.x, e.clientY - d.screen.y) < 4) return;
      const first = !d.moved;
      d.moved = true;
      if (first) setMoving(true);
      const dx = world.x - d.origin.x;
      const dy = world.y - d.origin.y;
      change(
        (doc) => ({
          ...doc,
          classes: doc.classes.map((c) => {
            const s = d.starts.get(c.id);
            if (!s) return c;
            const nx = s.x + dx;
            const ny = s.y + dy;
            return {
              ...c,
              x: snap ? Math.round(nx / GRID) * GRID : Math.round(nx),
              y: snap ? Math.round(ny / GRID) * GRID : Math.round(ny),
            };
          }),
        }),
        first ? { key: 'move' } : { replace: true },
      );
    } else if (d.kind === 'connect') {
      const hover = nodeAt(world);
      setPreview((p) => (p ? { ...p, to: world, hover } : p));
    }
  };

  const endDrag = (e: RPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const wrap = wrapRef.current!;
    if (wrap.hasPointerCapture(e.pointerId)) wrap.releasePointerCapture(e.pointerId);
    setPanning(false);
    setMoving(false);

    if (d.kind === 'marquee') setMarquee(null);
    if (d.kind === 'move' && !d.moved && d.collapseTo) onSelect([d.collapseTo]);
    if (d.kind === 'connect') {
      const world = toWorld(e.clientX, e.clientY);
      const dist = Math.hypot(e.clientX - d.screen.x, e.clientY - d.screen.y);
      const target = nodeAt(world);
      setPreview(null);
      if (dist < 6) return;
      if (target) onConnect(d.from, target, relType);
      else if (d.viaHandle) onConnectNew(d.from, world, relType);
      if (!d.viaHandle) onToolChange('select');
    }
  };

  const onDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (tool !== 'select') return;
    const t = e.target as Element;
    const nodeId = t.closest('[data-node-id]')?.getAttribute('data-node-id');
    if (nodeId) onEditName(nodeId);
    else if (!t.closest('[data-edge-id]')) onAddClassAt('class', toWorld(e.clientX, e.clientY));
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    const kind = e.dataTransfer.getData('application/x-classforge-kind') as ClassKind;
    if (!kind) return;
    e.preventDefault();
    onAddClassAt(kind, toWorld(e.clientX, e.clientY));
  };

  // grid
  const gs = 20 * vp.z;
  const gridStyle = {
    backgroundSize: `${gs}px ${gs}px`,
    backgroundPosition: `${vp.x}px ${vp.y}px`,
    backgroundImage: gs > 7 ? 'radial-gradient(circle, var(--grid-dot) 1px, transparent 1.3px)' : 'none',
  };

  const singleSelectedNode = selected.length === 1 && nodes.has(selected[0]) ? selected[0] : null;
  const orderedNodes = useMemo(() => {
    const sel = new Set(selected);
    return [...doc.classes.filter((c) => !sel.has(c.id)), ...doc.classes.filter((c) => sel.has(c.id))];
  }, [doc.classes, selected]);

  const cursor =
    panning ? 'grabbing' : tool === 'hand' || space ? 'grab' : tool === 'connect' ? 'crosshair' : 'default';

  return (
    <div
      ref={wrapRef}
      className="cf-canvas"
      style={{ ...gridStyle, cursor }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={onDoubleClick}
      onDragOver={(e) => e.dataTransfer.types.includes('application/x-classforge-kind') && e.preventDefault()}
      onDrop={onDrop}
      onContextMenu={(e) => e.preventDefault()}
    >
      <svg className="cf-svg" width="100%" height="100%">
        <g ref={worldRef} transform={`translate(${vp.x} ${vp.y}) scale(${vp.z})`}>
          {doc.relationships.map((r) => {
            const rt = routes.get(r.id);
            return rt ? <EdgeView key={r.id} rel={r} points={rt.points} selected={selected.includes(r.id)} /> : null;
          })}
          {orderedNodes.map((c: ClassNode) => {
            const iss = issueByClass.get(c.id);
            const worst = iss?.some((i) => i.severity === 'error') ? 'error' : iss?.length ? 'warning' : undefined;
            return (
              <ClassNodeView
                key={c.id}
                node={c}
                selected={selected.includes(c.id)}
                dropTarget={preview?.hover === c.id}
                showHandles={singleSelectedNode === c.id && tool === 'select'}
                issue={worst}
                issueText={iss?.map((i) => i.message).join('\n')}
              />
            );
          })}
          {preview && (
            <g data-export-ignore style={{ pointerEvents: 'none' }}>
              <line
                x1={preview.from.x}
                y1={preview.from.y}
                x2={preview.to.x}
                y2={preview.to.y}
                style={{ stroke: 'var(--d-accent)', strokeWidth: 2, strokeDasharray: '6 5' }}
              />
              <circle cx={preview.to.x} cy={preview.to.y} r={4} style={{ fill: 'var(--d-accent)' }} />
            </g>
          )}
          {marquee && (
            <rect
              data-export-ignore
              x={Math.min(marquee.a.x, marquee.b.x)}
              y={Math.min(marquee.a.y, marquee.b.y)}
              width={Math.abs(marquee.a.x - marquee.b.x)}
              height={Math.abs(marquee.a.y - marquee.b.y)}
              style={{
                fill: 'color-mix(in srgb, var(--d-accent) 10%, transparent)',
                stroke: 'var(--d-accent)',
                strokeWidth: 1 / vp.z,
              }}
            />
          )}
        </g>
      </svg>
      {children}
    </div>
  );
}
