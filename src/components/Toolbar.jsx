import { WIRE_COLORS } from '../lib/state.js';

export default function Toolbar({ state, dispatch, errorCount }) {
  const { running, wireColor, selected } = state;
  const reset = () => {
    if (window.confirm('회로 전체를 초기화할까요? 모든 부품과 전선이 삭제됩니다.')) dispatch({ type: 'RESET' });
  };
  const loadExample = () => {
    if (state.components.length === 0 || window.confirm('현재 회로를 지우고 기본 예제 회로를 불러올까요?')) dispatch({ type: 'LOAD_EXAMPLE' });
  };
  return (
    <header className="topbar">
      <div className="brand">
        <span className="logo">⚡</span>
        <div>
          <h1>브레드보드 회로 시뮬레이터</h1>
          <small>LED · 저항 · 스위치 · 전원 — 수정 절점 해석(MNA) 실시간 계산</small>
        </div>
      </div>

      <div className="controls">
        {running ? (
          <button type="button" className="btn stop" onClick={() => dispatch({ type: 'SET_RUNNING', running: false })}>■ 정지</button>
        ) : (
          <button type="button" className="btn run" onClick={() => dispatch({ type: 'SET_RUNNING', running: true })}>▶ 실행</button>
        )}
        <button type="button" className="btn" onClick={reset}>⟲ 초기화</button>
        <button type="button" className="btn" onClick={loadExample}>📘 예제 회로</button>
        <span className="sep" />
        <button type="button" className="btn icon" disabled={state.past.length === 0} onClick={() => dispatch({ type: 'UNDO' })} title="되돌리기 (Ctrl+Z)">↶</button>
        <button type="button" className="btn icon" disabled={state.future.length === 0} onClick={() => dispatch({ type: 'REDO' })} title="다시하기 (Ctrl+Y)">↷</button>
        <button type="button" className="btn" disabled={selected?.kind !== 'comp'} onClick={() => dispatch({ type: 'ROTATE' })} title="회전 (R)">⟳ 회전</button>
        <button type="button" className="btn danger" disabled={!selected} onClick={() => dispatch({ type: 'DELETE' })} title="삭제 (Delete)">🗑 삭제</button>
        <button type="button" className={`btn ${state.showLabels ? 'on' : ''}`} onClick={() => dispatch({ type: 'TOGGLE_LABELS' })} title="부품 이름표 보이기/숨기기">🏷 이름표</button>
        <span className="sep" />
        <div className="wire-colors" title="전선 색상 (선택된 전선에도 적용)">
          <span>전선 색</span>
          {WIRE_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={`swatch ${c === wireColor ? 'active' : ''}`}
              style={{ background: c }}
              onClick={() => dispatch({ type: 'SET_DEFAULT_WIRE_COLOR', color: c })}
              aria-label={`전선 색 ${c}`}
            />
          ))}
        </div>
      </div>

      <div className={`sim-status ${running ? (errorCount ? 'err' : 'on') : 'off'}`}>
        <span className="dot" />
        {running ? (errorCount ? `경고 ${errorCount}건` : '시뮬레이션 실행 중') : '정지됨'}
      </div>
    </header>
  );
}
