import type { ClassNode, Diagram, Issue } from './types';
import { isIdentifier, JAVA_KEYWORDS, parseParams } from './javaUtil';

const classRelTypes = new Set(['inheritance', 'realization']);

export function validateDiagram(d: Diagram): Issue[] {
  const issues: Issue[] = [];
  const byId = new Map(d.classes.map((c) => [c.id, c]));
  let n = 0;
  const add = (severity: Issue['severity'], message: string, ref: { classId?: string; relId?: string }) =>
    issues.push({ id: `i${n++}`, severity, message, ...ref });

  // names
  const seen = new Map<string, ClassNode>();
  for (const c of d.classes) {
    const name = c.name.trim();
    if (!name) add('error', 'Class has no name', { classId: c.id });
    else if (JAVA_KEYWORDS.has(name)) add('error', `"${name}" is a reserved Java keyword`, { classId: c.id });
    else if (!isIdentifier(name)) add('error', `"${name}" is not a valid Java identifier`, { classId: c.id });
    else if (!/^[A-Z]/.test(name)) add('warning', `"${name}" should start with an uppercase letter`, { classId: c.id });

    const key = `${c.pkg.trim()}::${name}`;
    if (name && seen.has(key)) add('error', `Duplicate class name "${name}"`, { classId: c.id });
    seen.set(key, c);

    const attrNames = new Set<string>();
    for (const a of c.attributes) {
      if (!isIdentifier(a.name.trim()))
        add('error', `${name || 'Class'}: "${a.name}" is not a valid field name`, { classId: c.id });
      else if (attrNames.has(a.name)) add('error', `${name}: duplicate field "${a.name}"`, { classId: c.id });
      attrNames.add(a.name);
      if (!a.type.trim()) add('error', `${name}.${a.name}: missing type`, { classId: c.id });
    }

    const sigs = new Set<string>();
    for (const m of c.methods) {
      if (!isIdentifier(m.name.trim()))
        add('error', `${name || 'Class'}: "${m.name}" is not a valid method name`, { classId: c.id });
      const sig = `${m.name}/${parseParams(m.params).map((p) => p.type).join(',')}`;
      if (sigs.has(sig)) add('warning', `${name}: duplicate method ${m.name}(…)`, { classId: c.id });
      sigs.add(sig);
      if (m.isAbstract && c.kind === 'class')
        add('warning', `${name}.${m.name}() is abstract but ${name} is not an abstract class`, { classId: c.id });
    }

    if (c.kind === 'enum' && c.constants.filter((x) => x.trim()).length === 0)
      add('warning', `Enum ${name || ''} has no constants`, { classId: c.id });
  }

  // relationships
  const supers = new Map<string, string[]>();
  const pairSeen = new Set<string>();
  for (const r of d.relationships) {
    const s = byId.get(r.source);
    const t = byId.get(r.target);
    if (!s || !t) continue;
    const pk = `${r.source}>${r.target}>${r.type}`;
    if (pairSeen.has(pk)) add('warning', `Duplicate ${r.type} between ${s.name} and ${t.name}`, { relId: r.id });
    pairSeen.add(pk);

    if (classRelTypes.has(r.type)) {
      if (s.id === t.id) {
        add('error', `${s.name} cannot inherit from itself`, { relId: r.id, classId: s.id });
        continue;
      }
      supers.set(s.id, [...(supers.get(s.id) ?? []), t.id]);
      if (s.kind === 'interface' && t.kind !== 'interface')
        add('error', `Interface ${s.name} can only extend interfaces`, { relId: r.id, classId: s.id });
      if (t.kind === 'enum') add('error', `${s.name} cannot extend enum ${t.name}`, { relId: r.id, classId: s.id });
      if (s.kind === 'enum' && t.kind !== 'interface')
        add('error', `Enum ${s.name} can only implement interfaces`, { relId: r.id, classId: s.id });
      if (r.type === 'realization' && t.kind !== 'interface')
        add('warning', `${t.name} is not an interface — "implements" will be emitted as "extends"`, { relId: r.id });
    }
  }

  for (const [id, targets] of supers) {
    const c = byId.get(id)!;
    const classParents = targets.filter((t) => byId.get(t)?.kind !== 'interface');
    if ((c.kind === 'class' || c.kind === 'abstract') && classParents.length > 1)
      add('error', `${c.name} extends more than one class — Java allows only single inheritance`, { classId: id });
  }

  // cycles
  const state = new Map<string, 0 | 1 | 2>();
  const reported = new Set<string>();
  const dfs = (id: string, stack: string[]) => {
    state.set(id, 1);
    for (const t of supers.get(id) ?? []) {
      if (state.get(t) === 1) {
        const cyc = [...stack.slice(stack.indexOf(t)), id].map((x) => byId.get(x)?.name).join(' → ');
        if (!reported.has(t)) add('error', `Inheritance cycle: ${cyc} → ${byId.get(t)?.name}`, { classId: t });
        reported.add(t);
      } else if (!state.get(t)) dfs(t, [...stack, id]);
    }
    state.set(id, 2);
  };
  for (const c of d.classes) if (!state.get(c.id)) dfs(c.id, []);

  return issues;
}
