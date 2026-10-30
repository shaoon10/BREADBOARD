import { memo } from 'react';
import { BOARD_RECT, COLS, COL_X0, HOLES, P, RAILS, ROW_Y } from '../lib/board.js';

const LABEL_COLS = [1, 5, 10, 15, 20, 25, 30];

function Breadboard({ hoverNet, activeNets }) {
  const { x, y, w, h } = BOARD_RECT;
  const left = (COL_X0 + 1) * P;
  const right = (COL_X0 + COLS) * P;
  return (
    <g className="breadboard">
      <rect x={x + 3} y={y + 5} width={w} height={h} rx={10} fill="rgba(0,0,0,0.35)" />
      <rect x={x} y={y} width={w} height={h} rx={10} fill="#eef1f5" stroke="#c3cad5" strokeWidth={1.5} />
      {/* 중앙 홈 */}
      <rect x={x + 8} y={12.5 * P - 7} width={w - 16} height={14} rx={3} fill="#d3d9e2" />
      {/* 전원 레일 구분선 */}
      {RAILS.map((r) => {
        const outer = r.id === 'top+' || r.id === 'bot+';
        const ly = r.id.startsWith('top') ? (outer ? r.y - 0.6 : r.y + 0.6) : (outer ? r.y + 0.6 : r.y - 0.6);
        const color = r.sign === '+' ? '#ef4444' : '#3b82f6';
        return (
          <g key={r.id}>
            <line x1={left - 6} y1={ly * P} x2={right + 6} y2={ly * P} stroke={color} strokeWidth={2} />
            <text x={left - 18} y={r.y * P + 4} fontSize={13} fontWeight="bold" fill={color} textAnchor="middle">{r.sign === '+' ? '+' : '−'}</text>
            <text x={right + 18} y={r.y * P + 4} fontSize={13} fontWeight="bold" fill={color} textAnchor="middle">{r.sign === '+' ? '+' : '−'}</text>
          </g>
        );
      })}
      {/* 레일과 단자 영역 사이 홈 */}
      <rect x={x + 8} y={6 * P - 3} width={w - 16} height={6} rx={2} fill="#e2e7ee" />
      <rect x={x + 8} y={19 * P - 3} width={w - 16} height={6} rx={2} fill="#e2e7ee" />
      {/* 열 번호 */}
      {LABEL_COLS.map((c) => (
        <g key={c} fontSize={8} fill="#64748b" textAnchor="middle">
          <text x={(COL_X0 + c) * P} y={ROW_Y.a * P - 11}>{c}</text>
          <text x={(COL_X0 + c) * P} y={ROW_Y.j * P + 17}>{c}</text>
        </g>
      ))}
      {/* 행 문자 */}
      {Object.entries(ROW_Y).map(([r, gy]) => (
        <g key={r} fontSize={9} fill="#64748b" textAnchor="middle">
          <text x={left - 18} y={gy * P + 3}>{r}</text>
          <text x={right + 18} y={gy * P + 3}>{r}</text>
        </g>
      ))}
      {/* 구멍 */}
      {HOLES.map((hole) => {
        const hovered = hole.net === hoverNet;
        const active = activeNets.has(hole.net);
        return (
          <rect
            key={hole.key}
            x={hole.gx * P - 4}
            y={hole.gy * P - 4}
            width={8}
            height={8}
            rx={1.5}
            fill={hovered ? '#0ea5e9' : active ? '#16a34a' : '#3a4049'}
            stroke={hovered ? '#7dd3fc' : '#a3acb9'}
            strokeWidth={0.8}
          />
        );
      })}
    </g>
  );
}

export default memo(Breadboard);
