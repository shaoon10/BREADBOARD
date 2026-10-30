import { memo } from 'react';
import { P } from '../lib/board.js';
import { LED_COLORS, PART_DEFS } from '../lib/parts.js';
import { resistorBands, formatSI } from '../lib/format.js';

const LEAD = '#9ca3af';

function Resistor({ comp }) {
  const bands = resistorBands(comp.props.ohms);
  return (
    <>
      <line x1={0} y1={0} x2={80} y2={0} stroke={LEAD} strokeWidth={2.5} />
      <rect x={18} y={-8} width={44} height={16} rx={7} fill="#dcc08f" stroke="#9a7b4a" strokeWidth={1} />
      {bands.map((b, i) => (
        <rect key={i} x={i < 3 ? 25 + i * 8 : 52} y={-8} width={4.5} height={16} fill={b.hex} />
      ))}
    </>
  );
}

function Led({ comp, result }) {
  const col = LED_COLORS[comp.props.color];
  const b = result?.brightness ?? 0;
  const damaged = result?.damaged;
  return (
    <>
      <line x1={0} y1={0} x2={0} y2={-14} stroke={LEAD} strokeWidth={2.5} />
      <polyline points="20,0 20,-6 17,-10 17,-14" fill="none" stroke={LEAD} strokeWidth={2.5} />
      {b > 0 && !damaged && (
        <circle cx={10} cy={-28} r={14 + 14 * b} fill={col.glow} opacity={0.25 + 0.55 * b} filter="url(#glow)" />
      )}
      <path
        d="M-1,-14 L-1,-30 A11,11 0 0 1 21,-30 L21,-14 Z"
        fill={damaged ? '#3f3f46' : col.body}
        opacity={damaged ? 1 : 0.55 + 0.45 * b}
        stroke={damaged ? '#18181b' : 'rgba(0,0,0,0.35)'}
        strokeWidth={1}
      />
      {b > 0 && !damaged && <path d="M2,-16 L2,-30 A8,8 0 0 1 18,-30 L18,-16 Z" fill="#fff" opacity={0.35 * b + 0.1} />}
      <ellipse cx={5} cy={-33} rx={2.5} ry={4} fill="#fff" opacity={0.5} />
      <rect x={-3} y={-16} width={26} height={4} rx={1} fill={damaged ? '#27272a' : col.body} stroke="rgba(0,0,0,0.3)" strokeWidth={0.8} />
      {damaged && <text x={10} y={-24} textAnchor="middle" fontSize={14} fill="#f87171" fontWeight="bold">✕</text>}
      <text x={-7} y={-4} fontSize={9} fill="#fca5a5" fontWeight="bold" textAnchor="middle">+</text>
    </>
  );
}

function Button({ comp, isPressed, onPress }) {
  return (
    <>
      <line x1={0} y1={0} x2={40} y2={0} stroke={LEAD} strokeWidth={2.5} />
      <rect x={4} y={-16} width={32} height={32} rx={3} fill="#2b313b" stroke="#111" strokeWidth={1} />
      {[[9, -11], [31, -11], [9, 11], [31, 11]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r={2} fill="#4b5563" />)}
      <circle
        className="press-target"
        cx={20}
        cy={0}
        r={isPressed ? 9 : 10}
        fill={isPressed ? '#991b1b' : '#dc2626'}
        stroke={isPressed ? '#450a0a' : '#7f1d1d'}
        strokeWidth={2}
        onPointerDown={(e) => { e.stopPropagation(); onPress(comp, e); }}
      />
    </>
  );
}

function Switch({ comp, onToggle }) {
  const on = comp.props.on;
  return (
    <>
      <line x1={0} y1={0} x2={0} y2={-8} stroke={LEAD} strokeWidth={2.5} />
      <line x1={40} y1={0} x2={40} y2={-8} stroke={LEAD} strokeWidth={2.5} />
      <g className="press-target" onPointerDown={(e) => { e.stopPropagation(); onToggle(comp, e); }}>
        <rect x={-2} y={-24} width={44} height={16} rx={3} fill="#1f2937" stroke="#0b0f17" />
        <rect x={6} y={-19} width={28} height={6} rx={3} fill="#0b0f17" />
        <rect x={on ? 22 : 8} y={-22} width={10} height={12} rx={2} fill={on ? '#4ade80' : '#d1d5db'} stroke="#111" strokeWidth={0.8} />
      </g>
      <text x={20} y={-27} fontSize={7} textAnchor="middle" fill={on ? '#4ade80' : '#9ca3af'} fontWeight="bold">{on ? 'ON' : 'OFF'}</text>
    </>
  );
}

function Battery({ comp, result }) {
  return (
    <>
      <line x1={0} y1={0} x2={0} y2={-24} stroke="#dc2626" strokeWidth={3} />
      <line x1={20} y1={0} x2={20} y2={-24} stroke="#111827" strokeWidth={3} />
      <rect x={-6} y={-32} width={32} height={10} rx={2} fill="#1f2937" />
      <rect x={-18} y={-110} width={56} height={80} rx={6} fill="#111827" stroke={result?.shorted ? '#ef4444' : '#374151'} strokeWidth={result?.shorted ? 3 : 1.5} className={result?.shorted ? 'blink' : undefined} />
      <rect x={-18} y={-110} width={56} height={26} rx={6} fill="#d97706" />
      <rect x={-18} y={-90} width={56} height={6} fill="#d97706" />
      <rect x={-6} y={-118} width={10} height={8} rx={2} fill="#9ca3af" />
      <rect x={16} y={-118} width={10} height={8} rx={2} fill="#9ca3af" />
      <text x={10} y={-92} textAnchor="middle" fontSize={11} fontWeight="bold" fill="#111">BATTERY</text>
      <text x={10} y={-56} textAnchor="middle" fontSize={18} fontWeight="800" fill="#f8fafc">{`${+comp.props.volts}V`}</text>
      <text x={-1} y={-115} textAnchor="middle" fontSize={8} fill="#111" fontWeight="bold" pointerEvents="none">+</text>
      <text x={21} y={-115} textAnchor="middle" fontSize={8} fill="#111" fontWeight="bold" pointerEvents="none">−</text>
      <text x={-7} y={-6} fontSize={10} fill="#fca5a5" fontWeight="bold" textAnchor="middle">+</text>
      <text x={28} y={-6} fontSize={10} fill="#93c5fd" fontWeight="bold" textAnchor="middle">−</text>
    </>
  );
}

function Psu({ comp, result, running }) {
  const showV = running && result ? result.v : null;
  const showI = running && result ? result.i : null;
  return (
    <>
      <line x1={0} y1={0} x2={0} y2={-16} stroke="#dc2626" strokeWidth={3} />
      <line x1={40} y1={0} x2={40} y2={-16} stroke="#111827" strokeWidth={3} />
      <rect x={-40} y={-98} width={120} height={84} rx={6} fill="#cbd5e1" stroke={result?.shorted ? '#ef4444' : '#64748b'} strokeWidth={result?.shorted ? 3 : 1.5} className={result?.shorted ? 'blink' : undefined} />
      <rect x={-32} y={-90} width={84} height={40} rx={3} fill="#0f2417" stroke="#334155" />
      <text x={46} y={-74} textAnchor="end" fontSize={13} fontFamily="monospace" fontWeight="bold" fill={showV != null ? '#4ade80' : '#1e4d2b'}>
        {showV != null ? `${showV.toFixed(2)} V` : `${(+comp.props.volts).toFixed(2)} V`}
      </text>
      <text x={46} y={-56} textAnchor="end" fontSize={13} fontFamily="monospace" fontWeight="bold" fill={showI != null ? '#fbbf24' : '#1e4d2b'}>
        {showI != null ? `${Math.max(0, showI).toFixed(3)} A` : '0.000 A'}
      </text>
      <circle cx={66} cy={-74} r={9} fill="#334155" stroke="#0f172a" />
      <line x1={66} y1={-74} x2={66} y2={-81} stroke="#e2e8f0" strokeWidth={2} />
      <text x={66} y={-56} textAnchor="middle" fontSize={7} fill="#334155">VOLT</text>
      {running && result?.mode && (
        <text x={-27} y={-79} fontSize={8} fontFamily="monospace" fontWeight="bold" fill={result.mode === 'CC' ? '#f87171' : '#4ade80'}>{result.mode}</text>
      )}
      <circle cx={0} cy={-26} r={7} fill="#dc2626" stroke="#7f1d1d" strokeWidth={2} />
      <circle cx={40} cy={-26} r={7} fill="#1f2937" stroke="#000" strokeWidth={2} />
      <text x={-14} y={-23} fontSize={10} fill="#b91c1c" fontWeight="bold" textAnchor="middle">+</text>
      <text x={54} y={-23} fontSize={10} fill="#111827" fontWeight="bold" textAnchor="middle">−</text>
      <text x={-32} y={-40} fontSize={7} fill="#475569">DC POWER</text>
    </>
  );
}

const BODIES = { resistor: Resistor, led: Led, button: Button, switch: Switch, battery: Battery, psu: Psu };

function PartView({ comp, result, running, isPressed, onBodyDown, onPress, onToggle }) {
  const Body = BODIES[comp.type];
  const [bx, by, bw, bh] = PART_DEFS[comp.type].bbox;
  return (
    <g
      className="part"
      transform={`translate(${comp.gx * P} ${comp.gy * P}) rotate(${comp.rot})`}
      onPointerDown={(e) => onBodyDown(comp, e)}
    >
      <rect x={bx} y={by} width={bw} height={bh} fill="transparent" />
      <Body comp={comp} result={result} running={running} isPressed={isPressed} onPress={onPress} onToggle={onToggle} />
    </g>
  );
}

export default memo(PartView);

export function partCaption(comp) {
  if (comp.type === 'resistor') return `${comp.label} ${formatSI(comp.props.ohms, 'Ω')}`;
  if (comp.type === 'battery' || comp.type === 'psu') return `${comp.label} ${+comp.props.volts}V`;
  return comp.label;
}
