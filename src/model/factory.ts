import type { Attribute, ClassKind, ClassNode, Method, RelationType, Relationship } from './types';

export const uid = (prefix = 'n') =>
  `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;

const BASE_NAMES: Record<ClassKind, string> = {
  class: 'NewClass',
  abstract: 'AbstractClass',
  interface: 'NewInterface',
  enum: 'NewEnum',
};

export function uniqueName(kind: ClassKind, taken: Iterable<string>): string {
  const set = new Set(taken);
  const base = BASE_NAMES[kind];
  if (!set.has(base)) return base;
  let i = 2;
  while (set.has(base + i)) i++;
  return base + i;
}

export function newAttribute(partial: Partial<Attribute> = {}): Attribute {
  return {
    id: uid('a'),
    name: 'field',
    type: 'String',
    visibility: 'private',
    isStatic: false,
    isFinal: false,
    defaultValue: '',
    ...partial,
  };
}

export function newMethod(partial: Partial<Method> = {}): Method {
  return {
    id: uid('m'),
    name: 'method',
    returnType: 'void',
    params: '',
    visibility: 'public',
    isStatic: false,
    isAbstract: false,
    ...partial,
  };
}

export function newClass(kind: ClassKind, x: number, y: number, takenNames: Iterable<string> = []): ClassNode {
  return {
    id: uid('c'),
    name: uniqueName(kind, takenNames),
    kind,
    pkg: '',
    note: '',
    x,
    y,
    attributes: [],
    methods: [],
    constants: kind === 'enum' ? ['VALUE_ONE', 'VALUE_TWO'] : [],
  };
}

export function newRelationship(type: RelationType, source: string, target: string): Relationship {
  return { id: uid('r'), type, source, target, label: '', sourceMult: '', targetMult: '' };
}
