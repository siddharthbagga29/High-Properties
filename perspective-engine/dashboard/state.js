window.PE_STATE = {
 "generated": "2026-10-07T06:50:10Z",
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
   "status": "pending",
   "view": "pending"
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
   "status": "pending",
   "view": "pending"
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
   "status": "pending",
   "view": "pending"
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
   "status": "running",
   "view": "running"
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
   "t": "2026-10-06T12:39:58Z",
   "event": "done",
   "node": "V05",
   "note": "3 segments: ND-program employers (People/L&D), accommodation/ADA owners, higher ed; pricing unverified"
  },
  {
   "t": "2026-10-06T12:40:18Z",
   "event": "done",
   "node": "F06",
   "note": "Charter: paid ND advisors w/ binding veto, mandatory debrief, never-claims register; draft pending advisor review"
  },
  {
   "t": "2026-10-06T12:40:18Z",
   "event": "start",
   "node": "V04",
   "note": ""
  },
  {
   "t": "2026-10-06T12:40:58Z",
   "event": "done",
   "node": "V01",
   "note": "5 mechanisms graded S1-S3; design-parameter ranges; 15-item not-modeled list; M4/M5 sources snippet-level"
  },
  {
   "t": "2026-10-06T12:40:58Z",
   "event": "start",
   "node": "V02",
   "note": ""
  },
  {
   "t": "2026-10-06T12:42:32Z",
   "event": "done",
   "node": "V04",
   "note": "Advisor plan: USD 50/h floor (benchmarks snippet-level), 7 channels, session-1 script; all outreach gated"
  },
  {
   "t": "2026-10-06T12:42:32Z",
   "event": "start",
   "node": "V07",
   "note": ""
  },
  {
   "t": "2026-10-06T12:45:17Z",
   "event": "done",
   "node": "V02",
   "note": "Primary outcome: verified Accommodation Action Index at day 30; RCT vs info-only control; pilot of 80-150 estimates only"
  },
  {
   "t": "2026-10-06T12:45:23Z",
   "event": "start",
   "node": "V03",
   "note": ""
  },
  {
   "t": "2026-10-06T12:45:44Z",
   "event": "done",
   "node": "V07",
   "note": "50 accounts (26/12/12 by segment), 23 high-confidence; 14 roundtable rows need click-through"
  },
  {
   "t": "2026-10-06T12:45:44Z",
   "event": "start",
   "node": "V10",
   "note": ""
  },
  {
   "t": "2026-10-06T12:49:21Z",
   "event": "done",
   "node": "V03",
   "note": "OSF-ready prereg: 120-manager cluster-randomized estimation pilot; CI half-width ~0.41 SD; slots to fill"
  },
  {
   "t": "2026-10-06T12:49:21Z",
   "event": "start",
   "node": "V15",
   "note": ""
  },
  {
   "t": "2026-10-06T12:50:55Z",
   "event": "done",
   "node": "V10",
   "note": "MC: Y5 ARR P10/50/90 $53k/$633k/$4.31M; P($5M by m48)=0.6%; H1 dominant driver"
  },
  {
   "t": "2026-10-06T12:50:55Z",
   "event": "start",
   "node": "V11",
   "note": ""
  },
  {
   "t": "2026-10-06T12:53:55Z",
   "event": "done",
   "node": "V15",
   "note": "10 labs (7 non-US), first wave Birkbeck/Edinburgh/KCL/Barcelona; brief drafted; M1 DMN caveat flagged"
  },
  {
   "t": "2026-10-06T12:53:55Z",
   "event": "start",
   "node": "V13",
   "note": ""
  },
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
  }
 ]
};
