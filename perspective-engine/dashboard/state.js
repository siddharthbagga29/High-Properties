window.PE_STATE = {
 "generated": "2026-10-08T19:16:52Z",
 "project": "Perspective Engine",
 "north_star": "A validated, co-designed perspective-taking simulator with 3 paid B2B pilots and a published pilot study by month 12.",
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
   "status": "done",
   "view": "done"
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
   "status": "done",
   "run": {
    "used_k": 73.4,
    "duration_s": 83,
    "tools": 6
   },
   "view": "done"
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
   "status": "done",
   "run": {
    "used_k": 74.4,
    "duration_s": 67,
    "tools": 5
   },
   "view": "done"
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
   "status": "done",
   "run": {
    "used_k": 102.5,
    "duration_s": 180,
    "tools": 24
   },
   "view": "done"
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
   "status": "done",
   "run": {
    "used_k": 82.7,
    "duration_s": 107,
    "tools": 7
   },
   "view": "done"
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
   "status": "awaiting_human",
   "view": "awaiting_human"
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
   "status": "done",
   "run": {
    "used_k": 100.4,
    "duration_s": 206,
    "tools": 11
   },
   "view": "done"
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
   "status": "awaiting_human",
   "view": "awaiting_human"
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
   "t": "2026-10-06T12:55:40Z",
   "event": "done",
   "node": "V11",
   "note": "Top: NIH SBIR I (~$307k, 2027-01-05), NIDILRR SBIR (employment fit), NSF SBIR; US tiers need 51% US ownership"
  },
  {
   "t": "2026-10-06T12:55:59Z",
   "event": "start",
   "node": "D01",
   "note": ""
  },
  {
   "t": "2026-10-06T12:55:59Z",
   "event": "done",
   "node": "D01",
   "note": "Decision sheet prepared"
  },
  {
   "t": "2026-10-06T12:57:36Z",
   "event": "done",
   "node": "V13",
   "note": "Landing page: no 'simulate' claims, inert pilot form, honest 'where this stands' box"
  },
  {
   "t": "2026-10-06T12:57:56Z",
   "event": "block",
   "node": "F04",
   "note": "Prototype agent was stopped by the founder; relaunch only on founder instruction"
  },
  {
   "t": "2026-10-06T12:57:56Z",
   "event": "start",
   "node": "F05",
   "note": ""
  },
  {
   "t": "2026-10-06T12:57:56Z",
   "event": "done",
   "node": "F05",
   "note": "Plan v1: 4 falsifiable hypotheses w/ kill criteria; browser-first; behavior outcome; MC shows $50M@48mo ~0.6%"
  },
  {
   "t": "2026-10-06T12:57:56Z",
   "event": "start",
   "node": "V06",
   "note": ""
  },
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
  }
 ],
 "revenue": [],
 "audit": {
  "computedAt": "2026-10-08T19:16:52Z",
  "rubricVersion": "1.0",
  "scorecards": [
   {
    "agent": "orchestrator",
    "name": "Mayor",
    "score": 64.6,
    "grade": "D",
    "meetsInstitutionalBar": false,
    "dimensions": [
     {
      "id": "first_pass_yield",
      "label": "First-pass yield",
      "weight": 20,
      "score": 70.0,
      "basis": "No data: no task with a verification record; closed without a verification record: F05 F07 D01. Scored neutral (70)."
     },
     {
      "id": "effective_challenge",
      "label": "Verification outcome: rework and open gaps",
      "weight": 15,
      "score": 70.0,
      "basis": "No data: no task with a verification record. Scored neutral (70)."
     },
     {
      "id": "evidence",
      "label": "Evidence discipline",
      "weight": 15,
      "score": 75.5,
      "basis": "32/42 numeric claims (76%) in 4 output files are traceable: a source URL, file or task reference, citation, derivation or [S]/[U]/unverified/assumption/estimate/measured label on the line or table caption, or a restatement of such a figure; by task: F02 index.html 0/1, F05 execution-plan.md 25/29, F07 PLAN.md 1/6, D01 founder-decisions.md 6/6; untraced examples: F02: 0%; F05: d\u22480.33; F07: 160k. Score shrinks the share toward neutral by 5 claims (small samples are imprecise). Fabricated citations cannot be detected offline (left to LLM findings)."
     },
     {
      "id": "integrity",
      "label": "Honesty and research integrity",
      "weight": 20,
      "score": 70.0,
      "basis": "Over 3 tasks in the ledger: 0 orchestrator corrections of a false claim; 3 self-verified completions (F05 F07 D01: closed by their builder with no verifier row); 0 verifier FAIL/GAP rows naming a false statement. No independent LLM citation audit covers this agent yet, so this dimension is capped at 85 (fabricated citations cannot be ruled out offline)."
     },
     {
      "id": "process",
      "label": "Process discipline and separation of duties",
      "weight": 15,
      "score": 8.8,
      "basis": "3 closed tasks in the ledger: step records on 1 (2 self-logged rows, 0 transcript rows); verifier rows on 0; flagged --verifier (separate from builder rows) on 0; closed with no verification record: F05 F07 D01; graph-wide closure discipline (half of this score): 7/24 closures in the ledger have a verification record; orchestrator rewrote another agent's output instead of returning it: V09 (-10 each); not scored, closed before the ledger began: F01 F02."
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
    "findings": [],
    "computedAt": "2026-10-08T19:16:52Z"
   },
   {
    "agent": "science",
    "name": "Curie",
    "score": 73.5,
    "grade": "C",
    "meetsInstitutionalBar": false,
    "dimensions": [
     {
      "id": "first_pass_yield",
      "label": "First-pass yield",
      "weight": 20,
      "score": 70.0,
      "basis": "No data: no task with a verification record; closed without a verification record: F03 V01 V03 V15. Scored neutral (70)."
     },
     {
      "id": "effective_challenge",
      "label": "Verification outcome: rework and open gaps",
      "weight": 15,
      "score": 70.0,
      "basis": "No data: no task with a verification record. Scored neutral (70)."
     },
     {
      "id": "evidence",
      "label": "Evidence discipline",
      "weight": 15,
      "score": 92.4,
      "basis": "185/199 numeric claims (93%) in 4 output files are traceable: a source URL, file or task reference, citation, derivation or [S]/[U]/unverified/assumption/estimate/measured label on the line or table caption, or a restatement of such a figure; by task: F03 evidence-dossier.md 36/42, V01 mechanism-spec.md 37/37, V03 preregistration.md 100/107, V15 partners.md 12/13; untraced examples: F03: d+ = 0.51; V03: d = 0.66; V15: 4-8 weeks. Score shrinks the share toward neutral by 5 claims (small samples are imprecise). Fabricated citations cannot be detected offline (left to LLM findings)."
     },
     {
      "id": "integrity",
      "label": "Honesty and research integrity",
      "weight": 20,
      "score": 85.0,
      "basis": "Over 4 tasks in the ledger: 0 orchestrator corrections of a false claim; 0 self-verified completions; 0 verifier FAIL/GAP rows naming a false statement. No independent LLM citation audit covers this agent yet, so this dimension is capped at 85 (fabricated citations cannot be ruled out offline)."
     },
     {
      "id": "process",
      "label": "Process discipline and separation of duties",
      "weight": 15,
      "score": 25.0,
      "basis": "4 closed tasks in the ledger: step records on 4 (0 self-logged rows, 73 transcript rows); verifier rows on 0; flagged --verifier (separate from builder rows) on 0; closed with no verification record: F03 V01 V03 V15."
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
    "findings": [],
    "computedAt": "2026-10-08T19:16:52Z"
   },
   {
    "agent": "ethics",
    "name": "Milton",
    "score": 57.5,
    "grade": "F",
    "meetsInstitutionalBar": false,
    "dimensions": [
     {
      "id": "first_pass_yield",
      "label": "First-pass yield",
      "weight": 20,
      "score": 0.0,
      "basis": "0/1 verified tasks passed first time (none); needed rework, a block or a later correction: M03 (2 failed rounds, 1 blocks, 0 orchestrator corrections); not counted, no verification record: F06 V04."
     },
     {
      "id": "effective_challenge",
      "label": "Verification outcome: rework and open gaps",
      "weight": 15,
      "score": 37.0,
      "basis": "2 failed verification rounds over 1 verified tasks (2.00 per task); rework: M03 x2; 0 open FAIL/GAP rows after the last revision; 1 non-blocking notes left open (M03 1)."
     },
     {
      "id": "evidence",
      "label": "Evidence discipline",
      "weight": 15,
      "score": 91.6,
      "basis": "67/72 numeric claims (93%) in 3 output files are traceable: a source URL, file or task reference, citation, derivation or [S]/[U]/unverified/assumption/estimate/measured label on the line or table caption, or a restatement of such a figure; by task: F06 codesign-charter.md 14/14, V04 advisory-board.md 27/28, M03 irb-packet.md 26/30; untraced examples: V04: 10 minutes; M03: 10 people. Score shrinks the share toward neutral by 5 claims (small samples are imprecise). Fabricated citations cannot be detected offline (left to LLM findings)."
     },
     {
      "id": "integrity",
      "label": "Honesty and research integrity",
      "weight": 20,
      "score": 85.0,
      "basis": "Over 3 tasks in the ledger: 0 orchestrator corrections of a false claim; 0 self-verified completions; 1 verifier FAIL/GAP rows naming a false statement (M03 1). No independent LLM citation audit covers this agent yet, so this dimension is capped at 85 (fabricated citations cannot be ruled out offline)."
     },
     {
      "id": "process",
      "label": "Process discipline and separation of duties",
      "weight": 15,
      "score": 41.7,
      "basis": "3 closed tasks in the ledger: step records on 3 (18 self-logged rows, 111 transcript rows); verifier rows on 1; flagged --verifier (separate from builder rows) on 0; closed with no verification record: F06 V04; verifier rows not flagged --verifier: M03."
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
    "findings": [],
    "computedAt": "2026-10-08T19:16:52Z"
   },
   {
    "agent": "product",
    "name": "Ada",
    "score": 76.1,
    "grade": "C",
    "meetsInstitutionalBar": false,
    "dimensions": [
     {
      "id": "first_pass_yield",
      "label": "First-pass yield",
      "weight": 20,
      "score": 50.0,
      "basis": "1/2 verified tasks passed first time (V14); needed rework, a block or a later correction: F04 (3 failed rounds, 2 blocks, 0 orchestrator corrections)."
     },
     {
      "id": "effective_challenge",
      "label": "Verification outcome: rework and open gaps",
      "weight": 15,
      "score": 49.0,
      "basis": "3 failed verification rounds over 2 verified tasks (1.50 per task); rework: F04 x3; 0 open FAIL/GAP rows after the last revision; 2 non-blocking notes left open (V14 2)."
     },
     {
      "id": "evidence",
      "label": "Evidence discipline",
      "weight": 15,
      "score": 96.1,
      "basis": "132/136 numeric claims (97%) in 3 output files are traceable: a source URL, file or task reference, citation, derivation or [S]/[U]/unverified/assumption/estimate/measured label on the line or table caption, or a restatement of such a figure; by task: F04 index.html 3/3, F04 README.md 127/131, V14 CHANGELOG.md 2/2; untraced examples: F04: 30 days. Score shrinks the share toward neutral by 5 claims (small samples are imprecise). Fabricated citations cannot be detected offline (left to LLM findings)."
     },
     {
      "id": "integrity",
      "label": "Honesty and research integrity",
      "weight": 20,
      "score": 85.0,
      "basis": "Over 2 tasks in the ledger: 0 orchestrator corrections of a false claim; 0 self-verified completions; 1 verifier FAIL/GAP rows naming a false statement (F04 1). No independent LLM citation audit covers this agent yet, so this dimension is capped at 85 (fabricated citations cannot be ruled out offline)."
     },
     {
      "id": "process",
      "label": "Process discipline and separation of duties",
      "weight": 15,
      "score": 100.0,
      "basis": "2 closed tasks in the ledger: step records on 2 (77 self-logged rows, 260 transcript rows); verifier rows on 2; flagged --verifier (separate from builder rows) on 2."
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
    "findings": [],
    "computedAt": "2026-10-08T19:16:52Z"
   },
   {
    "agent": "data",
    "name": "Tukey",
    "score": 70.7,
    "grade": "C",
    "meetsInstitutionalBar": false,
    "dimensions": [
     {
      "id": "first_pass_yield",
      "label": "First-pass yield",
      "weight": 20,
      "score": 70.0,
      "basis": "No data: no task with a verification record; closed without a verification record: V02. Scored neutral (70)."
     },
     {
      "id": "effective_challenge",
      "label": "Verification outcome: rework and open gaps",
      "weight": 15,
      "score": 70.0,
      "basis": "No data: no task with a verification record. Scored neutral (70)."
     },
     {
      "id": "evidence",
      "label": "Evidence discipline",
      "weight": 15,
      "score": 89.4,
      "basis": "26/28 numeric claims (93%) in 1 output files are traceable: a source URL, file or task reference, citation, derivation or [S]/[U]/unverified/assumption/estimate/measured label on the line or table caption, or a restatement of such a figure; by task: V02 instruments.md 26/28; untraced examples: V02: 7 days. Score shrinks the share toward neutral by 5 claims (small samples are imprecise). Fabricated citations cannot be detected offline (left to LLM findings)."
     },
     {
      "id": "integrity",
      "label": "Honesty and research integrity",
      "weight": 20,
      "score": 85.0,
      "basis": "Over 1 tasks in the ledger: 0 orchestrator corrections of a false claim; 0 self-verified completions; 0 verifier FAIL/GAP rows naming a false statement. No independent LLM citation audit covers this agent yet, so this dimension is capped at 85 (fabricated citations cannot be ruled out offline)."
     },
     {
      "id": "process",
      "label": "Process discipline and separation of duties",
      "weight": 15,
      "score": 25.0,
      "basis": "1 closed tasks in the ledger: step records on 1 (0 self-logged rows, 29 transcript rows); verifier rows on 0; flagged --verifier (separate from builder rows) on 0; closed with no verification record: V02."
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
    "findings": [],
    "computedAt": "2026-10-08T19:16:52Z"
   },
   {
    "agent": "gtm",
    "name": "Ogilvy",
    "score": 63.7,
    "grade": "D",
    "meetsInstitutionalBar": false,
    "dimensions": [
     {
      "id": "first_pass_yield",
      "label": "First-pass yield",
      "weight": 20,
      "score": 0.0,
      "basis": "0/1 verified tasks passed first time (none); needed rework, a block or a later correction: V09 (0 failed rounds, 0 blocks, 1 orchestrator corrections); not counted, no verification record: V05 V06 V07 V08."
     },
     {
      "id": "effective_challenge",
      "label": "Verification outcome: rework and open gaps",
      "weight": 15,
      "score": 100.0,
      "basis": "0 failed verification rounds over 1 verified tasks (0.00 per task); 0 open FAIL/GAP rows after the last revision; 0 non-blocking notes left open."
     },
     {
      "id": "evidence",
      "label": "Evidence discipline",
      "weight": 15,
      "score": 84.1,
      "basis": "31/36 numeric claims (86%) in 5 output files are traceable: a source URL, file or task reference, citation, derivation or [S]/[U]/unverified/assumption/estimate/measured label on the line or table caption, or a restatement of such a figure; by task: V05 icp.md 17/22, V06 loi-template.md 6/6, V07 targets.csv 6/6, V09 outreach-log.md 2/2; untraced examples: V05: 19%. Score shrinks the share toward neutral by 5 claims (small samples are imprecise). Fabricated citations cannot be detected offline (left to LLM findings)."
     },
     {
      "id": "integrity",
      "label": "Honesty and research integrity",
      "weight": 20,
      "score": 80.0,
      "basis": "Over 5 tasks in the ledger: 1 orchestrator corrections of a false claim (V09 on 2026-10-08); 0 self-verified completions; 0 verifier FAIL/GAP rows naming a false statement. No independent LLM citation audit covers this agent yet, so this dimension is capped at 85 (fabricated citations cannot be ruled out offline)."
     },
     {
      "id": "process",
      "label": "Process discipline and separation of duties",
      "weight": 15,
      "score": 35.0,
      "basis": "5 closed tasks in the ledger: step records on 5 (8 self-logged rows, 103 transcript rows); verifier rows on 1; flagged --verifier (separate from builder rows) on 0; closed with no verification record: V05 V06 V07 V08; verifier rows not flagged --verifier: V09."
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
    "findings": [],
    "computedAt": "2026-10-08T19:16:52Z"
   },
   {
    "agent": "finance",
    "name": "Pacioli",
    "score": 85.9,
    "grade": "B",
    "meetsInstitutionalBar": true,
    "dimensions": [
     {
      "id": "first_pass_yield",
      "label": "First-pass yield",
      "weight": 20,
      "score": 100.0,
      "basis": "1/1 verified tasks passed first time (M05); not counted, no verification record: V10 V11."
     },
     {
      "id": "effective_challenge",
      "label": "Verification outcome: rework and open gaps",
      "weight": 15,
      "score": 97.0,
      "basis": "0 failed verification rounds over 1 verified tasks (0.00 per task); 0 open FAIL/GAP rows after the last revision; 1 non-blocking notes left open (M05 1)."
     },
     {
      "id": "evidence",
      "label": "Evidence discipline",
      "weight": 15,
      "score": 95.7,
      "basis": "455/474 numeric claims (96%) in 3 output files are traceable: a source URL, file or task reference, citation, derivation or [S]/[U]/unverified/assumption/estimate/measured label on the line or table caption, or a restatement of such a figure; by task: V10 model.md 78/79, V11 grants.md 81/81, M05 sbir-draft.md 296/314; untraced examples: V10: 12 months; M05: 1.25 pages. Score shrinks the share toward neutral by 5 claims (small samples are imprecise). Fabricated citations cannot be detected offline (left to LLM findings)."
     },
     {
      "id": "integrity",
      "label": "Honesty and research integrity",
      "weight": 20,
      "score": 85.0,
      "basis": "Over 3 tasks in the ledger: 0 orchestrator corrections of a false claim; 0 self-verified completions; 0 verifier FAIL/GAP rows naming a false statement. No independent LLM citation audit covers this agent yet, so this dimension is capped at 85 (fabricated citations cannot be ruled out offline)."
     },
     {
      "id": "process",
      "label": "Process discipline and separation of duties",
      "weight": 15,
      "score": 50.0,
      "basis": "3 closed tasks in the ledger: step records on 3 (40 self-logged rows, 152 transcript rows); verifier rows on 1; flagged --verifier (separate from builder rows) on 1; closed with no verification record: V10 V11."
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
    "findings": [],
    "computedAt": "2026-10-08T19:16:52Z"
   },
   {
    "agent": "legal",
    "name": "Ginsburg",
    "score": 94.7,
    "grade": "A",
    "meetsInstitutionalBar": true,
    "dimensions": [
     {
      "id": "first_pass_yield",
      "label": "First-pass yield",
      "weight": 20,
      "score": 100.0,
      "basis": "2/2 verified tasks passed first time (V12 M04)."
     },
     {
      "id": "effective_challenge",
      "label": "Verification outcome: rework and open gaps",
      "weight": 15,
      "score": 97.0,
      "basis": "0 failed verification rounds over 2 verified tasks (0.00 per task); 0 open FAIL/GAP rows after the last revision; 1 non-blocking notes left open (V12 1)."
     },
     {
      "id": "evidence",
      "label": "Evidence discipline",
      "weight": 15,
      "score": 97.5,
      "basis": "56/56 numeric claims (100%) in 2 output files are traceable: a source URL, file or task reference, citation, derivation or [S]/[U]/unverified/assumption/estimate/measured label on the line or table caption, or a restatement of such a figure; by task: V12 privacy.md 3/3, M04 entity-checklist.md 53/53. Score shrinks the share toward neutral by 5 claims (small samples are imprecise). Fabricated citations cannot be detected offline (left to LLM findings)."
     },
     {
      "id": "integrity",
      "label": "Honesty and research integrity",
      "weight": 20,
      "score": 85.0,
      "basis": "Over 2 tasks in the ledger: 0 orchestrator corrections of a false claim; 0 self-verified completions; 0 verifier FAIL/GAP rows naming a false statement. No independent LLM citation audit covers this agent yet, so this dimension is capped at 85 (fabricated citations cannot be ruled out offline)."
     },
     {
      "id": "process",
      "label": "Process discipline and separation of duties",
      "weight": 15,
      "score": 100.0,
      "basis": "2 closed tasks in the ledger: step records on 2 (19 self-logged rows, 97 transcript rows); verifier rows on 2; flagged --verifier (separate from builder rows) on 2."
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
    "findings": [],
    "computedAt": "2026-10-08T19:16:52Z"
   },
   {
    "agent": "brand",
    "name": "Rams",
    "score": 64.7,
    "grade": "D",
    "meetsInstitutionalBar": false,
    "dimensions": [
     {
      "id": "first_pass_yield",
      "label": "First-pass yield",
      "weight": 20,
      "score": 70.0,
      "basis": "No data: no task with a verification record; closed without a verification record: V13. Scored neutral (70)."
     },
     {
      "id": "effective_challenge",
      "label": "Verification outcome: rework and open gaps",
      "weight": 15,
      "score": 70.0,
      "basis": "No data: no task with a verification record. Scored neutral (70)."
     },
     {
      "id": "evidence",
      "label": "Evidence discipline",
      "weight": 15,
      "score": 43.8,
      "basis": "0/3 numeric claims (0%) in 1 output files are traceable: a source URL, file or task reference, citation, derivation or [S]/[U]/unverified/assumption/estimate/measured label on the line or table caption, or a restatement of such a figure; by task: V13 index.html 0/3; untraced examples: V13: 30 days. Score shrinks the share toward neutral by 5 claims (small samples are imprecise). Fabricated citations cannot be detected offline (left to LLM findings)."
     },
     {
      "id": "integrity",
      "label": "Honesty and research integrity",
      "weight": 20,
      "score": 85.0,
      "basis": "Over 1 tasks in the ledger: 0 orchestrator corrections of a false claim; 0 self-verified completions; 0 verifier FAIL/GAP rows naming a false statement. No independent LLM citation audit covers this agent yet, so this dimension is capped at 85 (fabricated citations cannot be ruled out offline)."
     },
     {
      "id": "process",
      "label": "Process discipline and separation of duties",
      "weight": 15,
      "score": 25.0,
      "basis": "1 closed tasks in the ledger: step records on 1 (0 self-logged rows, 11 transcript rows); verifier rows on 0; flagged --verifier (separate from builder rows) on 0; closed with no verification record: V13."
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
    "findings": [],
    "computedAt": "2026-10-08T19:16:52Z"
   }
  ],
  "notice": "A rubric informed by NIST AI RMF 1.0, SR 11-7, ISO/IEC 42001, GRADE, first-pass yield and research-integrity definitions; not a certification. See docs/JARVIS_AUDIT_RUBRIC.md.",
  "neutralScore": 70.0,
  "inputs": {
   "nodes": 34,
   "ledgerEvents": 61,
   "activityRows": 1145,
   "llmFindings": 0,
   "llmAuditedAgents": [],
   "revenueEntries": 0
  },
  "revenueCheck": {
   "entries": 0,
   "verified": 0,
   "flagged": []
  },
  "warnings": []
 }
};
