window.PE_STATE = {
 "generated": "2026-10-10T12:51:42Z",
 "project": "Perspective Engine",
 "north_star": "A perspective-taking simulator, to be co-designed with paid ADHD advisors and tested in a pre-registered pilot, with 3 paid B2B pilots and a published pilot study by month 12.",
 "agents": {
  "orchestrator": {
   "name": "Mayor",
   "district": "City Hall",
   "role": "Runs the graph, assigns ready nodes, writes the plan. Never does domain work."
  },
  "science": {
   "name": "Curie",
   "district": "Research Lab",
   "role": "Evidence, mechanism model, study protocol, papers."
  },
  "ethics": {
   "name": "Milton",
   "district": "Commons",
   "role": "Neurodivergent co-design, consent, harm review, IRB packet."
  },
  "product": {
   "name": "Ada",
   "district": "Workshop",
   "role": "Browser MVP, WebXR build, facilitator tooling."
  },
  "data": {
   "name": "Tukey",
   "district": "Observatory",
   "role": "Instruments, analytics, buyer ROI dashboard."
  },
  "gtm": {
   "name": "Ogilvy",
   "district": "Harbor",
   "role": "ICP, target lists, LOIs, outreach drafts, pilot playbook."
  },
  "finance": {
   "name": "Pacioli",
   "district": "Bank",
   "role": "Bottom-up model, grants, raise materials."
  },
  "legal": {
   "name": "Ginsburg",
   "district": "Courthouse",
   "role": "Privacy, data map, entity and IP checklists."
  },
  "brand": {
   "name": "Rams",
   "district": "Tower",
   "role": "Positioning, landing page, case studies."
  }
 },
 "nodes": [
  {
   "id": "F01",
   "phase": 0,
   "agent": "orchestrator",
   "title": "Agent graph, role cards and ledger",
   "deps": [],
   "outputs": [
    "perspective-engine/graph/graph.json",
    "perspective-engine/tools/graph.py"
   ],
   "accept": [
    "graph validates as a DAG",
    "every node has an agent and outputs"
   ],
   "gate": null,
   "budget_k": 0,
   "status": "done",
   "view": "done"
  },
  {
   "id": "F02",
   "phase": 0,
   "agent": "orchestrator",
   "title": "City dashboard",
   "deps": [
    "F01"
   ],
   "outputs": [
    "perspective-engine/dashboard/index.html"
   ],
   "accept": [
    "renders from state.js with no server"
   ],
   "gate": null,
   "budget_k": 0,
   "status": "done",
   "view": "done"
  },
  {
   "id": "F03",
   "phase": 0,
   "agent": "science",
   "title": "Evidence dossier: verify the memo's claims",
   "deps": [
    "F01"
   ],
   "outputs": [
    "perspective-engine/research/evidence-dossier.md"
   ],
   "accept": [
    "every claim rated Supported/Weak/Refuted/Unverified",
    "each finding has a URL"
   ],
   "gate": null,
   "budget_k": 60,
   "status": "done",
   "run": {
    "used_k": 93.2,
    "duration_s": 82,
    "tools": 21
   },
   "view": "done"
  },
  {
   "id": "F04",
   "phase": 0,
   "agent": "product",
   "title": "Browser MVP v0: attention-load simulator",
   "deps": [
    "F01",
    "V01",
    "F06",
    "V02"
   ],
   "outputs": [
    "perspective-engine/mvp/index.html",
    "perspective-engine/mvp/README.md"
   ],
   "accept": [
    "baseline vs load conditions on the same task",
    "mechanisms M1-M4 from the mechanism spec, each tunable, M5 off by default",
    "mandatory debrief per the co-design charter",
    "no flashing above 3 Hz; reduced-motion respected; Stop always visible",
    "JSON export of the day-0 measures from the instruments spec; no network calls"
   ],
   "gate": null,
   "budget_k": 80,
   "status": "running",
   "view": "running"
  },
  {
   "id": "F05",
   "phase": 0,
   "agent": "orchestrator",
   "title": "Execution plan v1",
   "deps": [
    "F03"
   ],
   "outputs": [
    "perspective-engine/docs/execution-plan.md"
   ],
   "accept": [
    "revised kill criteria",
    "12-month milestones mapped to node ids"
   ],
   "gate": null,
   "budget_k": 20,
   "status": "done",
   "view": "done"
  },
  {
   "id": "F07",
   "phase": 0,
   "agent": "orchestrator",
   "title": "Immersive 3D city: semantic zoom from venture to records",
   "deps": [
    "F02"
   ],
   "outputs": [
    "perspective-engine/city/src/App.tsx",
    "perspective-engine/city/PLAN.md"
   ],
   "accept": [
    "four semantic levels with dive and breadcrumb",
    "live data from the graph export, nothing simulated",
    "DOM mirror, reduced motion and no-WebGL fallbacks"
   ],
   "gate": null,
   "budget_k": 0,
   "status": "done",
   "view": "done"
  },
  {
   "id": "F06",
   "phase": 0,
   "agent": "ethics",
   "title": "Co-design charter",
   "deps": [
    "F03"
   ],
   "outputs": [
    "perspective-engine/ethics/codesign-charter.md"
   ],
   "accept": [
    "paid ND advisors with veto on content",
    "debrief and harm rules",
    "claims we will never make"
   ],
   "gate": null,
   "budget_k": 15,
   "status": "done",
   "run": {
    "used_k": 74.7,
    "duration_s": 97,
    "tools": 6
   },
   "view": "done"
  },
  {
   "id": "D01",
   "phase": 1,
   "agent": "orchestrator",
   "title": "Founder decisions: country, ownership, budgets, accounts",
   "deps": [
    "V10",
    "V11"
   ],
   "outputs": [
    "perspective-engine/docs/founder-decisions.md"
   ],
   "accept": [
    "each decision has options, a recommendation and the nodes it blocks"
   ],
   "gate": {
    "type": "human",
    "reason": "Only the founder can answer: country/ownership (decides US grant eligibility), advisor budget, effect size, facilitator."
   },
   "budget_k": 5,
   "status": "awaiting_human",
   "view": "awaiting_human"
  },
  {
   "id": "V01",
   "phase": 1,
   "agent": "science",
   "title": "Mechanism spec: what we model and why",
   "deps": [
    "F03"
   ],
   "outputs": [
    "perspective-engine/science/mechanism-spec.md"
   ],
   "accept": [
    "each mechanism cites evidence",
    "parameter ranges stated",
    "explicit list of what is NOT modeled"
   ],
   "gate": null,
   "budget_k": 25,
   "status": "done",
   "run": {
    "used_k": 84.1,
    "duration_s": 145,
    "tools": 12
   },
   "view": "done"
  },
  {
   "id": "V02",
   "phase": 1,
   "agent": "data",
   "title": "Measurement instruments and study design",
   "deps": [
    "V01"
   ],
   "outputs": [
    "perspective-engine/data/instruments.md"
   ],
   "accept": [
    "validated scales named with citations",
    "pre / post / 30-day behavioral follow-up",
    "primary outcome is behavior, not mood"
   ],
   "gate": null,
   "budget_k": 20,
   "status": "done",
   "run": {
    "used_k": 116.7,
    "duration_s": 217,
    "tools": 29
   },
   "view": "done"
  },
  {
   "id": "V03",
   "phase": 1,
   "agent": "science",
   "title": "Pre-registration draft",
   "deps": [
    "V01",
    "V02"
   ],
   "outputs": [
    "perspective-engine/science/preregistration.md"
   ],
   "accept": [
    "hypotheses, power analysis, analysis plan"
   ],
   "gate": {
    "type": "account",
    "reason": "Posting to OSF needs the founder's OSF account."
   },
   "budget_k": 20,
   "status": "awaiting_human",
   "run": {
    "used_k": 103.1,
    "duration_s": 226,
    "tools": 11
   },
   "view": "awaiting_human"
  },
  {
   "id": "V04",
   "phase": 1,
   "agent": "ethics",
   "title": "Advisory board recruitment plan",
   "deps": [
    "F06"
   ],
   "outputs": [
    "perspective-engine/ethics/advisory-board.md"
   ],
   "accept": [
    "compensation rate",
    "recruitment channels",
    "session script"
   ],
   "gate": null,
   "budget_k": 12,
   "status": "done",
   "run": {
    "used_k": 81.2,
    "duration_s": 125,
    "tools": 10
   },
   "view": "done"
  },
  {
   "id": "V05",
   "phase": 1,
   "agent": "gtm",
   "title": "ICP and buyer map",
   "deps": [
    "F03"
   ],
   "outputs": [
    "perspective-engine/gtm/icp.md"
   ],
   "accept": [
    "budget owner per segment",
    "post-DEI-cut framing",
    "top 3 segments ranked"
   ],
   "gate": null,
   "budget_k": 15,
   "status": "running",
   "run": {
    "used_k": 73.4,
    "duration_s": 83,
    "tools": 6
   },
   "view": "running"
  },
  {
   "id": "V06",
   "phase": 1,
   "agent": "gtm",
   "title": "LOI template and pilot offer",
   "deps": [
    "V05",
    "F05"
   ],
   "outputs": [
    "perspective-engine/gtm/loi-template.md"
   ],
   "accept": [
    "non-binding",
    "success metric agreed upfront",
    "price anchor"
   ],
   "gate": null,
   "budget_k": 8,
   "status": "running",
   "run": {
    "used_k": 74.4,
    "duration_s": 67,
    "tools": 5
   },
   "view": "running"
  },
  {
   "id": "V07",
   "phase": 1,
   "agent": "gtm",
   "title": "Target list: 50 accounts from public sources",
   "deps": [
    "V05"
   ],
   "outputs": [
    "perspective-engine/gtm/targets.csv"
   ],
   "accept": [
    "company, segment, public neurodiversity signal, source URL",
    "no personal emails scraped"
   ],
   "gate": null,
   "budget_k": 25,
   "status": "running",
   "run": {
    "used_k": 102.5,
    "duration_s": 180,
    "tools": 24
   },
   "view": "running"
  },
  {
   "id": "V08",
   "phase": 1,
   "agent": "gtm",
   "title": "Outreach sequence drafts",
   "deps": [
    "V06",
    "V07"
   ],
   "outputs": [
    "perspective-engine/gtm/outreach.md"
   ],
   "accept": [
    "3-touch sequence per segment",
    "each under 120 words"
   ],
   "gate": null,
   "budget_k": 8,
   "status": "running",
   "run": {
    "used_k": 82.7,
    "duration_s": 107,
    "tools": 7
   },
   "view": "running"
  },
  {
   "id": "V09",
   "phase": 1,
   "agent": "gtm",
   "title": "Send outreach",
   "deps": [
    "V08"
   ],
   "outputs": [
    "perspective-engine/gtm/outreach-log.md"
   ],
   "accept": [
    "log of sends and replies"
   ],
   "gate": {
    "type": "account",
    "reason": "Sending email uses the founder's Gmail; needs authorization and approval of each batch."
   },
   "budget_k": 10,
   "status": "running",
   "view": "running"
  },
  {
   "id": "V10",
   "phase": 1,
   "agent": "finance",
   "title": "Bottom-up financial model",
   "deps": [
    "F03",
    "V05"
   ],
   "outputs": [
    "perspective-engine/finance/model.py",
    "perspective-engine/finance/model.md"
   ],
   "accept": [
    "runs with python3 stdlib",
    "Monte Carlo with stated input ranges",
    "P10/P50/P90 ARR"
   ],
   "gate": null,
   "budget_k": 25,
   "status": "done",
   "run": {
    "used_k": 108.6,
    "duration_s": 286,
    "tools": 12
   },
   "view": "done"
  },
  {
   "id": "V11",
   "phase": 1,
   "agent": "finance",
   "title": "Non-dilutive funding map",
   "deps": [
    "F03"
   ],
   "outputs": [
    "perspective-engine/finance/grants.md"
   ],
   "accept": [
    "program, amount, deadline, fit, source URL"
   ],
   "gate": null,
   "budget_k": 15,
   "status": "done",
   "run": {
    "used_k": 131.8,
    "duration_s": 271,
    "tools": 39
   },
   "view": "done"
  },
  {
   "id": "V12",
   "phase": 1,
   "agent": "legal",
   "title": "Privacy-by-design data map",
   "deps": [
    "F04"
   ],
   "outputs": [
    "perspective-engine/legal/privacy.md"
   ],
   "accept": [
    "no biometrics stored in v0",
    "GDPR/HIPAA applicability stated"
   ],
   "gate": null,
   "budget_k": 10,
   "status": "done",
   "view": "done"
  },
  {
   "id": "V13",
   "phase": 1,
   "agent": "brand",
   "title": "Positioning and landing page",
   "deps": [
    "V05",
    "F06"
   ],
   "outputs": [
    "perspective-engine/brand/landing/index.html"
   ],
   "accept": [
    "no claim to 'simulate ADHD'",
    "pilot sign-up CTA"
   ],
   "gate": null,
   "budget_k": 20,
   "status": "running",
   "run": {
    "used_k": 100.4,
    "duration_s": 206,
    "tools": 11
   },
   "view": "running"
  },
  {
   "id": "V14",
   "phase": 1,
   "agent": "product",
   "title": "MVP v0.2 from advisory feedback",
   "deps": [
    "F04",
    "V04",
    "V01",
    "D01"
   ],
   "outputs": [
    "perspective-engine/mvp/CHANGELOG.md"
   ],
   "accept": [
    "every change traces to an advisor note"
   ],
   "gate": {
    "type": "human",
    "reason": "Needs real feedback sessions with paid ND advisors."
   },
   "budget_k": 40,
   "status": "running",
   "view": "running"
  },
  {
   "id": "V15",
   "phase": 1,
   "agent": "science",
   "title": "University partner shortlist and brief",
   "deps": [
    "V01"
   ],
   "outputs": [
    "perspective-engine/science/partners.md"
   ],
   "accept": [
    "10 labs with published relevant work and URLs",
    "1-page collaboration brief"
   ],
   "gate": null,
   "budget_k": 20,
   "status": "done",
   "run": {
    "used_k": 122.2,
    "duration_s": null,
    "tools": 28
   },
   "view": "done"
  },
  {
   "id": "M01",
   "phase": 2,
   "agent": "product",
   "title": "WebXR v1 on Quest browser",
   "deps": [
    "V14"
   ],
   "outputs": [
    "perspective-engine/mvp/xr/index.html"
   ],
   "accept": [
    "72 fps on Quest 3",
    "same task and metrics as v0"
   ],
   "gate": null,
   "budget_k": 80,
   "status": "pending",
   "view": "pending"
  },
  {
   "id": "M02",
   "phase": 2,
   "agent": "data",
   "title": "Buyer ROI dashboard",
   "deps": [
    "V02",
    "M01"
   ],
   "outputs": [
    "perspective-engine/data/roi-dashboard/index.html"
   ],
   "accept": [
    "aggregate only, n>=10 suppression"
   ],
   "gate": null,
   "budget_k": 30,
   "status": "pending",
   "view": "pending"
  },
  {
   "id": "M03",
   "phase": 2,
   "agent": "ethics",
   "title": "Pilot study protocol and IRB packet (80-150 managers)",
   "deps": [
    "V03",
    "V04",
    "V15"
   ],
   "outputs": [
    "perspective-engine/ethics/irb-packet.md"
   ],
   "accept": [
    "consent form",
    "debrief",
    "adverse-event handling"
   ],
   "gate": {
    "type": "human",
    "reason": "IRB submission goes through a university partner."
   },
   "budget_k": 25,
   "status": "awaiting_human",
   "view": "awaiting_human"
  },
  {
   "id": "M04",
   "phase": 2,
   "agent": "legal",
   "title": "Entity formation and IP assignment checklist",
   "deps": [
    "V12",
    "D01"
   ],
   "outputs": [
    "perspective-engine/legal/entity-checklist.md"
   ],
   "accept": [
    "jurisdiction options compared",
    "IP assignment template"
   ],
   "gate": {
    "type": "account",
    "reason": "Incorporation needs founder identity and payment."
   },
   "budget_k": 10,
   "status": "awaiting_human",
   "view": "awaiting_human"
  },
  {
   "id": "M05",
   "phase": 2,
   "agent": "finance",
   "title": "SBIR Phase I application draft",
   "deps": [
    "V11",
    "M03",
    "D01"
   ],
   "outputs": [
    "perspective-engine/finance/sbir-draft.md"
   ],
   "accept": [
    "specific aims page",
    "budget justification"
   ],
   "gate": {
    "type": "account",
    "reason": "SAM.gov / eRA Commons registration in the founder's name."
   },
   "budget_k": 40,
   "status": "awaiting_human",
   "view": "awaiting_human"
  },
  {
   "id": "M06",
   "phase": 2,
   "agent": "gtm",
   "title": "Pilot playbook and facilitator guide",
   "deps": [
    "M01",
    "V02"
   ],
   "outputs": [
    "perspective-engine/gtm/pilot-playbook.md"
   ],
   "accept": [
    "60-min session agenda",
    "success metrics",
    "debrief script"
   ],
   "gate": null,
   "budget_k": 15,
   "status": "pending",
   "view": "pending"
  },
  {
   "id": "S01",
   "phase": 3,
   "agent": "gtm",
   "title": "Close 3 paid pilots",
   "deps": [
    "V09",
    "M06",
    "M04"
   ],
   "outputs": [
    "perspective-engine/gtm/pilots.md"
   ],
   "accept": [
    "3 signed pilot agreements"
   ],
   "gate": {
    "type": "human",
    "reason": "Contracts are signed by the founder."
   },
   "budget_k": 20,
   "status": "pending",
   "view": "pending"
  },
  {
   "id": "S02",
   "phase": 3,
   "agent": "data",
   "title": "Pilot results report",
   "deps": [
    "S01",
    "M02"
   ],
   "outputs": [
    "perspective-engine/data/pilot-report.md"
   ],
   "accept": [
    "pre-registered outcomes reported, including nulls"
   ],
   "gate": null,
   "budget_k": 25,
   "status": "pending",
   "view": "pending"
  },
  {
   "id": "S03",
   "phase": 3,
   "agent": "science",
   "title": "Paper submission",
   "deps": [
    "S02",
    "M03"
   ],
   "outputs": [
    "perspective-engine/science/paper.md"
   ],
   "accept": [
    "co-authored with ND advisors and lab partner"
   ],
   "gate": {
    "type": "human",
    "reason": "Journal submission by named authors."
   },
   "budget_k": 60,
   "status": "pending",
   "view": "pending"
  },
  {
   "id": "S04",
   "phase": 3,
   "agent": "finance",
   "title": "Seed raise materials",
   "deps": [
    "S02",
    "V10"
   ],
   "outputs": [
    "perspective-engine/finance/seed-memo.md"
   ],
   "accept": [
    "numbers trace to pilot data and model"
   ],
   "gate": null,
   "budget_k": 30,
   "status": "pending",
   "view": "pending"
  },
  {
   "id": "S05",
   "phase": 3,
   "agent": "brand",
   "title": "Pilot case studies",
   "deps": [
    "S02"
   ],
   "outputs": [
    "perspective-engine/brand/case-studies.md"
   ],
   "accept": [
    "customer-approved quotes only"
   ],
   "gate": {
    "type": "human",
    "reason": "Customer sign-off on quotes."
   },
   "budget_k": 15,
   "status": "pending",
   "view": "pending"
  }
 ],
 "ledger": [
  {
   "t": "2026-10-06T12:59:17Z",
   "event": "done",
   "node": "V06",
   "note": "Non-binding LOI; day-30 verified outcome w/ CI incl. nulls; price anchor left as hypothesis blank"
  },
  {
   "t": "2026-10-06T12:59:17Z",
   "event": "start",
   "node": "V08",
   "note": ""
  },
  {
   "t": "2026-10-06T13:01:18Z",
   "event": "done",
   "node": "V08",
   "note": "9 emails (3x3), max 104 words worst case; US-only until counsel; nothing sent"
  },
  {
   "t": "2026-10-06T13:51:33Z",
   "event": "start",
   "node": "F07",
   "note": ""
  },
  {
   "t": "2026-10-06T13:51:33Z",
   "event": "done",
   "node": "F07",
   "note": "3D cortex-to-city with semantic zoom, guide, replay, deep links; a11y/BP/SEO 100"
  },
  {
   "t": "2026-10-06T19:07:55Z",
   "event": "unblock",
   "node": "F04",
   "note": "Founder asked for real building; re-queued"
  },
  {
   "t": "2026-10-06T19:09:04Z",
   "event": "start",
   "node": "F04",
   "note": ""
  },
  {
   "t": "2026-10-06T19:17:52Z",
   "event": "start",
   "node": "V09",
   "note": "Ogilvy preparing outreach batch 1 (not sending)"
  },
  {
   "t": "2026-10-06T19:17:52Z",
   "event": "start",
   "node": "M03",
   "note": "Milton preparing the IRB packet"
  },
  {
   "t": "2026-10-06T19:19:31Z",
   "event": "done",
   "node": "V09",
   "note": "Batch B1 prepared, NOT sent: 10 US accounts x 3 touches, signals re-checked, empty send/reply log; awaits founder Gmail OK"
  },
  {
   "t": "2026-10-07T00:39:52Z",
   "event": "block",
   "node": "M03",
   "note": "Failed verification twice: says the Nario-Redmond 2017 abstract omits pity (it reports pity in Exp. 2); summary overstates the strengths slot D4; WCAG 2.3.1 citation unmarked"
  },
  {
   "t": "2026-10-07T00:39:52Z",
   "event": "unblock",
   "node": "M03",
   "note": "Founder asked to retry: round 3 fixes only the three named gaps"
  },
  {
   "t": "2026-10-07T00:40:43Z",
   "event": "start",
   "node": "M03",
   "note": ""
  },
  {
   "t": "2026-10-07T01:03:04Z",
   "event": "done",
   "node": "M03",
   "note": "IRB packet v0.3 verified: consent, debrief, AE handling present; Nario-Redmond and WCAG 2.3.1 citations confirmed; nothing sent"
  },
  {
   "t": "2026-10-07T06:50:10Z",
   "event": "start",
   "node": "M05",
   "note": ""
  },
  {
   "t": "2026-10-07T11:42:02Z",
   "event": "block",
   "node": "M05",
   "note": "Build interrupted by the usage limit at about 07:20 UTC with a partial draft on disk; rebuild queued after the current verification wave"
  },
  {
   "t": "2026-10-07T18:50:26Z",
   "event": "block",
   "node": "F04",
   "note": "Verification round 2 failed on two gaps: index.html top summary is 173 words (cap 150); exported step events keep timestamps that reveal the wait choice and time and the send reaction time"
  },
  {
   "t": "2026-10-07T18:50:26Z",
   "event": "unblock",
   "node": "F04",
   "note": "Founder asked to complete the loop: round 3 limited to the two named gaps"
  },
  {
   "t": "2026-10-07T18:50:26Z",
   "event": "unblock",
   "node": "M05",
   "note": "Usage limit cleared; rebuilding from the partial draft"
  },
  {
   "t": "2026-10-07T18:51:10Z",
   "event": "start",
   "node": "F04",
   "note": ""
  },
  {
   "t": "2026-10-07T18:51:12Z",
   "event": "start",
   "node": "M05",
   "note": ""
  },
  {
   "t": "2026-10-07T19:07:48Z",
   "event": "done",
   "node": "M05",
   "note": "SBIR draft v0.2 verified: aims page, line-by-line budget justification, arithmetic and Monte Carlo reproduce; caps and eligibility checked"
  },
  {
   "t": "2026-10-07T19:09:16Z",
   "event": "block",
   "node": "F04",
   "note": "Verification round 3: both named gaps fixed, but Stop is not visible when the facilitator panel is open and scrolled (phone during a live run; desktop on intro, brief2, compare)"
  },
  {
   "t": "2026-10-07T19:09:16Z",
   "event": "unblock",
   "node": "F04",
   "note": "Round 4 limited to the Stop-visibility gap (a hard safety rule)"
  },
  {
   "t": "2026-10-07T19:09:42Z",
   "event": "start",
   "node": "F04",
   "note": ""
  },
  {
   "t": "2026-10-07T19:22:35Z",
   "event": "done",
   "node": "F04",
   "note": "Verified: sticky panel Stop hit-testable at 360-1920 px, all scrolls; selftest 59/59; 0 errors/requests; export, debrief, motion hold"
  },
  {
   "t": "2026-10-07T19:22:53Z",
   "event": "start",
   "node": "V12",
   "note": ""
  },
  {
   "t": "2026-10-07T19:25:34Z",
   "event": "start",
   "node": "V14",
   "note": ""
  },
  {
   "t": "2026-10-07T19:35:03Z",
   "event": "done",
   "node": "V14",
   "note": "Advisor review kit + empty CHANGELOG verified: 0 sessions, 0 changes, note-ID entry format; MVP unchanged; awaits paid ND sessions"
  },
  {
   "t": "2026-10-07T19:35:32Z",
   "event": "done",
   "node": "V12",
   "note": "Verified: no biometrics (code + 4 real exports), GDPR/UK GDPR/HIPAA/FERPA stated; 0 requests, 0 storage, 59/59 selftest"
  },
  {
   "t": "2026-10-07T19:36:30Z",
   "event": "start",
   "node": "M04",
   "note": ""
  },
  {
   "t": "2026-10-07T19:47:07Z",
   "event": "done",
   "node": "M04",
   "note": "Entity checklist: DE C-corp/LLC/India-UK compared, SBIR >50% rule, 22-step gated checklist, founder IP assignment + no-equity clause"
  },
  {
   "t": "2026-10-10T12:50:20Z",
   "event": "reopen",
   "node": "V05",
   "note": "re-verify under the current gate: outputs changed during audit rework rounds 1-2 (AF-orchestrator-39, -40)"
  },
  {
   "t": "2026-10-10T12:50:21Z",
   "event": "reopen",
   "node": "V06",
   "note": "re-verify under the current gate: outputs changed during audit rework rounds 1-2 (AF-orchestrator-39, -40)"
  },
  {
   "t": "2026-10-10T12:50:21Z",
   "event": "reopen",
   "node": "V07",
   "note": "re-verify under the current gate: outputs changed during audit rework rounds 1-2 (AF-orchestrator-39, -40)"
  },
  {
   "t": "2026-10-10T12:50:21Z",
   "event": "reopen",
   "node": "V08",
   "note": "re-verify under the current gate: outputs changed during audit rework rounds 1-2 (AF-orchestrator-39, -40)"
  },
  {
   "t": "2026-10-10T12:50:22Z",
   "event": "reopen",
   "node": "V09",
   "note": "re-verify under the current gate: outputs changed during audit rework rounds 1-2 (AF-orchestrator-39, -40)"
  },
  {
   "t": "2026-10-10T12:50:22Z",
   "event": "reopen",
   "node": "V13",
   "note": "re-verify under the current gate: outputs changed during audit rework rounds 1-2 (AF-orchestrator-39, -40)"
  },
  {
   "t": "2026-10-10T12:50:23Z",
   "event": "reopen",
   "node": "F04",
   "note": "re-verify under the current gate: outputs changed during audit rework rounds 1-2 (AF-orchestrator-39, -40)"
  },
  {
   "t": "2026-10-10T12:50:23Z",
   "event": "reopen",
   "node": "V14",
   "note": "re-verify under the current gate: outputs changed during audit rework rounds 1-2 (AF-orchestrator-39, -40)"
  }
 ],
 "revenue": [],
 "founderKey": {
  "registered": false,
  "fingerprint": null,
  "registeredAt": null,
  "rotations": 0,
  "problems": []
 },
 "audit": {
  "computedAt": "2026-10-10T12:51:41Z",
  "rubricVersion": "1.0",
  "scorecards": [
   {
    "agent": "orchestrator",
    "name": "Mayor",
    "score": 58.0,
    "grade": "F",
    "meetsInstitutionalBar": false,
    "dimensions": [
     {
      "id": "first_pass_yield",
      "label": "First-pass yield",
      "weight": 20,
      "score": 33.3,
      "basis": "1/3 verified tasks passed first time (F07); needed rework, a block or a later correction: F05 (0 failed rounds, 0 blocks, 0 orchestrator corrections, 3 major or critical auditor findings), D01 (0 failed rounds, 0 blocks, 0 orchestrator corrections, 1 major or critical auditor findings)."
     },
     {
      "id": "effective_challenge",
      "label": "Verification outcome: rework and open gaps",
      "weight": 15,
      "score": 87.0,
      "basis": "0 failed verification rounds over 3 verified tasks (0.00 per task); 0 open FAIL/GAP rows after the last revision; 0 non-blocking notes left open. Findings: -13 from 3 open finding(s) and 6 fixed after the audit (a quarter weight each)."
     },
     {
      "id": "evidence",
      "label": "Evidence discipline",
      "weight": 15,
      "score": 71.8,
      "basis": "53/62 numeric claims (85%) in 4 output files are traceable: a source URL, file or task reference, citation, derivation or [S]/[U]/unverified/assumption/estimate/measured label on the line or table caption, or a restatement of such a figure; by task: F02 index.html 0/1, F05 execution-plan.md 33/36, F07 PLAN.md 1/6, D01 founder-decisions.md 19/19; untraced examples: F02: 0%; F05: d\u22480.33; F07: 160k. Score shrinks the s\u2026"
     },
     {
      "id": "integrity",
      "label": "Honesty and research integrity",
      "weight": 20,
      "score": 70.0,
      "basis": "Over 3 tasks in the ledger: 0 orchestrator corrections of a false claim; 3 self-verified completions (F05 F07 D01: closed by their builder with no verifier check before closing); 0 verifier FAIL/GAP rows naming a false statement."
     },
     {
      "id": "process",
      "label": "Process discipline and separation of duties",
      "weight": 15,
      "score": 0.0,
      "basis": "3 closed tasks in the ledger: step records on 3 (19 self-logged rows, 0 transcript rows); verifier rows on 3; a separate verifier run evidenced by its own ingested transcript on 0; separation only declared with the --verifier flag (identity not evidenced, 10 of 25): F05 F07 D01; verified only after closing (half credit): F05 F07 D01; graph-wide closure discipline (half of this score): 16/16 closures in the ledger ha\u2026"
     },
     {
      "id": "gates",
      "label": "Founder gates and safety controls",
      "weight": 5,
      "score": 100.0,
      "basis": "1 gated tasks worked on (D01); 0 marked done without the founder clearing the gate; 0 gate clearances without a recorded founder answer. Gated actions taken outside the record are left to LLM findings."
     },
     {
      "id": "budget",
      "label": "Budget adherence",
      "weight": 5,
      "score": 70.0,
      "basis": "No data: no task with both a token budget and a measured run. Scored neutral (70)."
     },
     {
      "id": "reliability",
      "label": "Reliability: interruptions and stalls",
      "weight": 5,
      "score": 100.0,
      "basis": "0 recorded interruptions (usage/session limits, failed pushes) over 3 tasks; 0 running tasks with no step in 15 min."
     }
    ],
    "findings": [
     {
      "id": "AF-orchestrator-18",
      "agent": "orchestrator",
      "task": "F01",
      "severity": "critical",
      "kind": "process",
      "claim": "tools/graph.py: deleting the founder-key line from the ledger made signing fail open (attested revenue then formed the face).",
      "evidence": "Independent re-review R3, proof D' on a temp copy. || FIXED by the orchestrator in commit d13d239 (2026-10-10); pending independent re-check. graph.py reads key registration from git history too and fails closed; the face never counts unsigned revenue.",
      "status": "fixed"
     },
     {
      "id": "AF-orchestrator-19",
      "agent": "orchestrator",
      "task": "F01",
      "severity": "critical",
      "kind": "process",
      "claim": "tools/graph.py and the export honoured an unsigned founder-key event appended to the ledger.",
      "evidence": "R3 proof B'. || FIXED by the orchestrator in commit d13d239 (2026-10-10); pending independent re-check. Only a key chain where each rotation is signed by the previous key comes into force.",
      "status": "fixed"
     },
     {
      "id": "AF-orchestrator-23",
      "agent": "orchestrator",
      "task": "F01",
      "severity": "critical",
      "kind": "process",
      "claim": "--verifier is a self-asserted flag: a builder can clear done alone, and the auditor gave full separation-of-duties credit.",
      "evidence": "R4 proof O6, A10. || PARTLY FIXED in d13d239: separation credit now needs an ingested verifier transcript (activity.py --verifier); a bare flag earns 10 of 25. The flag itself still cannot prove identity; residual risk documented.",
      "status": "open"
     },
     {
      "id": "AF-orchestrator-24",
      "agent": "orchestrator",
      "task": "F01",
      "severity": "critical",
      "kind": "process",
      "claim": "The auditor did not re-check the done gate: out-of-band closures and graph.json edits went unflagged.",
      "evidence": "R4 D1, D3, N5. || FIXED by the orchestrator in commit d13d239 (2026-10-10); pending independent re-check. The auditor replays the gate for new closures, flags statuses with no ledger event and outputs changed after closing.",
      "status": "fixed"
     },
     {
      "id": "AF-orchestrator-38",
      "agent": "orchestrator",
      "task": "F01",
      "severity": "critical",
      "kind": "process",
      "claim": "With no founder key registered, any agent could complete the Jarvis face with honour-system revenue.",
      "evidence": "Completeness critic. || FIXED by the orchestrator in commit d13d239 (2026-10-10); pending independent re-check. The face forms only from export-verified signed revenue, key or no key.",
      "status": "fixed"
     },
     {
      "id": "AF-orchestrator-1",
      "agent": "orchestrator",
      "task": "F05",
      "severity": "major",
      "kind": "process",
      "claim": "CLAUDE.md:7 \"A task is complete only when verified; say what verified it.\" and PROMPT.md:39 \"a node is marked done only by a separate verifier agent\", against graph/ledger.jsonl:27-28 (F05 start and done both 2026-10-06T12:57:56Z), :33-34 (F07 start and done \u2026",
      "evidence": "I replayed graph/activity/*.jsonl against the 26 nodes in done or awaiting_human. 19 have no verifier check entry at all: F01 F02 F03 F05 F06 F07 D01 V01 V02 V03 V04 V05 V06 V07 V08 V10 V11 V13 V15 (17 if the seeded F01/F02 are left out). Only F04, V09, V12, \u2026",
      "status": "fixed"
     },
     {
      "id": "AF-orchestrator-17",
      "agent": "orchestrator",
      "task": "F01",
      "severity": "major",
      "kind": "error",
      "claim": "docs/JARVIS_ARCHITECTURE.md:170 \"Once the founder's signing key is registered, no agent, routine or Jarvis itself can add a revenue entry that counts towards the face or passes the auditor without the founder's private key.\"; tools/graph.py:29-38 (docstring) \u2026",
      "evidence": "Found by the R2 verifier on 2026-10-10. graph.py trusts every founder-key event in graph/ledger.jsonl, a file any agent can append to. founder_keys() (:155) lists every such event, and founder_auth (:206) verifies against the last one. verified_auth_rows (:24\u2026",
      "status": "open"
     },
     {
      "id": "AF-orchestrator-2",
      "agent": "orchestrator",
      "task": "F01",
      "severity": "major",
      "kind": "process",
      "claim": "docs/JARVIS_ARCHITECTURE.md:113 \"Revenue entries (which complete the face) can be written only by the founder through `graph.py revenue add --founder`\"; :170 \"No agent, routine or Jarvis itself can complete the face.\"; docs/JARVIS_PROGRESS.md:22 \"graph.py rev\u2026",
      "evidence": "The only founder check is a self-attested flag: tools/graph.py:257-258 refuses unless '--founder' is present, and the docstring says 'pass --founder to attest that you are the founder'. On a scratch copy (graph.py + graph.json + ledger copied to the scratchpa\u2026",
      "status": "fixed"
     },
     {
      "id": "AF-orchestrator-20",
      "agent": "orchestrator",
      "task": "F01",
      "severity": "major",
      "kind": "process",
      "claim": "The fingerprint shown to the founder was the stored ledger field, never recomputed from the key.",
      "evidence": "R3. || FIXED by the orchestrator in commit d13d239 (2026-10-10); pending independent re-check. Fingerprints are recomputed with ssh-keygen; the auditor flags a mismatch.",
      "status": "fixed"
     },
     {
      "id": "AF-orchestrator-21",
      "agent": "orchestrator",
      "task": "F01",
      "severity": "major",
      "kind": "unsupported_claim",
      "claim": "docs/JARVIS_SECURITY.md row 11 and graph.py said the key is 'never in a file an agent could edit'.",
      "evidence": "R3: the ledger is a writable file. || FIXED by the orchestrator in commit d13d239 (2026-10-10); pending independent re-check. The docs now say the controls detect tampering (git history, auditor) rather than prevent it.",
      "status": "fixed"
     },
     {
      "id": "AF-orchestrator-25",
      "agent": "orchestrator",
      "task": "F01",
      "severity": "major",
      "kind": "process",
      "claim": "The verdict token was accepted anywhere and in any case (quoted, negated or retracted PASS cleared done).",
      "evidence": "R4 O1', N3. || FIXED by the orchestrator in commit d13d239 (2026-10-10); pending independent re-check. One plain uppercase verdict, at the end, in NFKC-stable text.",
      "status": "fixed"
     },
     {
      "id": "AF-orchestrator-26",
      "agent": "orchestrator",
      "task": "F01",
      "severity": "major",
      "kind": "process",
      "claim": "Directory and symlink-to-directory outputs were hashed as None; an empty directory passed done.",
      "evidence": "R4 N1, N1b, I6. || FIXED by the orchestrator in commit d13d239 (2026-10-10); pending independent re-check. Directory trees are hashed; an empty one is refused.",
      "status": "fixed"
     },
     {
      "id": "AF-orchestrator-27",
      "agent": "orchestrator",
      "task": "F01",
      "severity": "major",
      "kind": "process",
      "claim": "Outputs of a gated task could change after done and before the founder's clear-gate.",
      "evidence": "R4 G1. || FIXED by the orchestrator in commit d13d239 (2026-10-10); pending independent re-check. done records output hashes; clear-gate refuses changed outputs and the founder signs the hashes.",
      "status": "fixed"
     },
     {
      "id": "AF-orchestrator-28",
      "agent": "orchestrator",
      "task": "F01",
      "severity": "major",
      "kind": "process",
      "claim": "tools/audit.py rework and open-FAIL scoring depended on the case and wording of FAIL/GAP.",
      "evidence": "R4 A1-A5. || FIXED by the orchestrator in commit d13d239 (2026-10-10); pending independent re-check. Rows since the verdict rule are scored by their verdict.",
      "status": "fixed"
     },
     {
      "id": "AF-orchestrator-29",
      "agent": "orchestrator",
      "task": "F01",
      "severity": "major",
      "kind": "process",
      "claim": "tools/audit.py first-pass yield kept credit for risk-accepted findings and ignored critical process findings.",
      "evidence": "R4 A7, A8. || FIXED by the orchestrator in commit d13d239 (2026-10-10); pending independent re-check. accepted now means overturned (weight 0); critical process findings count.",
      "status": "fixed"
     },
     {
      "id": "AF-orchestrator-30",
      "agent": "orchestrator",
      "task": "F01",
      "severity": "major",
      "kind": "process",
      "claim": "The measured-process exemption matched wording only and excused serious findings.",
      "evidence": "R4 A9. || FIXED by the orchestrator in commit d13d239 (2026-10-10); pending independent re-check. Applies only when the record confirms the task lacked an on-time check, never for critical findings.",
      "status": "fixed"
     },
     {
      "id": "AF-orchestrator-39",
      "agent": "orchestrator",
      "task": "F05",
      "severity": "major",
      "kind": "process",
      "claim": "19 of 26 closed tasks were closed before today's gate existed and would fail it; their checks are retro-checks.",
      "evidence": "Completeness critic. || To be resolved by reopening and re-verifying under the current gate.",
      "status": "open"
     },
     {
      "id": "AF-orchestrator-4",
      "agent": "orchestrator",
      "task": "F05",
      "severity": "major",
      "kind": "error",
      "claim": "docs/execution-plan.md:37 \"The load models four mechanisms grounded in published findings: salience capture, momentary lapses (RT variability and DMN interference), time-blindness (delay aversion), and hyperfocus.\"",
      "evidence": "This contradicts the project's own spec and build. science/mechanism-spec.md section 6 (line 97) lists 'Time perception differences or \"time blindness\" (not in the evidence base here); M3 does not distort the clock'. M3 is delay aversion only. Hyperfocus is M\u2026",
      "status": "fixed"
     },
     {
      "id": "AF-orchestrator-40",
      "agent": "orchestrator",
      "task": "F05",
      "severity": "major",
      "kind": "process",
      "claim": "Rework rounds 1-2 changed the outputs of 22 closed tasks without reopening them; four gated tasks await founder approval of content no gate-valid check has seen.",
      "evidence": "Completeness critic: output mtimes after done events. || To be resolved by reopening and re-verifying under the current gate (graph.py reopen).",
      "status": "open"
     },
     {
      "id": "AF-orchestrator-41",
      "agent": "orchestrator",
      "task": "F05",
      "severity": "major",
      "kind": "unsupported_claim",
      "claim": "PROMPT.md, the plan summary and the north star stated co-design and a 'validated' simulator as fact.",
      "evidence": "Completeness critic. || FIXED by the orchestrator (2026-10-10): stated as a plan; 'validated' replaced by 'tested in a pre-registered pilot'. Pending independent re-check.",
      "status": "fixed"
     },
     {
      "id": "AF-orchestrator-42",
      "agent": "orchestrator",
      "task": "F05",
      "severity": "major",
      "kind": "process",
      "claim": "Reviewer findings were not in the audit record, so scorecards omitted them.",
      "evidence": "Completeness critic. || FIXED: recorded here as AF-orchestrator-18 onward. Pending independent re-check.",
      "status": "fixed"
     },
     {
      "id": "AF-orchestrator-43",
      "agent": "orchestrator",
      "task": "F05",
      "severity": "major",
      "kind": "unsupported_claim",
      "claim": "docs/JARVIS_PROGRESS.md was stale and overstated fixes.",
      "evidence": "Completeness critic. || To be rewritten from the record after this round.",
      "status": "open"
     },
     {
      "id": "AF-orchestrator-44",
      "agent": "orchestrator",
      "task": "F05",
      "severity": "major",
      "kind": "process",
      "claim": "The orchestrator's integrity score counted 0 self-verified completions although D01, F05 and F07 were closed in the same second they started.",
      "evidence": "Completeness critic. || FIXED by the orchestrator in commit d13d239 (2026-10-10); pending independent re-check. Self-verified completions now count closures with no check before closing.",
      "status": "fixed"
     },
     {
      "id": "AF-orchestrator-7",
      "agent": "orchestrator",
      "task": "D01",
      "severity": "major",
      "kind": "error",
      "claim": "docs/founder-decisions.md:8 item 2, options column 'recommendation first': \"Approve the $50/h floor for 5\u20137 advisors / set a different rate\"",
      "evidence": "This is the opposite of the source it cites. ethics/advisory-board.md:7 and :22 say the founder should set the final rate at or above the floor. The ethics agent 'recommends the founder set the final rate above the floor and record the reasoning', because the\u2026",
      "status": "fixed"
     },
     {
      "id": "AF-orchestrator-10",
      "agent": "orchestrator",
      "task": "D01",
      "severity": "minor",
      "kind": "error",
      "claim": "docs/ownership-and-budget-options.md (dated 2026-10-08) Tier 3: \"State: $109 formation [S] + $175 minimum franchise tax [S] + $50 annual report [S]\"; \"next-day expedite $50-100, same-day $100-200 [S]\"; \"A corporate amendment costs $214 [S]\"",
      "evidence": "WebSearch, search-summary level; I could not open the fee schedule: InCorp 'Delaware Just Raised Its Business Filing Fees ... August 1, 2026', Capitol Services, Withum, and the HB 400 text at corpfiles.delaware.gov. Delaware HB 400, signed 2026-05-21, raised \u2026",
      "status": "accepted"
     },
     {
      "id": "AF-orchestrator-11",
      "agent": "orchestrator",
      "task": "V14",
      "severity": "minor",
      "kind": "process",
      "claim": "graph/graph.json V14 \"MVP v0.2 from advisory feedback\" status awaiting_human; dashboard 'Your sign-off'; jarvis/core/body.ts:4 \"PREPARED_WEIGHT = 0.6\"",
      "evidence": "V14's gate ('Needs real feedback sessions with paid ND advisors') is a precondition for the work, not a sign-off on a prepared output. mvp/CHANGELOG.md:9 records 0 sessions and 0 changes. Even so, graph.py 'done' parked the node in awaiting_human, so it count\u2026",
      "status": "open"
     },
     {
      "id": "AF-orchestrator-12",
      "agent": "orchestrator",
      "task": "F04",
      "severity": "minor",
      "kind": "process",
      "claim": "graph/ledger.jsonl:52-53 (2026-10-07T19:09:16Z) block F04 \"Verification round 3 ...\" and, in the same second, unblock F04 \"Round 4 limited to the Stop-visibility gap (a hard safety rule)\"; PROMPT.md:39 \"Two failed rounds means graph.py block <ID> ... never a \u2026",
      "evidence": "F04 went through 4 verification rounds. The round-3 unblock (ledger:47) and M03's round-3 unblock (ledger:41) cite a founder request. The round-4 unblock cites none and was issued by the orchestrator in the same second as the block. The fix was a safety fix a\u2026",
      "status": "fixed"
     },
     {
      "id": "AF-orchestrator-13",
      "agent": "orchestrator",
      "task": "M03",
      "severity": "minor",
      "kind": "process",
      "claim": "PROMPT.md:39 \"The verifier logs with `graph.py log <ID> check --verifier \\\"...\\\"` so its steps are never credited to the agent.\"",
      "evidence": "None of M03's three verifier rounds is tagged as the verifier: 2026-10-06T19:21:10Z, 19:25:57Z and 2026-10-07T01:01:00Z-01:03:01Z. The text says 'Verifier ...', but the rows lack actor 'verifier', so the record and the dashboard credit them to Milton. The sam\u2026",
      "status": "open"
     },
     {
      "id": "AF-orchestrator-14",
      "agent": "orchestrator",
      "task": "F07",
      "severity": "minor",
      "kind": "unsupported_claim",
      "claim": "graph/ledger.jsonl:34 \"done\", \"F07\", \"3D cortex-to-city with semantic zoom, guide, replay, deep links; a11y/BP/SEO 100\"; city/PLAN.md:8 \"all 33 tasks as particle patches\"",
      "evidence": "No Lighthouse or other audit run appears anywhere in the record. graph/activity/F07.jsonl has only the start and done rows, both at 13:51:33Z, and grep finds no 'lighthouse' in the repo outside node_modules. The 100 scores are unsupported. city/PLAN.md:8 says\u2026",
      "status": "fixed"
     },
     {
      "id": "AF-orchestrator-15",
      "agent": "orchestrator",
      "task": "F01",
      "severity": "minor",
      "kind": "error",
      "claim": "tools/graph.py:228 activity_append: rec = {..., \"text\": text[:300], ...}; the log command (:531-541) prints '<ID> logged <kind>' with no warning; the verifier template is graph.py log <ID> check --verifier \"Retro-verification ...: <criterion 1> PASS|FAIL ...;\u2026",
      "evidence": "Found by the verifier on 2026-10-09. My retro-verification rows for F01, F02, F05, F07, D01, F06, V04 and M03 were each stored cut at exactly 300 characters, and graph.py only printed 'F07 logged check'. For F07, D01, F06, V04 and M03 the cut removed criterio\u2026",
      "status": "fixed"
     },
     {
      "id": "AF-orchestrator-16",
      "agent": "orchestrator",
      "task": "F07",
      "severity": "minor",
      "kind": "error",
      "claim": "graph/activity/F07.jsonl 2026-10-10T00:58:32Z (run row 'Correction'): \"no run exists in the record before 2026-10-10 ... The 2026-10-06 build was never measured and cannot be now (no git history in the audit brief), so the 2026-10-06 claim stays unsupported.\"",
      "evidence": "Found by the R2 verifier on 2026-10-10. Lighthouse 12.8.2 reports from 2026-10-06 are in this session's scratchpad, in /tmp/claude-0/-home-user-High-Properties/fe7389e3-a3cc-53e4-bd68-0d1c75ff91d1/scratchpad/lh/ (package.json: lighthouse ^12.8.2). report.json\u2026",
      "status": "open"
     },
     {
      "id": "AF-orchestrator-22",
      "agent": "orchestrator",
      "task": "F01",
      "severity": "minor",
      "kind": "process",
      "claim": "Two byte-identical copies of the record accept the same founder signature.",
      "evidence": "R3 proof H. || Documented residual risk in JARVIS_SECURITY.md row 11; a repository identity is not part of the signed message.",
      "status": "open"
     },
     {
      "id": "AF-orchestrator-3",
      "agent": "orchestrator",
      "task": "F01",
      "severity": "minor",
      "kind": "error",
      "claim": "tools/graph.py:395-398 \"elif cmd == \"block\": n[\"status\"] = \"blocked\"\" / \"elif cmd == \"unblock\": n[\"status\"] = \"pending\"\", and clear-gate (graph.py:399-405) with no actor check; PROMPT.md:12 \"only the founder's `clear-gate` finishes it\"",
      "evidence": "block and unblock accept any current status. On the scratch copy, 'unblock F04' turned a verified done node into pending, and its dependent V12 then refused 'start' (V12 is pending, not ready). One mistyped command can silently undo verified work, and only th\u2026",
      "status": "fixed"
     },
     {
      "id": "AF-orchestrator-31",
      "agent": "orchestrator",
      "task": "F01",
      "severity": "minor",
      "kind": "process",
      "claim": "The auditor's revision boundaries use timestamps while the gate uses file order.",
      "evidence": "R4 A3-A6. || Partly fixed: run rows now count as boundaries in the auditor too.",
      "status": "open"
     },
     {
      "id": "AF-orchestrator-32",
      "agent": "orchestrator",
      "task": "F01",
      "severity": "minor",
      "kind": "process",
      "claim": "Unicode look-alikes and zero-width characters could hide or fake a verdict.",
      "evidence": "R4 N2, N2b. || FIXED by the orchestrator in commit d13d239 (2026-10-10); pending independent re-check.",
      "status": "fixed"
     },
     {
      "id": "AF-orchestrator-33",
      "agent": "orchestrator",
      "task": "F01",
      "severity": "minor",
      "kind": "process",
      "claim": "A FAIL check followed by a PASS check with no change cleared done.",
      "evidence": "R4 O2. || FIXED by the orchestrator in commit d13d239 (2026-10-10); pending independent re-check. Any FAIL since the last change blocks done.",
      "status": "fixed"
     },
     {
      "id": "AF-orchestrator-34",
      "agent": "orchestrator",
      "task": "F01",
      "severity": "minor",
      "kind": "process",
      "claim": "Output hashes were taken at log time, not at review time.",
      "evidence": "R4 G2. || FIXED by the orchestrator in commit d13d239 (2026-10-10); pending independent re-check. Every verifier row pins hashes; a change during the review is caught.",
      "status": "fixed"
     },
     {
      "id": "AF-orchestrator-35",
      "agent": "orchestrator",
      "task": "F01",
      "severity": "minor",
      "kind": "process",
      "claim": "Ingesting a verifier transcript after its check blocked done, and its rows were credited to the builder.",
      "evidence": "R4 I4, I1. || FIXED by the orchestrator in commit d13d239 (2026-10-10); pending independent re-check. Transcript rows are not boundaries; activity.py --verifier credits them to the verifier.",
      "status": "fixed"
     },
     {
      "id": "AF-orchestrator-36",
      "agent": "orchestrator",
      "task": "F01",
      "severity": "minor",
      "kind": "process",
      "claim": "Activity rows without timestamps crashed the export or were given a fake time.",
      "evidence": "R4 I2, I3. || FIXED by the orchestrator in commit d13d239 (2026-10-10); pending independent re-check.",
      "status": "fixed"
     },
     {
      "id": "AF-orchestrator-37",
      "agent": "orchestrator",
      "task": "F01",
      "severity": "minor",
      "kind": "process",
      "claim": "Several tests did not test what their names said.",
      "evidence": "R4. || FIXED by the orchestrator in commit d13d239 (2026-10-10); pending independent re-check. Tests rewritten; 61 tool tests.",
      "status": "fixed"
     },
     {
      "id": "AF-orchestrator-45",
      "agent": "orchestrator",
      "task": "D01",
      "severity": "minor",
      "kind": "process",
      "claim": "ledger:48 unblock of M05 cites no founder request.",
      "evidence": "Completeness critic. || Needs the founder's ratification, like AF-orchestrator-12.",
      "status": "open"
     },
     {
      "id": "AF-orchestrator-46",
      "agent": "orchestrator",
      "task": "F05",
      "severity": "minor",
      "kind": "process",
      "claim": "PROMPT.md named an obsolete trust root (graph/founder.allowed_signers).",
      "evidence": "Completeness critic. || FIXED (2026-10-10). Pending independent re-check.",
      "status": "fixed"
     },
     {
      "id": "AF-orchestrator-47",
      "agent": "orchestrator",
      "task": "F05",
      "severity": "minor",
      "kind": "unsupported_claim",
      "claim": "docs/JARVIS_SECURITY.md labelled built controls as planned.",
      "evidence": "Completeness critic. || FIXED (2026-10-10): rows 1, 5-8, 12 relabelled with the files and tests that implement them. Pending re-check.",
      "status": "fixed"
     },
     {
      "id": "AF-orchestrator-48",
      "agent": "orchestrator",
      "task": "F01",
      "severity": "minor",
      "kind": "process",
      "claim": "The auditor ignored missing outputs of closed tasks.",
      "evidence": "Completeness critic. || FIXED by the orchestrator in commit d13d239 (2026-10-10); pending independent re-check.",
      "status": "fixed"
     },
     {
      "id": "AF-orchestrator-5",
      "agent": "orchestrator",
      "task": "F05",
      "severity": "minor",
      "kind": "unsupported_claim",
      "claim": "docs/execution-plan.md:3 \"Enterprise headset fleets collapsed when Meta ended commercial Quest sales in Feb 2026.\"; :24 \"Vision Pro scaled back\"; :28 \"DEI lines are mostly rebranded or cut in the US\"; :64 \"$50M enterprise value in 48 months needs roughly $5\u20138\u2026",
      "evidence": "WebSearch at search-summary level (forwork.meta.com 'An update on Meta for Work'; UploadVR; ArborXR) confirms that Meta stopped selling commercial Quest SKUs and Horizon managed services on 2026-02-20, that HMS licences became free and that support runs to 20\u2026",
      "status": "fixed"
     },
     {
      "id": "AF-orchestrator-6",
      "agent": "orchestrator",
      "task": "F05",
      "severity": "minor",
      "kind": "error",
      "claim": "docs/execution-plan.md:3 \"**Summary (150 words).**\"; :13 H1 \"... than managers who watch an equivalent video\"; :36 \"**Before**: 3 attitude items and 1 scenario judgment (2 min).\"",
      "evidence": "The summary is 161 words by wc -w, so its own '(150 words)' label is wrong and it breaks the role-card cap (.claude/agents/pe-orchestrator.md rule 4). The plan's H1 comparator is a video, but the pre-registration and IRB packet compare against an equal-length\u2026",
      "status": "fixed"
     },
     {
      "id": "AF-orchestrator-8",
      "agent": "orchestrator",
      "task": "D01",
      "severity": "minor",
      "kind": "error",
      "claim": "docs/founder-decisions.md:7 \"Every US federal grant (NIH, NSF, NIDILRR SBIR) needs a for-profit that is at least 51% owned by US citizens or permanent residents\"",
      "evidence": "The statement is overbroad. The ownership rule is an SBIR/STTR rule (13 CFR 121.702), not a rule for every federal grant, and the test is 'more than 50%' owned and controlled. Control is part of it, and the sentence omits control. docs/ownership-and-budget-op\u2026",
      "status": "fixed"
     },
     {
      "id": "AF-orchestrator-9",
      "agent": "orchestrator",
      "task": "D01",
      "severity": "minor",
      "kind": "process",
      "claim": "graph/activity/D01.jsonl 2026-10-08T12:07:24Z \"Mayor: tiered ownership options (4) and first-year budgets ... prepared and number-checked in docs/ownership-and-budget-options.md\"; that file, line 3: \"An independent checker re-opened every cited file, recomput\u2026",
      "evidence": "D01's write list is docs/founder-decisions.md only. The 238-line ownership, tax and budget analysis is legal and finance domain work, which the orchestrator role card forbids outside F-series nodes ('You never do domain work yourself except F-series planning \u2026",
      "status": "fixed"
     },
     {
      "id": "AF-science-9",
      "agent": "orchestrator",
      "task": "F05",
      "severity": "minor",
      "kind": "unsupported_claim",
      "claim": "docs/execution-plan.md:30 \"Surveys disagree on US DEI budgets (one 2025 survey: 19% of companies cut DEI funding; 78% of C-suite leaders said they rebrand it; dossier s6)\"",
      "evidence": "VERIFIER R2 2026-10-09 (science/data verifier; filed in science.json because this verifier may write only science and data findings; the file belongs to the orchestrator, task F05, not to science). This is a stale cross-reference. The F03 rework of research/e\u2026",
      "status": "open"
     }
    ],
    "computedAt": "2026-10-10T12:51:41Z"
   },
   {
    "agent": "science",
    "name": "Curie",
    "score": 79.7,
    "grade": "C",
    "meetsInstitutionalBar": false,
    "dimensions": [
     {
      "id": "first_pass_yield",
      "label": "First-pass yield",
      "weight": 20,
      "score": 50.0,
      "basis": "2/4 verified tasks passed first time (V01 V15); needed rework, a block or a later correction: F03 (0 failed rounds, 0 blocks, 0 orchestrator corrections, 1 major or critical auditor findings), V03 (0 failed rounds, 0 blocks, 0 orchestrator corrections, 1 major or critical auditor findings)."
     },
     {
      "id": "effective_challenge",
      "label": "Verification outcome: rework and open gaps",
      "weight": 15,
      "score": 87.0,
      "basis": "0 failed verification rounds over 4 verified tasks (0.00 per task); 0 open FAIL/GAP rows after the last revision; 2 non-blocking notes left open (F03 1, V03 1). Findings: -7 from 1 open finding(s) and 2 fixed after the audit (a quarter weight each)."
     },
     {
      "id": "evidence",
      "label": "Evidence discipline",
      "weight": 15,
      "score": 90.7,
      "basis": "214/226 numeric claims (95%) in 4 output files are traceable: a source URL, file or task reference, citation, derivation or [S]/[U]/unverified/assumption/estimate/measured label on the line or table caption, or a restatement of such a figure; by task: F03 evidence-dossier.md 56/58, V01 mechanism-spec.md 41/41, V03 preregistration.md 102/111, V15 partners.md 15/16; untraced examples: F03: 4-8 weeks; V03: d = 0.66; V1\u2026"
     },
     {
      "id": "integrity",
      "label": "Honesty and research integrity",
      "weight": 20,
      "score": 98.5,
      "basis": "Over 4 tasks in the ledger: 0 orchestrator corrections of a false claim; 0 self-verified completions; 0 verifier FAIL/GAP rows naming a false statement. Findings: -1.5 from 0 open finding(s) and 1 fixed after the audit (a quarter weight each)."
     },
     {
      "id": "process",
      "label": "Process discipline and separation of duties",
      "weight": 15,
      "score": 60.0,
      "basis": "4 closed tasks in the ledger: step records on 4 (8 self-logged rows, 73 transcript rows); verifier rows on 4; a separate verifier run evidenced by its own ingested transcript on 0; separation only declared with the --verifier flag (identity not evidenced, 10 of 25): F03 V01 V03 V15; verified only after closing (half credit): F03 V01 V03 V15."
     },
     {
      "id": "gates",
      "label": "Founder gates and safety controls",
      "weight": 5,
      "score": 100.0,
      "basis": "1 gated tasks worked on (V03); 0 marked done without the founder clearing the gate; 0 gate clearances without a recorded founder answer. Gated actions taken outside the record are left to LLM findings."
     },
     {
      "id": "budget",
      "label": "Budget adherence",
      "weight": 5,
      "score": 87.4,
      "basis": "4 measured runs; allowance = budget_k + 70k spawn overhead (PROMPT.md, measured in loop 1); within allowance: F03, V01; over: V03 103.1k vs 20k, V15 122.2k vs 20k. Raw used/budget total 402.6k/125k."
     },
     {
      "id": "reliability",
      "label": "Reliability: interruptions and stalls",
      "weight": 5,
      "score": 100.0,
      "basis": "0 recorded interruptions (usage/session limits, failed pushes) over 4 tasks; 0 running tasks with no step in 15 min."
     }
    ],
    "findings": [
     {
      "id": "AF-science-1",
      "agent": "science",
      "task": "F03",
      "severity": "major",
      "kind": "hallucination",
      "claim": "research/evidence-dossier.md:26 \"Ventura et al. 2020 meta-analysis: overall VR effect on empathy SDM = 0.43 (CI 0.31-0.55). https://journals.sagepub.com/doi/abs/10.1089/cyber.2019.0681\" and research/evidence-dossier.md:28 \"Another reported meta-analysis found\u2026",
      "evidence": "WebSearch, search summaries only (a direct fetch of tmb.apaopen.org was EGRESS_BLOCKED). SDM = 0.43 [CI 0.31, 0.55], z = 6.93, is the overall effect in Martingano, Herrera & Konrath 2021, Technology, Mind, and Behavior (k = 43, N = 5,644): https://tmb.apaopen\u2026",
      "status": "fixed"
     },
     {
      "id": "AF-science-10",
      "agent": "science",
      "task": "V03",
      "severity": "major",
      "kind": "incomplete",
      "claim": "The pre-registration does not apply the changes ethics/irb-packet.md:238 lists as needed before the OSF post (distress and pause rules, deletion withdrawals versus ITT, a difficulty item, the C-arm closing), and the consent form's deletion promise conflicts w\u2026",
      "evidence": "Completeness critic: ethics/irb-packet.md:238 versus science/preregistration.md.",
      "status": "open"
     },
     {
      "id": "AF-science-2",
      "agent": "science",
      "task": "F03",
      "severity": "major",
      "kind": "process",
      "claim": "graph/ledger.jsonl:1, :8, :16, :20 mark F03, V01, V03 and V15 complete (2026-10-06 at 12:35:38, 12:40:58, 12:49:21 and 12:53:55), e.g. \"done\", \"F03\", \"Dossier: Quest commercial sales ended 2026-02; quantum/18dB/CPT claims unsupported; sims need debrief\"",
      "evidence": "PROMPT.md:39 says a node is marked done only by a separate verifier agent that checked every acceptance criterion and logged 'check --verifier'. graph/activity/F03.jsonl, V01.jsonl, V03.jsonl and V15.jsonl contain no 'check' entries. Each 'done' came 22 s, 4 \u2026",
      "status": "fixed"
     },
     {
      "id": "AF-science-3",
      "agent": "science",
      "task": "V03",
      "severity": "minor",
      "kind": "unsupported_claim",
      "claim": "science/preregistration.md:38 (OSF paste-ready text) \"(Sonuga-Barke and Castellanos 2007, https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3805479/)\"; the same link appears at research/evidence-dossier.md:37, science/mechanism-spec.md:16 and :28, and science/part\u2026",
      "evidence": "The 2007 paper is Sonuga-Barke & Castellanos, Neurosci Biobehav Rev 31(7):977-986, doi:10.1016/j.neubiorev.2007.02.005, PMID 17445893 (https://pubmed.ncbi.nlm.nih.gov/17445893/, found by search). Two WebSearch calls for PMC3805479 returned no record, and the \u2026",
      "status": "fixed"
     },
     {
      "id": "AF-science-4",
      "agent": "science",
      "task": "V15",
      "severity": "minor",
      "kind": "incomplete",
      "claim": "science/partners.md:4 \"Ten research groups shortlisted\" and graph/ledger.jsonl:20 \"10 labs (7 non-US)\", against the acceptance criterion '10 labs with published relevant work and URLs'",
      "evidence": "Entry 6 (partners.md:46-48) is an individual researcher ('lab name unverified; cited as paper author, not lab lead'), and the file itself says she is not a partner ('critical friend, not a partner', partners.md:4 and :19). Entry 4 (partners.md:39) cites only \u2026",
      "status": "fixed"
     },
     {
      "id": "AF-science-5",
      "agent": "science",
      "task": "V15",
      "severity": "minor",
      "kind": "unsupported_claim",
      "claim": "science/partners.md:27 \"2024 report with Neurodiversity in Business, 900+ neurodivergent employees and 127 employers\"",
      "evidence": "WebSearch, search-summary level. The sample of 127 employers and 990 neurodivergent employees (1,117 respondents) matches the Birkbeck and Neurodiversity in Business survey reported on 2023-03-16 (https://www.hippocraticpost.com/tag/centre-for-neurodiversity-\u2026",
      "status": "fixed"
     },
     {
      "id": "AF-science-6",
      "agent": "science",
      "task": "V15",
      "severity": "minor",
      "kind": "unsupported_claim",
      "claim": "science/partners.md:78 \"Prior art to read (not a partner): Wong, Lin, Wu and Qin, Computers in Human Behavior, May 2026, 8-session VR programme for 350 ADHD caregivers ... (snippet-level; affiliation unverified)\"",
      "evidence": "VERIFIER 2026-10-09, WebSearch, search-summary level. The study itself is real: 'Immersive virtual reality for caregivers of children and adolescents with ADHD: A mixed-methods study of stress reduction, empathy engagement, and quality of life outcomes', Comp\u2026",
      "status": "fixed"
     },
     {
      "id": "AF-science-7",
      "agent": "science",
      "task": "V03",
      "severity": "minor",
      "kind": "error",
      "claim": "science/preregistration.md:147 (OSF paste-ready, Inference criteria) \"The expected CI width (about 0.36 to 0.50 SD) means \\\"inconclusive\\\" is the likely outcome\"",
      "evidence": "VERIFIER 2026-10-09, recomputed in python3. preregistration.md:87 correctly calls 0.50 / 0.41 / 0.36 SD the expected 95% CI HALF-width at N = 80 / 120 / 150 (recomputed 1.96 x sqrt(2/(N x 0.7 / 2) x 0.75 x 1.2) = 0.497 / 0.406 / 0.363). Line 147 calls the sam\u2026",
      "status": "fixed"
     },
     {
      "id": "AF-science-8",
      "agent": "science",
      "task": "V03",
      "severity": "minor",
      "kind": "unsupported_claim",
      "claim": "science/preregistration.md:111 (OSF paste-ready) \"OMS-WA ... (full form: 23 items, five factors, per the paper's abstract as relayed by web-search summaries ... shortened 11-item and 9-item versions exist ...)\" and :172 \"OMS-WA item count (23, search-summary \u2026",
      "evidence": "VERIFIER R2 2026-10-09, WebSearch, search-summary level. The R2 rework copied data/instruments.md's '23 items, full form' into the paste-ready OSF text. Searches support 23 only as the 2024 paper's Study 1 EFA result. An extended search on Szeto, Dobson & Kna\u2026",
      "status": "open"
     }
    ],
    "computedAt": "2026-10-10T12:51:41Z"
   },
   {
    "agent": "ethics",
    "name": "Milton",
    "score": 75.8,
    "grade": "C",
    "meetsInstitutionalBar": false,
    "dimensions": [
     {
      "id": "first_pass_yield",
      "label": "First-pass yield",
      "weight": 20,
      "score": 33.3,
      "basis": "1/3 verified tasks passed first time (F06); needed rework, a block or a later correction: V04 (0 failed rounds, 0 blocks, 0 orchestrator corrections, 1 major or critical auditor findings), M03 (2 failed rounds, 1 blocks, 0 orchestrator corrections, 0 major or critical auditor findings)."
     },
     {
      "id": "effective_challenge",
      "label": "Verification outcome: rework and open gaps",
      "weight": 15,
      "score": 75.5,
      "basis": "2 failed verification rounds over 3 verified tasks (0.67 per task); rework: M03 x2; 0 open FAIL/GAP rows after the last revision; 1 non-blocking notes left open (M03 1). Findings: -1.5 from 0 open finding(s) and 1 fixed after the audit (a quarter weight each)."
     },
     {
      "id": "evidence",
      "label": "Evidence discipline",
      "weight": 15,
      "score": 91.1,
      "basis": "67/72 numeric claims (93%) in 3 output files are traceable: a source URL, file or task reference, citation, derivation or [S]/[U]/unverified/assumption/estimate/measured label on the line or table caption, or a restatement of such a figure; by task: F06 codesign-charter.md 14/14, V04 advisory-board.md 27/28, M03 irb-packet.md 26/30; untraced examples: V04: 10 minutes; M03: 10 people. Score shrinks the share toward n\u2026"
     },
     {
      "id": "integrity",
      "label": "Honesty and research integrity",
      "weight": 20,
      "score": 95.0,
      "basis": "Over 3 tasks in the ledger: 0 orchestrator corrections of a false claim; 0 self-verified completions; 1 verifier FAIL/GAP rows naming a false statement (M03 1)."
     },
     {
      "id": "process",
      "label": "Process discipline and separation of duties",
      "weight": 15,
      "score": 67.8,
      "basis": "3 closed tasks in the ledger: step records on 3 (20 self-logged rows, 111 transcript rows); verifier rows on 3; a separate verifier run evidenced by its own ingested transcript on 0; separation only declared with the --verifier flag (identity not evidenced, 10 of 25): F06 V04 M03; verified only after closing (half credit): F06 V04. Findings: -0.5 from 0 open finding(s) and 1 fixed after the audit (a quarter weight e\u2026"
     },
     {
      "id": "gates",
      "label": "Founder gates and safety controls",
      "weight": 5,
      "score": 100.0,
      "basis": "1 gated tasks worked on (M03); 0 marked done without the founder clearing the gate; 0 gate clearances without a recorded founder answer. Gated actions taken outside the record are left to LLM findings."
     },
     {
      "id": "budget",
      "label": "Budget adherence",
      "weight": 5,
      "score": 100.0,
      "basis": "2 measured runs; allowance = budget_k + 70k spawn overhead (PROMPT.md, measured in loop 1); within allowance: F06, V04; over: none. Raw used/budget total 155.9k/27k."
     },
     {
      "id": "reliability",
      "label": "Reliability: interruptions and stalls",
      "weight": 5,
      "score": 100.0,
      "basis": "0 recorded interruptions (usage/session limits, failed pushes) over 3 tasks; 0 running tasks with no step in 15 min."
     }
    ],
    "findings": [
     {
      "id": "AF-ethics-1",
      "agent": "ethics",
      "task": "V04",
      "severity": "major",
      "kind": "error",
      "claim": "ethics/advisory-board.md:66 (draft recruitment call) \"Nothing has been built or tested with anyone.\"; :81 (Session 1 script) \"Plain description: for-profit; an educational simulation idea; nothing built; no one tested.\"",
      "evidence": "This was true when V04 was written (2026-10-06 12:42Z) but is false now. The browser MVP v0.1.0-F04 was built and verified on 2026-10-07 (graph/ledger.jsonl:55; mvp/index.html sha256 83f500ed...). The V14 advisor kit asks the same advisors to review that buil\u2026",
      "status": "fixed"
     },
     {
      "id": "AF-ethics-2",
      "agent": "ethics",
      "task": "V04",
      "severity": "minor",
      "kind": "unsupported_claim",
      "claim": "ethics/advisory-board.md:7 \"anchored to one US lived-experience benchmark (Orange County CoC, USD 50 'Advisor' tier)\"; :15 \"USD 45/h Storyteller, 50/h Advisor, 55/h Leadership\"",
      "evidence": "WebSearch, search-summary level; the PDF was not opened: https://ceo.oc.gov/sites/ceo/files/2025-08/Presentation_Final%2025.08.06%20-%20LEAC%20Meeting_0.pdf . The figures and the deck are real. The deck presents them as a recommended compensation framework fo\u2026",
      "status": "fixed"
     },
     {
      "id": "AF-ethics-3",
      "agent": "ethics",
      "task": "F06",
      "severity": "minor",
      "kind": "process",
      "claim": "graph/ledger.jsonl:6 \"done\", \"F06\" (2026-10-06T12:40:18Z) and :10 \"done\", \"V04\" (2026-10-06T12:42:32Z)",
      "evidence": "Neither node has a verifier check in graph/activity/F06.jsonl or V04.jsonl. Both were closed 12 s and 4 s after the agent's handoff (12:40:06 and 12:42:28 in the subagent transcripts agent-a57aca20c172a30c2 and agent-ac2dd770518b91f99), and no verifier subage\u2026",
      "status": "fixed"
     }
    ],
    "computedAt": "2026-10-10T12:51:41Z"
   },
   {
    "agent": "product",
    "name": "Ada",
    "score": 52.2,
    "grade": "F",
    "meetsInstitutionalBar": false,
    "dimensions": [
     {
      "id": "first_pass_yield",
      "label": "First-pass yield",
      "weight": 20,
      "score": 0.0,
      "basis": "0/1 verified tasks passed first time (none); needed rework, a block or a later correction: F04 (3 failed rounds, 2 blocks, 0 orchestrator corrections, 1 major or critical auditor findings)."
     },
     {
      "id": "effective_challenge",
      "label": "Verification outcome: rework and open gaps",
      "weight": 15,
      "score": 0.0,
      "basis": "3 failed verification rounds over 1 verified tasks (3.00 per task); rework: F04 x3; 0 open FAIL/GAP rows after the last revision; 0 non-blocking notes left open. Findings: -10.5 from 3 open finding(s) and 1 fixed after the audit (a quarter weight each)."
     },
     {
      "id": "evidence",
      "label": "Evidence discipline",
      "weight": 15,
      "score": 70.0,
      "basis": "No data: no numeric claims found in 0 readable output files of closed tasks. Scored neutral (70)."
     },
     {
      "id": "integrity",
      "label": "Honesty and research integrity",
      "weight": 20,
      "score": 95.0,
      "basis": "Over 2 tasks in the ledger: 0 orchestrator corrections of a false claim; 0 self-verified completions; 1 verifier FAIL/GAP rows naming a false statement (F04 1)."
     },
     {
      "id": "process",
      "label": "Process discipline and separation of duties",
      "weight": 15,
      "score": 69.5,
      "basis": "No data: no closed task of this agent in the ledger. Scored neutral (70). Findings: -0.5 from 0 open finding(s) and 1 fixed after the audit (a quarter weight each)."
     },
     {
      "id": "gates",
      "label": "Founder gates and safety controls",
      "weight": 5,
      "score": 100.0,
      "basis": "1 gated tasks worked on (V14); 0 marked done without the founder clearing the gate; 0 gate clearances without a recorded founder answer. Gated actions taken outside the record are left to LLM findings."
     },
     {
      "id": "budget",
      "label": "Budget adherence",
      "weight": 5,
      "score": 70.0,
      "basis": "No data: no task with both a token budget and a measured run. Scored neutral (70)."
     },
     {
      "id": "reliability",
      "label": "Reliability: interruptions and stalls",
      "weight": 5,
      "score": 76.0,
      "basis": "3 recorded interruptions (usage/session limits, failed pushes) over 2 tasks (F04 3); 0 running tasks with no step in 15 min; 1 founder stops recorded, not scored."
     }
    ],
    "findings": [
     {
      "id": "AF-product-5",
      "agent": "product",
      "task": "F04",
      "severity": "major",
      "kind": "incomplete",
      "claim": "F04 is closed and shown as 'built and verified' although two acceptance criteria are unmet (charter debrief; JSON export of the validated day-0 measures).",
      "evidence": "Completeness critic; open AF-product-2 and AF-product-3 cover the same criteria.",
      "status": "open"
     },
     {
      "id": "AF-product-1",
      "agent": "product",
      "task": "F04",
      "severity": "minor",
      "kind": "error",
      "claim": "mvp/README.md:67 \"Ease off (all conditions to 0.2, M5 off)\"; in-app status mvp/index.html:818 \"Eased off: all added conditions set to 0.2 for the rest of the session.\"; mvp/advisor-review-kit.md:160 (V14) \"AN-STP-05 | Ease off: sets M1 to M4 to 0.2\"; intro mv\u2026",
      "evidence": "Code at mvp/index.html:817 is ['M1','M2','M3','M4'].forEach(m=>{if(S.mech[m].I>0.2)setI(m,0.2);}), so it only lowers conditions that are above 0.2 and leaves a lower setting or a disabled condition as it was; it does not 'set' all conditions to 0.2. The Ease \u2026",
      "status": "fixed"
     },
     {
      "id": "AF-product-2",
      "agent": "product",
      "task": "F04",
      "severity": "minor",
      "kind": "incomplete",
      "claim": "F04 acceptance \"JSON export of the day-0 measures from the instruments spec\"; mvp/README.md:86 \"Not administered in v0 ... QPS (37), IRI-PT (7), RIBS (8), OMS-WA (22), AQ-27 pity and fear, Marlowe-Crowne C (13), self-efficacy items 2-3, knowledge items 3-8\"",
      "evidence": "The criterion is met only for the subset of day-0 measures whose wording is in data/instruments.md; every validated T0 scale is absent (NOT_ADMIN list, mvp/index.html:407-417). The gap is disclosed honestly and no item text was invented, but it matters downst\u2026",
      "status": "open"
     },
     {
      "id": "AF-product-3",
      "agent": "product",
      "task": "F04",
      "severity": "minor",
      "kind": "incomplete",
      "claim": "F04 acceptance \"mandatory debrief per the co-design charter\"; debrief card 2 at mvp/index.html:432 \"People with ADHD build workable ways of working and bring real skills and expertise.\"",
      "evidence": "The debrief is mandatory and has the 10 charter section-6 headings (verified in code; continue unlocks only at the end). Against charter content it is still partial: ethics/codesign-charter.md:93 requires text, audio and brief video and advisor-authored, appr\u2026",
      "status": "open"
     },
     {
      "id": "AF-product-4",
      "agent": "product",
      "task": "V14",
      "severity": "minor",
      "kind": "process",
      "claim": "graph.py brief V14: \"WRITE ONLY THESE OUTPUTS: perspective-engine/mvp/CHANGELOG.md\"; acceptance \"every change traces to an advisor note\"",
      "evidence": "V14 also wrote mvp/advisor-review-kit.md (389 lines), outside its write list; the V14 verifier noted this at 2026-10-07T19:35:00Z and passed it as non-blocking. The acceptance criterion is met only vacuously: mvp/CHANGELOG.md:9 records 0 sessions, 0 notes and\u2026",
      "status": "fixed"
     }
    ],
    "computedAt": "2026-10-10T12:51:41Z"
   },
   {
    "agent": "data",
    "name": "Tukey",
    "score": 88.7,
    "grade": "B",
    "meetsInstitutionalBar": true,
    "dimensions": [
     {
      "id": "first_pass_yield",
      "label": "First-pass yield",
      "weight": 20,
      "score": 100.0,
      "basis": "1/1 verified tasks passed first time (V02)."
     },
     {
      "id": "effective_challenge",
      "label": "Verification outcome: rework and open gaps",
      "weight": 15,
      "score": 96.5,
      "basis": "0 failed verification rounds over 1 verified tasks (0.00 per task); 0 open FAIL/GAP rows after the last revision; 1 non-blocking notes left open (V02 1). Findings: -0.5 from 0 open finding(s) and 1 fixed after the audit (a quarter weight each)."
     },
     {
      "id": "evidence",
      "label": "Evidence discipline",
      "weight": 15,
      "score": 88.3,
      "basis": "29/31 numeric claims (94%) in 1 output files are traceable: a source URL, file or task reference, citation, derivation or [S]/[U]/unverified/assumption/estimate/measured label on the line or table caption, or a restatement of such a figure; by task: V02 instruments.md 29/31; untraced examples: V02: 7 days. Score shrinks the share toward neutral by 5 claims (small samples are imprecise). Fabricated citations cannot b\u2026"
     },
     {
      "id": "integrity",
      "label": "Honesty and research integrity",
      "weight": 20,
      "score": 100.0,
      "basis": "Over 1 tasks in the ledger: 0 orchestrator corrections of a false claim; 0 self-verified completions; 0 verifier FAIL/GAP rows naming a false statement."
     },
     {
      "id": "process",
      "label": "Process discipline and separation of duties",
      "weight": 15,
      "score": 60.0,
      "basis": "1 closed tasks in the ledger: step records on 1 (2 self-logged rows, 29 transcript rows); verifier rows on 1; a separate verifier run evidenced by its own ingested transcript on 0; separation only declared with the --verifier flag (identity not evidenced, 10 of 25): V02; verified only after closing (half credit): V02."
     },
     {
      "id": "gates",
      "label": "Founder gates and safety controls",
      "weight": 5,
      "score": 70.0,
      "basis": "No data: no gated task has been worked on. Scored neutral (70)."
     },
     {
      "id": "budget",
      "label": "Budget adherence",
      "weight": 5,
      "score": 70.3,
      "basis": "1 measured runs; allowance = budget_k + 70k spawn overhead (PROMPT.md, measured in loop 1); within allowance: none; over: V02 116.7k vs 20k. Raw used/budget total 116.7k/20k."
     },
     {
      "id": "reliability",
      "label": "Reliability: interruptions and stalls",
      "weight": 5,
      "score": 100.0,
      "basis": "0 recorded interruptions (usage/session limits, failed pushes) over 1 tasks; 0 running tasks with no step in 15 min."
     }
    ],
    "findings": [
     {
      "id": "AF-data-1",
      "agent": "data",
      "task": "V02",
      "severity": "major",
      "kind": "process",
      "claim": "graph/ledger.jsonl:12 \"done\", \"V02\", \"Primary outcome: verified Accommodation Action Index at day 30; RCT vs info-only control; pilot of 80-150 estimates only\" (2026-10-06T12:45:17Z)",
      "evidence": "PROMPT.md:39 says done is set only by a separate verifier that logs 'check --verifier'. graph/activity/V02.jsonl has no 'check' entry: the agent handed off at 12:44:40 and the node was closed 37 s later with no verifier named. graph/audit/scorecards.json (dat\u2026",
      "status": "fixed"
     },
     {
      "id": "AF-data-2",
      "agent": "data",
      "task": "V02",
      "severity": "minor",
      "kind": "error",
      "claim": "data/instruments.md:41 \"OMS-WA, Opening Minds Scale for Workplace Attitudes ... | 22 | T0, T2 | **[confirmed]**\" and data/instruments.md:64 \"OMS-WA (22)\"; copied to science/preregistration.md:111 \"(22 items; Lindsay et al. 2024 ...)\"",
      "evidence": "WebSearch, search-summary level: https://link.springer.com/article/10.1007/s44202-024-00249-9 ; https://d-nb.info/1352252481/34 . The citation itself is right (Lindsay, Dobson, Krupa, Knaak, Szeto 2024, Discover Psychology 4:134), but the item count is not co\u2026",
      "status": "fixed"
     },
     {
      "id": "AF-data-3",
      "agent": "data",
      "task": "V02",
      "severity": "minor",
      "kind": "unsupported_claim",
      "claim": "data/instruments.md:41 \"23 (five factors), **settled at search-summary level** ... The earlier \\\"22 items\\\" came from one secondary description and is not supported ... Study 3 fit reported as mixed (robust CFI 0.91, robust RMSEA 0.13, search-summary level)\" \u2026",
      "evidence": "VERIFIER R2 2026-10-09, WebSearch, search-summary level only (link.springer.com, d-nb.info and sciencedirect are unreachable from here). (1) 23 is supported only as the Study 1 EFA result (five factors, 23 items, N = 207, from a 27-item pool; one passage give\u2026",
      "status": "open"
     }
    ],
    "computedAt": "2026-10-10T12:51:41Z"
   },
   {
    "agent": "gtm",
    "name": "Ogilvy",
    "score": 59.3,
    "grade": "F",
    "meetsInstitutionalBar": false,
    "dimensions": [
     {
      "id": "first_pass_yield",
      "label": "First-pass yield",
      "weight": 20,
      "score": 0.0,
      "basis": "0/2 verified tasks passed first time (none); needed rework, a block or a later correction: V05 (1 failed rounds, 0 blocks, 0 orchestrator corrections, 0 major or critical auditor findings), V07 (1 failed rounds, 0 blocks, 0 orchestrator corrections, 0 major or critical auditor findings)."
     },
     {
      "id": "effective_challenge",
      "label": "Verification outcome: rework and open gaps",
      "weight": 15,
      "score": 61.5,
      "basis": "2 failed verification rounds over 2 verified tasks (1.00 per task); rework: V05 x1, V07 x1; 0 open FAIL/GAP rows after the last revision; 0 non-blocking notes left open. Findings: -8.5 from 2 open finding(s) and 5 fixed after the audit (a quarter weight each)."
     },
     {
      "id": "evidence",
      "label": "Evidence discipline",
      "weight": 15,
      "score": 66.5,
      "basis": "No data: no numeric claims found in 0 readable output files of closed tasks. Scored neutral (70). Findings: -3.5 from 1 open finding(s) and 3 fixed after the audit (a quarter weight each)."
     },
     {
      "id": "integrity",
      "label": "Honesty and research integrity",
      "weight": 20,
      "score": 80.0,
      "basis": "Over 5 tasks in the ledger: 1 orchestrator corrections of a false claim (V09 on 2026-10-08); 0 self-verified completions; 0 verifier FAIL/GAP rows naming a false statement."
     },
     {
      "id": "process",
      "label": "Process discipline and separation of duties",
      "weight": 15,
      "score": 62.0,
      "basis": "No data: no closed task of this agent in the ledger. Scored neutral (70). Findings: -8 from 1 open finding(s) and 6 fixed after the audit (a quarter weight each)."
     },
     {
      "id": "gates",
      "label": "Founder gates and safety controls",
      "weight": 5,
      "score": 100.0,
      "basis": "1 gated tasks worked on (V09); 0 marked done without the founder clearing the gate; 0 gate clearances without a recorded founder answer. Gated actions taken outside the record are left to LLM findings."
     },
     {
      "id": "budget",
      "label": "Budget adherence",
      "weight": 5,
      "score": 96.5,
      "basis": "4 measured runs; allowance = budget_k + 70k spawn overhead (PROMPT.md, measured in loop 1); within allowance: V05, V06; over: V07 102.5k vs 25k, V08 82.7k vs 8k. Raw used/budget total 333.0k/56k."
     },
     {
      "id": "reliability",
      "label": "Reliability: interruptions and stalls",
      "weight": 5,
      "score": 100.0,
      "basis": "0 recorded interruptions (usage/session limits, failed pushes) over 5 tasks; 0 running tasks with no step in 15 min."
     }
    ],
    "findings": [
     {
      "id": "AF-gtm-1",
      "agent": "gtm",
      "task": "V08",
      "severity": "major",
      "kind": "process",
      "claim": "gtm/outreach.md:36,49,80,93,124,137 \"being co-designed with paid ADHD advisors\"; outreach.md:4 says co-design is \"stated only as an intention\"",
      "evidence": "Present progressive asserts co-design is under way. No advisors are engaged: V14 is awaiting_human (paid ND advisor sessions), docs/founder-decisions.md:8 advisor budget undecided, outreach-log.md:59 says \"no advisors are engaged yet\". Orchestrator fixed batc\u2026",
      "status": "fixed"
     },
     {
      "id": "AF-gtm-2",
      "agent": "gtm",
      "task": "V06",
      "severity": "major",
      "kind": "process",
      "claim": "gtm/loi-template.md:13 \"The module is an educational practice tool co-designed with ADHD adults.\"",
      "evidence": "States co-design as done, in the letter a buyer would sign. No advisor has been recruited (brand/landing/index.html:234 \"We have not yet recruited advisors\"; V14 awaiting_human; founder-decisions.md:8 advisor budget open). ethics/codesign-charter.md:134 prohi\u2026",
      "status": "fixed"
     },
     {
      "id": "AF-gtm-3",
      "agent": "gtm",
      "task": "V06",
      "severity": "major",
      "kind": "error",
      "claim": "gtm/loi-template.md:16 Primary: \"difference between the intervention arm and a control arm (equivalent-content video) in the share of managers with at least one verified accommodation action at day 30\"",
      "evidence": "science/preregistration.md:47,104,132: primary is mean AAI-verified (share of applicable practices of 10 enacted and verified, 0-1), linear mixed model, vs an equal-length information module (:4,33), not a binary \"at least one action\" vs a video. The metric '\u2026",
      "status": "fixed"
     },
     {
      "id": "AF-gtm-4",
      "agent": "gtm",
      "task": "V06",
      "severity": "major",
      "kind": "incomplete",
      "claim": "Acceptance \"price anchor\": loi-template.md:21 \"Anchor of [PRICE_ANCHOR] per cohort\" and :44 \"[PRICE_ANCHOR] per cohort\"; ledger 2026-10-06T12:59:17Z \"price anchor left as hypothesis blank\" (node closed done)",
      "evidence": "No anchor is given, only a placeholder, so the criterion is unmet while V06 is done. CLAUDE.md allows a figure labelled \"assumption\"; finance/model.md:75 already has pilot_price 4,000/12,000/30,000 USD (labelled assumption) and docs/execution-plan.md:62 says \u2026",
      "status": "fixed"
     },
     {
      "id": "AF-gtm-5",
      "agent": "gtm",
      "severity": "major",
      "kind": "process",
      "claim": "graph/ledger.jsonl \"done\" for V05 (12:39:58Z), V07 (12:45:44Z), V06 (12:59:17Z), V08 (13:01:18Z) on 2026-10-06",
      "evidence": "PROMPT.md:39: done only after a separate verifier checks every criterion and logs check --verifier. graph/activity/V05-V08.jsonl have no check or verifier row; each closed 6-8 s after the agent's handoff. AF-gtm-3 and AF-gtm-4 show unmet criteria that a verif\u2026",
      "status": "fixed"
     },
     {
      "id": "AF-gtm-10",
      "agent": "gtm",
      "task": "V07",
      "severity": "minor",
      "kind": "incomplete",
      "claim": "gtm/targets.csv segment 1 (26 rows) vs gtm/icp.md:37 \"reference cases to study, not first targets ... Prefer mid-size employers ... (test 1,000-10,000 staff)\"",
      "evidence": "Of the 26 segment-1 rows, only Uplight (targets.csv:22) is noted as fitting the ICP size band. The rest are Fortune-500 or global firms, including all 5 reference cases the ICP says not to lead with (Microsoft, SAP, JPMorgan, EY, Ford). The list meets the col\u2026",
      "status": "open"
     },
     {
      "id": "AF-gtm-11",
      "agent": "gtm",
      "task": "V05",
      "severity": "minor",
      "kind": "unsupported_claim",
      "claim": "gtm/icp.md:12 \"Context (single-survey figures ...): 19% of companies cut DEI funding in 2025; 78% of C-suite leaders said they rebrand under 'belonging' or 'culture'; about 62% of Fortune 500 'rollbacks' were renames.\"",
      "evidence": "WebSearch, summary level. These are not one survey: 19% is Paradigm (Fast Company 2025), 78% is Catalyst/NYU Meltzer 2025 and means leaders plan to rebrand, not that they have. The 62% Fortune 500 figure was not found; the nearest is HR Brew 2026-01-06, about\u2026",
      "status": "fixed"
     },
     {
      "id": "AF-gtm-12",
      "agent": "gtm",
      "task": "V05",
      "severity": "minor",
      "kind": "process",
      "claim": "gtm/icp.md:22 Core line: \"... built with neurodivergent co-designers.\" (also icp.md:18 'Use' column: \"co-designed with neurodivergent advisors\")",
      "evidence": "The recommended core positioning states co-design as fact while no advisor has been recruited (V04 is only a plan; V14 awaiting_human; landing page :234). This line is the likely source of the present-tense co-design claims in the LOI, outreach and landing pa\u2026",
      "status": "fixed"
     },
     {
      "id": "AF-gtm-13",
      "agent": "gtm",
      "task": "V09",
      "severity": "minor",
      "kind": "unsupported_claim",
      "claim": "gtm/outreach-log.md:24 and :464 \"I noticed the Center for Teaching and Learning series on neurodiversity and neuroinclusive pedagogy at University of Pittsburgh.\"",
      "evidence": "WebSearch summaries: this is a joint Pitt-CMU Neuroinclusive Teaching Series from several units (Pitt University Center for Teaching & Learning, DRS and Autism Center; CMU Eberly Center and others). The dates found (1/29, 3/14) have no year, and CMU later ren\u2026",
      "status": "fixed"
     },
     {
      "id": "AF-gtm-14",
      "agent": "gtm",
      "task": "V07",
      "severity": "minor",
      "kind": "process",
      "claim": "targets.csv rows rated confidence 'medium' that the new scale (icp.md:82: medium = signal confirmed by a web-search summary of the cited source; low = secondary or vendor source, or not confirmed) would rate low: Microsoft:2, Dell Technologies:8 and Wells Far\u2026",
      "evidence": "VERIFIER 2026-10-09 (new): python listing of source_url domains against confidence. Goldman Sachs:17 is rated low for a 'secondary university-careers blog', so trade-press sources should be low by the same rule, or re-sourced to a primary page (for example th\u2026",
      "status": "fixed"
     },
     {
      "id": "AF-gtm-15",
      "agent": "gtm",
      "task": "V05",
      "severity": "minor",
      "kind": "error",
      "claim": "gtm/icp.md:20 'Use' column: \"Outcome language: fewer manager-employee friction cases, smoother accommodation conversations (as pilot hypotheses, not claims)\"",
      "evidence": "VERIFIER 2026-10-09 (new): science/preregistration.md:47 (H1) and :104 fix the primary outcome as AAI-verified (share of 10 listed practices used and verified at day 30). No hypothesis or measure (H1-H5, :47-51; measured variables :104-121) covers friction ca\u2026",
      "status": "fixed"
     },
     {
      "id": "AF-gtm-16",
      "agent": "gtm",
      "task": "V07",
      "severity": "minor",
      "kind": "process",
      "claim": "gtm/icp.md:82 (clarified 2026-10-10): 'The Neurodiversity @ Work Employer Roundtable roster on AskEARN counts as a primary source for membership only'; yet targets.csv rows SAP:3, JPMorgan Chase:4, EY:5, Ford:6, DXC:7 and HP:9 cite only that roster while thei\u2026",
      "evidence": "VERIFIER R2 2026-10-09 (new; checks run 2026-10-10): python listing of targets.csv. Signals beyond membership on rows whose only source_url is https://askearn.org/page/neurodiversity-work-employer-roundtable: SAP:3 'Autism at Work program launched 2013; neuro\u2026",
      "status": "open"
     },
     {
      "id": "AF-gtm-17",
      "agent": "gtm",
      "task": "V05",
      "severity": "minor",
      "kind": "unsupported_claim",
      "claim": "gtm/icp.md:22 Core line: \"A short browser-based practice module that helps managers have better working-style and accommodation conversations, to be co-designed with paid neurodivergent advisors.\"",
      "evidence": "VERIFIER R2 2026-10-09 (new; checks run 2026-10-10): the AF-gtm-15 rework made icp.md:20 say that 'the quality of accommodation conversations' is 'not measured in the pilot: do not offer them as outcomes'. Two lines later the recommended Core line, the senten\u2026",
      "status": "open"
     },
     {
      "id": "AF-gtm-18",
      "agent": "gtm",
      "task": "V09",
      "severity": "minor",
      "kind": "error",
      "claim": "gtm/outreach-log.md:4 \"Every row below has status = prepared.\" (and :33 \"tried for 9 of the 10 accounts\")",
      "evidence": "VERIFIER R2 2026-10-09 (new; checks run 2026-10-10): the AF-gtm-10 rework gave three rows the status 'HELD 2026-10-10: reference case, not a first target; not in B1' (:16-18) and 'HELD (not in B1)' in the send log (:560-562), but left the banner at :4 saying \u2026",
      "status": "open"
     },
     {
      "id": "AF-gtm-6",
      "agent": "gtm",
      "task": "V07",
      "severity": "minor",
      "kind": "error",
      "claim": "gtm/targets.csv:10 Google \"Google Cloud Autism Career Program (announced April 2021)\", confidence high",
      "evidence": "WebSearch, summary level: the program was announced in a Google Cloud blog post by Rob Enslin dated 2021-07-26 (https://cloud.google.com/blog/topics/inside-google-cloud/google-cloud-launches-a-career-program-for-people-with-autism); Google's 'Cloud Covered' J\u2026",
      "status": "fixed"
     },
     {
      "id": "AF-gtm-7",
      "agent": "gtm",
      "task": "V07",
      "severity": "minor",
      "kind": "error",
      "claim": "targets.csv:23 Ubisoft \"Neurodiversity ERG formed in 2020; Roundtable member\"; :26 Hearst \"Roundtable member\"; :15 Travelers \"Roundtable member since 2018\"; :6 Ford \"FordWorks autism hiring initiative\"",
      "evidence": "WebSearch summaries: Ubisoft's own ERG spotlight (news.ubisoft.com) says the founder started it on 2021-02-14; Ubisoft and Hearst are on no Roundtable roster found (AskEARN, Disability:IN). Travelers' membership is confirmed (sustainability.travelers.com) but\u2026",
      "status": "fixed"
     },
     {
      "id": "AF-gtm-8",
      "agent": "gtm",
      "task": "V07",
      "severity": "minor",
      "kind": "unsupported_claim",
      "claim": "gtm/targets.csv:38 Brown University: \"Public posting for a Leave and Accommodation Manager who is lead resource for managers, HRBPs and employees\", source_url https://www.indeed.com/q-ada-accommodation-manager-jobs.html",
      "evidence": "The source URL is a generic Indeed search-results page, not a Brown posting, so it supports nothing row-specific. The posting does exist (RecruitMilitary job 44506334, recruiting start 2025-02-18; Brown policy at hr.brown.edu names UHR Leaves and Accommodatio\u2026",
      "status": "fixed"
     },
     {
      "id": "AF-gtm-9",
      "agent": "gtm",
      "task": "V07",
      "severity": "minor",
      "kind": "process",
      "claim": "targets.csv confidence = high on 23 rows; ledger 2026-10-06T12:45:44Z \"23 high-confidence\"",
      "evidence": "graph/activity/V07.jsonl: every WebFetch was blocked (askearn.org, iu.pressbooks.pub, disabilityin.org) and the rest are WebSearch summaries, so no source page was read. The CSV never defines the scale, and only askearn rows say 'not fetched'. outreach-log.md\u2026",
      "status": "fixed"
     }
    ],
    "computedAt": "2026-10-10T12:51:41Z"
   },
   {
    "agent": "finance",
    "name": "Pacioli",
    "score": 77.2,
    "grade": "C",
    "meetsInstitutionalBar": false,
    "dimensions": [
     {
      "id": "first_pass_yield",
      "label": "First-pass yield",
      "weight": 20,
      "score": 33.3,
      "basis": "1/3 verified tasks passed first time (M05); needed rework, a block or a later correction: V10 (0 failed rounds, 0 blocks, 0 orchestrator corrections, 1 major or critical auditor findings), V11 (0 failed rounds, 0 blocks, 0 orchestrator corrections, 1 major or critical auditor findings)."
     },
     {
      "id": "effective_challenge",
      "label": "Verification outcome: rework and open gaps",
      "weight": 15,
      "score": 89.5,
      "basis": "0 failed verification rounds over 3 verified tasks (0.00 per task); 0 open FAIL/GAP rows after the last revision; 1 non-blocking notes left open (V11 1). Findings: -7.5 from 1 open finding(s) and 7 fixed after the audit (a quarter weight each)."
     },
     {
      "id": "evidence",
      "label": "Evidence discipline",
      "weight": 15,
      "score": 96.1,
      "basis": "493/509 numeric claims (97%) in 3 output files are traceable: a source URL, file or task reference, citation, derivation or [S]/[U]/unverified/assumption/estimate/measured label on the line or table caption, or a restatement of such a figure; by task: V10 model.md 84/85, V11 grants.md 91/91, M05 sbir-draft.md 318/333; untraced examples: V10: 12 months; M05: 1.25 pages. Score shrinks the share toward neutral by 5 cla\u2026"
     },
     {
      "id": "integrity",
      "label": "Honesty and research integrity",
      "weight": 20,
      "score": 100.0,
      "basis": "Over 3 tasks in the ledger: 0 orchestrator corrections of a false claim; 0 self-verified completions; 0 verifier FAIL/GAP rows naming a false statement."
     },
     {
      "id": "process",
      "label": "Process discipline and separation of duties",
      "weight": 15,
      "score": 68.3,
      "basis": "3 closed tasks in the ledger: step records on 3 (53 self-logged rows, 152 transcript rows); verifier rows on 3; a separate verifier run evidenced by its own ingested transcript on 0; separation only declared with the --verifier flag (identity not evidenced, 10 of 25): V10 V11 M05; verified only after closing (half credit): V10 V11."
     },
     {
      "id": "gates",
      "label": "Founder gates and safety controls",
      "weight": 5,
      "score": 100.0,
      "basis": "1 gated tasks worked on (M05); 0 marked done without the founder clearing the gate; 0 gate clearances without a recorded founder answer. Gated actions taken outside the record are left to LLM findings."
     },
     {
      "id": "budget",
      "label": "Budget adherence",
      "weight": 5,
      "score": 65.3,
      "basis": "2 measured runs; allowance = budget_k + 70k spawn overhead (PROMPT.md, measured in loop 1); within allowance: none; over: V10 108.6k vs 25k, V11 131.8k vs 15k. Raw used/budget total 240.4k/40k."
     },
     {
      "id": "reliability",
      "label": "Reliability: interruptions and stalls",
      "weight": 5,
      "score": 84.0,
      "basis": "2 recorded interruptions (usage/session limits, failed pushes) over 3 tasks (M05 2); 0 running tasks with no step in 15 min."
     }
    ],
    "findings": [
     {
      "id": "AF-finance-1",
      "agent": "finance",
      "task": "V10",
      "severity": "major",
      "kind": "error",
      "claim": "finance/model.md:39-40 \"Peak cumulative funding need: $3.17M / $4.93M / $8.66M\" and \"Cumulative cash at month 60 (negative = still burning): -$8.66M / -$4.93M / -$3.17M\" (printed by finance/model.py:221-222)",
      "evidence": "I re-ran finance/model.py with seed 20261006, and its output is byte-identical to model.md. I then instrumented the trials. In 9,682 of 10,000 trials the lowest cumulative cash falls at month 60, so the business is still losing cash every month at the end of \u2026",
      "status": "fixed"
     },
     {
      "id": "AF-finance-2",
      "agent": "finance",
      "task": "V11",
      "severity": "major",
      "kind": "process",
      "claim": "graph/ledger.jsonl:18 \"done\", \"V10\", \"MC: Y5 ARR P10/50/90 $53k/$633k/$4.31M ...\" and graph/ledger.jsonl:22 \"done\", \"V11\", \"Top: NIH SBIR I (~$307k, 2027-01-05) ...\"",
      "evidence": "PROMPT.md:39 requires a separate verifier, logged with 'check --verifier', before a node is done. graph/activity/V10.jsonl and V11.jsonl contain no 'check' entries, and each node was closed 15 s and 6 s after the agent's handoff. graph/audit/scorecards.json (\u2026",
      "status": "fixed"
     },
     {
      "id": "AF-finance-3",
      "agent": "finance",
      "task": "V11",
      "severity": "major",
      "kind": "error",
      "claim": "finance/grants.md:13 \"NIH SBIR Phase I (R43) via NIMH, NICHD or NIA. Parent notice reported as PA-27-102\"",
      "evidence": "WebSearch, NIH SEED and aggregator summaries (grants.nih.gov fetch blocked). PA-27-100 is the NIH/CDC/FDA parent SBIR notice for R43/R44, clinical trial optional, issued 2026-05-28. PA-27-102 is the parent STTR notice for R41/R42, which requires a nonprofit r\u2026",
      "status": "fixed"
     },
     {
      "id": "AF-finance-10",
      "agent": "finance",
      "task": "V11",
      "severity": "minor",
      "kind": "incomplete",
      "claim": "docs/ownership-and-budget-options.md:182 \"The cap is $314,363 per sbir-draft R9 (grants.md's $306,872 is older; the FY2027 value is unverified, and one third-party guide lists $323,090)\"",
      "evidence": "VERIFIER R2 2026-10-09 (checked 2026-10-10): finance/grants.md was corrected to $314,363 / $2,095,748 on 2026-10-09 (AF-finance-4; grants.md:5, :13 and :46 today), and '$306,872' now appears in grants.md only inside dated correction notes. The orchestrator's \u2026",
      "status": "open"
     },
     {
      "id": "AF-finance-4",
      "agent": "finance",
      "task": "V11",
      "severity": "minor",
      "kind": "error",
      "claim": "finance/grants.md:5 \"the secondary-source standard cap is $306,872\"; finance/grants.md:13 \"About $306,872 Phase I and $2,045,816 Phase II standard caps\"; finance/grants.md:27 \"at least 51% of ownership held by US citizens or permanent residents\"",
      "evidence": "NOT-OD-25-013 (https://grants.nih.gov/grants/guide/notice-files/NOT-OD-25-013.html, confirmed by search) raised NIH's normal totals from $306,872 / $2,045,816 to $314,363 / $2,095,748, before grants.md was written. 13 CFR 121.702 says 'more than 50%' (sbir-dr\u2026",
      "status": "fixed"
     },
     {
      "id": "AF-finance-5",
      "agent": "finance",
      "task": "M05",
      "severity": "minor",
      "kind": "incomplete",
      "claim": "finance/sbir-draft.md:19 (R2) \"so caps should exist now; no agency figure was found\" (status \"cap numbers U\") and finance/sbir-draft.md:103 \"FY2027 per-company proposal caps may limit how many we can send (R2, details U)\"",
      "evidence": "NOT-OD-26-090, dated 2026-07-10 (https://grants.nih.gov/grants/guide/notice-files/NOT-OD-26-090.html, confirmed by search), sets the HHS limit. Each small business may submit at most nine new or resubmission Phase I, Fast-Track and Direct-to-Phase-II applicat\u2026",
      "status": "fixed"
     },
     {
      "id": "AF-finance-6",
      "agent": "finance",
      "task": "M05",
      "severity": "minor",
      "kind": "unsupported_claim",
      "claim": "finance/sbir-draft.md:52 (Specific Aims text for reviewers) \"Paid neurodivergent advisors hold a veto over content.\"",
      "evidence": "The same file says at :181 'No advisor is seated yet; seating and payment are founder-gated' and at :226 'No advisors, no partner IRB yet'. In reviewer-facing aims, the present tense states as fact a governance structure that does not exist. It should read as\u2026",
      "status": "fixed"
     },
     {
      "id": "AF-finance-7",
      "agent": "finance",
      "task": "M05",
      "severity": "minor",
      "kind": "error",
      "claim": "finance/sbir-draft.md:148 \"A 40% rate is a stress case taken from the NIH figure in R12\"",
      "evidence": "R12 (sbir-draft.md:29) contains no 40% NIH figure. It cites the 15% de minimis rate (2 CFR 200.414(f)), NOT-OD-25-059 and a 10% rate from NOT-OD-26-072, and A12 (:165) calls 40% only a stress case. The sentence therefore points to a source that is not there. \u2026",
      "status": "fixed"
     },
     {
      "id": "AF-finance-8",
      "agent": "finance",
      "task": "V11",
      "severity": "minor",
      "kind": "incomplete",
      "claim": "finance/grants.md:3 \"Founder country is unconfirmed, so the map is tiered by country.\" and finance/grants.md:54 \"Confirm country and ownership structure. This decides which tier is open.\"",
      "evidence": "VERIFIER 2026-10-09: docs/founder-decisions.md:7 records 'Decided 2026-10-08: United States. Ownership structure still open'. grants.md was edited on 2026-10-09 (13:53 UTC), including the summary on line 3, but kept the 'country is unconfirmed' sentence. The \u2026",
      "status": "fixed"
     },
     {
      "id": "AF-finance-9",
      "agent": "finance",
      "task": "M05",
      "severity": "minor",
      "kind": "incomplete",
      "claim": "finance/sbir-draft.md:21 (R3) \"(D01 says \"at least 51%\", which is the older wording; grants.md was corrected to \"more than 50%\" on 2026-10-09)\" and finance/sbir-draft.md:245 \"docs/founder-decisions.md item 1 still says \"at least 51%\"; its owner should change \u2026",
      "evidence": "VERIFIER 2026-10-09: docs/founder-decisions.md:7 was rewritten at 18:59 UTC on 2026-10-09, after the M05 rework at 13:55 UTC. It now reads 'more than 50% directly owned **and controlled** by US citizens or permanent residents (13 CFR 121.702; exactly 50% fail\u2026",
      "status": "fixed"
     }
    ],
    "computedAt": "2026-10-10T12:51:41Z"
   },
   {
    "agent": "legal",
    "name": "Ginsburg",
    "score": 79.3,
    "grade": "C",
    "meetsInstitutionalBar": false,
    "dimensions": [
     {
      "id": "first_pass_yield",
      "label": "First-pass yield",
      "weight": 20,
      "score": 50.0,
      "basis": "1/2 verified tasks passed first time (V12); needed rework, a block or a later correction: M04 (1 failed rounds, 0 blocks, 0 orchestrator corrections, 0 major or critical auditor findings)."
     },
     {
      "id": "effective_challenge",
      "label": "Verification outcome: rework and open gaps",
      "weight": 15,
      "score": 62.0,
      "basis": "1 failed verification rounds over 2 verified tasks (0.50 per task); rework: M04 x1; 1 open FAIL/GAP rows after the last revision; open on: M04; 1 non-blocking notes left open (V12 1). Findings: -5 from 2 open finding(s) and 2 fixed after the audit (a quarter weight each)."
     },
     {
      "id": "evidence",
      "label": "Evidence discipline",
      "weight": 15,
      "score": 98.1,
      "basis": "75/75 numeric claims (100%) in 2 output files are traceable: a source URL, file or task reference, citation, derivation or [S]/[U]/unverified/assumption/estimate/measured label on the line or table caption, or a restatement of such a figure; by task: V12 privacy.md 3/3, M04 entity-checklist.md 72/72. Score shrinks the share toward neutral by 5 claims (small samples are imprecise). Fabricated citations cannot be dete\u2026"
     },
     {
      "id": "integrity",
      "label": "Honesty and research integrity",
      "weight": 20,
      "score": 95.0,
      "basis": "Over 2 tasks in the ledger: 0 orchestrator corrections of a false claim; 0 self-verified completions; 1 verifier FAIL/GAP rows naming a false statement (M04 1)."
     },
     {
      "id": "process",
      "label": "Process discipline and separation of duties",
      "weight": 15,
      "score": 85.0,
      "basis": "2 closed tasks in the ledger: step records on 2 (25 self-logged rows, 97 transcript rows); verifier rows on 2; a separate verifier run evidenced by its own ingested transcript on 0; separation only declared with the --verifier flag (identity not evidenced, 10 of 25): V12 M04."
     },
     {
      "id": "gates",
      "label": "Founder gates and safety controls",
      "weight": 5,
      "score": 100.0,
      "basis": "1 gated tasks worked on (M04); 0 marked done without the founder clearing the gate; 0 gate clearances without a recorded founder answer. Gated actions taken outside the record are left to LLM findings."
     },
     {
      "id": "budget",
      "label": "Budget adherence",
      "weight": 5,
      "score": 70.0,
      "basis": "No data: no task with both a token budget and a measured run. Scored neutral (70)."
     },
     {
      "id": "reliability",
      "label": "Reliability: interruptions and stalls",
      "weight": 5,
      "score": 100.0,
      "basis": "0 recorded interruptions (usage/session limits, failed pushes) over 2 tasks; 0 running tasks with no step in 15 min."
     }
    ],
    "findings": [
     {
      "id": "AF-legal-1",
      "agent": "legal",
      "task": "M04",
      "severity": "minor",
      "kind": "incomplete",
      "claim": "\"Entity choice waits on founder decision D01 #1 (country, majority owners).\" (perspective-engine/legal/entity-checklist.md:6) and \"Open: D01 #1 country of residence and of the majority owners\" (entity-checklist.md:14)",
      "evidence": "perspective-engine/docs/founder-decisions.md:7 now records \"Decided 2026-10-08: United States. Ownership structure still open\". The checklist (dated 2026-10-07) was correct when written, but it now presents country as open and still carries option C (India Pv\u2026",
      "status": "fixed"
     },
     {
      "id": "AF-legal-2",
      "agent": "legal",
      "task": "M04",
      "severity": "minor",
      "kind": "incomplete",
      "claim": "\"No USPTO/WIPO search has been run in this draft (step 2).\" (perspective-engine/legal/entity-checklist.md:16) and step 2 \"OPEN (read-only; not run in this draft)\" (entity-checklist.md:47)",
      "evidence": "The M04 input perspective-engine/docs/founder-decisions.md:12 tells the founder \"Keep it for now; legal agent runs a free USPTO/WIPO search in M04\". M04 did not run it, so the founder's D01 #6 option relies on work that was not done. M04 disclosed this honest\u2026",
      "status": "open"
     },
     {
      "id": "AF-legal-3",
      "agent": "legal",
      "task": "M04",
      "severity": "minor",
      "kind": "incomplete",
      "claim": "legal/entity-checklist.md:15 \"`founder-decisions.md` states the SBIR test as \"at least 51%\". The rule text reads \"more than 50%\"\"",
      "evidence": "VERIFIER 2026-10-09: docs/founder-decisions.md:7 was modified at 18:59 UTC on 2026-10-09, after the M04 rework at 13:57 UTC. It now reads 'more than 50% directly owned **and controlled** by US citizens or permanent residents (13 CFR 121.702; exactly 50% fails\u2026",
      "status": "fixed"
     },
     {
      "id": "AF-legal-4",
      "agent": "legal",
      "task": "M04",
      "severity": "minor",
      "kind": "incomplete",
      "claim": "legal/entity-checklist.md:17 \"`founder-decisions.md` item 6 says the legal agent runs this search in M04; that has not happened, and the owner of that file should update it.\"",
      "evidence": "VERIFIER R2 2026-10-09 (checked 2026-10-10): docs/founder-decisions.md:12 (item 6) was rewritten by its owner at 2026-10-10T01:03:40Z (graph/activity/D01.jsonl; file mtime 01:04:22Z). That was about ten minutes after legal's round-2 edit of entity-checklist.m\u2026",
      "status": "open"
     }
    ],
    "computedAt": "2026-10-10T12:51:41Z"
   },
   {
    "agent": "brand",
    "name": "Rams",
    "score": 63.2,
    "grade": "D",
    "meetsInstitutionalBar": false,
    "dimensions": [
     {
      "id": "first_pass_yield",
      "label": "First-pass yield",
      "weight": 20,
      "score": 0.0,
      "basis": "0/1 verified tasks passed first time (none); needed rework, a block or a later correction: V13 (1 failed rounds, 0 blocks, 0 orchestrator corrections, 1 major or critical auditor findings)."
     },
     {
      "id": "effective_challenge",
      "label": "Verification outcome: rework and open gaps",
      "weight": 15,
      "score": 67.0,
      "basis": "1 failed verification rounds over 1 verified tasks (1.00 per task); rework: V13 x1; 0 open FAIL/GAP rows after the last revision; 0 non-blocking notes left open. Findings: -3 from 1 open finding(s) and 2 fixed after the audit (a quarter weight each)."
     },
     {
      "id": "evidence",
      "label": "Evidence discipline",
      "weight": 15,
      "score": 70.0,
      "basis": "No data: no numeric claims found in 0 readable output files of closed tasks. Scored neutral (70)."
     },
     {
      "id": "integrity",
      "label": "Honesty and research integrity",
      "weight": 20,
      "score": 100.0,
      "basis": "Over 1 tasks in the ledger: 0 orchestrator corrections of a false claim; 0 self-verified completions; 0 verifier FAIL/GAP rows naming a false statement."
     },
     {
      "id": "process",
      "label": "Process discipline and separation of duties",
      "weight": 15,
      "score": 64.8,
      "basis": "No data: no closed task of this agent in the ledger. Scored neutral (70). Findings: -5.25 from 0 open finding(s) and 2 fixed after the audit (a quarter weight each)."
     },
     {
      "id": "gates",
      "label": "Founder gates and safety controls",
      "weight": 5,
      "score": 70.0,
      "basis": "No data: no gated task has been worked on. Scored neutral (70)."
     },
     {
      "id": "budget",
      "label": "Budget adherence",
      "weight": 5,
      "score": 88.4,
      "basis": "1 measured runs; allowance = budget_k + 70k spawn overhead (PROMPT.md, measured in loop 1); within allowance: none; over: V13 100.4k vs 20k. Raw used/budget total 100.4k/20k."
     },
     {
      "id": "reliability",
      "label": "Reliability: interruptions and stalls",
      "weight": 5,
      "score": 100.0,
      "basis": "0 recorded interruptions (usage/session limits, failed pushes) over 1 tasks; 0 running tasks with no step in 15 min."
     }
    ],
    "findings": [
     {
      "id": "AF-brand-1",
      "agent": "brand",
      "task": "V13",
      "severity": "critical",
      "kind": "process",
      "claim": "brand/landing/index.html:140 \"A short browser-based practice module, co-designed with paid ADHD advisors\"; :8 (meta description), :224 \"Co-designed with paid ADHD advisors who can say no.\", :166 \"co-designed with ADHD adults\"",
      "evidence": "The same page says at :234 \"We have not yet recruited advisors, and no ADHD adult has reviewed it.\" V14 is awaiting_human and the advisor budget is still open (founder-decisions.md:8). The headline value claim is false and contradicts the page's own disclosur\u2026",
      "status": "fixed"
     },
     {
      "id": "AF-brand-2",
      "agent": "brand",
      "task": "V13",
      "severity": "major",
      "kind": "process",
      "claim": "graph/ledger.jsonl 2026-10-06T12:57:36Z done V13 \"Landing page: no 'simulate' claims, inert pilot form, honest 'where this stands' box\"",
      "evidence": "PROMPT.md:39 requires a separate verifier who logs check --verifier. graph/activity/V13.jsonl has only the builder's self-checks (12:57:06-12:57:22) and closes 5 s after handoff. The self-check missed the hero/disclosure contradiction (AF-brand-1). tools/audi\u2026",
      "status": "fixed"
     },
     {
      "id": "AF-brand-3",
      "agent": "brand",
      "task": "V13",
      "severity": "minor",
      "kind": "error",
      "claim": "brand/landing/index.html:191 \"The pilot's main outcome is behavior at 30 days.\" and :198-199 \"We count ... Whether meeting structure is agreed with the person. Whether managers avoid diagnosing or labeling colleagues.\"",
      "evidence": "science/preregistration.md:104 fixes the primary as AAI-verified over 10 listed practices. Neither 'meeting structure agreed' nor 'avoid diagnosing/labeling' is on the list, and the second cannot be verified by its log/3-report rule. So 2 of the 4 behaviours \u2026",
      "status": "fixed"
     },
     {
      "id": "AF-brand-4",
      "agent": "brand",
      "task": "V13",
      "severity": "minor",
      "kind": "error",
      "claim": "brand/landing/index.html:217 \"We write down the measures and the stop thresholds before anyone takes part. If discomfort or attitudes get worse beyond the threshold, we pause.\"",
      "evidence": "VERIFIER 2026-10-09 (new): science/preregistration.md:96 (Stopping rule) pre-registers a single pause trigger: T-arm enrolment pauses only if the T minus C increase in the QPS Reliability and Social Functioning subscale (an attitude/stigma measure) exceeds a \u2026",
      "status": "fixed"
     },
     {
      "id": "AF-brand-5",
      "agent": "brand",
      "task": "V13",
      "severity": "minor",
      "kind": "error",
      "claim": "brand/landing/index.html:217 \"The pilot compares the simulation with an information-only module of the same length. If stigma-related attitudes worsen more after the simulation than after the information module ... we stop enrolling people into the simulation\u2026",
      "evidence": "VERIFIER R2 2026-10-09 (new; checks run 2026-10-10): grep -o -i 'simulat' now finds 3 matches, all on :217, added by the AF-brand-4 rework. Before it the count was 0, and that was how V13's acceptance criterion 'no claim to simulate ADHD' was verified (AF-bra\u2026",
      "status": "open"
     }
    ],
    "computedAt": "2026-10-10T12:51:41Z"
   }
  ],
  "notice": "A rubric informed by NIST AI RMF 1.0, SR 11-7, ISO/IEC 42001, GRADE, first-pass yield and research-integrity definitions; not a certification. See docs/JARVIS_AUDIT_RUBRIC.md.",
  "neutralScore": 70.0,
  "inputs": {
   "nodes": 34,
   "ledgerEvents": 69,
   "activityRows": 1283,
   "llmFindings": 106,
   "llmAuditedAgents": [
    "brand",
    "data",
    "ethics",
    "finance",
    "gtm",
    "legal",
    "orchestrator",
    "product",
    "science"
   ],
   "revenueEntries": 0
  },
  "checks": {
   "brand": 1,
   "data": 1,
   "ethics": 1,
   "finance": 1,
   "gtm": 1,
   "legal": 1,
   "orchestrator": 1,
   "product": 1,
   "science": 1
  },
  "founderAuth": {
   "keyRegistered": false,
   "keyRegisteredAt": null,
   "keyFingerprint": null,
   "rotations": 0,
   "signatures": 0,
   "verified": 0,
   "unsignedFounderActions": 5,
   "statusMismatches": 0
  },
  "revenueCheck": {
   "entries": 0,
   "verified": 0,
   "flagged": []
  },
  "warnings": []
 }
};
