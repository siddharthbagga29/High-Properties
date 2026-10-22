// Pure helpers for the research charts. Every function works on persisted result arrays (experiment series,
// monthly returns, Monte Carlo artifacts); nothing here invents or smooths data. Unit-tested in web/tests.
export const DAYS = 252;

/** Daily simple returns of an equity curve (skips non-positive bases). */
export function returns(equity) {
  const out = [];
  for (let i = 1; i < equity.length; i++) if (equity[i - 1] > 0) out.push(equity[i] / equity[i - 1] - 1);
  return out;
}

/** Rolling statistic over a window of daily returns; null until the window is full. */
export function rolling(rets, window, fn) {
  return rets.map((_, i) => (i + 1 < window ? null : fn(rets.slice(i + 1 - window, i + 1))));
}
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1)); };
/** Annualised rolling volatility (sample std x sqrt(252)). */
export const rollingVol = (rets, w) => rolling(rets, w, (x) => sd(x) * Math.sqrt(DAYS));
/** Annualised rolling Sharpe (rf = 0); null where volatility is zero. */
export const rollingSharpe = (rets, w) => rolling(rets, w, (x) => { const s = sd(x); return s > 0 ? (mean(x) / s) * Math.sqrt(DAYS) : null; });

/** Equal-width histogram: { lo, width, counts }. */
export function histogram(values, bins = 30) {
  const v = values.filter((x) => Number.isFinite(x));
  if (!v.length) return { lo: 0, width: 1, counts: [] };
  const lo = Math.min(...v), hi = Math.max(...v), width = (hi - lo) / bins || 1;
  const counts = new Array(bins).fill(0);
  for (const x of v) counts[Math.min(bins - 1, Math.floor((x - lo) / width))]++;
  return { lo, width, counts };
}

/** Monthly returns {"YYYY-MM": r} to a year x month grid (null where the month has no data). */
export function monthlyGrid(monthly) {
  const years = [...new Set(Object.keys(monthly || {}).map((k) => k.slice(0, 4)))].sort();
  return { years, rows: years.map((y) => Array.from({ length: 12 }, (_, m) => { const k = `${y}-${String(m + 1).padStart(2, "0")}`; return k in monthly ? monthly[k] : null; })) };
}

/** Parameter grid [{fast, slow, sharpe}] to a matrix keyed by sorted unique fast (rows) and slow (columns). */
export function paramMatrix(grid, a = "fast", b = "slow", v = "sharpe") {
  const ra = [...new Set(grid.map((g) => g[a]))].sort((x, y) => x - y), cb = [...new Set(grid.map((g) => g[b]))].sort((x, y) => x - y);
  const cell = new Map(grid.map((g) => [`${g[a]}|${g[b]}`, g[v]]));
  return { rows: ra, cols: cb, values: ra.map((x) => cb.map((y) => (cell.has(`${x}|${y}`) ? cell.get(`${x}|${y}`) : null))) };
}

/** Diverging colour for a value in [-lim, lim]: negative rose, positive green, zero neutral; null is empty. */
export function diverging(v, lim) {
  if (v == null || !Number.isFinite(v)) return "transparent";
  const t = Math.max(-1, Math.min(1, v / (lim || 1)));
  const a = (0.15 + 0.75 * Math.abs(t)).toFixed(3);
  return t >= 0 ? `rgba(62, 230, 160, ${a})` : `rgba(255, 93, 115, ${a})`;
}

/** Normalise an equity curve to start at 1 (for comparison with Monte Carlo paths). */
export const normalise = (eq) => (eq.length && eq[0] > 0 ? eq.map((x) => x / eq[0]) : []);
