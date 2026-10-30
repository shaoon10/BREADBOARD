export const BAND_COLORS = [
  { name: '검정', hex: '#1c1917' },
  { name: '갈색', hex: '#7c3f12' },
  { name: '빨강', hex: '#dc2626' },
  { name: '주황', hex: '#f97316' },
  { name: '노랑', hex: '#facc15' },
  { name: '초록', hex: '#16a34a' },
  { name: '파랑', hex: '#2563eb' },
  { name: '보라', hex: '#7c3aed' },
  { name: '회색', hex: '#6b7280' },
  { name: '흰색', hex: '#f5f5f4' },
];
const GOLD = { name: '금색', hex: '#c9a227' };
const SILVER = { name: '은색', hex: '#a8a29e' };

// 4색띠 저항: [첫째 자리, 둘째 자리, 승수, 오차(금색 ±5%)]
export function resistorBands(ohms) {
  let exp = Math.floor(Math.log10(ohms)) - 1;
  let digits = Math.round(ohms / 10 ** exp);
  if (digits >= 100) { digits = Math.round(digits / 10); exp += 1; }
  const d1 = Math.floor(digits / 10);
  const d2 = digits % 10;
  let mult;
  if (exp === -1) mult = GOLD;
  else if (exp === -2) mult = SILVER;
  else mult = BAND_COLORS[Math.min(Math.max(exp, 0), 9)];
  return [BAND_COLORS[d1], BAND_COLORS[d2], mult, GOLD];
}

const PREFIXES = [
  [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'],
];

export function formatSI(value, unit, digits = 3) {
  if (value == null || !Number.isFinite(value)) return '—';
  if (value === 0) return `0 ${unit}`;
  const abs = Math.abs(value);
  for (const [scale, prefix] of PREFIXES) {
    if (abs >= scale * 0.9995) {
      return `${parseFloat((value / scale).toPrecision(digits))} ${prefix}${unit}`;
    }
  }
  return `≈0 ${unit}`;
}

export const formatOhms = (ohms) => formatSI(ohms, 'Ω');
