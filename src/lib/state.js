import { COL_X0, ROW_Y, RAILS, WORLD_W, WORLD_H } from './board.js';
import { PART_DEFS, nextLabel, resolveEndpoint, sameEndpoint } from './parts.js';

export const STORAGE_KEY = 'breadboard-sim:v1';
export const WIRE_COLORS = ['#ef4444', '#111827', '#3b82f6', '#22c55e', '#facc15', '#f97316', '#f8fafc', '#a855f7'];

const railY = (id) => RAILS.find((r) => r.id === id).y;
const hole = (row, col) => ({ gx: COL_X0 + col, gy: ROW_Y[row] });
const rail = (id, col) => ({ gx: COL_X0 + col, gy: railY(id) });

// 기본 예제: 9V 배터리 → 470Ω → 빨간 LED → 푸시 버튼 (상단)
//           330Ω + 초록 LED + 슬라이드 스위치 (하단)
export function exampleCircuit() {
  const comp = (id, type, label, at, props = {}) => ({ id, type, label, gx: at.gx, gy: at.gy, rot: 0, props: { ...PART_DEFS[type].props, ...props } });
  const components = [
    comp('c1', 'battery', 'BAT1', { gx: 4, gy: 13 }, { volts: 9 }),
    comp('c2', 'resistor', 'R1', hole('b', 2), { ohms: 470 }),
    comp('c3', 'led', 'LED1', hole('e', 6), { color: 'red' }),
    comp('c4', 'button', 'BTN1', hole('c', 7)),
    comp('c5', 'switch', 'SW1', hole('h', 14), { on: true }),
    comp('c6', 'resistor', 'R2', hole('i', 16), { ohms: 330 }),
    comp('c7', 'led', 'LED2', hole('h', 20), { color: 'green' }),
  ];
  const w = (id, a, b, color, points = []) => ({ id, a, b, color, points });
  const wires = [
    // 배터리 전선은 꺾이는 점을 넣어 직각으로 배선
    w('w1', { comp: 'c1', pin: 0 }, rail('top+', 1), '#ef4444', [{ gx: 4, gy: 14 }, { gx: 2, gy: 14 }, { gx: 2, gy: 4 }]),
    w('w2', { comp: 'c1', pin: 1 }, rail('bot-', 1), '#111827', [{ gx: 8, gy: 13 }, { gx: 8, gy: 20 }]),
    w('w3', rail('top+', 2), hole('a', 2), '#ef4444'),
    w('w4', hole('a', 9), rail('top-', 9), '#111827'),
    w('w5', rail('top+', 26), rail('bot+', 26), '#ef4444'),
    w('w6', rail('top-', 27), rail('bot-', 27), '#111827'),
    w('w7', rail('bot+', 14), hole('j', 14), '#f97316'),
    w('w8', hole('j', 21), rail('bot-', 21), '#3b82f6'),
  ];
  return { components, wires, seq: 100 };
}

const EMPTY_HISTORY = { past: [], future: [], lastTx: null, lastTxAt: 0 };

export function initialState() {
  const base = { running: true, wireColor: WIRE_COLORS[0], showLabels: true, selected: null, ...EMPTY_HISTORY };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.components) && Array.isArray(saved.wires)) {
      const wires = saved.wires.map((w) => ({ points: [], ...w }));
      return { ...base, ...saved, wires, selected: null };
    }
  } catch { /* 저장된 상태가 손상된 경우 예제로 시작 */ }
  return { ...base, ...exampleCircuit() };
}

export function saveState(s) {
  const { components, wires, running, wireColor, showLabels, seq } = s;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ components, wires, running, wireColor, showLabels, seq }));
  } catch { /* 저장 공간 부족 등은 무시 */ }
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const mapComp = (s, id, fn) => ({ ...s, components: s.components.map((c) => (c.id === id ? fn(c) : c)) });
const mapWire = (s, id, fn) => ({ ...s, wires: s.wires.map((w) => (w.id === id ? fn(w) : w)) });

function edit(s, a) {
  switch (a.type) {
    case 'ADD_COMP': {
      const id = `c${s.seq}`;
      const comp = {
        id,
        type: a.partType,
        label: nextLabel(a.partType, s.components),
        gx: clamp(a.gx, 0, WORLD_W),
        gy: clamp(a.gy, 0, WORLD_H),
        rot: 0,
        props: { ...PART_DEFS[a.partType].props },
      };
      return { ...s, seq: s.seq + 1, components: [...s.components, comp], selected: { kind: 'comp', id } };
    }
    case 'MOVE_COMP':
      return mapComp(s, a.id, (c) => ({ ...c, gx: clamp(a.gx, 0, WORLD_W), gy: clamp(a.gy, 0, WORLD_H) }));
    case 'ROTATE': {
      const id = a.id ?? (s.selected?.kind === 'comp' ? s.selected.id : null);
      if (!id) return s;
      return mapComp(s, id, (c) => ({ ...c, rot: (c.rot + 90) % 360 }));
    }
    case 'UPDATE_PROPS':
      return mapComp(s, a.id, (c) => ({ ...c, props: { ...c.props, ...a.props } }));
    case 'UPDATE_LABEL':
      return mapComp(s, a.id, (c) => ({ ...c, label: a.label.slice(0, 24) }));
    case 'TOGGLE_SWITCH':
      return mapComp(s, a.id, (c) => ({ ...c, props: { ...c.props, on: !c.props.on } }));
    case 'SELECT':
      return { ...s, selected: a.selected };
    case 'DELETE': {
      const sel = a.selected ?? s.selected;
      if (!sel) return s;
      if (sel.kind === 'comp') {
        return {
          ...s,
          components: s.components.filter((c) => c.id !== sel.id),
          wires: s.wires.filter((w) => w.a.comp !== sel.id && w.b.comp !== sel.id),
          selected: null,
        };
      }
      return { ...s, wires: s.wires.filter((w) => w.id !== sel.id), selected: null };
    }
    case 'ADD_WIRE': {
      const byId = new Map(s.components.map((c) => [c.id, c]));
      const pa = resolveEndpoint(a.a, byId);
      const pb = resolveEndpoint(a.b, byId);
      if (!pa || !pb || (pa.gx === pb.gx && pa.gy === pb.gy)) return s;
      const dup = s.wires.some((w) => (sameEndpoint(w.a, a.a) && sameEndpoint(w.b, a.b)) || (sameEndpoint(w.a, a.b) && sameEndpoint(w.b, a.a)));
      if (dup) return s;
      const wire = { id: `w${s.seq}`, a: a.a, b: a.b, color: s.wireColor, points: a.points ?? [] };
      return { ...s, seq: s.seq + 1, wires: [...s.wires, wire] };
    }
    case 'MOVE_WIRE_END':
      return mapWire(s, a.id, (w) => {
        const other = a.end === 'a' ? w.b : w.a;
        return sameEndpoint(other, a.ep) || sameEndpoint(w[a.end], a.ep) ? w : { ...w, [a.end]: a.ep };
      });
    case 'ADD_WAYPOINT':
      return mapWire(s, a.id, (w) => {
        const points = [...w.points];
        points.splice(a.index, 0, { gx: a.gx, gy: a.gy });
        return { ...w, points };
      });
    case 'MOVE_WAYPOINT':
      return mapWire(s, a.id, (w) => {
        const p = w.points[a.index];
        if (!p || (p.gx === a.gx && p.gy === a.gy)) return w;
        return { ...w, points: w.points.map((q, i) => (i === a.index ? { gx: clamp(a.gx, 0, WORLD_W), gy: clamp(a.gy, 0, WORLD_H) } : q)) };
      });
    case 'REMOVE_WAYPOINT':
      return mapWire(s, a.id, (w) => ({ ...w, points: w.points.filter((_, i) => i !== a.index) }));
    case 'SET_WIRE_COLOR':
      return mapWire(s, a.id, (w) => ({ ...w, color: a.color }));
    case 'SET_DEFAULT_WIRE_COLOR': {
      const next = { ...s, wireColor: a.color };
      if (s.selected?.kind === 'wire') return edit(next, { type: 'SET_WIRE_COLOR', id: s.selected.id, color: a.color });
      return next;
    }
    case 'SET_RUNNING':
      return { ...s, running: a.running };
    case 'TOGGLE_LABELS':
      return { ...s, showLabels: !s.showLabels };
    case 'RESET':
      return { ...s, components: [], wires: [], selected: null };
    case 'LOAD_EXAMPLE':
      return { ...s, ...exampleCircuit(), selected: null, running: true };
    default:
      return s;
  }
}

// ---------- 되돌리기 / 다시하기 ----------
// 부품·전선이 실제로 바뀐 동작만 기록한다. 드래그처럼 연속으로 들어오는 동작은
// 같은 tx(트랜잭션 id)를 달아 보내면 한 번의 되돌리기 단위로 묶인다.
const HISTORY_LIMIT = 100;
const TX_WINDOW_MS = 1500;
const snapshot = (s) => ({ components: s.components, wires: s.wires });

function validSelection(s) {
  const sel = s.selected;
  if (!sel) return null;
  const list = sel.kind === 'comp' ? s.components : s.wires;
  return list.some((x) => x.id === sel.id) ? sel : null;
}

export function reducer(s, a) {
  if (a.type === 'UNDO' || a.type === 'REDO') {
    const undo = a.type === 'UNDO';
    const from = undo ? s.past : s.future;
    if (from.length === 0) return s;
    const cur = snapshot(s);
    const next = {
      ...s,
      ...from[from.length - 1],
      past: undo ? s.past.slice(0, -1) : [...s.past, cur],
      future: undo ? [...s.future, cur] : s.future.slice(0, -1),
      lastTx: null,
    };
    return { ...next, selected: validSelection(next) };
  }

  const next = edit(s, a);
  if (next.components === s.components && next.wires === s.wires) return next;
  if (JSON.stringify(snapshot(next)) === JSON.stringify(snapshot(s))) return { ...next, components: s.components, wires: s.wires };

  const now = Date.now();
  // 드래그 tx는 드래그마다 고유하므로 시간 제한 없이 묶고, 입력칸/슬라이더 tx는 잠깐 사이의 연속 입력만 묶는다
  const merge = a.tx != null && a.tx === s.lastTx && (a.tx.startsWith('drag:') || now - s.lastTxAt < TX_WINDOW_MS);
  return {
    ...next,
    past: merge ? s.past : [...s.past, snapshot(s)].slice(-HISTORY_LIMIT),
    future: [],
    lastTx: a.tx ?? null,
    lastTxAt: now,
  };
}
