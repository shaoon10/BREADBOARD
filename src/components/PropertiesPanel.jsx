import { HOLE_MAP, key } from '../lib/board.js';
import { LED_COLORS, PART_DEFS, pinPoints, resolveEndpoint } from '../lib/parts.js';
import { formatSI, resistorBands } from '../lib/format.js';
import { LED_RS, R_INTERNAL, SHORT_OHMS, currentLimit, isSource } from '../lib/simulate.js';
import { WIRE_COLORS } from '../lib/state.js';

const RESISTOR_PRESETS = [10, 47, 100, 220, 330, 470, 680, 1000, 2200, 4700, 10000, 47000, 100000];
const VOLT_PRESETS = [1.5, 3, 3.7, 5, 9, 12];

function Row({ label, children }) {
  return <div className="row"><span>{label}</span><b className="mono">{children}</b></div>;
}

function pointDescription(p, compId, pinIdx, wires, byId) {
  const hole = HOLE_MAP.get(key(p.gx, p.gy));
  if (hole) return `${hole.label}`;
  const wired = wires.some((w) => [w.a, w.b].some((ep) => (ep.comp === compId && ep.pin === pinIdx) || (ep.comp == null && ep.gx === p.gx && ep.gy === p.gy)));
  if (wired) return '전선 연결됨';
  const other = [...byId.values()].some((c) => c.id !== compId && pinPoints(c).some((q) => q.gx === p.gx && q.gy === p.gy));
  return other ? '다른 부품 단자와 접촉' : '보드 밖 · 미연결';
}

function CompProps({ comp, state, dispatch, sim, pressed, onPressStart }) {
  const def = PART_DEFS[comp.type];
  const r = sim?.results[comp.id];
  // 입력칸·슬라이더의 연속 변경은 tx로 묶어 되돌리기 한 번에 되돌아가게 한다
  const set = (props) => dispatch({ type: 'UPDATE_PROPS', id: comp.id, props, tx: `props:${comp.id}:${Object.keys(props).join()}` });
  const byId = new Map(state.components.map((c) => [c.id, c]));
  const pts = pinPoints(comp);

  return (
    <>
      <section>
        <div className="sel-title">
          <span className="tag">{comp.label}</span>
          <h3>{def.name}</h3>
        </div>

        <label className="field">
          이름표
          <div className="inline">
            <input
              type="text"
              className="text"
              value={comp.label}
              maxLength={24}
              onChange={(e) => dispatch({ type: 'UPDATE_LABEL', id: comp.id, label: e.target.value, tx: `label:${comp.id}` })}
            />
          </div>
        </label>

        {comp.type === 'resistor' && (
          <>
            <label className="field">
              저항값
              <div className="inline">
                <select value={RESISTOR_PRESETS.includes(comp.props.ohms) ? comp.props.ohms : ''} onChange={(e) => e.target.value && set({ ohms: Number(e.target.value) })}>
                  <option value="">직접 입력</option>
                  {RESISTOR_PRESETS.map((v) => <option key={v} value={v}>{formatSI(v, 'Ω')}</option>)}
                </select>
                <input type="number" min={1} max={10000000} step={1} value={comp.props.ohms} onChange={(e) => { const v = Number(e.target.value); if (v >= 1) set({ ohms: v }); }} />
                <span>Ω</span>
              </div>
            </label>
            <div className="bands">
              {resistorBands(comp.props.ohms).map((b, i) => (
                <span key={i} className="band"><i style={{ background: b.hex }} />{b.name}</span>
              ))}
            </div>
          </>
        )}

        {comp.type === 'led' && (
          <div className="field">
            LED 색상
            <div className="led-colors">
              {Object.entries(LED_COLORS).map(([id, c]) => (
                <button key={id} type="button" className={`chip ${comp.props.color === id ? 'active' : ''}`} onClick={() => set({ color: id })}>
                  <i style={{ background: c.body }} />{c.name}<small>{c.vf}V</small>
                </button>
              ))}
            </div>
          </div>
        )}

        {isSource(comp) && (
          <label className="field">
            출력 전압
            <div className="inline">
              <input type="range" min={0} max={comp.type === 'psu' ? 30 : 12} step={0.1} value={comp.props.volts} onChange={(e) => set({ volts: Number(e.target.value) })} />
              <input type="number" min={0} max={comp.type === 'psu' ? 30 : 12} step={0.1} value={comp.props.volts} onChange={(e) => { const v = Number(e.target.value); if (v >= 0) set({ volts: v }); }} />
              <span>V</span>
            </div>
            <div className="presets">
              {VOLT_PRESETS.map((v) => <button key={v} type="button" className="chip" onClick={() => set({ volts: v })}>{v}V</button>)}
            </div>
          </label>
        )}

        {comp.type === 'psu' && (
          <label className="field">
            전류 제한 (CC)
            <div className="inline">
              <input type="range" min={0.01} max={5} step={0.01} value={currentLimit(comp)} onChange={(e) => set({ ilimit: Number(e.target.value) })} />
              <input type="number" min={0.001} max={5} step={0.01} value={comp.props.ilimit ?? 1} onChange={(e) => { const v = Number(e.target.value); if (v > 0) set({ ilimit: v }); }} />
              <span>A</span>
            </div>
            <small className="muted">출력 전류가 이 값을 넘으면 전압을 낮춰 전류를 제한합니다.</small>
          </label>
        )}

        {comp.type === 'switch' && (
          <button type="button" className={`btn wide ${comp.props.on ? 'run' : ''}`} onClick={() => dispatch({ type: 'TOGGLE_SWITCH', id: comp.id })}>
            {comp.props.on ? '● ON — 클릭하여 끄기' : '○ OFF — 클릭하여 켜기'}
          </button>
        )}

        {comp.type === 'button' && (
          <button type="button" className={`btn wide ${pressed.has(comp.id) ? 'run' : ''}`} onPointerDown={(e) => onPressStart(comp.id, e)}>
            {pressed.has(comp.id) ? '눌림 — 연결됨' : '여기를 누르고 있기'}
          </button>
        )}

        <div className="actions">
          <button type="button" className="btn" onClick={() => dispatch({ type: 'ROTATE', id: comp.id })}>⟳ 회전 (R)</button>
          <button type="button" className="btn danger" onClick={() => dispatch({ type: 'DELETE', selected: { kind: 'comp', id: comp.id } })}>🗑 삭제</button>
        </div>
      </section>

      <section>
        <h4>단자 연결</h4>
        {def.pins.map(([, , name], i) => (
          <Row key={name} label={name}>{pointDescription(pts[i], comp.id, i, state.wires, byId)}</Row>
        ))}
      </section>

      <section>
        <h4>전기적 특성</h4>
        {!sim && <p className="muted">▶ 실행을 누르면 전압과 전류가 계산됩니다.</p>}
        {sim && r && <Electrical comp={comp} r={r} />}
      </section>
    </>
  );
}

function Electrical({ comp, r }) {
  if (r.floating) return <p className="muted">⚪ 회로가 완성되지 않아 전류가 흐르지 않습니다. 양쪽 단자가 전원까지 이어지도록 연결하세요.</p>;
  if (comp.type === 'resistor') {
    return (
      <>
        <Row label="양단 전압 V">{formatSI(Math.abs(r.v), 'V')}</Row>
        <Row label="전류 I">{formatSI(Math.abs(r.i), 'A')}</Row>
        <Row label="소비 전력 P">{formatSI(Math.abs(r.p), 'W')}</Row>
        <div className="formula">
          옴의 법칙 V = I × R<br />
          {formatSI(Math.abs(r.v), 'V')} = {formatSI(Math.abs(r.i), 'A')} × {formatSI(comp.props.ohms, 'Ω')}
        </div>
      </>
    );
  }
  if (comp.type === 'led') {
    const vf = LED_COLORS[comp.props.color].vf;
    return (
      <>
        <Row label="상태">{r.damaged ? '💥 소손' : r.on ? `켜짐 (밝기 ${Math.round(r.brightness * 100)}%)` : '꺼짐'}</Row>
        <Row label="양단 전압">{formatSI(r.v, 'V')}</Row>
        <Row label="순방향 전압 Vf">{vf} V</Row>
        <Row label="전류">{formatSI(r.i, 'A')}</Row>
        <div className="meter"><i style={{ width: `${Math.min(100, (r.i / 0.03) * 100)}%`, background: r.i > 0.03 ? '#ef4444' : r.i > 0.02 ? '#f59e0b' : '#22c55e' }} /></div>
        <div className="formula">
          LED 전류 I = (V − Vf) / R<br />
          권장 전류 5–20mA · 모델 직렬저항 {LED_RS}Ω
        </div>
      </>
    );
  }
  if (isSource(comp)) {
    return (
      <>
        {r.mode && <Row label="동작 모드">{r.mode === 'CC' ? '정전류 CC (전류 제한 중)' : '정전압 CV'}</Row>}
        <Row label="설정 전압">{formatSI(comp.props.volts, 'V')}</Row>
        <Row label="단자 전압">{formatSI(r.v, 'V')}</Row>
        <Row label="출력 전류">{formatSI(r.i, 'A')}</Row>
        <Row label="공급 전력">{formatSI(r.p, 'W')}</Row>
        <Row label="+/− 사이 외부 저항">{Number.isFinite(r.rExt) ? formatSI(r.rExt, 'Ω') : '∞ (개방)'}</Row>
        <div className="formula">
          내부저항 {R_INTERNAL[comp.type]}Ω{comp.type === 'psu' && <> · 전류 제한 {formatSI(currentLimit(comp), 'A')}</>}<br />
          +/− 사이 외부 저항이 {SHORT_OHMS}Ω 미만이면 단락으로 판단
        </div>
      </>
    );
  }
  return (
    <>
      <Row label="상태">{r.closed ? '닫힘 (연결)' : '열림 (차단)'}</Row>
      <Row label="양단 전압">{formatSI(Math.abs(r.v), 'V')}</Row>
      <Row label="전류">{formatSI(Math.abs(r.i), 'A')}</Row>
    </>
  );
}

function WireProps({ wire, state, dispatch }) {
  const byId = new Map(state.components.map((c) => [c.id, c]));
  const describe = (ep) => {
    if (ep.comp != null) {
      const c = byId.get(ep.comp);
      return c ? `${c.label} ${PART_DEFS[c.type].pins[ep.pin][2]}` : '?';
    }
    const p = resolveEndpoint(ep, byId);
    return HOLE_MAP.get(key(p.gx, p.gy))?.label ?? '?';
  };
  return (
    <section>
      <div className="sel-title"><span className="tag" style={{ background: wire.color, color: '#000' }}>전선</span><h3>점퍼 전선</h3></div>
      <Row label="시작">{describe(wire.a)}</Row>
      <Row label="끝">{describe(wire.b)}</Row>
      <div className="field">
        색상
        <div className="wire-colors">
          {WIRE_COLORS.map((c) => (
            <button key={c} type="button" className={`swatch ${c === wire.color ? 'active' : ''}`} style={{ background: c }} onClick={() => dispatch({ type: 'SET_WIRE_COLOR', id: wire.id, color: c })} aria-label={c} />
          ))}
        </div>
      </div>
      <Row label="꺾이는 점">{wire.points?.length ?? 0}개</Row>
      <p className="muted">
        흰색 끝점을 드래그하면 다른 구멍으로 옮길 수 있습니다.<br />
        전선을 더블클릭하면 그 자리에 꺾이는 점이 추가되고, 사각 점을 드래그해 경로를 바꾸며, 사각 점을 더블클릭하면 지웁니다.
      </p>
      <div className="actions">
        <button type="button" className="btn danger" onClick={() => dispatch({ type: 'DELETE', selected: { kind: 'wire', id: wire.id } })}>🗑 전선 삭제</button>
      </div>
    </section>
  );
}

function CircuitSummary({ state, sim }) {
  const count = (t) => state.components.filter((c) => c.type === t).length;
  const leds = state.components.filter((c) => c.type === 'led');
  const lit = sim ? leds.filter((c) => sim.results[c.id]?.on).length : 0;
  return (
    <section>
      <h3>회로 정보</h3>
      <Row label="부품">{state.components.length}개</Row>
      <Row label="전선">{state.wires.length}개</Row>
      <Row label="LED / 저항">{count('led')} / {count('resistor')}</Row>
      {sim && <Row label="켜진 LED">{lit} / {leds.length}</Row>}
      {sim?.sources.map((s) => (
        <div key={s.comp.id} className="source-card">
          <b>{s.comp.label}</b>
          <Row label="전압">{formatSI(s.v, 'V')}</Row>
          <Row label="전류">{formatSI(s.i, 'A')}</Row>
          <Row label="전력">{formatSI(s.p, 'W')}</Row>
        </div>
      ))}
      {!sim && <p className="muted">시뮬레이션이 정지되어 있습니다. 상단의 ▶ 실행을 누르세요.</p>}
      <p className="muted">부품이나 전선을 클릭하면 속성과 전압·전류를 볼 수 있습니다.</p>
    </section>
  );
}

const LEVEL_ICON = { error: '⛔', warn: '⚠️', info: 'ℹ️' };

export default function PropertiesPanel({ state, dispatch, sim, pressed, onPressStart }) {
  const sel = state.selected;
  const comp = sel?.kind === 'comp' ? state.components.find((c) => c.id === sel.id) : null;
  const wire = sel?.kind === 'wire' ? state.wires.find((w) => w.id === sel.id) : null;

  return (
    <aside className="panel props">
      <h2>속성 및 회로 정보</h2>
      {comp && <CompProps comp={comp} state={state} dispatch={dispatch} sim={sim} pressed={pressed} onPressStart={onPressStart} />}
      {wire && <WireProps wire={wire} state={state} dispatch={dispatch} />}
      {!comp && !wire && <CircuitSummary state={state} sim={sim} />}

      {sim && (
        <section>
          <h4>회로 진단</h4>
          {sim.warnings.length === 0 && <p className="ok">✅ 문제 없음</p>}
          <ul className="warnings">
            {sim.warnings.map((w, i) => (
              <li key={i} className={w.level}>
                <button type="button" onClick={() => { if (w.compId) dispatch({ type: 'SELECT', selected: { kind: 'comp', id: w.compId } }); else if (w.wireId) dispatch({ type: 'SELECT', selected: { kind: 'wire', id: w.wireId } }); }}>
                  <span>{LEVEL_ICON[w.level]}</span>{w.msg}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  );
}
