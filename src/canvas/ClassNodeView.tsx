import { memo } from 'react';
import type { ClassKind, ClassNode, Visibility } from '../model/types';
import { FONT_MONO, FONT_SANS, KIND_STEREOTYPE, M, layoutNode } from './measure';
import type { Side } from './geometry';

export const KIND_COLOR: Record<ClassKind, string> = {
  class: 'var(--d-class)',
  abstract: 'var(--d-abstract)',
  interface: 'var(--d-interface)',
  enum: 'var(--d-enum)',
};

export const KIND_LETTER: Record<ClassKind, string> = { class: 'C', abstract: 'A', interface: 'I', enum: 'E' };

const VIS_COLOR: Record<Visibility, string> = {
  public: 'var(--d-vis-public)',
  private: 'var(--d-vis-private)',
  protected: 'var(--d-vis-protected)',
  package: 'var(--d-vis-package)',
};

const R = 10;

interface Props {
  node: ClassNode;
  selected: boolean;
  dropTarget: boolean;
  showHandles: boolean;
  issue?: 'error' | 'warning';
  issueText?: string;
}

function ClassNodeViewImpl({ node, selected, dropTarget, showHandles, issue, issueText }: Props) {
  const L = layoutNode(node);
  const color = KIND_COLOR[node.kind];
  const stereo = KIND_STEREOTYPE[node.kind];
  const headerPath = `M0,${R} a${R},${R} 0 0 1 ${R},-${R} h${L.w - 2 * R} a${R},${R} 0 0 1 ${R},${R} V${L.headerH} H0 Z`;
  const nameY = stereo ? 40 : L.headerH / 2;
  const badgeY = stereo ? 33 : L.headerH / 2;

  const handles: { side: Side; x: number; y: number }[] = showHandles
    ? [
        { side: 'top', x: L.w / 2, y: -1 },
        { side: 'right', x: L.w + 1, y: L.h / 2 },
        { side: 'bottom', x: L.w / 2, y: L.h + 1 },
        { side: 'left', x: -1, y: L.h / 2 },
      ]
    : [];

  return (
    <g
      className={`cf-node${selected ? ' is-selected' : ''}${dropTarget ? ' is-drop' : ''}`}
      data-node-id={node.id}
      transform={`translate(${node.x} ${node.y})`}
    >
      {(selected || dropTarget) && (
        <rect
          className="cf-select-ring"
          x={-4}
          y={-4}
          width={L.w + 8}
          height={L.h + 8}
          rx={R + 3}
          style={{
            fill: 'none',
            stroke: dropTarget ? 'var(--d-interface)' : 'var(--d-accent)',
            strokeWidth: 2,
            opacity: dropTarget ? 1 : 0.9,
          }}
        />
      )}
      <g style={{ filter: 'drop-shadow(0 1px 1px var(--d-shadow-a)) drop-shadow(0 6px 14px var(--d-shadow-b))' }}>
        <rect
          className="cf-body"
          width={L.w}
          height={L.h}
          rx={R}
          style={{ fill: 'var(--d-node-bg)', stroke: 'var(--d-node-border)', strokeWidth: 1 }}
        />
      </g>
      <path
        d={headerPath}
        style={{ fill: `color-mix(in srgb, ${color} 13%, var(--d-node-bg))` }}
      />
      <rect x={0} y={L.headerH - 1} width={L.w} height={1} style={{ fill: 'var(--d-divider)' }} />
      <path
        d={`M2.86,3 A${R},${R} 0 0 1 ${R},0 H${L.w - R} A${R},${R} 0 0 1 ${L.w - 2.86},3 Z`}
        style={{ fill: color }}
      />
      <rect
        width={L.w}
        height={L.h}
        rx={R}
        style={{ fill: 'none', stroke: 'var(--d-node-border)', strokeWidth: 1 }}
      />

      {/* badge + title */}
      <circle cx={26} cy={badgeY + 1} r={11} style={{ fill: color }} />
      <text
        x={26}
        y={badgeY + 1.5}
        textAnchor="middle"
        dominantBaseline="central"
        style={{ fontFamily: FONT_SANS, fontSize: 11.5, fontWeight: 700, fill: '#fff' }}
      >
        {KIND_LETTER[node.kind]}
      </text>
      {stereo && (
        <text
          x={46}
          y={21}
          dominantBaseline="central"
          style={{ fontFamily: FONT_SANS, fontSize: M.stereoFont, fill: 'var(--d-text-muted)', letterSpacing: 0.3 }}
        >
          {stereo}
        </text>
      )}
      <text
        x={46}
        y={nameY + 1}
        dominantBaseline="central"
        style={{
          fontFamily: FONT_SANS,
          fontSize: M.nameFont,
          fontWeight: 600,
          fill: 'var(--d-text)',
          fontStyle: node.kind === 'abstract' ? 'italic' : 'normal',
        }}
      >
        {node.name || 'Unnamed'}
      </text>

      {/* compartments */}
      {L.sections.map((s, si) => (
        <g key={s.key}>
          {si > 0 && <rect x={0} y={s.y} width={L.w} height={1} style={{ fill: 'var(--d-divider)' }} />}
          {s.rows.map((r, i) => (
            <g key={i}>
              {r.symbol && (
                <text
                  x={M.symbolX}
                  y={r.y + M.row / 2 + 0.5}
                  dominantBaseline="central"
                  textAnchor="middle"
                  style={{
                    fontFamily: FONT_MONO,
                    fontSize: 13,
                    fontWeight: 700,
                    fill: r.visibility ? VIS_COLOR[r.visibility] : 'var(--d-text-muted)',
                  }}
                >
                  {r.symbol}
                </text>
              )}
              <text
                x={r.symbol ? M.textX : 18}
                y={r.y + M.row / 2 + 0.5}
                dominantBaseline="central"
                style={{
                  fontFamily: FONT_MONO,
                  fontSize: M.rowFont,
                  fill: s.key === 'constants' ? 'var(--d-enum)' : 'var(--d-text)',
                  fontWeight: s.key === 'constants' ? 600 : 400,
                  textDecoration: r.isStatic ? 'underline' : 'none',
                  fontStyle: r.isAbstract ? 'italic' : 'normal',
                }}
              >
                {r.text}
                {r.text !== r.full && <title>{r.full}</title>}
              </text>
            </g>
          ))}
        </g>
      ))}

      {issue && (
        <g transform={`translate(${L.w - 6} -6)`}>
          <circle r={9} style={{ fill: issue === 'error' ? 'var(--d-error)' : 'var(--d-warn)', stroke: 'var(--d-node-bg)', strokeWidth: 2 }} />
          <text
            textAnchor="middle"
            dominantBaseline="central"
            y={0.5}
            style={{ fontFamily: FONT_SANS, fontSize: 11, fontWeight: 800, fill: '#fff' }}
          >
            !
          </text>
          <title>{issueText}</title>
        </g>
      )}

      {handles.map((h) => (
        <g key={h.side} data-handle={h.side} data-export-ignore className="cf-handle" transform={`translate(${h.x} ${h.y})`}>
          <circle r={12} style={{ fill: 'transparent' }} />
          <circle className="cf-handle-dot" r={5.5} style={{ fill: 'var(--d-node-bg)', stroke: 'var(--d-accent)', strokeWidth: 2 }} />
        </g>
      ))}
    </g>
  );
}

export const ClassNodeView = memo(ClassNodeViewImpl);
