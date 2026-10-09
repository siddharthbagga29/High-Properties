# Founder decisions (node D01)

**Summary.** Several later nodes depend on facts only you can supply. Agents have prepared everything around them. Answer these, then run `python3 perspective-engine/tools/graph.py clear-gate D01 "<your answers in one line>"`, or just tell Claude the answers.

| # | Decision | Why it matters | Options (recommendation first) | Blocks |
|---|---|---|---|---|
| 1 | Country of residence and of the company's majority owners. **Decided 2026-10-08: United States.** Ownership structure still open | SBIR/STTR awards (NIH, NSF, NIDILRR) need a for-profit with a US place of business that is more than 50% directly owned **and controlled** by US citizens or permanent residents (13 CFR 121.702; exactly 50% fails, so 51% is the safe margin; `finance/grants.md`, `legal/entity-checklist.md` s1). This is an SBIR/STTR rule, not a rule for every federal grant. NIH also accepts SBIR (not STTR) applicants majority-owned by several venture capital, hedge fund or private equity firms, with a certification (NIH notice NOT-OD-13-071; search summary, page not opened) | A. US Delaware C-corp with a US co-founder holding the majority. B. India Pvt Ltd first, with a US subsidiary later (no SBIR at the start). C. UK Ltd (Innovate UK KTP route) | M04, M05 |
| 2 | Advisor budget for the first quarter | The co-design charter requires paid advisors before any content ships. About $4.7k–7k at $50–75/h (`ethics/advisory-board.md`) | Set a rate above the $50/h floor, up to $75/h (about $7k for the quarter), as the ethics agent recommends: the public-sector benchmarks probably understate what a for-profit asking for a binding veto should pay (`ethics/advisory-board.md`) / approve the $50/h floor (about $4.7k) and record why | V14 |
| 3 | Smallest effect worth selling | The pre-registration uses +1 of 10 accommodation practices as a placeholder (`science/preregistration.md`) | Confirm +1 practice / set another value after 5 buyer interviews | V03 posting |
| 4 | Who facilitates advisor sessions | The charter requires a named human facilitator; agents only draft | You / a hired facilitator / a university partner | V14 |
| 5 | Accounts you will authorize | OSF (pre-registration), Gmail (outreach batches), later SAM.gov/eRA (grants), a form backend for the landing page | Authorize each one when its node reaches you on the dashboard | V03, V09, M05 |
| 6 | Name | "Perspective Engine" is a working name. No trademark search has been done | Keep it for now; legal agent runs a free USPTO/WIPO search in M04 | M04 |

Ownership and budget options for a US company, tiered from minimum to most effective: `docs/ownership-and-budget-options.md` (2026-10-08).

Nothing here has been sent, filed or paid. Each item stays in "Waiting on you" on the city dashboard until you clear it.
