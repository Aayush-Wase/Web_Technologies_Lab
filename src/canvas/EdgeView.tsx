import { memo } from 'react';
import type { Relationship } from '../model/types';
import {
  EDGE_STYLES,
  insetEnds,
  markerInset,
  markerPath,
  pathMidpoint,
  polylinePath,
  type EndMarker,
  type Pt,
} from './geometry';
import { FONT_SANS, textWidth } from './measure';

interface Props {
  rel: Relationship;
  points: Pt[];
  selected: boolean;
}

function Marker({ kind, at, from, stroke }: { kind: EndMarker; at: Pt; from: Pt; stroke: string }) {
  if (kind === 'none') return null;
  const angle = (Math.atan2(at.y - from.y, at.x - from.x) * 180) / Math.PI;
  const fill = kind === 'diamond-filled' ? stroke : kind === 'arrow' ? 'none' : 'var(--d-node-bg)';
  return (
    <path
      d={markerPath(kind)}
      transform={`translate(${at.x} ${at.y}) rotate(${angle})`}
      style={{
        fill,
        stroke,
        strokeWidth: 1.6,
        strokeLinejoin: 'round',
        strokeLinecap: 'round',
      }}
    />
  );
}

/** Multiplicity text sits just beside the line near an end. */
function endLabel(end: Pt, inner: Pt, text: string) {
  const dx = inner.x - end.x;
  const dy = inner.y - end.y;
  const l = Math.hypot(dx, dy) || 1;
  const ux = dx / l;
  const uy = dy / l;
  // perpendicular, biased to the upper/left side so labels from both ends rarely clash
  let px = -uy;
  let py = ux;
  if (py > 0.01 || (Math.abs(py) <= 0.01 && px > 0)) {
    px = -px;
    py = -py;
  }
  const x = end.x + ux * 22 + px * 11;
  const y = end.y + uy * 22 + py * 11;
  return { x, y, text };
}

function EdgeViewImpl({ rel, points, selected }: Props) {
  if (points.length < 2) return null;
  const style = EDGE_STYLES[rel.type];
  const stroke = selected ? 'var(--d-accent)' : 'var(--d-edge)';
  const first = points[0];
  const last = points[points.length - 1];
  const d = polylinePath(insetEnds(points, markerInset(style.sourceMarker), markerInset(style.targetMarker)));
  const mid = pathMidpoint(points);
  const label = rel.label.trim();
  const lw = label ? textWidth(label, 11.5, FONT_SANS, 500) + 16 : 0;

  const sm = rel.sourceMult.trim() ? endLabel(first, points[1], rel.sourceMult.trim()) : null;
  const tm = rel.targetMult.trim() ? endLabel(last, points[points.length - 2], rel.targetMult.trim()) : null;

  return (
    <g className={`cf-edge${selected ? ' is-selected' : ''}`} data-edge-id={rel.id}>
      <path d={d} data-hit style={{ fill: 'none', stroke: 'transparent', strokeWidth: 16, pointerEvents: 'stroke' }} />
      <path
        className="cf-edge-line"
        d={d}
        style={{
          fill: 'none',
          stroke,
          strokeWidth: selected ? 2.2 : 1.6,
          strokeDasharray: style.dashed ? '6 5' : undefined,
          strokeLinecap: 'round',
        }}
      />
      <Marker kind={style.sourceMarker} at={first} from={points[1]} stroke={stroke} />
      <Marker kind={style.targetMarker} at={last} from={points[points.length - 2]} stroke={stroke} />

      {[sm, tm].map(
        (m, i) =>
          m && (
            <text
              key={i}
              x={m.x}
              y={m.y}
              textAnchor="middle"
              dominantBaseline="central"
              style={{
                fontFamily: FONT_SANS,
                fontSize: 11.5,
                fontWeight: 500,
                fill: 'var(--d-text-muted)',
                paintOrder: 'stroke',
                stroke: 'var(--d-canvas)',
                strokeWidth: 4,
                strokeLinejoin: 'round',
              }}
            >
              {m.text}
            </text>
          ),
      )}

      {label && (
        <g transform={`translate(${mid.p.x} ${mid.p.y})`}>
          <rect
            x={-lw / 2}
            y={-11}
            width={lw}
            height={22}
            rx={11}
            style={{ fill: 'var(--d-label-bg)', stroke: selected ? 'var(--d-accent)' : 'var(--d-node-border)', strokeWidth: 1 }}
          />
          <text
            textAnchor="middle"
            dominantBaseline="central"
            y={0.5}
            style={{ fontFamily: FONT_SANS, fontSize: 11.5, fontWeight: 500, fill: 'var(--d-text)' }}
          >
            {label}
          </text>
        </g>
      )}
    </g>
  );
}

export const EdgeView = memo(EdgeViewImpl);
