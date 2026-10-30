import { PART_DEFS, TOOLBOX_ORDER } from '../lib/parts.js';

function Icon({ type }) {
  switch (type) {
    case 'led':
      return (
        <svg viewBox="0 0 40 40"><line x1="16" y1="26" x2="16" y2="38" stroke="#9ca3af" strokeWidth="2" /><line x1="24" y1="26" x2="24" y2="34" stroke="#9ca3af" strokeWidth="2" /><path d="M10,27 L10,14 A10,10 0 0 1 30,14 L30,27 Z" fill="#e11d48" /><circle cx="20" cy="15" r="14" fill="#ff3355" opacity="0.25" /></svg>
      );
    case 'resistor':
      return (
        <svg viewBox="0 0 40 40"><line x1="2" y1="20" x2="38" y2="20" stroke="#9ca3af" strokeWidth="2" /><rect x="9" y="13" width="22" height="14" rx="6" fill="#dcc08f" /><rect x="13" y="13" width="3" height="14" fill="#dc2626" /><rect x="18" y="13" width="3" height="14" fill="#dc2626" /><rect x="23" y="13" width="3" height="14" fill="#7c3f12" /></svg>
      );
    case 'button':
      return (
        <svg viewBox="0 0 40 40"><rect x="7" y="7" width="26" height="26" rx="3" fill="#2b313b" /><circle cx="20" cy="20" r="8" fill="#dc2626" /></svg>
      );
    case 'switch':
      return (
        <svg viewBox="0 0 40 40"><rect x="4" y="12" width="32" height="14" rx="3" fill="#1f2937" /><rect x="22" y="14" width="9" height="10" rx="2" fill="#4ade80" /><line x1="8" y1="26" x2="8" y2="34" stroke="#9ca3af" strokeWidth="2" /><line x1="32" y1="26" x2="32" y2="34" stroke="#9ca3af" strokeWidth="2" /></svg>
      );
    case 'battery':
      return (
        <svg viewBox="0 0 40 40"><rect x="10" y="6" width="20" height="30" rx="3" fill="#111827" /><rect x="10" y="6" width="20" height="9" rx="3" fill="#d97706" /><text x="20" y="30" fontSize="9" fill="#fff" textAnchor="middle" fontWeight="bold">9V</text></svg>
      );
    case 'psu':
      return (
        <svg viewBox="0 0 40 40"><rect x="3" y="8" width="34" height="24" rx="3" fill="#cbd5e1" /><rect x="6" y="11" width="22" height="11" fill="#0f2417" /><text x="17" y="19.5" fontSize="7" fill="#4ade80" textAnchor="middle" fontFamily="monospace">5.0V</text><circle cx="12" cy="27" r="2.5" fill="#dc2626" /><circle cx="22" cy="27" r="2.5" fill="#1f2937" /></svg>
      );
    default:
      return null;
  }
}

export default function Toolbox({ onAdd }) {
  return (
    <aside className="panel toolbox">
      <h2>부품 도구 상자</h2>
      <p className="hint">작업 영역으로 끌어다 놓거나 클릭해서 추가하세요.</p>
      <ul>
        {TOOLBOX_ORDER.map((type) => (
          <li key={type}>
            <button
              type="button"
              className="tool-item"
              draggable
              onDragStart={(e) => { e.dataTransfer.setData('application/x-part', type); e.dataTransfer.effectAllowed = 'copy'; }}
              onClick={() => onAdd(type)}
              title={`${PART_DEFS[type].name} 추가`}
            >
              <span className="tool-icon"><Icon type={type} /></span>
              <span className="tool-text">
                <b>{PART_DEFS[type].name}</b>
                <small>{PART_DEFS[type].desc}</small>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="help">
        <h3>사용 방법</h3>
        <ul>
          <li><b>전선</b>: 구멍이나 단자에서 다른 구멍으로 드래그 (또는 두 번 클릭)</li>
          <li><b>이동</b>: 부품 몸체를 드래그</li>
          <li><b>버튼</b>: 빨간 캡을 누르고 있으면 연결</li>
          <li><b>스위치</b>: 레버 클릭으로 ON/OFF</li>
          <li><b>R</b> 회전 · <b>Delete</b> 삭제 · <b>Esc</b> 취소</li>
          <li>전선 선택 후 흰 끝점을 끌어 다시 연결</li>
        </ul>
      </div>
    </aside>
  );
}
