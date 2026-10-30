import test from 'node:test';
import assert from 'node:assert/strict';
import { simulate } from '../src/lib/simulate.js';
import { exampleCircuit, reducer } from '../src/lib/state.js';
import { resistorBands } from '../src/lib/format.js';
import { COL_X0, HOLES, ROW_Y, RAILS } from '../src/lib/board.js';

const near = (a, b, tol) => assert.ok(Math.abs(a - b) < tol, `${a} != ${b} (±${tol})`);

// ---------- 회로 구성 도우미 ----------
const hole = (row, col) => ({ gx: COL_X0 + col, gy: ROW_Y[row] });
const rail = (id, col) => ({ gx: COL_X0 + col, gy: RAILS.find((r) => r.id === id).y });
const part = (id, type, at, props = {}, rot = 0) => ({ id, type, label: id.toUpperCase(), gx: at.gx, gy: at.gy, rot, props });
const wire = (id, a, b) => ({ id, a, b, points: [] });
const battery = (volts = 9) => part('bat', 'battery', { gx: 3, gy: 13 }, { volts });
// 배터리 + → 상단 + 레일, − → 상단 − 레일
const batteryToRails = () => [
  wire('wp', { comp: 'bat', pin: 0 }, rail('top+', 1)),
  wire('wn', { comp: 'bat', pin: 1 }, rail('top-', 1)),
];

const allFinite = (sim) => {
  for (const h of HOLES) {
    const pv = sim.pointVoltage(h.key);
    assert.ok(Number.isFinite(pv.v), `${h.label} 전압이 숫자가 아님: ${pv.v}`);
  }
  for (const [id, r] of Object.entries(sim.results)) {
    for (const k of ['v', 'i', 'p']) assert.ok(Number.isFinite(r[k]), `${id}.${k} = ${r[k]}`);
  }
};
const warningsFor = (sim, id) => sim.warnings.filter((w) => w.compId === id);

// ---------- 요청된 테스트 ----------

test('빨강·파랑 LED 병렬 + 저항 1개 공유 → 빨강만 켜짐', () => {
  // + 레일 → a2 | 저항 b2–b6 | 빨강 e6→e7, 파랑 d6→d7 (같은 두 세로줄에 병렬) | a7 → − 레일
  const comps = [
    battery(9),
    part('r', 'resistor', hole('b', 2), { ohms: 220 }),
    part('red', 'led', hole('e', 6), { color: 'red' }),
    part('blue', 'led', hole('d', 6), { color: 'blue' }),
  ];
  const wires = [...batteryToRails(), wire('w1', rail('top+', 2), hole('a', 2)), wire('w2', hole('a', 7), rail('top-', 7))];
  const sim = simulate(comps, wires);
  assert.equal(sim.converged, true);
  assert.equal(sim.results.red.on, true);
  assert.equal(sim.results.blue.on, false);
  // 빨강이 노드를 약 1.8V로 붙잡아 파랑(Vf 3.0V)은 켜질 수 없다
  near(sim.results.red.i, (9 - 1.8) / (220 + 15 + 1.5), 1e-4);
  assert.ok(sim.results.red.v < 3.0);
});

test('저항 없이 LED를 9V에 연결 → 과전류 경고', () => {
  const comps = [battery(9), part('led', 'led', hole('e', 8), { color: 'red' })];
  const wires = [...batteryToRails(), wire('w1', rail('top+', 8), hole('a', 8)), wire('w2', hole('a', 9), rail('top-', 9))];
  const sim = simulate(comps, wires);
  near(sim.results.led.i, (9 - 1.8) / (15 + 1.5), 1e-3); // ≈ 436mA
  const w = warningsFor(sim, 'led');
  assert.ok(w.some((x) => x.msg.includes('과전류') && x.level === 'error'), JSON.stringify(w));
  assert.equal(sim.results.led.damaged, true);
});

test('LED 역방향 → 꺼짐', () => {
  const comps = [battery(9), part('r', 'resistor', hole('b', 2), { ohms: 330 }), part('led', 'led', hole('e', 6), { color: 'red' })];
  // 캐소드(e7)를 + 쪽, 애노드(e6)를 − 쪽으로: + 레일 → a7, 저항 b2–b6, a2 → − 레일
  const wires = [...batteryToRails(), wire('w1', rail('top+', 7), hole('a', 7)), wire('w2', hole('a', 2), rail('top-', 2))];
  const sim = simulate(comps, wires);
  assert.equal(sim.results.led.on, false);
  assert.equal(sim.results.led.i, 0);
  assert.ok(warningsFor(sim, 'led').some((x) => x.msg.includes('극성')));
});

test('+ 레일과 − 레일 직결 → 단락 경고, NaN 없음', () => {
  const comps = [battery(9)];
  const wires = [...batteryToRails(), wire('short', rail('top+', 5), rail('top-', 5))];
  const sim = simulate(comps, wires);
  const src = sim.sources[0];
  assert.equal(src.shorted, true);
  near(src.rExt, 0, 1e-6);
  near(src.i, 9 / 1.5, 1e-6); // 내부저항 1.5Ω만으로 제한 → 6A
  assert.ok(warningsFor(sim, 'bat').some((x) => x.level === 'error' && x.msg.includes('단락')));
  allFinite(sim);
});

test('저항 다리 두 개가 같은 세로줄 → 경고', () => {
  // 90° 회전한 저항: a5 ~ e5 (같은 5번 세로줄)
  const comps = [battery(9), part('r', 'resistor', hole('a', 5), { ohms: 220 }, 90)];
  const wires = [...batteryToRails(), wire('w1', rail('top+', 5), hole('b', 5))];
  const sim = simulate(comps, wires);
  assert.equal(sim.results.r.samenode, true);
  assert.ok(warningsFor(sim, 'r').some((x) => x.level === 'warn' && x.msg.includes('같은 세로줄')));
});

test('스위치 OFF 상태에서 모든 구멍 전압이 유효한 숫자', () => {
  const { components, wires } = exampleCircuit();
  components.find((c) => c.id === 'c5').props.on = false;
  const sim = simulate(components, wires, new Set());
  allFinite(sim);
  assert.equal(sim.results.c7.on, false);
  // 끊긴 쪽(스위치 뒤 h16)은 GND 기준 0V 근처로 계산된다
  const k = `${hole('h', 16).gx},${hole('h', 16).gy}`;
  near(sim.pointVoltage(k).v, 0, 1e-3);
  // 스위치 앞(h14)은 + 레일 전압
  const k14 = `${hole('h', 14).gx},${hole('h', 14).gy}`;
  assert.ok(sim.pointVoltage(k14).v > 8.9);
});

// ---------- 그 밖의 계산 변경 사항 ----------

test('9V에 5Ω 저항 → 단락이 아니라 저항 과열', () => {
  const comps = [battery(9), part('r', 'resistor', hole('b', 2), { ohms: 5 })];
  const wires = [...batteryToRails(), wire('w1', rail('top+', 2), hole('a', 2)), wire('w2', hole('a', 6), rail('top-', 7))];
  const sim = simulate(comps, wires);
  const src = sim.sources[0];
  near(src.i, 9 / (5 + 1.5), 1e-4); // ≈ 1.38A
  assert.equal(src.shorted, false);
  assert.ok(!sim.warnings.some((x) => x.msg.includes('단락')));
  assert.ok(warningsFor(sim, 'r').some((x) => x.level === 'error' && x.msg.includes('과열')));
});

test('DC 전원 장치 전류 제한(CC)', () => {
  const psu = (ilimit) => part('psu', 'psu', { gx: 4, gy: 26 }, { volts: 5, ilimit });
  const wires = [
    wire('wp', { comp: 'psu', pin: 0 }, rail('top+', 1)),
    wire('wn', { comp: 'psu', pin: 1 }, rail('top-', 1)),
    wire('w1', rail('top+', 2), hole('a', 2)),
    wire('w2', hole('a', 6), rail('top-', 7)),
  ];
  const r10 = part('r', 'resistor', hole('b', 2), { ohms: 10 });
  // 제한 1A: 5V/10Ω = 0.5A → 정전압(CV)
  const cv = simulate([psu(1), r10], wires).sources[0];
  assert.equal(cv.mode, 'CV');
  near(cv.i, 5 / 10.1, 1e-4);
  // 제한 0.1A → 정전류(CC), 출력 전압이 0.1A × 10Ω = 1V로 낮아짐
  const cc = simulate([psu(0.1), r10], wires).sources[0];
  assert.equal(cc.mode, 'CC');
  near(cc.i, 0.1, 1e-9);
  near(cc.v, 1, 1e-4);
  // CC 상태에서 단락 → 경고(보호됨), NaN 없음
  const shortSim = simulate([psu(0.5)], [...wires.slice(0, 2), wire('s', rail('top+', 3), rail('top-', 3))]);
  assert.equal(shortSim.sources[0].mode, 'CC');
  assert.equal(shortSim.sources[0].shorted, true);
  assert.ok(warningsFor(shortSim, 'psu').some((x) => x.level === 'warn' && x.msg.includes('CC')));
  allFinite(shortSim);
});

test('한쪽 끝이 비어 있는 전선 → 미연결 경고', () => {
  const comps = [battery(9)];
  const wires = [...batteryToRails(), wire('dangle', rail('top+', 3), hole('a', 20))];
  const sim = simulate(comps, wires);
  const w = sim.warnings.find((x) => x.wireId === 'dangle');
  assert.ok(w, '전선 경고 없음');
  assert.ok(w.msg.includes('a20'));
  // + 레일에는 dangle 전선이 이어져 있으므로 배터리 + 전선은 경고 없음
  assert.ok(!sim.warnings.some((x) => x.wireId === 'wp'));
  // − 레일에는 배터리 − 전선 말고 아무것도 없으므로 경고
  assert.ok(sim.warnings.some((x) => x.wireId === 'wn'));
});

test('예제: 스위치 ON → 초록 LED 점등, 버튼 누르면 빨간 LED도 점등', () => {
  const { components, wires } = exampleCircuit();
  const off = simulate(components, wires, new Set());
  assert.equal(off.results.c7.on, true);
  assert.equal(off.results.c3.on, false);
  near(off.results.c7.i, (9 - 2.1) / (330 + 15 + 1.5), 1e-4);
  near(off.results.c6.v, 330 * off.results.c7.i, 1e-3); // 저항: V = IR

  const on = simulate(components, wires, new Set(['c4']));
  assert.equal(on.results.c3.on, true);
  near(on.sources[0].i, on.results.c3.i + on.results.c7.i, 1e-5); // 키르히호프 전류 법칙
  assert.equal(on.warnings.filter((w) => w.level !== 'info').length, 0);
});

test('한쪽만 연결된 LED → 미연결, 전압은 유한한 숫자', () => {
  const comps = [battery(9), part('led', 'led', hole('e', 6), { color: 'red' })];
  const wires = [...batteryToRails(), wire('w1', rail('top+', 7), hole('a', 6))];
  const sim = simulate(comps, wires);
  assert.equal(sim.results.led.floating, true);
  assert.equal(sim.results.led.on, false);
  const anode = sim.pointVoltage(`${hole('a', 6).gx},${hole('a', 6).gy}`);
  near(anode.v, 9 * 1, 0.01); // 전류가 없으니 내부저항 강하 없음
  assert.equal(sim.pointVoltage(`${hole('a', 7).gx},${hole('a', 7).gy}`).floating, true);
  allFinite(sim);
});

test('저항 색띠', () => {
  assert.deepEqual(resistorBands(220).map((b) => b.name), ['빨강', '빨강', '갈색', '금색']);
  assert.deepEqual(resistorBands(4700).map((b) => b.name), ['노랑', '보라', '빨강', '금색']);
  assert.deepEqual(resistorBands(10).map((b) => b.name), ['갈색', '검정', '검정', '금색']);
  assert.deepEqual(resistorBands(4.7).map((b) => b.name), ['노랑', '보라', '금색', '금색']);
});

// ---------- 되돌리기 / 다시하기 ----------

test('되돌리기/다시하기: 드래그는 한 단계로 묶임', () => {
  let s = { components: [], wires: [], seq: 1, selected: null, wireColor: '#f00', past: [], future: [], lastTx: null, lastTxAt: 0 };
  s = reducer(s, { type: 'ADD_COMP', partType: 'led', gx: 20, gy: 25 });
  const id = s.components[0].id;
  for (let x = 21; x <= 25; x++) s = reducer(s, { type: 'MOVE_COMP', id, gx: x, gy: 25, tx: 'drag:1' });
  assert.equal(s.components[0].gx, 25);
  assert.equal(s.past.length, 2); // 추가 1 + 이동 1
  s = reducer(s, { type: 'UNDO' });
  assert.equal(s.components[0].gx, 20);
  s = reducer(s, { type: 'UNDO' });
  assert.equal(s.components.length, 0);
  assert.equal(s.selected, null);
  s = reducer(s, { type: 'REDO' });
  s = reducer(s, { type: 'REDO' });
  assert.equal(s.components[0].gx, 25);
  // 선택만 바꾸는 동작은 기록하지 않음
  s = reducer(s, { type: 'SELECT', selected: null });
  assert.equal(s.past.length, 2);
});
