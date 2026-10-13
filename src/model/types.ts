export type Visibility = 'public' | 'private' | 'protected' | 'package';
export type ClassKind = 'class' | 'abstract' | 'interface' | 'enum';
export type RelationType =
  | 'inheritance'
  | 'realization'
  | 'association'
  | 'aggregation'
  | 'composition'
  | 'dependency';

export interface Attribute {
  id: string;
  name: string;
  type: string;
  visibility: Visibility;
  isStatic: boolean;
  isFinal: boolean;
  defaultValue: string;
}

export interface Method {
  id: string;
  name: string;
  returnType: string;
  /** Java-style parameter list, e.g. "String name, int age" */
  params: string;
  visibility: Visibility;
  isStatic: boolean;
  isAbstract: boolean;
}

export interface ClassNode {
  id: string;
  name: string;
  kind: ClassKind;
  /** Optional package override; empty = project package */
  pkg: string;
  note: string;
  x: number;
  y: number;
  attributes: Attribute[];
  methods: Method[];
  constants: string[];
}

export interface Relationship {
  id: string;
  type: RelationType;
  source: string;
  target: string;
  label: string;
  sourceMult: string;
  targetMult: string;
}

export interface CodegenOptions {
  rootPackage: string;
  getters: boolean;
  setters: boolean;
  constructors: boolean;
  toStringMethod: boolean;
  javadoc: boolean;
  stubInherited: boolean;
}

export interface Diagram {
  name: string;
  classes: ClassNode[];
  relationships: Relationship[];
  options: CodegenOptions;
}

export const DEFAULT_OPTIONS: CodegenOptions = {
  rootPackage: 'com.example.app',
  getters: true,
  setters: true,
  constructors: true,
  toStringMethod: false,
  javadoc: true,
  stubInherited: true,
};

export interface Issue {
  id: string;
  severity: 'error' | 'warning';
  message: string;
  classId?: string;
  relId?: string;
}
