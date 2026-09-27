export function pct(v) {
  if (v == null) return '–';
  const x = v * 100;
  if (x === 0) return '0%';
  if (x >= 10) return `${x.toFixed(1)}%`;
  if (x >= 0.1) return `${x.toFixed(2)}%`;
  return `${x.toFixed(3)}%`;
}
export const int = (n) => n.toLocaleString('en-US');
