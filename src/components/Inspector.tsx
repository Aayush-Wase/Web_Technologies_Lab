import { useEffect, useMemo, useRef } from 'react';
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  ArrowLeftRight,
  CircleCheck,
  Copy,
  Info,
  Plus,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react';
import type { Attribute, ClassKind, ClassNode, Diagram, Issue, Method, RelationType, Relationship } from '../model/types';
import type { ChangeFn } from '../model/store';
import { newAttribute, newMethod } from '../model/factory';
import { isIdentifier, isMany, pluralize, decapitalize, toFieldName } from '../model/javaUtil';
import { rectOf } from '../canvas/geometry';
import { KindBadge, RelationGlyph, VisibilityPicker } from './ui';
import { KIND_META, REL_META } from './Sidebar';

interface Props {
  doc: Diagram;
  selected: string[];
  issues: Issue[];
  change: ChangeFn;
  onSelect: (ids: string[]) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  focusToken: number;
  fileCount: number;
}

function uniqueIn(base: string, taken: string[]): string {
  if (!taken.includes(base)) return base;
  let i = 2;
  while (taken.includes(base + i)) i++;
  return base + i;
}

export function Inspector(props: Props) {
  const { doc, selected, issues } = props;
  const classes = doc.classes.filter((c) => selected.includes(c.id));
  const rels = doc.relationships.filter((r) => selected.includes(r.id));

  if (classes.length === 1 && rels.length === 0) return <ClassInspector {...props} node={classes[0]} />;
  if (rels.length === 1 && classes.length === 0) return <RelationInspector {...props} rel={rels[0]} />;
  if (classes.length + rels.length > 1) return <MultiInspector {...props} classes={classes} count={classes.length + rels.length} />;
  return <Overview doc={doc} issues={issues} onSelect={props.onSelect} fileCount={props.fileCount} />;
}

/* ───────────────────────── Overview ───────────────────────── */
function IssueList({ issues, doc, onSelect }: { issues: Issue[]; doc: Diagram; onSelect: (ids: string[]) => void }) {
  if (!issues.length)
    return (
      <div className="ok-note">
        <CircleCheck size={16} /> No problems — this diagram generates valid Java.
      </div>
    );
  const known = new Set([...doc.classes.map((c) => c.id), ...doc.relationships.map((r) => r.id)]);
  return (
    <div className="members">
      {issues.map((i) => {
        const target = i.relId && known.has(i.relId) ? i.relId : i.classId;
        return (
          <button key={i.id} className={`issue ${i.severity}`} onClick={() => target && onSelect([target])}>
            <TriangleAlert size={15} />
            <span>{i.message}</span>
          </button>
        );
      })}
    </div>
  );
}

function Overview({
  doc,
  issues,
  onSelect,
  fileCount,
}: {
  doc: Diagram;
  issues: Issue[];
  onSelect: (ids: string[]) => void;
  fileCount: number;
}) {
  const members = doc.classes.reduce((n, c) => n + c.attributes.length + c.methods.length, 0);
  return (
    <aside className="inspector" aria-label="Inspector">
      <div className="insp-head">
        <div>
          <h3>{doc.name || 'Untitled diagram'}</h3>
          <small>Diagram overview</small>
        </div>
      </div>
      <div className="insp-scroll">
        <div className="stat-grid">
          <div className="stat">
            <b>{doc.classes.length}</b>
            <span>Types</span>
          </div>
          <div className="stat">
            <b>{doc.relationships.length}</b>
            <span>Relationships</span>
          </div>
          <div className="stat">
            <b>{members}</b>
            <span>Members</span>
          </div>
          <div className="stat">
            <b>{fileCount}</b>
            <span>Java files</span>
          </div>
        </div>

        <div>
          <div className="group-head">
            <h4>
              Problems <span className="count-pill">{issues.length}</span>
            </h4>
          </div>
          <IssueList issues={issues} doc={doc} onSelect={onSelect} />
        </div>

        <div>
          <div className="group-head">
            <h4>Quick tips</h4>
          </div>
          <div className="members" style={{ color: 'var(--text-2)', fontSize: 12, gap: 8 }}>
            <Tip>
              <b>Double-click</b> the canvas to drop a new class.
            </Tip>
            <Tip>
              Select a class and drag from a <b>blue handle</b> to connect — release on empty space to create a new
              connected class.
            </Tip>
            <Tip>
              Name relationships and set multiplicities like <code>0..*</code> — they become typed fields (e.g.{' '}
              <code>List&lt;Order&gt;</code>) in the Java output.
            </Tip>
          </div>
        </div>
      </div>
    </aside>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
      <Info size={14} style={{ marginTop: 2, color: 'var(--accent)', flex: 'none' }} />
      <span>{children}</span>
    </div>
  );
}

/* ───────────────────────── Multi-selection ───────────────────────── */
function MultiInspector({
  doc, classes, count, change, onDelete, onDuplicate,
}: Props & { classes: ClassNode[]; count: number }) {
  const align = (mode: 'l' | 'c' | 'r' | 't' | 'm' | 'b') => {
    if (classes.length < 2) return;
    const rs = classes.map((c) => ({ id: c.id, ...rectOf(c) }));
    const minX = Math.min(...rs.map((r) => r.x));
    const maxX = Math.max(...rs.map((r) => r.x + r.w));
    const minY = Math.min(...rs.map((r) => r.y));
    const maxY = Math.max(...rs.map((r) => r.y + r.h));
    const byId = new Map(rs.map((r) => [r.id, r]));
    change((d) => ({
      ...d,
      classes: d.classes.map((c) => {
        const r = byId.get(c.id);
        if (!r) return c;
        const n = { ...c };
        if (mode === 'l') n.x = minX;
        if (mode === 'r') n.x = maxX - r.w;
        if (mode === 'c') n.x = Math.round((minX + maxX) / 2 - r.w / 2);
        if (mode === 't') n.y = minY;
        if (mode === 'b') n.y = maxY - r.h;
        if (mode === 'm') n.y = Math.round((minY + maxY) / 2 - r.h / 2);
        return n;
      }),
    }));
  };
  const btn = (mode: Parameters<typeof align>[0], tip: string, Icon: typeof AlignStartVertical) => (
    <button className="icon-btn" data-tip={tip} onClick={() => align(mode)} disabled={classes.length < 2}>
      <Icon size={17} />
    </button>
  );
  return (
    <aside className="inspector" aria-label="Inspector">
      <div className="insp-head">
        <div>
          <h3>{count} items selected</h3>
          <small>{classes.length} types</small>
        </div>
      </div>
      <div className="insp-scroll">
        <div>
          <div className="group-head">
            <h4>Align</h4>
          </div>
          <div className="float" style={{ position: 'static', display: 'inline-flex', transform: 'none', boxShadow: 'none' }}>
            {btn('l', 'Align left', AlignStartVertical)}
            {btn('c', 'Align centers', AlignCenterVertical)}
            {btn('r', 'Align right', AlignEndVertical)}
            <span className="sep" />
            {btn('t', 'Align top', AlignStartHorizontal)}
            {btn('m', 'Align middles', AlignCenterHorizontal)}
            {btn('b', 'Align bottom', AlignEndHorizontal)}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={onDuplicate}>
            <Copy size={14} /> Duplicate
          </button>
          <button className="btn danger" onClick={onDelete}>
            <Trash2 size={14} /> Delete
          </button>
        </div>
        <div className="members">
          {classes.map((c) => (
            <div key={c.id} className="rel-row" style={{ cursor: 'default' }}>
              <KindBadge kind={c.kind} small />
              <span>{c.name}</span>
            </div>
          ))}
        </div>
        <div className="hint">{doc.classes.length - classes.length} other types not selected.</div>
      </div>
    </aside>
  );
}

/* ───────────────────────── Class inspector ───────────────────────── */
function ClassInspector({
  doc, node, change, onSelect, onDelete, onDuplicate, focusToken, issues,
}: Props & { node: ClassNode }) {
  const nameRef = useRef<HTMLInputElement>(null);
  const update = (fn: (c: ClassNode) => ClassNode, key?: string) =>
    change((d) => ({ ...d, classes: d.classes.map((c) => (c.id === node.id ? fn(c) : c)) }), { key: key ? `${node.id}:${key}` : undefined });

  useEffect(() => {
    if (focusToken > 0) {
      nameRef.current?.focus();
      nameRef.current?.select();
    }
  }, [focusToken, node.id]);

  const myRels = useMemo(
    () => doc.relationships.filter((r) => r.source === node.id || r.target === node.id),
    [doc.relationships, node.id],
  );
  const nameOf = (id: string) => doc.classes.find((c) => c.id === id)?.name ?? '?';
  const nameIssue = !node.name.trim() || !isIdentifier(node.name.trim());
  const myIssues = issues.filter((i) => i.classId === node.id);

  const setAttr = (id: string, patch: Partial<Attribute>, key?: string) =>
    update((c) => ({ ...c, attributes: c.attributes.map((a) => (a.id === id ? { ...a, ...patch } : a)) }), key ? `a${id}${key}` : undefined);
  const setMethod = (id: string, patch: Partial<Method>, key?: string) =>
    update((c) => ({ ...c, methods: c.methods.map((m) => (m.id === id ? { ...m, ...patch } : m)) }), key ? `m${id}${key}` : undefined);

  const isInterface = node.kind === 'interface';

  return (
    <aside className="inspector" aria-label="Inspector">
      <div className="insp-head">
        <KindBadge kind={node.kind} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{node.name || 'Unnamed'}</h3>
          <small>{KIND_META[node.kind].label} properties</small>
        </div>
        <button className="icon-btn sm" data-tip="Duplicate (Ctrl+D)" onClick={onDuplicate}>
          <Copy size={15} />
        </button>
        <button className="icon-btn sm danger" data-tip="Delete (Del)" onClick={onDelete}>
          <Trash2 size={15} />
        </button>
      </div>

      <div className="insp-scroll">
        <div className="field">
          <label htmlFor="cls-name">Name</label>
          <input
            id="cls-name"
            ref={nameRef}
            className={`input mono${nameIssue ? ' invalid' : ''}`}
            value={node.name}
            spellCheck={false}
            onChange={(e) => update((c) => ({ ...c, name: e.target.value }), 'name')}
          />
        </div>

        <div className="field">
          <label>Kind</label>
          <div className="segmented">
            {(Object.keys(KIND_META) as ClassKind[]).map((k) => (
              <button
                key={k}
                className={node.kind === k ? 'on' : ''}
                onClick={() => update((c) => ({ ...c, kind: k, constants: k === 'enum' && !c.constants.length ? ['VALUE_ONE'] : c.constants }))}
              >
                {KIND_META[k].label}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label htmlFor="cls-pkg">Package override</label>
          <input
            id="cls-pkg"
            className="input mono"
            placeholder={doc.options.rootPackage || 'default package'}
            value={node.pkg}
            spellCheck={false}
            onChange={(e) => update((c) => ({ ...c, pkg: e.target.value.replace(/\s/g, '') }), 'pkg')}
          />
        </div>

        <div className="field">
          <label htmlFor="cls-note">Description (Javadoc)</label>
          <textarea
            id="cls-note"
            className="textarea"
            rows={2}
            placeholder="What is this type responsible for?"
            value={node.note}
            onChange={(e) => update((c) => ({ ...c, note: e.target.value }), 'note')}
          />
        </div>

        {myIssues.length > 0 && (
          <div className="members">
            {myIssues.map((i) => (
              <div key={i.id} className={`issue ${i.severity}`}>
                <TriangleAlert size={15} />
                <span>{i.message}</span>
              </div>
            ))}
          </div>
        )}

        {node.kind === 'enum' && (
          <div>
            <div className="group-head">
              <h4>
                Constants <span className="count-pill">{node.constants.length}</span>
              </h4>
            </div>
            <div className="members">
              {node.constants.map((k, i) => (
                <div key={i} className="member-row">
                  <input
                    className="input mono"
                    value={k}
                    spellCheck={false}
                    placeholder="CONSTANT_NAME"
                    onChange={(e) =>
                      update((c) => ({ ...c, constants: c.constants.map((x, j) => (j === i ? e.target.value : x)) }), `k${i}`)
                    }
                  />
                  <button
                    className="icon-btn sm danger"
                    aria-label="Remove constant"
                    onClick={() => update((c) => ({ ...c, constants: c.constants.filter((_, j) => j !== i) }))}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
            <button
              className="add-row"
              onClick={() => update((c) => ({ ...c, constants: [...c.constants, `VALUE_${c.constants.length + 1}`] }))}
            >
              <Plus size={14} /> Add constant
            </button>
          </div>
        )}

        {(
          <div>
            <div className="group-head">
              <h4>
                {isInterface ? 'Constants' : 'Attributes'} <span className="count-pill">{node.attributes.length}</span>
              </h4>
            </div>
            <div className="members">
              {node.attributes.map((a) => (
                <div className="member" key={a.id}>
                  <div className="member-row">
                    {!isInterface && (
                      <VisibilityPicker value={a.visibility} onChange={(v) => setAttr(a.id, { visibility: v })} />
                    )}
                    <input
                      className={`input mono bare${isIdentifier(a.name) ? '' : ' invalid'}`}
                      style={{ flex: 1.1 }}
                      value={a.name}
                      spellCheck={false}
                      aria-label="Attribute name"
                      onChange={(e) => setAttr(a.id, { name: e.target.value.replace(/\s/g, '') }, 'n')}
                    />
                    <span className="sep">:</span>
                    <input
                      className={`input mono bare${a.type.trim() ? '' : ' invalid'}`}
                      style={{ flex: 1 }}
                      value={a.type}
                      spellCheck={false}
                      aria-label="Attribute type"
                      onChange={(e) => setAttr(a.id, { type: e.target.value }, 't')}
                    />
                    <button
                      className="icon-btn sm danger"
                      aria-label="Remove attribute"
                      onClick={() => update((c) => ({ ...c, attributes: c.attributes.filter((x) => x.id !== a.id) }))}
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <div className="member-sub">
                    {!isInterface && (
                      <>
                        <button className={`chip${a.isStatic ? ' on' : ''}`} onClick={() => setAttr(a.id, { isStatic: !a.isStatic })}>
                          static
                        </button>
                        <button className={`chip${a.isFinal ? ' on' : ''}`} onClick={() => setAttr(a.id, { isFinal: !a.isFinal })}>
                          final
                        </button>
                      </>
                    )}
                    <input
                      className="input mono bare"
                      style={{ flex: 1, height: 24 }}
                      placeholder="= default value"
                      value={a.defaultValue}
                      spellCheck={false}
                      aria-label="Default value"
                      onChange={(e) => setAttr(a.id, { defaultValue: e.target.value }, 'd')}
                    />
                  </div>
                </div>
              ))}
            </div>
            <button
              className="add-row"
              onClick={() =>
                update((c) => ({
                  ...c,
                  attributes: [
                    ...c.attributes,
                    newAttribute({
                      name: uniqueIn('field', c.attributes.map((a) => a.name)),
                      visibility: isInterface ? 'public' : 'private',
                    }),
                  ],
                }))
              }
            >
              <Plus size={14} /> Add {isInterface ? 'constant' : 'attribute'}
            </button>
          </div>
        )}

        <div>
          <div className="group-head">
            <h4>
              Methods <span className="count-pill">{node.methods.length}</span>
            </h4>
          </div>
          <div className="members">
            {node.methods.map((m) => (
              <div className="member" key={m.id}>
                <div className="member-row">
                  <VisibilityPicker value={m.visibility} onChange={(v) => setMethod(m.id, { visibility: v })} />
                  <input
                    className={`input mono bare${isIdentifier(m.name) ? '' : ' invalid'}`}
                    style={{ flex: 1.1 }}
                    value={m.name}
                    spellCheck={false}
                    aria-label="Method name"
                    onChange={(e) => setMethod(m.id, { name: e.target.value.replace(/\s/g, '') }, 'n')}
                  />
                  <span className="sep">:</span>
                  <input
                    className="input mono bare"
                    style={{ flex: 0.9 }}
                    value={m.returnType}
                    spellCheck={false}
                    aria-label="Return type"
                    onChange={(e) => setMethod(m.id, { returnType: e.target.value }, 'r')}
                  />
                  <button
                    className="icon-btn sm danger"
                    aria-label="Remove method"
                    onClick={() => update((c) => ({ ...c, methods: c.methods.filter((x) => x.id !== m.id) }))}
                  >
                    <X size={14} />
                  </button>
                </div>
                <div className="member-sub">
                  <span className="mono" style={{ color: 'var(--text-3)' }}>
                    (
                  </span>
                  <input
                    className="input mono bare"
                    style={{ flex: 1, height: 24 }}
                    placeholder="String name, int age"
                    value={m.params}
                    spellCheck={false}
                    aria-label="Parameters"
                    onChange={(e) => setMethod(m.id, { params: e.target.value }, 'p')}
                  />
                  <span className="mono" style={{ color: 'var(--text-3)' }}>
                    )
                  </span>
                </div>
                {!isInterface && (
                  <div className="member-sub">
                    <button className={`chip${m.isStatic ? ' on' : ''}`} onClick={() => setMethod(m.id, { isStatic: !m.isStatic })}>
                      static
                    </button>
                    <button
                      className={`chip${m.isAbstract ? ' on' : ''}`}
                      onClick={() => setMethod(m.id, { isAbstract: !m.isAbstract })}
                    >
                      abstract
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
          <button
            className="add-row"
            onClick={() =>
              update((c) => ({
                ...c,
                methods: [
                  ...c.methods,
                  newMethod({ name: uniqueIn('method', c.methods.map((m) => m.name)) }),
                ],
              }))
            }
          >
            <Plus size={14} /> Add method
          </button>
        </div>

        {myRels.length > 0 && (
          <div>
            <div className="group-head">
              <h4>
                Relationships <span className="count-pill">{myRels.length}</span>
              </h4>
            </div>
            <div className="members">
              {myRels.map((r) => {
                const outgoing = r.source === node.id;
                return (
                  <button key={r.id} className="rel-row" onClick={() => onSelect([r.id])}>
                    <RelationGlyph type={r.type} width={44} />
                    <span>
                      <b style={{ fontWeight: 600 }}>{outgoing ? '→' : '←'}</b> {nameOf(outgoing ? r.target : r.source)}
                      {r.label ? <span style={{ color: 'var(--text-3)' }}> · {r.label}</span> : null}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

/* ───────────────────────── Relationship inspector ───────────────────────── */
function describeEffect(rel: Relationship, source: string, target: string): string {
  const many = isMany(rel.targetMult);
  const field =
    toFieldName(rel.label) || (many ? pluralize(decapitalize(target)) : decapitalize(target));
  const type = many ? `List<${target}>` : target;
  switch (rel.type) {
    case 'inheritance':
      return `class ${source} extends ${target}`;
    case 'realization':
      return `class ${source} implements ${target}`;
    case 'dependency':
      return `${source} depends on ${target} (import only)`;
    default:
      return `${source}:  private ${type} ${field};`;
  }
}

function RelationInspector({
  doc, rel, change, onDelete, onSelect,
}: Props & { rel: Relationship }) {
  const update = (patch: Partial<Relationship>, key?: string) =>
    change(
      (d) => ({ ...d, relationships: d.relationships.map((r) => (r.id === rel.id ? { ...r, ...patch } : r)) }),
      { key: key ? `${rel.id}:${key}` : undefined },
    );
  const src = doc.classes.find((c) => c.id === rel.source);
  const tgt = doc.classes.find((c) => c.id === rel.target);
  const structural = rel.type === 'inheritance' || rel.type === 'realization' || rel.type === 'dependency';

  return (
    <aside className="inspector" aria-label="Inspector">
      <div className="insp-head">
        <RelationGlyph type={rel.type} width={48} />
        <div style={{ flex: 1 }}>
          <h3>{REL_META[rel.type].label}</h3>
          <small>Relationship properties</small>
        </div>
        <button className="icon-btn sm danger" data-tip="Delete (Del)" onClick={onDelete}>
          <Trash2 size={15} />
        </button>
      </div>
      <div className="insp-scroll">
        <div className="field">
          <label>Type</label>
          <div className="type-grid">
            {(Object.keys(REL_META) as RelationType[]).map((t) => (
              <button key={t} className={`type-opt${rel.type === t ? ' on' : ''}`} onClick={() => update({ type: t })}>
                <RelationGlyph type={t} width={48} />
                {REL_META[t].label}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>Direction</label>
          <div className="rel-endpoints">
            <button className="endpoint" style={{ textAlign: 'left' }} onClick={() => src && onSelect([src.id])}>
              <small>From</small>
              {src?.name}
            </button>
            <button
              className="icon-btn"
              data-tip="Swap direction"
              onClick={() => update({ source: rel.target, target: rel.source, sourceMult: rel.targetMult, targetMult: rel.sourceMult })}
            >
              <ArrowLeftRight size={16} />
            </button>
            <button className="endpoint" style={{ textAlign: 'left' }} onClick={() => tgt && onSelect([tgt.id])}>
              <small>To</small>
              {tgt?.name}
            </button>
          </div>
        </div>

        {!(rel.type === 'inheritance' || rel.type === 'realization') && (
          <div className="field">
            <label htmlFor="rel-label">{structural ? 'Label' : 'Role / field name'}</label>
            <input
              id="rel-label"
              className="input"
              placeholder={structural ? 'optional' : 'e.g. orders'}
              value={rel.label}
              onChange={(e) => update({ label: e.target.value }, 'label')}
            />
            {!structural && <span className="hint">Used as the field name in the generated source.</span>}
          </div>
        )}

        {!(rel.type === 'inheritance' || rel.type === 'realization') && (
          <div className="field">
            <label>Multiplicity</label>
            <datalist id="mult-list">
              {['1', '0..1', '*', '0..*', '1..*'].map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div className="field">
                <input
                  className="input mono"
                  list="mult-list"
                  placeholder="source"
                  aria-label="Source multiplicity"
                  value={rel.sourceMult}
                  onChange={(e) => update({ sourceMult: e.target.value }, 'sm')}
                />
                <span className="hint">at {src?.name}</span>
              </div>
              <div className="field">
                <input
                  className="input mono"
                  list="mult-list"
                  placeholder="target"
                  aria-label="Target multiplicity"
                  value={rel.targetMult}
                  onChange={(e) => update({ targetMult: e.target.value }, 'tm')}
                />
                <span className="hint">at {tgt?.name}</span>
              </div>
            </div>
          </div>
        )}

        {src && tgt && (
          <div className="field">
            <label>Generated Java</label>
            <div className="code-preview">{describeEffect(rel, src.name, tgt.name)}</div>
          </div>
        )}
      </div>
    </aside>
  );
}
