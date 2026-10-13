import type { Visibility } from './types';

export const JAVA_KEYWORDS = new Set([
  'abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char', 'class', 'const',
  'continue', 'default', 'do', 'double', 'else', 'enum', 'extends', 'final', 'finally', 'float',
  'for', 'goto', 'if', 'implements', 'import', 'instanceof', 'int', 'interface', 'long', 'native',
  'new', 'package', 'private', 'protected', 'public', 'return', 'short', 'static', 'strictfp',
  'super', 'switch', 'synchronized', 'this', 'throw', 'throws', 'transient', 'try', 'void',
  'volatile', 'while', 'true', 'false', 'null',
]);

export const PRIMITIVES = new Set(['int', 'long', 'short', 'byte', 'char', 'boolean', 'float', 'double', 'void']);

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

export function isIdentifier(s: string): boolean {
  return IDENT.test(s) && !JAVA_KEYWORDS.has(s);
}

export function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

export function decapitalize(s: string): string {
  return s ? s[0].toLowerCase() + s.slice(1) : s;
}

export function pluralize(s: string): string {
  if (/[^aeiou]y$/i.test(s)) return s.slice(0, -1) + 'ies';
  if (/(s|x|z|ch|sh)$/i.test(s)) return s + 'es';
  return s + 's';
}

/** Turn an arbitrary label into a lowerCamelCase identifier (or '' when impossible). */
export function toFieldName(label: string): string {
  const words = label.trim().split(/[^A-Za-z0-9_$]+/).filter(Boolean);
  if (!words.length) return '';
  const camel = words.map((w, i) => (i === 0 ? decapitalize(w) : capitalize(w))).join('');
  const safe = /^[0-9]/.test(camel) ? '_' + camel : camel;
  return isIdentifier(safe) ? safe : '';
}

export interface Param {
  type: string;
  name: string;
}

/** Split on top-level commas, respecting generics like Map<String, List<Integer>>. */
export function splitTopLevel(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '<' || ch === '(' || ch === '[') depth++;
    if (ch === '>' || ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.map((p) => p.trim()).filter(Boolean);
}

export function parseParams(s: string): Param[] {
  return splitTopLevel(s).map((raw, i) => {
    const p = raw.replace(/\bfinal\s+/g, '').replace(/\s+/g, ' ').trim();
    // the name is whatever follows the last space that sits outside generics
    let depth = 0;
    let idx = -1;
    for (let k = 0; k < p.length; k++) {
      const ch = p[k];
      if (ch === '<') depth++;
      else if (ch === '>') depth = Math.max(0, depth - 1);
      else if (ch === ' ' && depth === 0) idx = k;
    }
    if (idx === -1) {
      // single token: either a type or a bare name
      if (PRIMITIVES.has(p) || /^[A-Z]/.test(p)) return { type: p, name: `arg${i}` };
      return { type: 'Object', name: p };
    }
    return { type: p.slice(0, idx).trim(), name: p.slice(idx + 1).trim() };
  });
}

export function paramsToUml(params: string): string {
  return parseParams(params)
    .map((p) => `${p.name}: ${p.type}`)
    .join(', ');
}

export function defaultValueFor(type: string): string {
  const t = type.trim();
  if (t === 'boolean') return 'false';
  if (t === 'char') return "'\\0'";
  if (t === 'float') return '0f';
  if (t === 'double') return '0.0';
  if (t === 'long') return '0L';
  if (PRIMITIVES.has(t) && t !== 'void') return '0';
  return 'null';
}

export const VISIBILITY_SYMBOL: Record<Visibility, string> = {
  public: '+',
  private: '-',
  protected: '#',
  package: '~',
};

export const VISIBILITY_KEYWORD: Record<Visibility, string> = {
  public: 'public ',
  private: 'private ',
  protected: 'protected ',
  package: '',
};

/** Does a multiplicity string imply "many" (> 1)? */
export function isMany(mult: string): boolean {
  const m = mult.trim().toLowerCase();
  if (!m) return false;
  if (m.includes('*') || m.includes('n')) return true;
  const nums = m.match(/\d+/g)?.map(Number) ?? [];
  return nums.length > 0 && Math.max(...nums) > 1;
}

export const JDK_IMPORTS: Record<string, string> = {
  List: 'java.util.List',
  ArrayList: 'java.util.ArrayList',
  LinkedList: 'java.util.LinkedList',
  Map: 'java.util.Map',
  HashMap: 'java.util.HashMap',
  TreeMap: 'java.util.TreeMap',
  Set: 'java.util.Set',
  HashSet: 'java.util.HashSet',
  TreeSet: 'java.util.TreeSet',
  Queue: 'java.util.Queue',
  Deque: 'java.util.Deque',
  Optional: 'java.util.Optional',
  Date: 'java.util.Date',
  UUID: 'java.util.UUID',
  Collection: 'java.util.Collection',
  LocalDate: 'java.time.LocalDate',
  LocalDateTime: 'java.time.LocalDateTime',
  LocalTime: 'java.time.LocalTime',
  Instant: 'java.time.Instant',
  Duration: 'java.time.Duration',
  BigDecimal: 'java.math.BigDecimal',
  BigInteger: 'java.math.BigInteger',
};
