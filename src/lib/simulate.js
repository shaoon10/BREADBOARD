// 수정 절점 해석(MNA)을 이용한 직류 회로 해석기.
// - 구멍/전선/레일로 이어진 점들을 Union-Find로 하나의 노드로 묶는다.
// - 저항: 컨덕턴스 1/R
// - 배터리: 내부저항을 가진 전압원 (노턴 등가)
// - DC 전원 공급 장치: 정전압(CV) ↔ 전류 제한(CC) 두 모드
// - LED: 켜짐 = 순방향 전압 Vf + 직렬저항, 꺼짐 = 개방
// - 닫힌 스위치/눌린 버튼: 매우 작은 저항
// LED 켜짐/꺼짐과 전원 CV/CC는 '상태'이므로, 모든 상태가 서로 모순 없을 때까지 반복해서 다시 푼다.
import { HOLES, HOLE_MAP, key } from './board.js';
import { LED_COLORS, PART_DEFS, pinPoints, resolveEndpoint } from './parts.js';
import { formatSI } from './format.js';

export const R_INTERNAL = { battery: 1.5, psu: 0.1 }; // 전원 내부저항 (Ω)
export const LED_RS = 15; // LED 직렬저항 (Ω)
export const R_SWITCH = 0.001; // 닫힌 스위치 접촉저항 (Ω)
const GMIN = 1e-9; // 모든 노드 → 기준점 누설 (행렬이 특이해지는 것을 막음)
const G_GROUND = 1; // 회로마다 전원 − 단자를 기준점(0V)에 고정
const MAX_ITER = 200;
export const SHORT_OHMS = 0.5; // 전원 +/− 사이 외부 저항이 이보다 작으면 단락
export const LED_MAX = 0.03; // LED 과전류 경고 (A)
export const LED_BURN = 0.1; // LED 소손 (A)
export const LED_FULL = 0.02; // 최대 밝기 기준 전류 (A)
export const RESISTOR_MAX_W = 0.25; // 1/4W 저항 정격
export const RESISTOR_BURN_W = 1; // 정격의 4배 이상이면 과열(소손 위험)

class DSU {
  constructor() { this.parent = new Map(); }
  find(x) {
    let root = x;
    while (true) {
      const p = this.parent.get(root);
      if (p === undefined) { this.parent.set(root, root); break; }
      if (p === root) break;
      root = p;
    }
    while (x !== root) { const next = this.parent.get(x); this.parent.set(x, root); x = next; }
    return root;
  }
  union(a, b) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

function solveLinear(A, b) {
  const n = b.length;
  const M = A.map((row, i) => { const r = Array.from(row); r.push(b[i]); return r; });
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-30) continue;
    [M[col], M[piv]] = [M[piv], M[col]];
    for (let r = col + 1; r < n; r++) {
      const f = M[r][col] / M[col][col];
      if (f === 0) continue;
      for (let k = col; k <= n; k++) M[r][k] -= f * M[col][k];
    }
  }
  const x = new Float64Array(n);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = Math.abs(M[r][r]) < 1e-30 ? 0 : s / M[r][r];
  }
  return x;
}

const num = (v, fallback, min = -Infinity) => (Number.isFinite(+v) ? Math.max(min, +v) : fallback);

export const isSource = (c) => c.type === 'battery' || c.type === 'psu';
export const isClosed = (c, pressed) => (c.type === 'switch' && c.props.on) || (c.type === 'button' && pressed.has(c.id));
export const sourceVolts = (c) => num(c.props.volts, 0, 0);
export const currentLimit = (c) => num(c.props.ilimit, PART_DEFS.psu.props.ilimit, 0.001);

export function simulate(components, wires, pressed = new Set()) {
  const dsu = new DSU();
  for (const h of HOLES) dsu.union(h.key, `net:${h.net}`);

  const byId = new Map(components.map((c) => [c.id, c]));
  const wireEnds = wires.map((w) => [resolveEndpoint(w.a, byId), resolveEndpoint(w.b, byId)]);
  for (const [a, b] of wireEnds) if (a && b) dsu.union(key(a.gx, a.gy), key(b.gx, b.gy));

  const nodeIdx = new Map();
  const idxOf = (k) => {
    const r = dsu.find(k);
    if (!nodeIdx.has(r)) nodeIdx.set(r, nodeIdx.size);
    return nodeIdx.get(r);
  };
  const elems = components.map((c) => ({ c, n: pinPoints(c).map((p) => idxOf(key(p.gx, p.gy))) }));
  const N = nodeIdx.size;

  // 소자로 이어진 노드 묶음 (열린 스위치 포함 — 물리적으로 붙어 있는 한 덩어리)
  const conn = new DSU();
  for (const { n: [a, b] } of elems) conn.union(a, b);
  for (let i = 0; i < N; i++) conn.find(i);

  // 덩어리마다 첫 번째 전원의 − 단자를 0V 기준(GND)으로 고정한다.
  // 이렇게 하면 스위치가 열려 떠 있는 부분도 GMIN을 통해 0V 근처의 유한한 값으로 계산된다.
  const groundOf = new Map(); // conn root → { node, label }
  for (const { c, n } of elems) {
    if (!isSource(c)) continue;
    const root = conn.find(n[0]);
    if (!groundOf.has(root)) groundOf.set(root, { node: n[1], label: c.label });
  }

  const ledOn = new Map();
  const ccMode = new Map(); // PSU id → true(전류 제한 동작)
  let V = new Float64Array(N);
  let converged = false;
  let nonFinite = false;

  const solveOnce = () => {
    const G = Array.from({ length: N }, () => new Float64Array(N));
    const I = new Float64Array(N);
    for (let i = 0; i < N; i++) G[i][i] += GMIN;
    for (const { node } of groundOf.values()) G[node][node] += G_GROUND;
    const stampG = (a, b, g) => { G[a][a] += g; G[b][b] += g; G[a][b] -= g; G[b][a] -= g; };
    // 소자 전류 i(a→b) = g·(Va − Vb) − g·v  (v: 소자 기전력/문턱전압)
    const stampSrc = (a, b, g, v) => { stampG(a, b, g); I[a] += g * v; I[b] -= g * v; };

    for (const { c, n: [a, b] } of elems) {
      if (c.type === 'resistor') stampG(a, b, 1 / num(c.props.ohms, 1, 1e-3));
      else if (c.type === 'led') {
        if (ledOn.get(c.id)) stampSrc(a, b, 1 / LED_RS, LED_COLORS[c.props.color].vf);
        else stampG(a, b, GMIN);
      } else if (isSource(c)) {
        if (ccMode.get(c.id)) { const il = currentLimit(c); I[a] += il; I[b] -= il; } // − → + 로 일정 전류
        else stampSrc(a, b, 1 / R_INTERNAL[c.type], sourceVolts(c));
      } else if (isClosed(c, pressed)) stampG(a, b, 1 / R_SWITCH);
    }
    const x = N > 0 ? solveLinear(G, I) : new Float64Array(0);
    for (let i = 0; i < N; i++) if (!Number.isFinite(x[i])) { x[i] = 0; nonFinite = true; }
    return x;
  };

  const sourceCurrent = (c, [p, n]) => (ccMode.get(c.id)
    ? currentLimit(c)
    : (sourceVolts(c) - (V[p] - V[n])) / R_INTERNAL[c.type]);

  for (let iter = 0; iter < MAX_ITER; iter++) {
    V = solveOnce();

    // 1) 전원 CV ↔ CC 전환
    let psuChanged = false;
    for (const { c, n } of elems) {
      if (c.type !== 'psu') continue;
      const vt = V[n[0]] - V[n[1]];
      if (!ccMode.get(c.id) && sourceCurrent(c, n) > currentLimit(c) + 1e-9) { ccMode.set(c.id, true); psuChanged = true; }
      else if (ccMode.get(c.id) && vt > sourceVolts(c) + 1e-9) { ccMode.set(c.id, false); psuChanged = true; }
    }
    if (psuChanged) continue;

    // 2) LED: 조건을 가장 크게 어긴 LED 하나만 바꾸고 다시 푼다.
    //    여러 개를 한 번에 바꾸면 병렬 LED에서 켜짐/꺼짐이 번갈아 진동할 수 있다.
    let worst = null;
    let worstBy = 1e-9;
    for (const { c, n: [a, b] } of elems) {
      if (c.type !== 'led') continue;
      const vf = LED_COLORS[c.props.color].vf;
      const vak = V[a] - V[b];
      const by = ledOn.get(c.id) ? vf - vak : vak - vf;
      if (by > worstBy) { worstBy = by; worst = c.id; }
    }
    if (worst === null) { converged = true; break; }
    ledOn.set(worst, !ledOn.get(worst));
  }

  // 각 노드(및 Union-Find 루트)에 꽂힌 부품 단자 수
  const pinCount = new Array(N).fill(0);
  for (const { n } of elems) for (const i of n) pinCount[i]++;

  const results = {};
  const warnings = [];
  const warn = (level, target, msg) => warnings.push({ level, ...target, msg });
  const sources = [];
  const groundedRoots = new Set(groundOf.keys());
  const isFloating = (n) => n.some((i) => pinCount[i] < 2) || !groundedRoots.has(conn.find(n[0]));

  for (const { c, n } of elems) {
    const [a, b] = n;
    const v = V[a] - V[b];
    const r = { v, i: 0, p: 0, samenode: a === b, floating: !isSource(c) && isFloating(n) };
    const at = { compId: c.id };

    if (c.type === 'resistor') {
      r.i = r.floating ? 0 : v / num(c.props.ohms, 1, 1e-3);
      r.p = v * r.i;
      const pw = Math.abs(r.p);
      if (pw > RESISTOR_BURN_W) warn('error', at, `${c.label}: 저항 과열! 소비 전력 ${formatSI(pw, 'W')} (정격 0.25W) — 전류 ${formatSI(Math.abs(r.i), 'A')}, 타버릴 수 있습니다`);
      else if (pw > RESISTOR_MAX_W) warn('warn', at, `${c.label}: 소비 전력 ${formatSI(pw, 'W')} — 1/4W 정격 초과로 뜨거워집니다`);
    } else if (c.type === 'led') {
      const vf = LED_COLORS[c.props.color].vf;
      r.i = ledOn.get(c.id) && !r.floating ? Math.max(0, (v - vf) / LED_RS) : 0;
      if (r.i < 1e-6) r.i = 0;
      r.on = r.i > 0;
      r.p = v * r.i;
      r.brightness = Math.min(1, r.i / LED_FULL);
      r.damaged = r.i > LED_BURN;
      if (r.damaged) warn('error', at, `${c.label}: 과전류 ${formatSI(r.i, 'A')} — LED가 타버립니다! 직렬 저항을 연결하세요`);
      else if (r.i > LED_MAX) warn('warn', at, `${c.label}: 과전류 ${formatSI(r.i, 'A')} — 정격(20mA) 초과, 저항값을 키우세요`);
      if (!r.floating && v < -5) warn('warn', at, `${c.label}: 극성이 반대이고 역방향 전압 ${formatSI(-v, 'V')} — 역내압(약 5V) 초과`);
      else if (!r.floating && v < -0.5) warn('info', at, `${c.label}: 극성이 반대입니다 (긴 다리 = +, 애노드)`);
    } else if (isSource(c)) {
      r.mode = c.type === 'psu' ? (ccMode.get(c.id) ? 'CC' : 'CV') : null;
      r.i = sourceCurrent(c, n); // + 단자에서 외부 회로로 나가는 전류
      if (Math.abs(r.i) < 1e-6) r.i = 0; // GMIN 누설로만 생긴 nA 수준 전류는 0으로
      r.p = v * r.i;
      // 단락 = 전원 +와 − 사이의 외부 저항(단자 전압 ÷ 전류)이 거의 0Ω
      r.rExt = r.i > 1e-3 ? v / r.i : Infinity;
      r.shorted = r.i > 1e-3 && r.rExt < SHORT_OHMS;
      sources.push({ comp: c, ...r });
      if (r.shorted && r.mode === 'CC') warn('warn', at, `${c.label}: 단락(+와 − 사이 ${formatSI(r.rExt, 'Ω')}) — 전류 제한(CC)으로 ${formatSI(r.i, 'A')}에서 보호 중`);
      else if (r.shorted) warn('error', at, `${c.label}: 단락(쇼트)! +와 − 사이 저항이 ${formatSI(r.rExt, 'Ω')}로 거의 0 — ${formatSI(r.i, 'A')}가 흐릅니다`);
      else if (r.mode === 'CC') warn('info', at, `${c.label}: 전류 제한(CC) 동작 중 — ${formatSI(r.i, 'A')}로 제한되어 출력이 ${formatSI(v, 'V')}로 낮아짐`);
      else if (Math.abs(r.i) < 1e-6) warn('info', at, `${c.label}: 회로가 열려 있어 전류가 흐르지 않습니다`);
    } else {
      r.closed = isClosed(c, pressed);
      r.i = r.closed ? v / R_SWITCH : 0;
    }

    if (r.floating) { r.v = 0; r.p = 0; }

    if (r.samenode && (c.type === 'resistor' || c.type === 'led')) {
      warn('warn', at, `${c.label}: 두 다리가 같은 세로줄(노드)에 꽂혀 있어 전류가 부품을 거치지 않습니다`);
    }
    if (n.some((i) => pinCount[i] < 2)) warn('info', at, `${c.label}: 아무 데도 연결되지 않은 단자가 있습니다`);
    results[c.id] = r;
  }

  // 한쪽 끝이 비어 있는 전선: 그 끝이 꽂힌 줄(구멍 묶음)에 부품 단자도, 다른 전선도 없을 때.
  // (전선이 양 끝을 하나의 노드로 합치므로 합쳐진 노드가 아니라 '끝이 꽂힌 자리'를 따로 본다.)
  const baseNet = (p) => HOLE_MAP.get(key(p.gx, p.gy))?.net ?? key(p.gx, p.gy);
  const pinsAt = new Map();
  const endsAt = new Map();
  const bump = (m, k) => m.set(k, (m.get(k) ?? 0) + 1);
  for (const c of components) for (const p of pinPoints(c)) bump(pinsAt, baseNet(p));
  for (const ends of wireEnds) for (const p of ends) if (p) bump(endsAt, baseNet(p));
  const describe = (p) => HOLE_MAP.get(key(p.gx, p.gy))?.label ?? `(${p.gx},${p.gy})`;
  wires.forEach((w, wi) => {
    const ends = wireEnds[wi];
    if (!ends[0] || !ends[1]) return;
    const dangling = ends.filter((p) => !pinsAt.get(baseNet(p)) && endsAt.get(baseNet(p)) <= 1);
    if (dangling.length === 0) return;
    const which = dangling.length === 2 ? '양쪽 끝' : `한쪽 끝(${describe(dangling[0])})`;
    warn('info', { wireId: w.id }, `전선 ${describe(ends[0])} → ${describe(ends[1])}: ${which}이 아무것과도 연결되지 않았습니다`);
  });

  if (sources.length === 0 && components.length > 0) warn('info', {}, '전원(배터리/전원 공급 장치)이 없습니다');
  if (!converged) warn('warn', {}, 'LED/전원 상태가 안정되지 않았습니다. 연결을 확인하세요');
  if (nonFinite) warn('warn', {}, '계산 중 유효하지 않은 값이 생겨 0V로 처리했습니다');

  // 구멍(또는 임의 격자점)의 전압 — 항상 유한한 숫자를 돌려준다.
  // floating: 전원과 이어지지 않았거나 부품 단자 하나에만 닿아 값이 정해지지 않는 지점
  function pointVoltage(k) {
    const root = dsu.find(k);
    if (!nodeIdx.has(root)) return { v: 0, floating: true, ref: null };
    const i = nodeIdx.get(root);
    const g = groundOf.get(conn.find(i));
    if (!g) return { v: 0, floating: true, ref: null };
    const v = V[i] - V[g.node];
    return { v: Number.isFinite(v) ? v : 0, floating: pinCount[i] < 2, ref: g.label };
  }

  const order = { error: 0, warn: 1, info: 2 };
  warnings.sort((x, y) => order[x.level] - order[y.level]);

  return { results, warnings, sources, pointVoltage, converged };
}
