// HTTP client for the localhost server. Every request has a timeout; failures flip the connection state so the UI
// never shows a disconnected server as healthy.
const listeners = new Set();
export const conn = { up: null, since: Date.now(), lastError: "" };
function setUp(up, err = "") {
  if (conn.up !== up) { conn.up = up; conn.since = Date.now(); conn.lastError = err; listeners.forEach((f) => f(conn)); }
  else conn.lastError = err;
}
export const onConn = (f) => listeners.add(f);

export async function api(path, body, { timeout = 15000 } = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  const opt = body !== undefined
    ? { method: "POST", headers: { "Content-Type": "application/json", "X-LQL-Request": "1" }, body: JSON.stringify(body), signal: ctl.signal }
    : { signal: ctl.signal };
  let r;
  try {
    r = await fetch(path, opt);
  } catch (e) {
    setUp(false, e.name === "AbortError" ? "request timed out" : "server unreachable");
    throw new Error(e.name === "AbortError" ? `timed out after ${timeout / 1000}s` : "server unreachable");
  } finally {
    clearTimeout(timer);
  }
  setUp(true);
  let j = null;
  try { j = await r.json(); } catch { j = null; }
  if (!r.ok) throw new Error((j && j.error) || r.statusText);
  return j;
}
