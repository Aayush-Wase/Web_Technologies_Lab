import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { Archive, ChevronDown, ChevronUp, Copy, Download, FileCode2, SlidersHorizontal } from 'lucide-react';
import type { ClassNode, CodegenOptions } from '../model/types';
import type { GeneratedFile } from '../codegen/java';
import { tokenizeJava } from '../codegen/highlight';
import { KindBadge, Popover, Toggle } from './ui';

interface Props {
  files: GeneratedFile[];
  classes: ClassNode[];
  activeId: string | null;
  onActive: (id: string) => void;
  options: CodegenOptions;
  onOptions: (patch: Partial<CodegenOptions>) => void;
  open: boolean;
  onToggle: () => void;
  height: number;
  onHeight: (h: number) => void;
  onCopy: (text: string, what: string) => void;
  onDownload: (file: GeneratedFile) => void;
  onDownloadAll: () => void;
}

export function CodeDock(props: Props) {
  const { files, classes, activeId, onActive, options, onOptions, open, onToggle, height, onHeight } = props;
  const active = files.find((f) => f.classId === activeId) ?? files[0];
  const kindOf = useMemo(() => new Map(classes.map((c) => [c.id, c.kind])), [classes]);
  const [resizing, setResizing] = useState(false);
  const startRef = useRef<{ y: number; h: number } | null>(null);

  const onDown = (e: RPointerEvent<HTMLDivElement>) => {
    startRef.current = { y: e.clientY, h: height };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setResizing(true);
  };
  const onMove = (e: RPointerEvent<HTMLDivElement>) => {
    if (!startRef.current) return;
    const max = window.innerHeight - 220;
    onHeight(Math.min(max, Math.max(160, startRef.current.h + startRef.current.y - e.clientY)));
  };
  const onUp = () => {
    startRef.current = null;
    setResizing(false);
  };

  const tokens = useMemo(() => (active ? tokenizeJava(active.code) : []), [active]);
  const lineCount = active ? active.code.split('\n').length - 1 : 0;

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, left: 0 });
  }, [active?.classId]);

  return (
    <section className="dock" style={{ height: open ? height : 42 }} aria-label="Generated Java code">
      {open && (
        <div
          className={`dock-resize${resizing ? ' dragging' : ''}`}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        />
      )}
      <div className="dock-head">
        <div className="dock-title">
          <FileCode2 size={16} />
          Java output
          <span className="java-pill">JAVA 17+</span>
        </div>
        {open && active && <span className="path">{active.path}</span>}
        <span className="spacer" />
        {open && active && (
          <>
            <span className="hint" style={{ marginRight: 6 }}>
              {lineCount} lines
            </span>
            <Popover
              placement="right"
              trigger={({ toggle, open: o }) => (
                <button className={`btn sm ghost${o ? ' active' : ''}`} onClick={toggle}>
                  <SlidersHorizontal size={14} /> Options
                </button>
              )}
            >
              {() => (
                <div style={{ width: 300 }}>
                  <div className="menu-label">Project package</div>
                  <div style={{ padding: '0 8px 8px' }}>
                    <input
                      className="input mono"
                      value={options.rootPackage}
                      spellCheck={false}
                      placeholder="com.example.app"
                      onChange={(e) => onOptions({ rootPackage: e.target.value.replace(/\s/g, '') })}
                    />
                  </div>
                  <div className="menu-sep" />
                  <Toggle label="Getters" checked={options.getters} onChange={(v) => onOptions({ getters: v })} />
                  <Toggle label="Setters" checked={options.setters} onChange={(v) => onOptions({ setters: v })} />
                  <Toggle
                    label="Constructors"
                    description="No-arg and all-args, with super() calls"
                    checked={options.constructors}
                    onChange={(v) => onOptions({ constructors: v })}
                  />
                  <Toggle label="toString()" checked={options.toStringMethod} onChange={(v) => onOptions({ toStringMethod: v })} />
                  <Toggle label="Javadoc comments" checked={options.javadoc} onChange={(v) => onOptions({ javadoc: v })} />
                  <Toggle
                    label="Stub inherited methods"
                    description="@Override stubs for interface / abstract methods"
                    checked={options.stubInherited}
                    onChange={(v) => onOptions({ stubInherited: v })}
                  />
                </div>
              )}
            </Popover>
            <button className="btn sm" onClick={() => props.onCopy(active.code, active.className + '.java')}>
              <Copy size={14} /> Copy
            </button>
            <button className="btn sm" onClick={() => props.onDownload(active)}>
              <Download size={14} /> .java
            </button>
            <button className="btn sm primary" onClick={props.onDownloadAll} disabled={!files.length}>
              <Archive size={14} /> Download all
            </button>
          </>
        )}
        <button className="icon-btn" onClick={onToggle} aria-label={open ? 'Collapse code panel' : 'Expand code panel'}>
          {open ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
        </button>
      </div>

      {open && (
        <div className="dock-body">
          <div className="file-list">
            {files.map((f) => (
              <button
                key={f.classId}
                className={`file-item${active?.classId === f.classId ? ' active' : ''}`}
                onClick={() => onActive(f.classId)}
              >
                {kindOf.get(f.classId) && <KindBadge kind={kindOf.get(f.classId)!} small />}
                <span>{f.className || 'Unnamed'}.java</span>
              </button>
            ))}
            {!files.length && <div className="empty-note">Add a class to generate code.</div>}
          </div>
          {active ? (
            <div className="code-wrap" ref={scrollRef}>
              <pre className="code-gutter" aria-hidden>
                {Array.from({ length: lineCount }, (_, i) => i + 1).join('\n')}
              </pre>
              <pre className="code-text">
                <code>
                  {tokens.map((t, i) =>
                    t.kind === 'plain' ? t.text : (
                      <span key={i} className={`tok-${t.kind}`}>
                        {t.text}
                      </span>
                    ),
                  )}
                </code>
              </pre>
            </div>
          ) : (
            <div className="dock-empty">Your generated Java source will appear here.</div>
          )}
        </div>
      )}
    </section>
  );
}
