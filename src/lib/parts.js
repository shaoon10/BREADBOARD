import { P } from './board.js';

export const LED_COLORS = {
  red: { name: '빨강', vf: 1.8, body: '#e11d48', glow: '#ff3355' },
  green: { name: '초록', vf: 2.1, body: '#16a34a', glow: '#44ff7a' },
  blue: { name: '파랑', vf: 3.0, body: '#2563eb', glow: '#4d9bff' },
  yellow: { name: '노랑', vf: 2.0, body: '#eab308', glow: '#ffe14d' },
};

// pins: [x, y, 이름] — 격자 단위, 첫 번째 핀이 부품의 기준점.
// bbox: [x, y, w, h] — 회전 전 로컬 픽셀 좌표의 선택 영역.
export const PART_DEFS = {
  battery: {
    name: '9V 배터리',
    desc: '전압 조절 가능한 배터리',
    prefix: 'BAT',
    pins: [[0, 0, '+ 단자'], [1, 0, '− 단자']],
    props: { volts: 9 },
    bbox: [-24, -118, 68, 124],
  },
  psu: {
    name: 'DC 전원 공급 장치',
    desc: '0–30V · 전류 제한(CC)',
    prefix: 'PSU',
    pins: [[0, 0, '+ 단자'], [2, 0, '− 단자']],
    props: { volts: 5, ilimit: 1 },
    bbox: [-44, -102, 128, 108],
  },
  resistor: {
    name: '저항',
    desc: '색띠로 저항값 표시',
    prefix: 'R',
    pins: [[0, 0, '단자 1'], [4, 0, '단자 2']],
    props: { ohms: 220 },
    bbox: [-6, -12, 92, 24],
  },
  led: {
    name: 'LED',
    desc: '빨강·초록·파랑·노랑',
    prefix: 'LED',
    pins: [[0, 0, '애노드 (+, 긴 다리)'], [1, 0, '캐소드 (−, 짧은 다리)']],
    props: { color: 'red' },
    bbox: [-8, -44, 36, 50],
  },
  button: {
    name: '푸시 버튼',
    desc: '누르는 동안만 연결',
    prefix: 'BTN',
    pins: [[0, 0, '단자 1'], [2, 0, '단자 2']],
    props: {},
    bbox: [-6, -20, 52, 40],
  },
  switch: {
    name: '슬라이드 스위치',
    desc: '클릭으로 켜고 끄기',
    prefix: 'SW',
    pins: [[0, 0, '단자 1'], [2, 0, '단자 2']],
    props: { on: false },
    bbox: [-6, -28, 52, 34],
  },
};

export const TOOLBOX_ORDER = ['led', 'resistor', 'button', 'switch', 'battery', 'psu'];

export function rotate(x, y, rot) {
  switch (((rot % 360) + 360) % 360) {
    case 90: return [-y, x];
    case 180: return [-x, -y];
    case 270: return [y, -x];
    default: return [x, y];
  }
}

export function pinPoints(comp) {
  return PART_DEFS[comp.type].pins.map(([x, y]) => {
    const [rx, ry] = rotate(x, y, comp.rot);
    return { gx: comp.gx + rx, gy: comp.gy + ry };
  });
}

// 회전이 반영된 화면 픽셀 좌표의 bbox
export function worldBBox(comp) {
  const [x, y, w, h] = PART_DEFS[comp.type].bbox;
  const pts = [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].map(([px, py]) => rotate(px, py, comp.rot));
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const ox = comp.gx * P;
  const oy = comp.gy * P;
  return { x: ox + Math.min(...xs), y: oy + Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

// 전선 끝점: 브레드보드 구멍 {gx, gy} 또는 보드 밖 부품 단자 {comp, pin}
export function resolveEndpoint(ep, byId) {
  if (ep.comp == null) return { gx: ep.gx, gy: ep.gy };
  const comp = byId.get(ep.comp);
  if (!comp) return null;
  return pinPoints(comp)[ep.pin] ?? null;
}

export function sameEndpoint(a, b) {
  if (a.comp != null || b.comp != null) return a.comp === b.comp && a.pin === b.pin;
  return a.gx === b.gx && a.gy === b.gy;
}

export function nextLabel(type, components) {
  const prefix = PART_DEFS[type].prefix;
  let max = 0;
  for (const c of components) {
    if (c.type !== type) continue;
    const n = parseInt(c.label.slice(prefix.length), 10);
    if (n > max) max = n;
  }
  return `${prefix}${max + 1}`;
}
