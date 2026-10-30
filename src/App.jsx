import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import Toolbar from './components/Toolbar.jsx';
import Toolbox from './components/Toolbox.jsx';
import Workspace from './components/Workspace.jsx';
import PropertiesPanel from './components/PropertiesPanel.jsx';
import { initialState, reducer, saveState } from './lib/state.js';
import { simulate } from './lib/simulate.js';

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  // 눌린 푸시 버튼 (순간 동작이므로 저장하지 않음)
  const [pressed, setPressed] = useState(() => new Set());

  useEffect(() => { saveState(state); }, [state]);

  const sim = useMemo(
    () => (state.running ? simulate(state.components, state.wires, pressed) : null),
    [state.running, state.components, state.wires, pressed],
  );

  const onPressStart = useCallback((id, e) => {
    e.preventDefault();
    setPressed((prev) => new Set(prev).add(id));
  }, []);

  useEffect(() => {
    const release = () => setPressed((prev) => (prev.size ? new Set() : prev));
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    window.addEventListener('blur', release);
    return () => {
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
      window.removeEventListener('blur', release);
    };
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.('input, select, textarea')) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && (k === 'z' || k === 'ㅋ')) { e.preventDefault(); dispatch({ type: e.shiftKey ? 'REDO' : 'UNDO' }); return; }
      if (mod && (k === 'y' || k === 'ㅛ')) { e.preventDefault(); dispatch({ type: 'REDO' }); return; }
      if (mod) return;
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); dispatch({ type: 'DELETE' }); }
      else if (e.key === 'r' || e.key === 'R' || e.key === 'ㄱ') dispatch({ type: 'ROTATE' });
      else if (e.key === 'Escape') dispatch({ type: 'SELECT', selected: null });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // 클릭으로 추가할 때는 겹치지 않도록 보관 영역에 차례로 배치
  const onAdd = useCallback((type) => {
    // 전원은 보드 아래 양 끝(왼쪽 배터리, 오른쪽 전원 장치), 나머지는 그 사이 보관 영역
    const SPAWN = { battery: { gx: 4, gy: 29 }, psu: { gx: 37, gy: 29 } };
    const n = state.components.length;
    const at = SPAWN[type] ?? { gx: 12 + ((n * 4) % 20), gy: 26 };
    dispatch({ type: 'ADD_COMP', partType: type, ...at });
  }, [state.components.length]);

  const errorCount = sim ? sim.warnings.filter((w) => w.level !== 'info').length : 0;

  return (
    <div className="app">
      <Toolbar state={state} dispatch={dispatch} errorCount={errorCount} />
      <main className="layout">
        <Toolbox onAdd={onAdd} />
        <Workspace state={state} dispatch={dispatch} sim={sim} pressed={pressed} onPressStart={onPressStart} />
        <PropertiesPanel state={state} dispatch={dispatch} sim={sim} pressed={pressed} onPressStart={onPressStart} />
      </main>
    </div>
  );
}
