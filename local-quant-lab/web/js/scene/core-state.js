// The research core's state, derived only from the persisted job list (/api/jobs via the pulse). Pure: shared by the
// HUD and the 3D core, unit-tested in node. Nothing here invents progress: a running job without a measurable
// progress counter says so.
export const CORE_STATES = ["IDLE", "QUEUED", "RUNNING", "SUCCEEDED", "FAILED"];
export const RECENT_MS = 12_000;          // a terminal event stays on the core this long after it happened

export function progressText(job) {
  const p = job && job.progress;
  if (!p || !Number.isFinite(p.total) || p.total <= 0) return "PROGRESS NOT MEASURED";
  return `${p.done}/${p.total} ${p.unit}`;
}

/** jobs: newest first (as /api/jobs returns them). now: ms epoch. */
export function coreState(jobs = [], now = Date.now()) {
  const running = jobs.find((j) => j.status === "running");
  const queued = jobs.filter((j) => j.status === "queued");
  if (running) {
    return { state: "RUNNING", job: running, queued: queued.length,
      line: `${running.id} ${running.kind} · ${running.stage || "started"} · ${progressText(running)}` };
  }
  if (queued.length) {
    const q = queued[queued.length - 1];     // the oldest queued job runs next
    return { state: "QUEUED", job: q, queued: queued.length, line: `${q.id} ${q.kind} waits · ${queued.length} queued · ${q.stage || ""}`.trim() };
  }
  const last = jobs.find((j) => j.status === "succeeded" || j.status === "failed");
  const t = last && Date.parse(last.finished_at || "");
  if (last && Number.isFinite(t) && now - t < RECENT_MS) {
    if (last.status === "succeeded") {
      const a = (last.artifacts || [])[0];
      return { state: "SUCCEEDED", job: last, queued: 0, line: `${last.id} ${last.kind} succeeded${a ? ` · artifact ${a.kind} ${a.id}` : ""}`, artifact: a || null };
    }
    return { state: "FAILED", job: last, queued: 0, line: `${last.id} ${last.kind} failed · ${(last.error || "").slice(0, 120)}` };
  }
  return { state: "IDLE", job: null, queued: 0, line: "NO ACTIVE JOBS" };
}
