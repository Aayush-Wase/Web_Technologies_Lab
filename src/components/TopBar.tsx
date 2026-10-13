import {
  CircleCheck,
  FileImage,
  FileJson,
  FilePlus2,
  FileUp,
  FileType2,
  Moon,
  PanelLeft,
  PanelRight,
  Sparkles,
  Sun,
  TriangleAlert,
  Download,
  Archive,
} from 'lucide-react';
import { Popover } from './ui';

interface Props {
  name: string;
  onName: (n: string) => void;
  errors: number;
  warnings: number;
  onProblems: () => void;
  theme: 'light' | 'dark';
  onTheme: () => void;
  sideOpen: boolean;
  onSide: () => void;
  inspOpen: boolean;
  onInsp: () => void;
  onNew: () => void;
  onExamples: () => void;
  onExport: (kind: 'json' | 'png' | 'svg' | 'zip') => void;
  onImport: () => void;
  canExportDiagram: boolean;
}

function Logo() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden>
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6366f1" />
          <stop offset="1" stopColor="#a855f7" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#lg)" />
      <g fill="none" stroke="#fff" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round">
        <rect x="11" y="6" width="10" height="7" rx="1.5" />
        <rect x="5" y="19" width="9" height="7" rx="1.5" />
        <rect x="18" y="19" width="9" height="7" rx="1.5" />
        <path d="M16 13v3M9.5 19v-3h13v3" />
      </g>
    </svg>
  );
}

export function TopBar(p: Props) {
  const total = p.errors + p.warnings;
  return (
    <header className="topbar">
      <button className="icon-btn" onClick={p.onSide} data-tip="Toggle elements panel" data-tip-pos="right" aria-pressed={p.sideOpen}>
        <PanelLeft size={18} />
      </button>
      <div className="brand">
        <Logo />
        ClassForge<small>UML → Java</small>
      </div>
      <span className="divider-v" />
      <input
        className="doc-name"
        value={p.name}
        placeholder="Untitled diagram"
        onChange={(e) => p.onName(e.target.value)}
        aria-label="Diagram name"
        spellCheck={false}
      />
      <span className="save-state" data-tip="Changes are saved in this browser">
        <i /> Autosaved
      </span>

      <span className="spacer" />

      <button
        className={`status-chip ${p.errors ? 'err' : p.warnings ? 'warn' : 'ok'}`}
        onClick={p.onProblems}
        data-tip="Show problems"
      >
        {total === 0 ? <CircleCheck size={14} /> : <TriangleAlert size={14} />}
        {total === 0
          ? 'Valid'
          : `${p.errors ? `${p.errors} error${p.errors > 1 ? 's' : ''}` : ''}${p.errors && p.warnings ? ' · ' : ''}${
              p.warnings ? `${p.warnings} warning${p.warnings > 1 ? 's' : ''}` : ''
            }`}
      </button>

      <span className="divider-v" />

      <button className="btn ghost" onClick={p.onNew}>
        <FilePlus2 size={15} /> New
      </button>
      <button className="btn ghost" onClick={p.onExamples}>
        <Sparkles size={15} /> Examples
      </button>

      <Popover
        trigger={({ toggle }) => (
          <button className="btn" onClick={toggle}>
            <Download size={15} /> Export
          </button>
        )}
      >
        {(close) => {
          const go = (k: Parameters<Props['onExport']>[0]) => () => {
            p.onExport(k);
            close();
          };
          return (
            <>
              <div className="menu-label">Code</div>
              <button className="menu-item" onClick={go('zip')}>
                <Archive size={16} /> Java sources (.zip)
              </button>
              <div className="menu-sep" />
              <div className="menu-label">Diagram</div>
              <button className="menu-item" onClick={go('png')} disabled={!p.canExportDiagram}>
                <FileImage size={16} /> PNG image
              </button>
              <button className="menu-item" onClick={go('svg')} disabled={!p.canExportDiagram}>
                <FileType2 size={16} /> SVG vector
              </button>
              <div className="menu-sep" />
              <div className="menu-label">Project</div>
              <button className="menu-item" onClick={go('json')}>
                <FileJson size={16} /> Save as JSON
                <small>Ctrl S</small>
              </button>
              <button
                className="menu-item"
                onClick={() => {
                  close();
                  p.onImport();
                }}
              >
                <FileUp size={16} /> Open JSON…
              </button>
            </>
          );
        }}
      </Popover>

      <span className="divider-v" />
      <button className="icon-btn" onClick={p.onTheme} data-tip={p.theme === 'dark' ? 'Light theme' : 'Dark theme'}>
        {p.theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
      </button>
      <button className="icon-btn" onClick={p.onInsp} data-tip="Toggle inspector" aria-pressed={p.inspOpen}>
        <PanelRight size={18} />
      </button>
    </header>
  );
}
