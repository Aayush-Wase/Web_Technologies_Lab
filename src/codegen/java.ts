import type { Attribute, ClassNode, Diagram, Method, Relationship } from '../model/types';
import {
  JDK_IMPORTS,
  VISIBILITY_KEYWORD,
  capitalize,
  decapitalize,
  defaultValueFor,
  isMany,
  parseParams,
  pluralize,
  toFieldName,
} from '../model/javaUtil';

export interface GeneratedFile {
  classId: string;
  className: string;
  pkg: string;
  /** e.g. com/example/Foo.java */
  path: string;
  code: string;
}

interface Field {
  name: string;
  type: string;
  visibility: Attribute['visibility'];
  isStatic: boolean;
  isFinal: boolean;
  init: string;
  comment?: string;
  /** field was derived from a relationship rather than declared as an attribute */
  derived?: boolean;
}

const IND = '    ';
const sigKey = (m: Method) => `${m.name}/${parseParams(m.params).length}`;
const IDENT_TOKEN = /[A-Za-z_$][A-Za-z0-9_$]*/g;

export function generateJava(d: Diagram): GeneratedFile[] {
  const opts = d.options;
  const byId = new Map(d.classes.map((c) => [c.id, c]));
  const classNames = new Set(d.classes.map((c) => c.name));
  const pkgOf = (c: ClassNode) => c.pkg.trim() || opts.rootPackage.trim();

  // ---------- hierarchy helpers ----------
  const hierarchyRels = d.relationships.filter((r) => r.type === 'inheritance' || r.type === 'realization');

  function parentsOf(c: ClassNode): { superclass?: ClassNode; interfaces: ClassNode[] } {
    const targets = hierarchyRels
      .filter((r) => r.source === c.id && r.target !== c.id)
      .map((r) => byId.get(r.target))
      .filter((t): t is ClassNode => !!t);
    if (c.kind === 'interface') return { interfaces: targets };
    const interfaces = targets.filter((t) => t.kind === 'interface');
    if (c.kind === 'enum') return { interfaces };
    const superclass = targets.find((t) => t.kind !== 'interface' && t.kind !== 'enum');
    return { superclass, interfaces };
  }

  function superclassChain(c: ClassNode): ClassNode[] {
    const chain: ClassNode[] = [];
    const seen = new Set([c.id]);
    let cur = parentsOf(c).superclass;
    while (cur && !seen.has(cur.id)) {
      chain.push(cur);
      seen.add(cur.id);
      cur = parentsOf(cur).superclass;
    }
    return chain;
  }

  function allInterfaces(c: ClassNode): ClassNode[] {
    const out: ClassNode[] = [];
    const seen = new Set<string>();
    const visit = (n: ClassNode) => {
      const p = parentsOf(n);
      for (const i of p.interfaces) {
        if (seen.has(i.id)) continue;
        seen.add(i.id);
        out.push(i);
        visit(i);
      }
      if (p.superclass && !seen.has(p.superclass.id)) {
        seen.add(p.superclass.id);
        visit(p.superclass);
      }
    };
    seen.add(c.id);
    visit(c);
    return out;
  }

  // ---------- fields derived from relationships ----------
  function relationFields(c: ClassNode): Field[] {
    const taken = new Set(c.attributes.map((a) => a.name));
    const fields: Field[] = [];
    const rels = d.relationships.filter(
      (r: Relationship) =>
        r.source === c.id && (r.type === 'association' || r.type === 'aggregation' || r.type === 'composition'),
    );
    for (const r of rels) {
      const t = byId.get(r.target);
      if (!t) continue;
      const many = isMany(r.targetMult);
      let name = toFieldName(r.label) || (many ? pluralize(decapitalize(t.name)) : decapitalize(t.name));
      if (!name) continue;
      const base = name;
      let i = 2;
      while (taken.has(name)) name = base + i++;
      taken.add(name);
      fields.push({
        name,
        type: many ? `List<${t.name}>` : t.name,
        visibility: 'private',
        isStatic: false,
        isFinal: false,
        init: many ? 'new ArrayList<>()' : '',
        comment: r.type === 'association' ? undefined : r.type,
        derived: true,
      });
    }
    return fields;
  }

  function attributeFields(c: ClassNode): Field[] {
    return c.attributes.map((a) => ({
      name: a.name,
      type: a.type,
      visibility: a.visibility,
      isStatic: a.isStatic,
      isFinal: a.isFinal,
      init: a.defaultValue.trim(),
    }));
  }

  // ---------- constructors ----------
  const ctorOwn = (c: ClassNode) =>
    c.attributes.filter((a) => !a.isStatic && !(a.isFinal && a.defaultValue.trim()));
  const requiredFinals = (c: ClassNode) =>
    c.attributes.filter((a) => !a.isStatic && a.isFinal && !a.defaultValue.trim());

  function ctorParams(c: ClassNode): { type: string; name: string; own: boolean }[] {
    const parent = parentsOf(c).superclass;
    const inherited = parent && c.kind !== 'interface' ? ctorParams(parent).map((p) => ({ ...p, own: false })) : [];
    const used = new Set(inherited.map((p) => p.name));
    const own = ctorOwn(c).map((a) => {
      let name = a.name;
      let i = 2;
      while (used.has(name)) name = a.name + i++;
      used.add(name);
      return { type: a.type, name, own: true };
    });
    return [...inherited, ...own];
  }

  function canNoArg(c: ClassNode): boolean {
    return requiredFinals(c).length === 0 && superclassChain(c).every((p) => requiredFinals(p).length === 0);
  }

  // ---------- per-file generation ----------
  return d.classes.map((c) => {
    const pkg = pkgOf(c);
    const { superclass, interfaces } = parentsOf(c);
    const chain = superclassChain(c);
    const ifaceAll = allInterfaces(c);
    const lines: string[] = [];
    const typeStrings: string[] = [];
    const isInterface = c.kind === 'interface';
    const isEnum = c.kind === 'enum';
    const isAbstract = c.kind === 'abstract';

    // ----- fields -----
    const attrFields = attributeFields(c);
    const relFields = isInterface ? [] : relationFields(c);
    const allFields = [...attrFields, ...relFields];
    allFields.forEach((f) => typeStrings.push(f.type, f.init));

    // ----- inherited abstract members & overrides -----
    const inheritedKeys = new Set<string>();
    const concreteKeys = new Set<string>();
    const needed = new Map<string, Method>();
    for (const m of c.methods) concreteKeys.add(sigKey(m));
    for (const p of chain) {
      for (const m of p.methods) {
        if (m.visibility !== 'private') inheritedKeys.add(sigKey(m));
        if (!m.isAbstract) concreteKeys.add(sigKey(m));
      }
    }
    for (const p of chain) {
      for (const m of p.methods) {
        if (m.isAbstract && !concreteKeys.has(sigKey(m)) && !needed.has(sigKey(m))) needed.set(sigKey(m), m);
      }
    }
    for (const i of [...ifaceAll]) {
      for (const m of i.methods) {
        if (m.isStatic) continue;
        inheritedKeys.add(sigKey(m));
        if (!concreteKeys.has(sigKey(m)) && !needed.has(sigKey(m))) needed.set(sigKey(m), m);
      }
    }
    const stubs =
      opts.stubInherited && !isInterface && !isAbstract && c.kind !== 'interface' ? [...needed.values()] : [];
    const ownMethodNames = new Set(c.methods.map((m) => m.name));

    // ----- header -----
    const kindWord = isInterface ? 'interface' : isEnum ? 'enum' : isAbstract ? 'abstract class' : 'class';
    let header = `public ${kindWord} ${c.name}`;
    if (isInterface) {
      if (interfaces.length) header += ` extends ${interfaces.map((i) => i.name).join(', ')}`;
    } else {
      if (superclass) header += ` extends ${superclass.name}`;
      if (interfaces.length) header += ` implements ${interfaces.map((i) => i.name).join(', ')}`;
    }
    typeStrings.push(...interfaces.map((i) => i.name), superclass?.name ?? '');

    // ----- body sections (each a block of lines) -----
    const sections: string[][] = [];

    if (isEnum) {
      const consts = c.constants.map((s) => s.trim()).filter(Boolean);
      const ownCtor = ctorOwn(c);
      const defaults = ownCtor.map((a) => defaultValueFor(a.type));
      const rendered = consts.map((k) => (ownCtor.length && !k.includes('(') ? `${k}(${defaults.join(', ')})` : k));
      if (rendered.length) {
        const hasMembers = c.attributes.length > 0 || c.methods.length > 0 || stubs.length > 0;
        sections.push(
          rendered.map((k, i) => {
            const last = i === rendered.length - 1;
            return IND + k + (last ? (hasMembers ? ';' : '') : ',');
          }),
        );
      }
    }

    // fields
    if (allFields.length) {
      const block: string[] = [];
      for (const f of allFields) {
        let init = f.init;
        if (isInterface) {
          if (!init) init = defaultValueFor(f.type);
          block.push(`${IND}${f.type} ${f.name} = ${init};`);
          continue;
        }
        if (f.isStatic && f.isFinal && !init) init = defaultValueFor(f.type);
        const mods =
          VISIBILITY_KEYWORD[f.visibility] + (f.isStatic ? 'static ' : '') + (f.isFinal ? 'final ' : '');
        block.push(
          `${IND}${mods}${f.type} ${f.name}${init ? ` = ${init}` : ''};${f.comment ? ` // ${f.comment}` : ''}`,
        );
      }
      sections.push(block);
    }

    // constructors
    if (!isInterface) {
      const params = ctorParams(c);
      const noArgOk = canNoArg(c);
      const needCtor = opts.constructors || !noArgOk;
      if (needCtor) {
        const vis = isAbstract ? 'protected ' : isEnum ? 'private ' : 'public ';
        const doc = (text: string) =>
          opts.javadoc ? [`${IND}/** ${text} */`] : [];
        // with no fields at all the implicit default constructor is enough
        if (params.length > 0) {
          if (noArgOk && !isEnum && opts.constructors) {
            sections.push([...doc(`Creates an empty ${c.name}.`), `${IND}${vis}${c.name}() {`, `${IND}}`]);
          }
          const body: string[] = [];
          const inherited = params.filter((p) => !p.own);
          if (inherited.length) body.push(`${IND}${IND}super(${inherited.map((p) => p.name).join(', ')});`);
          const ownParams = params.filter((p) => p.own);
          const ownAttrs = ctorOwn(c);
          ownParams.forEach((p, i) => body.push(`${IND}${IND}this.${ownAttrs[i].name} = ${p.name};`));
          sections.push([
            ...doc(`Creates a ${c.name} with all of its fields.`),
            `${IND}${vis}${c.name}(${params.map((p) => `${p.type} ${p.name}`).join(', ')}) {`,
            ...body,
            `${IND}}`,
          ]);
        }
      }
    }

    // getters & setters
    if (!isInterface && (opts.getters || opts.setters)) {
      const accessors: string[][] = [];
      for (const f of allFields) {
        if (f.isStatic || f.visibility === 'public') continue;
        const cap = capitalize(f.name);
        const getName = (f.type === 'boolean' ? 'is' : 'get') + cap;
        if (opts.getters && !ownMethodNames.has(getName)) {
          accessors.push([`${IND}public ${f.type} ${getName}() {`, `${IND}${IND}return ${f.name};`, `${IND}}`]);
        }
        if (opts.setters && !f.isFinal && !ownMethodNames.has('set' + cap)) {
          accessors.push([
            `${IND}public void set${cap}(${f.type} ${f.name}) {`,
            `${IND}${IND}this.${f.name} = ${f.name};`,
            `${IND}}`,
          ]);
        }
      }
      sections.push(...accessors);
    }

    // user methods
    for (const m of c.methods) {
      typeStrings.push(m.returnType, ...parseParams(m.params).map((p) => p.type));
      const params = parseParams(m.params);
      const paramStr = params.map((p) => `${p.type} ${p.name}`).join(', ');
      const returnsValue = m.returnType.trim() !== 'void' && m.returnType.trim() !== '';
      const ret = m.returnType.trim() || 'void';
      const override = inheritedKeys.has(sigKey(m)) && !m.isStatic;
      const block: string[] = [];

      if (opts.javadoc) {
        const tags = [
          ...params.map((p) => `${IND} * @param ${p.name} the ${p.name}`),
          ...(returnsValue ? [`${IND} * @return the result`] : []),
        ];
        if (tags.length) block.push(`${IND}/**`, `${IND} * TODO: describe ${m.name}.`, `${IND} *`, ...tags, `${IND} */`);
        else block.push(`${IND}/** TODO: describe ${m.name}. */`);
      }
      if (override) block.push(`${IND}@Override`);

      const bodyless = isInterface ? !m.isStatic && m.visibility !== 'private' : isAbstract && m.isAbstract;
      let mods = '';
      if (isInterface) {
        if (m.visibility === 'private') mods += 'private ';
        if (m.isStatic) mods += 'static ';
      } else {
        mods += VISIBILITY_KEYWORD[m.visibility];
        if (isAbstract && m.isAbstract) mods += 'abstract ';
        if (m.isStatic) mods += 'static ';
      }
      const sig = `${IND}${mods}${ret} ${m.name}(${paramStr})`;
      if (bodyless) block.push(`${sig};`);
      else {
        block.push(`${sig} {`, `${IND}${IND}// TODO: implement`);
        if (returnsValue) block.push(`${IND}${IND}return ${defaultValueFor(ret)};`);
        block.push(`${IND}}`);
      }
      sections.push(block);
    }

    // inherited abstract stubs
    for (const m of stubs) {
      typeStrings.push(m.returnType, ...parseParams(m.params).map((p) => p.type));
      const params = parseParams(m.params);
      const ret = m.returnType.trim() || 'void';
      const block = [
        `${IND}@Override`,
        `${IND}public ${ret} ${m.name}(${params.map((p) => `${p.type} ${p.name}`).join(', ')}) {`,
        `${IND}${IND}// TODO: implement`,
      ];
      if (ret !== 'void') block.push(`${IND}${IND}return ${defaultValueFor(ret)};`);
      block.push(`${IND}}`);
      sections.push(block);
    }

    // toString
    if (opts.toStringMethod && !isInterface && !isEnum && !ownMethodNames.has('toString')) {
      const fields = attrFields.filter((f) => !f.isStatic);
      if (fields.length) {
        const parts = fields.map((f, i) => {
          const label = `${i === 0 ? '' : ', '}${f.name}=`;
          return f.type === 'String'
            ? `${IND}${IND}${IND}${IND}"${label}'" + ${f.name} + '\\'' +`
            : `${IND}${IND}${IND}${IND}"${label}" + ${f.name} +`;
        });
        sections.push([
          `${IND}@Override`,
          `${IND}public String toString() {`,
          `${IND}${IND}return "${c.name}{" +`,
          ...parts,
          `${IND}${IND}${IND}${IND}'}';`,
          `${IND}}`,
        ]);
      }
    }

    // dependency targets contribute imports only
    for (const r of d.relationships) {
      if (r.source === c.id && r.type === 'dependency') {
        const t = byId.get(r.target);
        if (t) typeStrings.push(t.name);
      }
    }

    // ----- imports -----
    const imports = new Set<string>();
    for (const s of typeStrings) {
      for (const tok of s.match(IDENT_TOKEN) ?? []) {
        if (tok === c.name) continue;
        const local = d.classes.find((k) => k.name === tok);
        if (local) {
          if (pkgOf(local) !== pkg) imports.add(`${pkgOf(local)}.${local.name}`);
        } else if (JDK_IMPORTS[tok] && !classNames.has(tok)) imports.add(JDK_IMPORTS[tok]);
      }
    }
    const importLines = [...imports].sort();

    // ----- assemble -----
    const out: string[] = [];
    if (pkg) out.push(`package ${pkg};`, '');
    if (importLines.length) out.push(...importLines.map((i) => `import ${i};`), '');
    if (opts.javadoc) {
      const label = isInterface ? 'Interface' : isEnum ? 'Enumeration' : isAbstract ? 'Abstract class' : 'Class';
      if (c.note.trim()) out.push('/**', ...c.note.trim().split('\n').map((l) => ` * ${l}`), ' */');
      else out.push(`/** ${label} ${c.name}. */`);
    }
    out.push(`${header} {`);
    sections.forEach((s, i) => {
      if (i > 0) out.push('');
      out.push(...s);
    });
    out.push('}', '');
    lines.push(...out);

    const dir = pkg ? pkg.replace(/\./g, '/') + '/' : '';
    return {
      classId: c.id,
      className: c.name,
      pkg,
      path: `${dir}${c.name || 'Unnamed'}.java`,
      code: lines.join('\n'),
    };
  });
}
