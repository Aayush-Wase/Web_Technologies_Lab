import type { ClassKind, ClassNode, Visibility } from '../model/types';
import { VISIBILITY_SYMBOL, paramsToUml } from '../model/javaUtil';

export const FONT_MONO = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
export const FONT_SANS = '"Inter Variable", Inter, system-ui, -apple-system, "Segoe UI", sans-serif';

export const M = {
  headerPlain: 42,
  headerStereo: 58,
  row: 24,
  padY: 6,
  emptyH: 28,
  minW: 200,
  rowFont: 12.5,
  nameFont: 14.5,
  stereoFont: 10.5,
  symbolX: 16,
  textX: 34,
  maxChars: 46,
} as const;

export interface RowLayout {
  y: number;
  text: string;
  full: string;
  symbol: string;
  visibility?: Visibility;
  isStatic: boolean;
  isAbstract: boolean;
}

export interface SectionLayout {
  key: 'constants' | 'attributes' | 'methods';
  y: number;
  h: number;
  rows: RowLayout[];
}

export interface NodeLayout {
  w: number;
  h: number;
  headerH: number;
  stereotype: string;
  sections: SectionLayout[];
}

export const KIND_STEREOTYPE: Record<ClassKind, string> = {
  class: '',
  abstract: '«abstract»',
  interface: '«interface»',
  enum: '«enumeration»',
};

let ctx: CanvasRenderingContext2D | null = null;
let cache = new WeakMap<ClassNode, NodeLayout>();
const textCache = new Map<string, number>();

export function invalidateMeasure() {
  cache = new WeakMap();
  textCache.clear();
}

export function textWidth(text: string, size: number, family: string, weight = 400): number {
  const key = `${size}|${weight}|${family === FONT_MONO ? 'm' : 's'}|${text}`;
  const hit = textCache.get(key);
  if (hit !== undefined) return hit;
  if (!ctx) ctx = document.createElement('canvas').getContext('2d');
  let w: number;
  if (ctx) {
    ctx.font = `${weight} ${size}px ${family}`;
    w = ctx.measureText(text).width;
  } else {
    w = text.length * size * (family === FONT_MONO ? 0.6 : 0.55);
  }
  if (textCache.size > 4000) textCache.clear();
  textCache.set(key, w);
  return w;
}

function clip(s: string): string {
  return s.length > M.maxChars ? s.slice(0, M.maxChars - 1) + '…' : s;
}

export function layoutNode(c: ClassNode): NodeLayout {
  const hit = cache.get(c);
  if (hit) return hit;

  const stereotype = KIND_STEREOTYPE[c.kind];
  const headerH = stereotype ? M.headerStereo : M.headerPlain;

  const attrRows = c.attributes.map((a) => {
    const full = `${a.name}: ${a.type}${a.defaultValue.trim() ? ` = ${a.defaultValue.trim()}` : ''}`;
    return {
      text: clip(full),
      full,
      symbol: c.kind === 'interface' ? '+' : VISIBILITY_SYMBOL[a.visibility],
      visibility: c.kind === 'interface' ? ('public' as Visibility) : a.visibility,
      isStatic: a.isStatic || c.kind === 'interface',
      isAbstract: false,
    };
  });
  const methodRows = c.methods.map((m) => {
    const full = `${m.name}(${paramsToUml(m.params)}): ${m.returnType || 'void'}`;
    return {
      text: clip(full),
      full,
      symbol: c.kind === 'interface' && m.visibility === 'public' ? '+' : VISIBILITY_SYMBOL[m.visibility],
      visibility: m.visibility,
      isStatic: m.isStatic,
      isAbstract: m.isAbstract || c.kind === 'interface',
    };
  });
  const constRows = c.constants
    .filter((s) => s.trim())
    .map((s) => ({
      text: clip(s.trim()),
      full: s.trim(),
      symbol: '',
      isStatic: false,
      isAbstract: false,
    }));

  const defs: { key: SectionLayout['key']; rows: Omit<RowLayout, 'y'>[]; show: boolean }[] = [
    { key: 'constants', rows: constRows, show: c.kind === 'enum' },
    { key: 'attributes', rows: attrRows, show: c.kind === 'class' || c.kind === 'abstract' || attrRows.length > 0 },
    { key: 'methods', rows: methodRows, show: true },
  ];

  let y = headerH;
  let maxRow = 0;
  const sections: SectionLayout[] = [];
  for (const def of defs) {
    if (!def.show) continue;
    const h = def.rows.length ? def.rows.length * M.row + M.padY * 2 : M.emptyH;
    const rows = def.rows.map((r, i) => {
      maxRow = Math.max(maxRow, textWidth(r.text, M.rowFont, FONT_MONO) + (r.symbol ? M.textX : 18));
      return { ...r, y: y + M.padY + i * M.row };
    });
    sections.push({ key: def.key, y, h, rows });
    y += h;
  }

  const nameW = textWidth(c.name || 'Unnamed', M.nameFont, FONT_SANS, 600) + 70;
  const w = Math.ceil(Math.max(M.minW, nameW, maxRow + 24) / 10) * 10;
  const layout: NodeLayout = { w, h: y, headerH, stereotype, sections };
  cache.set(c, layout);
  return layout;
}
