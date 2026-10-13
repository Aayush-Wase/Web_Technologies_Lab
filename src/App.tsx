import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CircleCheck,
  FilePlus2,
  Hand,
  Magnet,
  Maximize,
  MousePointer2,
  Network,
  Redo2,
  Route,
  Slash,
  Sparkles,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { ClassKind, ClassNode, Diagram, RelationType, Relationship } from './model/types';
import { DEFAULT_OPTIONS } from './model/types';
import { newClass, newRelationship, uid } from './model/factory';
import { useDiagramStore } from './model/store';
import { validateDiagram } from './model/validate';
import { EXAMPLES } from './model/examples';
import { generateJava, type GeneratedFile } from './codegen/java';
import { createZip } from './codegen/zip';
import { Canvas, type CanvasHandle, type Tool } from './canvas/Canvas';
import { autoLayout } from './canvas/layout';
import { boundsOf, rectOf, type Pt, type Rect, type Routing } from './canvas/geometry';
import { invalidateMeasure, layoutNode } from './canvas/measure';
import { KIND_COLOR } from './canvas/ClassNodeView';
import { TopBar } from './components/TopBar';
import { Sidebar, REL_META } from './components/Sidebar';
import { Inspector } from './components/Inspector';
import { CodeDock } from './components/CodeDock';
import { Modal } from './components/ui';

/* ───────────────────────── persistence helpers ───────────────────────── */
const LS = {
  doc: 'classforge:doc:v1',
  theme: 'classforge:theme',
  ui: 'classforge:ui:v1',
};

function readLS<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function writeLS(key: string, value: unknown) {
  try {
    localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

/** Validate & repair an unknown JSON payload into a Diagram. */
function normalizeDiagram(raw: unknown): Diagram | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<Diagram>;
  if (!Array.isArray(r.classes) || !Array.isArray(r.relationships)) return null;
  const str = (v: unknown, d = '') => (typeof v === 'string' ? v : d);
  const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const vis = (v: unknown) => (['public', 'private', 'protected', 'package'].includes(v as string) ? (v as 'public') : 'private');
  const classes: ClassNode[] = r.classes.map((c) => ({
    id: str(c.id, uid('c')),
    name: str(c.name, 'Unnamed'),
    kind: (['class', 'abstract', 'interface', 'enum'].includes(c.kind) ? c.kind : 'class') as ClassKind,
    pkg: str(c.pkg),
    note: str(c.note),
    x: num(c.x),
    y: num(c.y),
    attributes: (Array.isArray(c.attributes) ? c.attributes : []).map((a) => ({
      id: str(a.id, uid('a')),
      name: str(a.name, 'field'),
      type: str(a.type, 'String'),
      visibility: vis(a.visibility),
      isStatic: !!a.isStatic,
      isFinal: !!a.isFinal,
      defaultValue: str(a.defaultValue),
    })),
    methods: (Array.isArray(c.methods) ? c.methods : []).map((m) => ({
      id: str(m.id, uid('m')),
      name: str(m.name, 'method'),
      returnType: str(m.returnType, 'void'),
      params: str(m.params),
      visibility: vis(m.visibility === undefined ? 'public' : m.visibility),
      isStatic: !!m.isStatic,
      isAbstract: !!m.isAbstract,
    })),
    constants: (Array.isArray(c.constants) ? c.constants : []).map((k) => str(k)),
  }));
  const ids = new Set(classes.map((c) => c.id));
  const types: RelationType[] = ['inheritance', 'realization', 'association', 'aggregation', 'composition', 'dependency'];
  const relationships: Relationship[] = r.relationships
    .filter((x) => ids.has(x.source) && ids.has(x.target))
    .map((x) => ({
      id: str(x.id, uid('r')),
      type: types.includes(x.type) ? x.type : 'association',
      source: x.source,
      target: x.target,
      label: str(x.label),
      sourceMult: str(x.sourceMult),
      targetMult: str(x.targetMult),
    }));
  return {
    name: str(r.name, 'Untitled diagram'),
    classes,
    relationships,
    options: { ...DEFAULT_OPTIONS, ...(r.options ?? {}) },
  };
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'diagram';

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);

interface UiPrefs {
  snap: boolean;
  routing: Routing;
  dockOpen: boolean;
  dockHeight: number;
  sideOpen: boolean;
  inspOpen: boolean;
}
const DEFAULT_UI: UiPrefs = { snap: true, routing: 'orthogonal', dockOpen: true, dockHeight: 300, sideOpen: true, inspOpen: true };

/** Nearest position to (x, y) where a w×h box does not overlap any existing box. */
function freeSpot(x: number, y: number, w: number, h: number, boxes: Rect[]): Pt {
  const M = 36;
  const hits = (px: number, py: number) =>
    boxes.some((b) => px < b.x + b.w + M && px + w + M > b.x && py < b.y + b.h + M && py + h + M > b.y);
  if (!hits(x, y)) return { x, y };
  const cands: Pt[] = [];
  for (let i = -14; i <= 14; i++) for (let j = -14; j <= 14; j++) cands.push({ x: x + i * 40, y: y + j * 40 });
  cands.sort((a, b) => (a.x - x) ** 2 + (a.y - y) ** 2 - ((b.x - x) ** 2 + (b.y - y) ** 2));
  return cands.find((c) => !hits(c.x, c.y)) ?? { x, y };
}

/* ───────────────────────── mini diagram for the examples gallery ───────────────────────── */
function MiniDiagram({ doc }: { doc: Diagram }) {
  const { boxes, lines, vb } = useMemo(() => {
    const pos = autoLayout(doc.classes, doc.relationships);
    const placed = doc.classes.map((c) => ({ ...c, x: pos.get(c.id)!.x, y: pos.get(c.id)!.y }));
    const b = boundsOf(placed, 20)!;
    return {
      boxes: placed.map((c) => ({ id: c.id, kind: c.kind, x: c.x, y: c.y, w: layoutNode(c).w, h: layoutNode(c).h })),
      lines: doc.relationships.map((r) => {
        const s = placed.find((c) => c.id === r.source)!;
        const t = placed.find((c) => c.id === r.target)!;
        return {
          id: r.id,
          x1: s.x + layoutNode(s).w / 2,
          y1: s.y + layoutNode(s).h / 2,
          x2: t.x + layoutNode(t).w / 2,
          y2: t.y + layoutNode(t).h / 2,
        };
      }),
      vb: `${b.x} ${b.y} ${b.w} ${b.h}`,
    };
  }, [doc]);
  return (
    <svg viewBox={vb} width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden>
      {lines.map((l) => (
        <line key={l.id} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="var(--d-edge)" strokeWidth={5} opacity={0.5} />
      ))}
      {boxes.map((b) => (
        <rect key={b.id} x={b.x} y={b.y} width={b.w} height={b.h} rx={14} fill={KIND_COLOR[b.kind]} opacity={0.9} />
      ))}
    </svg>
  );
}

/* ───────────────────────── App ───────────────────────── */
export default function App() {
  const initialRef = useRef<{ doc: Diagram; fresh: boolean } | null>(null);
  if (!initialRef.current) {
    const saved = normalizeDiagram(readLS<Diagram>(LS.doc));
    initialRef.current = saved ? { doc: saved, fresh: false } : { doc: EXAMPLES[0].build(), fresh: true };
  }
  const store = useDiagramStore(() => initialRef.current!.doc);
  const { doc, change } = store;

  const [selected, setSelected] = useState<string[]>([]);
  const [tool, setTool] = useState<Tool>('select');
  const [relType, setRelType] = useState<RelationType>('association');
  const [ui, setUi] = useState<UiPrefs>(() => ({ ...DEFAULT_UI, ...(readLS<Partial<UiPrefs>>(LS.ui) ?? {}) }));
  const [theme, setTheme] = useState<'light' | 'dark'>(
    () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'),
  );
  const [zoom, setZoom] = useState(1);
  const [focusToken, setFocusToken] = useState(0);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [modal, setModal] = useState<null | 'examples' | 'new'>(null);
  const [toasts, setToasts] = useState<{ id: number; text: string }[]>([]);
  const canvasRef = useRef<CanvasHandle>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const clipboard = useRef<{ classes: ClassNode[]; rels: Relationship[] } | null>(null);
  const pasteCount = useRef(0);
  const freshRef = useRef(initialRef.current.fresh);

  const patchUi = useCallback((p: Partial<UiPrefs>) => setUi((u) => ({ ...u, ...p })), []);

  // theme + prefs persistence
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    writeLS(LS.theme, theme);
  }, [theme]);
  useEffect(() => writeLS(LS.ui, ui), [ui]);
  useEffect(() => {
    const t = setTimeout(() => writeLS(LS.doc, doc), 300);
    return () => clearTimeout(t);
  }, [doc]);

  const toast = useCallback((text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2400);
  }, []);

  // derived
  const issues = useMemo(() => validateDiagram(doc), [doc]);
  const files = useMemo(() => generateJava(doc), [doc]);
  const errors = issues.filter((i) => i.severity === 'error').length;
  const warnings = issues.length - errors;

  // keep the code viewer following the selection
  useEffect(() => {
    const first = selected.find((id) => doc.classes.some((c) => c.id === id));
    if (first) setActiveFile(first);
  }, [selected, doc.classes]);
  const activeId = files.some((f) => f.classId === activeFile) ? activeFile : (files[0]?.classId ?? null);

  // drop selection ids that no longer exist
  useEffect(() => {
    const alive = new Set([...doc.classes.map((c) => c.id), ...doc.relationships.map((r) => r.id)]);
    setSelected((s) => (s.every((i) => alive.has(i)) ? s : s.filter((i) => alive.has(i))));
  }, [doc.classes, doc.relationships]);

  // fonts → remeasure, and lay out the first-run example once metrics are right
  useEffect(() => {
    let cancelled = false;
    const fonts = document.fonts;
    if (!fonts) return;
    Promise.all([
      fonts.load('600 14px "Inter Variable"'),
      fonts.load('400 12px "JetBrains Mono"'),
      fonts.load('600 12px "JetBrains Mono"'),
    ]).finally(() => {
      if (cancelled) return;
      invalidateMeasure();
      if (freshRef.current) {
        freshRef.current = false;
        change((d) => {
          const pos = autoLayout(d.classes, d.relationships);
          return { ...d, classes: d.classes.map((c) => ({ ...c, ...(pos.get(c.id) ?? {}) })) };
        });
        setTimeout(() => canvasRef.current?.fit(), 60);
      } else {
        // force one re-render so cached widths refresh
        change((d) => ({ ...d, classes: [...d.classes] }), { replace: true });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [change]);

  /* ───────── actions ───────── */
  const snapV = useCallback((v: number) => (ui.snap ? Math.round(v / 10) * 10 : Math.round(v)), [ui.snap]);

  const addClass = useCallback(
    (kind: ClassKind, at?: Pt) => {
      const names = doc.classes.map((c) => c.name);
      const probe = newClass(kind, 0, 0, names);
      const w = layoutNode(probe).w;
      const h = layoutNode(probe).h;
      let p: Pt;
      if (at) p = { x: at.x - w / 2, y: at.y - 30 };
      else {
        const c = canvasRef.current?.center() ?? { x: 0, y: 0 };
        p = freeSpot(c.x - w / 2, c.y - h / 2, w, h, doc.classes.map(rectOf));
      }
      const node = { ...probe, x: snapV(p.x), y: snapV(p.y) };
      change((d) => ({ ...d, classes: [...d.classes, node] }));
      setSelected([node.id]);
      setTool('select');
      patchUi({ inspOpen: true });
      setFocusToken((t) => t + 1);
    },
    [doc.classes, change, snapV, patchUi],
  );

  const connect = useCallback(
    (sourceId: string, targetId: string, type: RelationType) => {
      const s = doc.classes.find((c) => c.id === sourceId);
      const t = doc.classes.find((c) => c.id === targetId);
      if (!s || !t) return;
      let kind = type;
      if (kind === 'inheritance' && t.kind === 'interface' && s.kind !== 'interface') kind = 'realization';
      if (kind === 'realization' && t.kind !== 'interface') kind = 'inheritance';
      const dup = doc.relationships.find((r) => r.source === sourceId && r.target === targetId && r.type === kind);
      if (dup) {
        setSelected([dup.id]);
        toast('Those two are already connected that way');
        return;
      }
      const rel = newRelationship(kind, sourceId, targetId);
      change((d) => ({ ...d, relationships: [...d.relationships, rel] }));
      setSelected([rel.id]);
      setTool('select');
      if (kind !== type) toast(`Used ${REL_META[kind].label.toLowerCase()} — ${t.name} is ${t.kind === 'interface' ? 'an interface' : 'not an interface'}`);
    },
    [doc, change, toast],
  );

  const connectNew = useCallback(
    (sourceId: string, at: Pt, type: RelationType) => {
      const kind: ClassKind = type === 'realization' ? 'interface' : 'class';
      const probe = newClass(kind, 0, 0, doc.classes.map((c) => c.name));
      const w = layoutNode(probe).w;
      const h = layoutNode(probe).h;
      const p = freeSpot(at.x - w / 2, at.y - 20, w, h, doc.classes.map(rectOf));
      const node = { ...probe, x: snapV(p.x), y: snapV(p.y) };
      const rel = newRelationship(type, sourceId, node.id);
      change((d) => ({ ...d, classes: [...d.classes, node], relationships: [...d.relationships, rel] }));
      setSelected([node.id]);
      patchUi({ inspOpen: true });
      setFocusToken((t) => t + 1);
    },
    [doc.classes, change, snapV, patchUi],
  );

  const deleteSelection = useCallback(() => {
    if (!selected.length) return;
    const ids = new Set(selected);
    change((d) => ({
      ...d,
      classes: d.classes.filter((c) => !ids.has(c.id)),
      relationships: d.relationships.filter((r) => !ids.has(r.id) && !ids.has(r.source) && !ids.has(r.target)),
    }));
    setSelected([]);
  }, [selected, change]);

  const cloneInto = useCallback(
    (src: { classes: ClassNode[]; rels: Relationship[] }, offset: number) => {
      const idMap = new Map<string, string>();
      const taken = new Set(doc.classes.map((c) => c.name));
      const classes = src.classes.map((c) => {
        const id = uid('c');
        idMap.set(c.id, id);
        let name = c.name.replace(/Copy\d*$/, '') + 'Copy';
        let i = 2;
        while (taken.has(name)) name = c.name.replace(/Copy\d*$/, '') + 'Copy' + i++;
        taken.add(name);
        return {
          ...c,
          id,
          name,
          x: c.x + offset,
          y: c.y + offset,
          attributes: c.attributes.map((a) => ({ ...a, id: uid('a') })),
          methods: c.methods.map((m) => ({ ...m, id: uid('m') })),
          constants: [...c.constants],
        };
      });
      const rels = src.rels
        .filter((r) => idMap.has(r.source) && idMap.has(r.target))
        .map((r) => ({ ...r, id: uid('r'), source: idMap.get(r.source)!, target: idMap.get(r.target)! }));
      change((d) => ({ ...d, classes: [...d.classes, ...classes], relationships: [...d.relationships, ...rels] }));
      setSelected(classes.map((c) => c.id));
    },
    [doc.classes, change],
  );

  const gather = useCallback(() => {
    const ids = new Set(selected);
    const classes = doc.classes.filter((c) => ids.has(c.id));
    const cids = new Set(classes.map((c) => c.id));
    return { classes, rels: doc.relationships.filter((r) => cids.has(r.source) && cids.has(r.target)) };
  }, [selected, doc]);

  const duplicate = useCallback(() => {
    const g = gather();
    if (g.classes.length) cloneInto(g, 40);
  }, [gather, cloneInto]);

  const runAutoLayout = useCallback(() => {
    if (!doc.classes.length) return;
    change((d) => {
      const pos = autoLayout(d.classes, d.relationships);
      return { ...d, classes: d.classes.map((c) => ({ ...c, ...(pos.get(c.id) ?? {}) })) };
    });
    setTimeout(() => canvasRef.current?.fit(), 60);
  }, [doc.classes.length, change]);

  const replaceDiagram = useCallback(
    (next: Diagram, opts?: { layout?: boolean }) => {
      let d = next;
      if (opts?.layout) {
        const pos = autoLayout(d.classes, d.relationships);
        d = { ...d, classes: d.classes.map((c) => ({ ...c, ...(pos.get(c.id) ?? {}) })) };
      }
      change(() => d);
      setSelected([]);
      setTool('select');
      setTimeout(() => canvasRef.current?.fit(), 60);
    },
    [change],
  );

  const exportJson = useCallback(() => {
    download(new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' }), `${slug(doc.name)}.classforge.json`);
    toast('Saved project JSON');
  }, [doc, toast]);

  const exportZip = useCallback(() => {
    if (!files.length) return toast('Nothing to export yet — add a class first');
    download(createZip(files.map((f) => ({ path: f.path, content: f.code }))), `${slug(doc.name)}-java.zip`);
    toast(`Exported ${files.length} Java file${files.length > 1 ? 's' : ''}`);
  }, [files, doc.name, toast]);

  const exportImage = useCallback(
    async (kind: 'png' | 'svg') => {
      const out = canvasRef.current?.exportSvg(true);
      if (!out) return toast('Nothing to export yet');
      if (kind === 'svg') {
        download(new Blob([out.svg], { type: 'image/svg+xml' }), `${slug(doc.name)}.svg`);
        return toast('Exported SVG');
      }
      const url = URL.createObjectURL(new Blob([out.svg], { type: 'image/svg+xml;charset=utf-8' }));
      try {
        const img = new Image();
        img.src = url;
        await img.decode();
        const scale = 2;
        const cv = document.createElement('canvas');
        cv.width = out.width * scale;
        cv.height = out.height * scale;
        const ctx = cv.getContext('2d')!;
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0, out.width, out.height);
        cv.toBlob((b) => {
          if (b) {
            download(b, `${slug(doc.name)}.png`);
            toast('Exported PNG');
          }
        }, 'image/png');
      } catch {
        toast('Could not render PNG — try SVG instead');
      } finally {
        URL.revokeObjectURL(url);
      }
    },
    [doc.name, toast],
  );

  const onImportFile = async (file: File) => {
    try {
      const parsed = normalizeDiagram(JSON.parse(await file.text()));
      if (!parsed) throw new Error('bad');
      replaceDiagram(parsed);
      toast(`Opened “${parsed.name}”`);
    } catch {
      toast('That file is not a valid ClassForge diagram');
    }
  };

  const copyText = useCallback(
    async (text: string, what: string) => {
      try {
        await navigator.clipboard.writeText(text);
        toast(`Copied ${what}`);
      } catch {
        toast('Clipboard unavailable');
      }
    },
    [toast],
  );

  const downloadFile = useCallback(
    (f: GeneratedFile) => {
      download(new Blob([f.code], { type: 'text/x-java-source' }), `${f.className}.java`);
      toast(`Downloaded ${f.className}.java`);
    },
    [toast],
  );

  /* ───────── keyboard ───────── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === 's') {
        e.preventDefault();
        exportJson();
        return;
      }
      if (isTyping(e.target)) return;
      if (mod && key === 'z') {
        e.preventDefault();
        e.shiftKey ? store.redo() : store.undo();
      } else if (mod && key === 'y') {
        e.preventDefault();
        store.redo();
      } else if (mod && key === 'd') {
        e.preventDefault();
        duplicate();
      } else if (mod && key === 'a') {
        e.preventDefault();
        setSelected(doc.classes.map((c) => c.id));
      } else if (mod && key === 'c') {
        const g = gather();
        if (g.classes.length) {
          clipboard.current = { classes: g.classes, rels: g.rels };
          pasteCount.current = 0;
          toast(`Copied ${g.classes.length} type${g.classes.length > 1 ? 's' : ''}`);
        }
      } else if (mod && key === 'v') {
        if (clipboard.current) {
          pasteCount.current += 1;
          cloneInto(clipboard.current, 40 * pasteCount.current);
        }
      } else if (mod && key === 'j') {
        e.preventDefault();
        patchUi({ dockOpen: !ui.dockOpen });
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelection();
      } else if (e.key === 'Escape') {
        setTool('select');
        setSelected([]);
      } else if (!mod && key === 'v') setTool('select');
      else if (!mod && key === 'h') setTool('hand');
      else if (!mod && (key === '=' || key === '+')) canvasRef.current?.zoomBy(1.2);
      else if (!mod && key === '-') canvasRef.current?.zoomBy(1 / 1.2);
      else if (!mod && key === '1') canvasRef.current?.fit();
      else if (e.key.startsWith('Arrow') && selected.length) {
        const step = e.shiftKey ? 50 : 10;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        e.preventDefault();
        const ids = new Set(selected);
        change((d) => ({ ...d, classes: d.classes.map((c) => (ids.has(c.id) ? { ...c, x: c.x + dx, y: c.y + dy } : c)) }), {
          key: 'nudge',
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [store, duplicate, gather, cloneInto, deleteSelection, doc.classes, selected, exportJson, patchUi, ui.dockOpen, toast, change]);

  /* ───────── render ───────── */
  const connectActive = tool === 'connect';
  const pickRelation = (t: RelationType) => {
    if (connectActive && relType === t) setTool('select');
    else {
      setRelType(t);
      setTool('connect');
    }
  };

  return (
    <div className="app">
      <TopBar
        name={doc.name}
        onName={(name) => change((d) => ({ ...d, name }), { key: 'doc-name' })}
        errors={errors}
        warnings={warnings}
        onProblems={() => {
          setSelected([]);
          patchUi({ inspOpen: true });
        }}
        theme={theme}
        onTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
        sideOpen={ui.sideOpen}
        onSide={() => patchUi({ sideOpen: !ui.sideOpen })}
        inspOpen={ui.inspOpen}
        onInsp={() => patchUi({ inspOpen: !ui.inspOpen })}
        onNew={() => (doc.classes.length ? setModal('new') : toast('The canvas is already empty'))}
        onExamples={() => setModal('examples')}
        onExport={(k) => (k === 'json' ? exportJson() : k === 'zip' ? exportZip() : void exportImage(k))}
        onImport={() => importRef.current?.click()}
        canExportDiagram={doc.classes.length > 0}
      />
      <input
        ref={importRef}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onImportFile(f);
          e.target.value = '';
        }}
      />

      <div className={`workspace${ui.sideOpen ? '' : ' no-side'}${ui.inspOpen ? '' : ' no-insp'}`}>
        <Sidebar
          classes={doc.classes}
          selected={selected}
          connectActive={connectActive}
          relType={relType}
          issues={issues}
          onAddClass={(k) => addClass(k)}
          onPickRelation={pickRelation}
          onSelectClass={(id, additive) => {
            setSelected((s) => (additive ? (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]) : [id]));
            canvasRef.current?.focus(id);
          }}
        />

        <main className="main">
          <div className="canvas-area">
            <Canvas
              ref={canvasRef}
              doc={doc}
              selected={selected}
              onSelect={setSelected}
              tool={tool}
              relType={relType}
              onToolChange={setTool}
              routing={ui.routing}
              snap={ui.snap}
              issues={issues}
              change={change}
              onConnect={connect}
              onConnectNew={connectNew}
              onAddClassAt={addClass}
              onEditName={(id) => {
                setSelected([id]);
                patchUi({ inspOpen: true });
                setFocusToken((t) => t + 1);
              }}
              onZoom={setZoom}
            >
              {/* tool palette */}
              <div className="float top" data-overlay>
                <button className={`icon-btn${tool === 'select' ? ' active' : ''}`} data-tip="Select (V)" onClick={() => setTool('select')}>
                  <MousePointer2 size={18} />
                </button>
                <button className={`icon-btn${tool === 'hand' ? ' active' : ''}`} data-tip="Hand / pan (H)" onClick={() => setTool('hand')}>
                  <Hand size={18} />
                </button>
                <span className="sep" />
                <button className="icon-btn" data-tip="Undo (Ctrl+Z)" onClick={store.undo} disabled={!store.canUndo}>
                  <Undo2 size={18} />
                </button>
                <button className="icon-btn" data-tip="Redo (Ctrl+Shift+Z)" onClick={store.redo} disabled={!store.canRedo}>
                  <Redo2 size={18} />
                </button>
                <span className="sep" />
                <button className="icon-btn" data-tip="Auto-arrange layout" onClick={runAutoLayout} disabled={!doc.classes.length}>
                  <Network size={18} />
                </button>
                <button
                  className={`icon-btn${ui.snap ? ' active' : ''}`}
                  data-tip={`Snap to grid: ${ui.snap ? 'on' : 'off'}`}
                  onClick={() => patchUi({ snap: !ui.snap })}
                >
                  <Magnet size={18} />
                </button>
                <button
                  className="icon-btn"
                  data-tip={ui.routing === 'orthogonal' ? 'Lines: elbow (click for straight)' : 'Lines: straight (click for elbow)'}
                  onClick={() => patchUi({ routing: ui.routing === 'orthogonal' ? 'straight' : 'orthogonal' })}
                >
                  {ui.routing === 'orthogonal' ? <Route size={18} /> : <Slash size={18} />}
                </button>
              </div>

              {/* zoom */}
              <div className="float bl" data-overlay>
                <button className="icon-btn" data-tip="Zoom out (-)" data-tip-pos="top" onClick={() => canvasRef.current?.zoomBy(1 / 1.2)}>
                  <ZoomOut size={17} />
                </button>
                <button className="zoom-label" data-tip="Reset to 100%" data-tip-pos="top" onClick={() => canvasRef.current?.setZoom(1)}>
                  {Math.round(zoom * 100)}%
                </button>
                <button className="icon-btn" data-tip="Zoom in (+)" data-tip-pos="top" onClick={() => canvasRef.current?.zoomBy(1.2)}>
                  <ZoomIn size={17} />
                </button>
                <span className="sep" />
                <button className="icon-btn" data-tip="Fit to screen (1)" data-tip-pos="top" onClick={() => canvasRef.current?.fit()}>
                  <Maximize size={17} />
                </button>
              </div>

              {connectActive && (
                <div className="hint-bar" data-overlay>
                  <span>
                    Drag from one class to another to create <b>{REL_META[relType].label}</b>
                  </span>
                  <button onClick={() => setTool('select')}>Esc · Cancel</button>
                </div>
              )}

              {doc.classes.length === 0 && (
                <div className="empty-state" data-overlay>
                  <div className="empty-card">
                    <div className="empty-icon">
                      <Network size={26} />
                    </div>
                    <h2>Design your first class diagram</h2>
                    <p>
                      Drop classes on the canvas, connect them, and ClassForge writes the Java for you — fields,
                      constructors, accessors and all.
                    </p>
                    <div className="empty-actions">
                      <button className="btn primary" onClick={() => addClass('class')}>
                        <FilePlus2 size={15} /> Add a class
                      </button>
                      <button className="btn" onClick={() => setModal('examples')}>
                        <Sparkles size={15} /> Browse examples
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </Canvas>
          </div>

          <CodeDock
            files={files}
            classes={doc.classes}
            activeId={activeId}
            onActive={(id) => {
              setActiveFile(id);
              setSelected([id]);
            }}
            options={doc.options}
            onOptions={(patch) => change((d) => ({ ...d, options: { ...d.options, ...patch } }), { key: 'options' })}
            open={ui.dockOpen}
            onToggle={() => patchUi({ dockOpen: !ui.dockOpen })}
            height={ui.dockHeight}
            onHeight={(h) => patchUi({ dockHeight: h })}
            onCopy={copyText}
            onDownload={downloadFile}
            onDownloadAll={exportZip}
          />
        </main>

        <Inspector
          doc={doc}
          selected={selected}
          issues={issues}
          change={change}
          onSelect={setSelected}
          onDelete={deleteSelection}
          onDuplicate={duplicate}
          focusToken={focusToken}
          fileCount={files.length}
        />
      </div>

      {modal === 'new' && (
        <Modal
          narrow
          title="Start a new diagram?"
          subtitle={`This clears ${doc.classes.length} type${doc.classes.length === 1 ? '' : 's'} from the canvas. You can undo it.`}
          onClose={() => setModal(null)}
          footer={
            <>
              <button className="btn" onClick={() => setModal(null)}>
                Cancel
              </button>
              <button
                className="btn primary"
                onClick={() => {
                  replaceDiagram({ name: 'Untitled diagram', classes: [], relationships: [], options: { ...DEFAULT_OPTIONS } });
                  setModal(null);
                }}
              >
                Clear canvas
              </button>
            </>
          }
        />
      )}

      {modal === 'examples' && (
        <Modal
          title="Start from an example"
          subtitle="Load a ready-made diagram to explore — your current work can be restored with undo."
          onClose={() => setModal(null)}
        >
          <div className="example-grid">
            {EXAMPLES.map((ex) => (
              <ExampleCard
                key={ex.id}
                title={ex.title}
                description={ex.description}
                build={ex.build}
                onPick={(d) => {
                  replaceDiagram(d, { layout: true });
                  setModal(null);
                }}
              />
            ))}
          </div>
        </Modal>
      )}

      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            <CircleCheck size={16} />
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}

function ExampleCard({
  title,
  description,
  build,
  onPick,
}: {
  title: string;
  description: string;
  build: () => Diagram;
  onPick: (d: Diagram) => void;
}) {
  const sample = useMemo(build, [build]);
  return (
    <button className="example-card" onClick={() => onPick(build())}>
      <div className="mini-diagram">
        <MiniDiagram doc={sample} />
      </div>
      <div>
        <b>{title}</b>
        <p>{description}</p>
      </div>
      <span className="example-meta">
        {sample.classes.length} types · {sample.relationships.length} relationships
      </span>
    </button>
  );
}
