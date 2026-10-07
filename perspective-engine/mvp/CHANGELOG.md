# Perspective Engine MVP changelog (node V14)

## Summary

No advisor sessions have been held and no changes have been made. The MVP is still the baseline build `index.html` v0.1.0-F04, unchanged since 2026-10-07 19:12 UTC. This file lists zero changes. Every future change must trace to an advisor note ID from `advisor-review-kit.md` (format `AN-<AREA>-<NN>`, for example AN-M1-03). A change with no note ID is not made. Each entry records version, change, advisor note ID, file and line, and how it was verified. Notes that are not applied (waiting on a founder decision, a spec change, advisor agreement, or blocked by a product rule) are recorded in the register below, not as changes. Holds are recorded here and closed only by the facilitator's session log. Advisor feedback will be recorded only as the advisors give it: never invented, simulated or paraphrased.

## Status (2026-10-07)

- Advisor sessions held: 0. Advisor notes received: 0. Holds placed: 0. Changes made: 0.
- Gate: node V14 needs real feedback sessions with paid neurodivergent advisors. Open founder items: advisor rate (`docs/founder-decisions.md` item 2), facilitator (item 4), contracts, payment, outreach, recording policy. Nothing has been sent, signed or paid.
- Baseline under review: `perspective-engine/mvp/index.html`, `VERSION='0.1.0-F04'`, 119,994 bytes, sha256 `83f500ed9a837d56df88a2911bcfc364b14d4d60ec8251c50f34afa16f74e118`. `node --check` on the extracted script passed on 2026-10-07 (product agent, for node V14). Self-test result from the README, not re-run for V14: 59 of 59.

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
- No note ID, no entry. A change that is needed only to make a noted change work cites the same ID.
- The note ID stands for the advisor's words. Words, names and attribution appear here only if the advisor chose attribution; a note marked "not recorded" keeps its ID, verdict and hold flag only.
- Advisor replacement wording is used verbatim.
- A changed item goes back to advisors for a new Approve / Approve with named changes / Hold before release to any real participant.
- If a note cannot be applied, it goes in the register with one disposition: NEEDS-DECISION (founder), NEEDS-SPEC (outside `science/mechanism-spec.md`; another agent's file), CONFLICT (advisors disagree; goes back to them), BLOCKED-RULE (would break a product floor: flashing above 3 Hz, a hidden Stop, data leaving the device, a barred claim), NO-CHANGE (verdict OK or advisor chose to keep). Process detail: `advisor-review-kit.md` section 5.

## Changes

None. No advisor sessions have been held and no changes have been made.

## Note register (not applied or open)

Format: `AN-XXX-NN | session date | disposition | reason | owner | date closed`

None. No notes have been received.

## Hold register

Format: `AN-XXX-NN | date placed | status (open, accepted by holder, lifted by majority) | facilitator log date`

None. No holds have been placed.
