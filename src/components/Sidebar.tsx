import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { ClassKind, ClassNode, Issue, RelationType } from '../model/types';
import { KindBadge, RelationGlyph } from './ui';
import { KIND_COLOR } from '../canvas/ClassNodeView';

export const KIND_META: Record<ClassKind, { label: string; desc: string }> = {
  class: { label: 'Class', desc: 'Concrete type' },
  abstract: { label: 'Abstract', desc: 'Partial base class' },
  interface: { label: 'Interface', desc: 'Behaviour contract' },
  enum: { label: 'Enum', desc: 'Fixed set of values' },
};

export const REL_META: Record<RelationType, { label: string; desc: string }> = {
  inheritance: { label: 'Inheritance', desc: 'extends a superclass' },
  realization: { label: 'Realization', desc: 'implements an interface' },
  association: { label: 'Association', desc: 'holds a reference' },
  aggregation: { label: 'Aggregation', desc: 'whole–part, shared' },
  composition: { label: 'Composition', desc: 'whole–part, owned' },
  dependency: { label: 'Dependency', desc: 'uses temporarily' },
};

interface Props {
  classes: ClassNode[];
  selected: string[];
  connectActive: boolean;
  relType: RelationType;
  issues: Issue[];
  onAddClass: (kind: ClassKind) => void;
  onPickRelation: (type: RelationType) => void;
  onSelectClass: (id: string, additive: boolean) => void;
}

export function Sidebar({ classes, selected, connectActive, relType, issues, onAddClass, onPickRelation, onSelectClass }: Props) {
  const [query, setQuery] = useState('');
  const shown = useMemo(
    () => classes.filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase())),
    [classes, query],
  );
  const errorsBy = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of issues) if (i.classId && i.severity === 'error') m.set(i.classId, (m.get(i.classId) ?? 0) + 1);
    return m;
  }, [issues]);

  return (
    <aside className="sidebar" aria-label="Elements">
      <div className="side-scroll">
        <section className="section">
          <div className="section-title">Add class</div>
          <div className="kind-grid">
            {(Object.keys(KIND_META) as ClassKind[]).map((k) => (
              <button
                key={k}
                className="kind-card"
                style={{ ['--kc' as string]: KIND_COLOR[k] }}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/x-classforge-kind', k);
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                onClick={() => onAddClass(k)}
                title="Click to add, or drag onto the canvas"
              >
                <KindBadge kind={k} />
                <div>
                  <b>{KIND_META[k].label}</b>
                  <span className="d">{KIND_META[k].desc}</span>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="section">
          <div className="section-title">Relationships</div>
          <div className="rel-list">
            {(Object.keys(REL_META) as RelationType[]).map((t) => (
              <button
                key={t}
                className={`rel-item${connectActive && relType === t ? ' active' : ''}`}
                onClick={() => onPickRelation(t)}
              >
                <RelationGlyph type={t} />
                <div>
                  <b>{REL_META[t].label}</b>
                  <span>{REL_META[t].desc}</span>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="section">
          <div className="section-title">
            <span>Outline</span>
            <span style={{ fontWeight: 600 }}>{classes.length}</span>
          </div>
          {classes.length > 5 && (
            <div className="search">
              <Search size={14} />
              <input
                className="input"
                placeholder="Filter classes…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          )}
          {shown.length === 0 && <div className="empty-note">{classes.length ? 'No matches.' : 'No classes yet.'}</div>}
          {shown.map((c) => (
            <button
              key={c.id}
              className={`outline-item${selected.includes(c.id) ? ' active' : ''}`}
              onClick={(e) => onSelectClass(c.id, e.shiftKey)}
            >
              <KindBadge kind={c.kind} small />
              <span className="name">{c.name || 'Unnamed'}</span>
              {errorsBy.get(c.id) ? (
                <span className="count" style={{ color: 'var(--danger)' }}>
                  {errorsBy.get(c.id)} ⚠
                </span>
              ) : (
                <span className="count">{c.attributes.length + c.methods.length || ''}</span>
              )}
            </button>
          ))}
        </section>
      </div>
      <div className="side-footer">
        <span>
          <kbd>V</kbd> Select
        </span>
        <span>
          <kbd>H</kbd> Hand
        </span>
        <span>
          <kbd>Space</kbd> Pan
        </span>
        <span>
          <kbd>Ctrl</kbd>+<kbd>Scroll</kbd> Zoom
        </span>
      </div>
    </aside>
  );
}
