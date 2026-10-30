import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Breadboard from './Breadboard.jsx';
import PartView, { partCaption } from './PartView.jsx';
import { HOLE_MAP, P, WORLD_H, WORLD_W, key, netDescription } from '../lib/board.js';
import { pinPoints, resolveEndpoint, sameEndpoint, worldBBox } from '../lib/parts.js';
import { formatSI } from '../lib/format.js';

const SNAP_RADIUS = 0.45 * P;
const DOUBLE_TAP_MS = 350;

const px = (pt) => ({ x: pt.gx * P, y: pt.gy * P });
const snap = (w) => ({ gx: Math.round(w.x / P), gy: Math.round(w.y / P) });

// 제어점(끝점·꺾이는 점) 사이를 '가로 먼저, 세로 다음'의 직각 경로로 잇는다
function orthoRoute(ctrl) {
  const out = [ctrl[0]];
  for (let i = 1; i < ctrl.length; i++) {
    const p = out[out.length - 1];
    const q = ctrl[i];
    if (p.x !== q.x && p.y !== q.y) out.push({ x: q.x, y: p.y });
    out.push(q);
  }
  return out;
}
const pathOf = (pts) => `M${pts.map((p) => `${p.x} ${p.y}`).join(' L')}`;

function distToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

// 클릭 위치가 제어점 i와 i+1 사이의 어느 구간에 가장 가까운지 → 꺾이는 점을 끼워 넣을 위치
function nearestLeg(ctrl, p) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < ctrl.length - 1; i++) {
    const leg = orthoRoute([ctrl[i], ctrl[i + 1]]);
    for (let k = 0; k < leg.length - 1; k++) {
      const d = distToSegment(p, leg[k], leg[k + 1]);
      if (d < bestD) { bestD = d; best = i; }
    }
  }
  return best;
}

const textWidth = (s) => [...s].reduce((w, ch) => w + (ch.charCodeAt(0) > 0x1100 ? 10 : 6.2), 0);

let txSeq = 0;
const newTx = (kind) => `drag:${kind}:${++txSeq}`;

export default function Workspace({ state, dispatch, sim, pressed, onPressStart }) {
  const svgRef = useRef(null);
  const lastTap = useRef({ id: null, t: 0 });
  const [drag, setDrag] = useState(null);
  const [hoverKey, setHoverKey] = useState(null);
  const { components, wires, selected, running, showLabels } = state;

  const byId = useMemo(() => new Map(components.map((c) => [c.id, c])), [components]);
  const pinMap = useMemo(() => {
    const m = new Map();
    for (const c of components) pinPoints(c).forEach((p, i) => m.set(key(p.gx, p.gy), { comp: c.id, pin: i }));
    return m;
  }, [components]);

  // 무엇인가 꽂혀 있는 줄(넷) — 구멍을 초록색으로 표시
  const activeNets = useMemo(() => {
    const s = new Set();
    const mark = (p) => { const h = p && HOLE_MAP.get(key(p.gx, p.gy)); if (h) s.add(h.net); };
    for (const c of components) pinPoints(c).forEach(mark);
    for (const w of wires) { mark(resolveEndpoint(w.a, byId)); mark(resolveEndpoint(w.b, byId)); }
    return s;
  }, [components, wires, byId]);

  const toWorld = useCallback((e) => {
    const svg = svgRef.current;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    return { x: p.x, y: p.y };
  }, []);

  // 화면 좌표 근처의 연결 가능한 지점: 브레드보드 구멍 우선, 없으면 부품 단자
  const endpointNear = useCallback((w) => {
    const { gx, gy } = snap(w);
    if (Math.hypot(w.x - gx * P, w.y - gy * P) > SNAP_RADIUS) return null;
    if (HOLE_MAP.has(key(gx, gy))) return { gx, gy };
    return pinMap.get(key(gx, gy)) ?? null;
  }, [pinMap]);

  const isDoubleTap = (id) => {
    const now = Date.now();
    const hit = lastTap.current.id === id && now - lastTap.current.t < DOUBLE_TAP_MS;
    lastTap.current = { id: hit ? null : id, t: now };
    return hit;
  };

  const capture = (e) => { try { svgRef.current.setPointerCapture(e.pointerId); } catch { /* 일부 브라우저 미지원 */ } };

  const finishWire = (from, to, points = []) => {
    if (to && !sameEndpoint(from, to)) dispatch({ type: 'ADD_WIRE', a: from, b: to, points });
    setDrag(null);
  };

  // 단자(구멍·핀·전선 끝)를 누르면 전선 그리기 시작.
  // 드래그해서 놓거나, 클릭 → (빈 곳 클릭으로 꺾이는 점 추가) → 끝 구멍 클릭.
  const beginWireAt = (ep, e) => {
    e.stopPropagation();
    if (drag?.kind === 'wire' && drag.sticky) { finishWire(drag.from, ep, drag.points); return; }
    capture(e);
    setDrag({ kind: 'wire', from: ep, points: [], cur: toWorld(e), moved: false, sticky: false });
  };

  const onSvgPointerDown = (e) => {
    if (e.button !== 0) return;
    const w = toWorld(e);
    const ep = endpointNear(w);
    if (drag?.kind === 'wire' && drag.sticky) {
      if (ep) { finishWire(drag.from, ep, drag.points); return; }
      const g = snap(w);
      const last = drag.points[drag.points.length - 1];
      if (!last || last.gx !== g.gx || last.gy !== g.gy) setDrag({ ...drag, points: [...drag.points, g] });
      return;
    }
    if (ep) { beginWireAt(ep, e); return; }
    dispatch({ type: 'SELECT', selected: null });
  };

  const onBodyDown = useCallback((comp, e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    dispatch({ type: 'SELECT', selected: { kind: 'comp', id: comp.id } });
    const w = toWorld(e);
    try { svgRef.current.setPointerCapture(e.pointerId); } catch { /* noop */ }
    setDrag({ kind: 'comp', id: comp.id, offX: w.x - comp.gx * P, offY: w.y - comp.gy * P, tx: newTx('comp') });
  }, [dispatch, toWorld]);

  const onPress = useCallback((comp, e) => {
    dispatch({ type: 'SELECT', selected: { kind: 'comp', id: comp.id } });
    onPressStart(comp.id, e);
  }, [dispatch, onPressStart]);

  const onToggle = useCallback((comp) => {
    dispatch({ type: 'SELECT', selected: { kind: 'comp', id: comp.id } });
    dispatch({ type: 'TOGGLE_SWITCH', id: comp.id });
  }, [dispatch]);

  const wireCtrl = (w) => {
    const a = resolveEndpoint(w.a, byId);
    const b = resolveEndpoint(w.b, byId);
    if (!a || !b) return null;
    return [px(a), ...(w.points ?? []).map(px), px(b)];
  };

  const onWireDown = (w, e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (drag?.sticky) setDrag(null);
    const isSel = selected?.kind === 'wire' && selected.id === w.id;
    if (isSel && isDoubleTap(`wire:${w.id}`)) {
      // 더블클릭한 자리에 꺾이는 점을 넣고 곧바로 끌 수 있게 한다
      const ctrl = wireCtrl(w);
      const pos = toWorld(e);
      const index = nearestLeg(ctrl, pos);
      const g = snap(pos);
      const tx = newTx('wp');
      dispatch({ type: 'ADD_WAYPOINT', id: w.id, index, ...g, tx });
      capture(e);
      setDrag({ kind: 'waypoint', id: w.id, index, tx });
      return;
    }
    if (!isSel) isDoubleTap(`wire:${w.id}`);
    dispatch({ type: 'SELECT', selected: { kind: 'wire', id: w.id } });
  };

  const onWaypointDown = (w, index, e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (isDoubleTap(`wp:${w.id}:${index}`)) {
      dispatch({ type: 'REMOVE_WAYPOINT', id: w.id, index });
      return;
    }
    capture(e);
    setDrag({ kind: 'waypoint', id: w.id, index, tx: newTx('wp') });
  };

  const onPointerMove = (e) => {
    const w = toWorld(e);
    const gk = key(Math.round(w.x / P), Math.round(w.y / P));
    const hk = HOLE_MAP.has(gk) ? gk : null;
    if (hk !== hoverKey) setHoverKey(hk);
    if (!drag) return;
    if (drag.kind === 'comp') {
      const comp = byId.get(drag.id);
      const gx = Math.round((w.x - drag.offX) / P);
      const gy = Math.round((w.y - drag.offY) / P);
      if (comp && (comp.gx !== gx || comp.gy !== gy)) dispatch({ type: 'MOVE_COMP', id: drag.id, gx, gy, tx: drag.tx });
    } else if (drag.kind === 'waypoint') {
      const g = snap(w);
      const p = wires.find((x) => x.id === drag.id)?.points[drag.index];
      if (p && (p.gx !== g.gx || p.gy !== g.gy)) dispatch({ type: 'MOVE_WAYPOINT', id: drag.id, index: drag.index, ...g, tx: drag.tx });
    } else {
      const start = drag.kind === 'wire' ? resolveEndpoint(drag.from, byId) : null;
      const moved = drag.moved || (start && Math.hypot(w.x - start.gx * P, w.y - start.gy * P) > SNAP_RADIUS);
      setDrag({ ...drag, cur: w, moved });
    }
  };

  const onPointerUp = (e) => {
    if (!drag) return;
    const w = toWorld(e);
    if (drag.kind === 'comp' || drag.kind === 'waypoint') setDrag(null);
    else if (drag.kind === 'wire') {
      if (drag.sticky) return;
      if (!drag.moved) setDrag({ ...drag, sticky: true }); // 클릭만 했으면 다음 클릭에서 연결
      else finishWire(drag.from, endpointNear(w));
    } else if (drag.kind === 'wireEnd') {
      const ep = endpointNear(w);
      if (ep) dispatch({ type: 'MOVE_WIRE_END', id: drag.id, end: drag.end, ep });
      setDrag(null);
    }
  };

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setDrag(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // 툴박스에서 끌어다 놓기
  const onDrop = (e) => {
    const type = e.dataTransfer.getData('application/x-part');
    if (!type) return;
    e.preventDefault();
    const w = toWorld(e);
    dispatch({ type: 'ADD_COMP', partType: type, gx: Math.round(w.x / P), gy: Math.round(w.y / P) });
  };

  const hoverHole = hoverKey ? HOLE_MAP.get(hoverKey) : null;
  const hoverVoltage = hoverHole && sim ? sim.pointVoltage(hoverKey) : null;

  // 그리는 중이거나 끝점을 옮기는 중인 전선의 미리보기
  const preview = (() => {
    if (!drag || !drag.cur || (drag.kind !== 'wire' && drag.kind !== 'wireEnd')) return null;
    const target = endpointNear(drag.cur);
    const tp = target ? px(resolveEndpoint(target, byId)) : drag.cur;
    if (drag.kind === 'wire') {
      const from = resolveEndpoint(drag.from, byId);
      if (!from) return null;
      return { ctrl: [px(from), ...drag.points.map(px), tp], color: state.wireColor, start: px(from), end: tp, snapped: !!target };
    }
    const wire = wires.find((x) => x.id === drag.id);
    const ctrl = wire && wireCtrl(wire);
    if (!ctrl) return null;
    if (drag.end === 'a') ctrl[0] = tp; else ctrl[ctrl.length - 1] = tp;
    return { ctrl, color: wire.color, start: null, end: tp, snapped: !!target };
  })();

  const selectedComp = selected?.kind === 'comp' ? byId.get(selected.id) : null;
  const selectedWire = selected?.kind === 'wire' ? wires.find((w) => w.id === selected.id) : null;

  let statusText;
  if (drag?.kind === 'wire' && drag.sticky) {
    statusText = <span>🔌 전선 연결 중 — 빈 곳을 클릭하면 꺾이는 점 추가, 구멍·단자를 클릭하면 연결 (Esc: 취소)</span>;
  } else if (hoverHole) {
    statusText = (
      <span>
        <b>{hoverHole.label}</b> · {netDescription(hoverHole.net)}
        {hoverVoltage && (hoverVoltage.floating
          ? <> · <small>전원과 이어지지 않음 (0V로 간주)</small></>
          : <> · 전압 <b className="mono">{formatSI(hoverVoltage.v, 'V')}</b> <small>(기준: {hoverVoltage.ref} −)</small></>)}
      </span>
    );
  } else {
    statusText = <span className="muted">구멍을 드래그해 전선 연결 · 부품을 드래그해 이동 · R: 회전 · Delete: 삭제 · Ctrl+Z/Y: 되돌리기/다시하기</span>;
  }

  return (
    <div className="workspace" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      <div className="canvas-scroll">
        <svg
          ref={svgRef}
          className={`canvas ${drag?.kind === 'wire' ? 'wiring' : ''} ${drag?.kind === 'comp' ? 'moving' : ''}`}
          viewBox={`0 0 ${WORLD_W * P} ${WORLD_H * P}`}
          onPointerDown={onSvgPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={() => setHoverKey(null)}
          onContextMenu={(e) => e.preventDefault()}
        >
          <defs>
            <pattern id="grid" width={P} height={P} patternUnits="userSpaceOnUse">
              <circle cx={0} cy={0} r={0.9} fill="#1e293b" />
            </pattern>
            <filter id="glow" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="6" />
            </filter>
          </defs>
          <rect x={0} y={0} width={WORLD_W * P} height={WORLD_H * P} fill="url(#grid)" />
          <text x={10} y={18} className="zone-label">전원 영역</text>
          <text x={12 * P} y={(WORLD_H - 0.5) * P} className="zone-label">부품 보관 영역 — 툴박스에서 끌어다 놓으세요</text>

          <Breadboard hoverNet={hoverHole?.net ?? null} activeNets={activeNets} />

          {components.map((c) => (
            <PartView
              key={c.id}
              comp={c}
              result={sim?.results[c.id]}
              running={running}
              isPressed={pressed.has(c.id)}
              onBodyDown={onBodyDown}
              onPress={onPress}
              onToggle={onToggle}
            />
          ))}

          {selectedComp && (() => {
            const b = worldBBox(selectedComp);
            return <rect x={b.x - 3} y={b.y - 3} width={b.w + 6} height={b.h + 6} rx={5} className="sel-box" pointerEvents="none" />;
          })()}

          {/* 전선 */}
          {wires.map((w) => {
            const ctrl = wireCtrl(w);
            if (!ctrl) return null;
            const d = pathOf(orthoRoute(ctrl));
            const isSel = selectedWire?.id === w.id;
            return (
              <g key={w.id} className="wire" onPointerDown={(e) => onWireDown(w, e)}>
                <path d={d} stroke="transparent" strokeWidth={12} fill="none" />
                {isSel && <path d={d} stroke="#38bdf8" strokeWidth={9} fill="none" opacity={0.55} strokeLinejoin="round" strokeLinecap="round" />}
                <path d={d} stroke="rgba(0,0,0,0.55)" strokeWidth={5.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
                <path d={d} stroke={w.color} strokeWidth={3.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
              </g>
            );
          })}

          {/* 선택된 전선의 꺾이는 점 */}
          {selectedWire?.points?.map((p, i) => (
            <rect
              key={`wp-${i}`}
              className="waypoint"
              x={p.gx * P - 5}
              y={p.gy * P - 5}
              width={10}
              height={10}
              rx={2}
              onPointerDown={(e) => onWaypointDown(selectedWire, i, e)}
            />
          ))}

          {/* 부품 단자 */}
          {components.map((c) => pinPoints(c).map((p, i) => {
            const ep = HOLE_MAP.has(key(p.gx, p.gy)) ? { gx: p.gx, gy: p.gy } : { comp: c.id, pin: i };
            return (
              <circle
                key={`${c.id}-${i}`}
                className="connector"
                cx={p.gx * P}
                cy={p.gy * P}
                r={3.5}
                onPointerDown={(e) => { if (e.button === 0) beginWireAt(ep, e); }}
              />
            );
          }))}

          {/* 전선 끝 — 선택된 전선은 끝을 끌어 옮기고, 아니면 그 지점에서 새 전선 시작 */}
          {wires.map((w) => ['a', 'b'].map((end) => {
            const p = resolveEndpoint(w[end], byId);
            if (!p) return null;
            const isSel = selectedWire?.id === w.id;
            return (
              <circle
                key={`${w.id}-${end}`}
                className={isSel ? 'wire-handle' : 'wire-end'}
                cx={p.gx * P}
                cy={p.gy * P}
                r={isSel ? 6 : 4}
                fill={isSel ? '#f8fafc' : w.color}
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  if (isSel) {
                    e.stopPropagation();
                    capture(e);
                    setDrag({ kind: 'wireEnd', id: w.id, end, cur: toWorld(e) });
                  } else beginWireAt(w[end], e);
                }}
              />
            );
          }))}

          {/* 부품 이름표 */}
          {showLabels && components.map((c) => {
            const b = worldBBox(c);
            const text = partCaption(c);
            const tw = textWidth(text) + 12;
            const cx = b.x + b.w / 2;
            const cy = b.y - 13;
            const isSel = selectedComp?.id === c.id;
            return (
              <g key={`tag-${c.id}`} className={`name-tag ${isSel ? 'sel' : ''}`} pointerEvents="none">
                <rect x={cx - tw / 2} y={cy - 8} width={tw} height={16} rx={8} />
                <text x={cx} y={cy}>{text}</text>
              </g>
            );
          })}

          {preview && (
            <g pointerEvents="none">
              <path d={pathOf(orthoRoute(preview.ctrl))} stroke={preview.color} strokeWidth={3.5} fill="none" strokeDasharray="6 4" strokeLinejoin="round" strokeLinecap="round" opacity={0.9} />
              {preview.start && <circle cx={preview.start.x} cy={preview.start.y} r={6} className="snap-ring" />}
              {drag.kind === 'wire' && drag.points.map((p, i) => <rect key={i} x={p.gx * P - 4} y={p.gy * P - 4} width={8} height={8} rx={2} className="snap-ring" />)}
              {preview.snapped && <circle cx={preview.end.x} cy={preview.end.y} r={8} className="snap-ring ok" />}
            </g>
          )}
        </svg>
      </div>
      <div className="statusbar">{statusText}</div>
    </div>
  );
}
