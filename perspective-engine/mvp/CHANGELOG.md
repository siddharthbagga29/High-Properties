# Perspective Engine MVP changelog (node V14)

## Summary

No advisor sessions have been held and no advisor-driven changes have been made. On 2026-10-09 an audit rework corrected wording in the baseline (not an advisor change; see Baseline corrections), so the baseline is now `index.html` v0.1.1-F04. Every future change must trace to an advisor note ID from `advisor-review-kit.md` (format `AN-<AREA>-<NN>`, for example AN-M1-03). A change with no note ID is not made. Each entry records version, change, advisor note ID, file and line, and how it was verified. Notes that are not applied (waiting on a founder decision, a spec change, advisor agreement, or blocked by a product rule) are recorded in the register below, not as changes. Holds are recorded here and closed only by the facilitator's session log. Advisor feedback will be recorded only as the advisors give it: never invented, simulated or paraphrased.

## Status (2026-10-09)

- Advisor sessions held: 0. Advisor notes received: 0. Holds placed: 0. Advisor-driven changes made: 0. Baseline corrections outside V14: 1 (audit rework, below).
- Gate: node V14 needs real feedback sessions with paid neurodivergent advisors. Open founder items: advisor rate (`docs/founder-decisions.md` item 2), facilitator (item 4), contracts, payment, outreach, recording policy. Nothing has been sent, signed or paid.
- Baseline under review: `perspective-engine/mvp/index.html`, `VERSION='0.1.1-F04'`, 120,373 bytes, sha256 `259502d413c58bd045d26f136b4c435f005dd8926211252ebc58a7874dc709c6`. `node --check` passes and the in-app self-test is 59 of 59 at 390 and 1280 px (re-run 2026-10-09, README Revision check 4). Previous baseline: 0.1.0-F04, 119,994 bytes, sha256 `83f500ed9a837d56df88a2911bcfc364b14d4d60ec8251c50f34afa16f74e118`.
- Provenance (audit AF-product-4): V14's write list names only this file, but `advisor-review-kit.md` was also written under V14, outside that list. V14's acceptance criterion ("every change traces to an advisor note") is so far met only vacuously: no sessions, no notes, no advisor changes. It is not evidence that v0.2 exists.

## Entry format

Newest entry first. One entry per released version; list several note IDs when one edit answers several notes. Append only: an error is corrected by a new entry, and a revert is a new entry citing the same note ID.

```
### v0.2.N-V14 | YYYY-MM-DD
- Change: one plain sentence saying what is different for the participant or facilitator.
- Advisor note ID: AN-XXX-NN [, AN-XXX-NN]  (session date; hold status: none | open | accepted by holder | lifted by majority, with the facilitator log date)
- File and line: perspective-engine/mvp/index.html:LINE-LINE (name of the constant or function). Also any README section changed.
- Verified by: who ran what, with results. Minimum: node --check on the extracted script (pass/fail); index.html#selftest at about 390 px and about 1280 px wide ("n of n"); the changed screen checked by hand; Stop still visible and hit-testable. Never write "advisor approved" unless the facilitator's log says so.
- Build: sha256 and bytes of index.html after the change.
```

Rules:
- No note ID, no entry. A change that is needed only to make a noted change work cites the same ID. This rule covers every advisor-driven change. A correction that makes the baseline match its own code or the ethics rules, found by an audit, is not an advisor change: it goes under Baseline corrections with its finding ID, is never presented as advisor input, and every changed item still goes to advisors.
- The note ID stands for the advisor's words. Words, names and attribution appear here only if the advisor chose attribution; a note marked "not recorded" keeps its ID, verdict and hold flag only.
- Advisor replacement wording is used verbatim.
- A changed item goes back to advisors for a new Approve / Approve with named changes / Hold before release to any real participant.
- If a note cannot be applied, it goes in the register with one disposition: NEEDS-DECISION (founder), NEEDS-SPEC (outside `science/mechanism-spec.md`; another agent's file), CONFLICT (advisors disagree; goes back to them), BLOCKED-RULE (would break a product floor: flashing above 3 Hz, a hidden Stop, data leaving the device, a barred claim), NO-CHANGE (verdict OK or advisor chose to keep). Process detail: `advisor-review-kit.md` section 5.

## Changes

None. No advisor sessions have been held and no advisor-driven changes have been made.

## Baseline corrections (outside V14; no advisor note)

### v0.1.1-F04 | 2026-10-09 | audit rework (findings AF-product-1, AF-product-2, AF-product-3)
- Change: the intro controls line says Pause and Skip work during both task rounds and Ease off in round 2 (was "Pause, Ease off and Skip are always available"); the Ease off status line and button title describe what the code does, which is to lower settings above 0.2 to 0.2 and switch M5 off (was "all added conditions set to 0.2 for the rest of the session"); the round 2 brief says "During round 2"; debrief card 2 no longer carries agent-written strengths wording and says the statement is reserved for advisors, while the simulation caveat and workplace-change sentences stay; the OMS-WA item count in `NOT_ADMIN` is marked unverified; `VERSION` is 0.1.1-F04 and the consent `text_version` is `v0-draft-2026-10-09`.
- Advisor note ID: none (audit correction). Items for advisors: AN-INT-03, AN-STP-05, AN-DB2-01, AN-DB2-02.
- File and line: perspective-engine/mvp/index.html:163 (`#easeBtn` title), :187 (intro), :235 (`VERSION`), :411 (`NOT_ADMIN`), :432 (`DEBRIEF` card 2), :818 (`easeOff`), :902 (`buildBrief2`), :1298 (consent `text_version`). README sections Summary, Facilitator panel, Measures, Draft content and Revision check 4; `advisor-review-kit.md` lines 1, 12, 74, 160, 254.
- Verified by: the product agent (rework session, not an independent verifier). `node --check` on the extracted script passes; `index.html#selftest` 59 of 59 at 390 and 1280 px, each with and without reduced-motion emulation, 0 page errors, 0 external requests; Ease off probed in Chromium (M1 0.1 stays 0.1, M2 off stays off at 0.2, M3 0.6 and M4 0.8 go to 0.2, M5 off); debrief has 10 sections; Stop hit-testable check is part of the 59. Not advisor approved.
- Build: 120,373 bytes, sha256 `259502d413c58bd045d26f136b4c435f005dd8926211252ebc58a7874dc709c6`. Previous: 119,994 bytes, sha256 `83f500ed9a837d56df88a2911bcfc364b14d4d60ec8251c50f34afa16f74e118`.

## Note register (not applied or open)

Format: `AN-XXX-NN | session date | disposition | reason | owner | date closed`

None. No notes have been received.

## Hold register

Format: `AN-XXX-NN | date placed | status (open, accepted by holder, lifted by majority) | facilitator log date`

None. No holds have been placed.
