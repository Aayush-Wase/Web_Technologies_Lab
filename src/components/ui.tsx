import { useEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import type { ClassKind, RelationType, Visibility } from '../model/types';
import { EDGE_STYLES, markerPath } from '../canvas/geometry';
import { KIND_COLOR, KIND_LETTER } from '../canvas/ClassNodeView';
import { VISIBILITY_SYMBOL } from '../model/javaUtil';

/* ───────── Popover ───────── */
export function Popover({
  trigger,
  children,
  placement = 'right',
}: {
  trigger: (api: { open: boolean; toggle: () => void }) => ReactNode;
  children: (close: () => void) => ReactNode;
  placement?: 'right' | 'left' | 'up';
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', down);
      document.removeEventListener('keydown', key);
    };
  }, [open]);

  return (
    <div className="menu-wrap" ref={ref}>
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && <div className={`menu ${placement}`}>{children(() => setOpen(false))}</div>}
    </div>
  );
}

/* ───────── Modal ───────── */
export function Modal({
  title,
  subtitle,
  onClose,
  children,
  footer,
  narrow,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children?: ReactNode;
  footer?: ReactNode;
  narrow?: boolean;
}) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${narrow ? ' narrow' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <div style={{ flex: 1 }}>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        {children && <div className="modal-body">{children}</div>}
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

/* ───────── Small visual atoms ───────── */
export function KindBadge({ kind, small }: { kind: ClassKind; small?: boolean }) {
  return (
    <span className={`badge${small ? ' sm' : ''}`} style={{ background: KIND_COLOR[kind] }}>
      {KIND_LETTER[kind]}
    </span>
  );
}

export function RelationGlyph({ type, width = 54 }: { type: RelationType; width?: number }) {
  const s = EDGE_STYLES[type];
  const y = 9;
  const x1 = 3;
  const x2 = width - 3;
  const inset = (m: string) => (m === 'triangle' ? 15 : m.startsWith('diamond') ? 22 : 0);
  const ls = x1 + inset(s.sourceMarker);
  const le = x2 - inset(s.targetMarker);
  return (
    <svg className="rel-glyph" width={width} height={18} viewBox={`0 0 ${width} 18`} aria-hidden>
      <line
        x1={ls}
        y1={y}
        x2={le}
        y2={y}
        stroke="currentColor"
        strokeWidth={1.6}
        strokeDasharray={s.dashed ? '4 3' : undefined}
        strokeLinecap="round"
      />
      {s.sourceMarker !== 'none' && (
        <path
          d={markerPath(s.sourceMarker)}
          transform={`translate(${x1} ${y}) rotate(180)`}
          fill={s.sourceMarker === 'diamond-filled' ? 'currentColor' : 'var(--panel)'}
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
      )}
      {s.targetMarker !== 'none' && (
        <path
          d={markerPath(s.targetMarker)}
          transform={`translate(${x2} ${y})`}
          fill={s.targetMarker === 'arrow' ? 'none' : 'var(--panel)'}
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

const VIS_LABEL: Record<Visibility, string> = {
  public: 'public',
  private: 'private',
  protected: 'protected',
  package: 'package-private',
};

export function VisibilityPicker({ value, onChange }: { value: Visibility; onChange: (v: Visibility) => void }) {
  return (
    <Popover
      placement="left"
      trigger={({ toggle }) => (
        <button className={`vis-btn vis-${value}`} onClick={toggle} title={`Visibility: ${VIS_LABEL[value]}`} aria-label="Visibility">
          {VISIBILITY_SYMBOL[value]}
        </button>
      )}
    >
      {(close) => (
        <div className="vis-menu">
          {(['public', 'private', 'protected', 'package'] as Visibility[]).map((v) => (
            <button
              key={v}
              className="menu-item"
              onClick={() => {
                onChange(v);
                close();
              }}
            >
              <span className={`vis-${v}`} style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, width: 14 }}>
                {VISIBILITY_SYMBOL[v]}
              </span>
              {VIS_LABEL[v]}
            </button>
          ))}
        </div>
      )}
    </Popover>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <button className="toggle-row" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}>
      <span>
        {label}
        {description && <small>{description}</small>}
      </span>
      <span className={`switch${checked ? ' on' : ''}`} />
    </button>
  );
}
