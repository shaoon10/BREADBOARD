// 브레드보드 형상과 내부 전기적 연결 구조.
// 모든 좌표는 격자 단위(gx, gy)이며 화면 픽셀 = 격자 × P.

export const P = 20; // 구멍 간격(px) — 실제 2.54mm 피치에 대응
export const COLS = 30;
export const COL_X0 = 10; // 열 c(1..30)의 gx = COL_X0 + c
export const WORLD_W = 44;
export const WORLD_H = 30;

export const ROW_Y = { a: 7, b: 8, c: 9, d: 10, e: 11, f: 14, g: 15, h: 16, i: 17, j: 18 };
export const ROW_LETTERS = Object.keys(ROW_Y);

export const RAILS = [
  { id: 'top+', y: 4, sign: '+', name: '상단 + 레일' },
  { id: 'top-', y: 5, sign: '-', name: '상단 − 레일' },
  { id: 'bot-', y: 20, sign: '-', name: '하단 − 레일' },
  { id: 'bot+', y: 21, sign: '+', name: '하단 + 레일' },
];

export const BOARD_RECT = {
  x: (COL_X0 + 1 - 1.5) * P,
  y: (4 - 1.4) * P,
  w: (COLS - 1 + 3) * P,
  h: (21 - 4 + 2.8) * P,
};

export const key = (gx, gy) => `${gx},${gy}`;

// 전원 레일은 5구멍마다 한 칸씩 비어 있다 (실제 브레드보드와 동일한 배치).
export const railHasHole = (c) => (c - 1) % 6 !== 5;

export const HOLES = [];
export const HOLE_MAP = new Map();
export const NET_MEMBERS = new Map();

function addHole(h) {
  HOLES.push(h);
  HOLE_MAP.set(h.key, h);
  if (!NET_MEMBERS.has(h.net)) NET_MEMBERS.set(h.net, []);
  NET_MEMBERS.get(h.net).push(h.key);
}

for (let c = 1; c <= COLS; c++) {
  const gx = COL_X0 + c;
  for (const r of ROW_LETTERS) {
    const gy = ROW_Y[r];
    const top = 'abcde'.includes(r);
    addHole({ key: key(gx, gy), gx, gy, kind: 'term', label: `${r}${c}`, net: top ? `T${c}` : `B${c}` });
  }
  if (railHasHole(c)) {
    for (const rail of RAILS) {
      addHole({ key: key(gx, rail.y), gx, gy: rail.y, kind: 'rail', sign: rail.sign, label: `${rail.name} ${c}`, net: `R${rail.id}` });
    }
  }
}

export function netDescription(net) {
  if (net.startsWith('T')) return `${net.slice(1)}번 열 a–e (세로 5구멍 연결)`;
  if (net.startsWith('B')) return `${net.slice(1)}번 열 f–j (세로 5구멍 연결)`;
  const rail = RAILS.find((r) => `R${r.id}` === net);
  return rail ? `${rail.name} (가로 전체 연결)` : net;
}
