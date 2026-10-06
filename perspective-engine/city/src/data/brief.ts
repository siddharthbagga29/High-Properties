/**
 * The guide's knowledge brief. Every claim here is traceable to a file in the repo
 * (research/evidence-dossier.md, docs/execution-plan.md, finance/model.md) or to a public source.
 */
export const BRIEF = {
  idea: 'Perspective Engine is a manager-accommodation program. It runs in an ordinary browser. A manager does one workplace task twice, once with attention load switched on. Then they hear ADHD adults describe what actually helps, practise three accommodations, and are checked 30 days later on what they actually changed. It is being co-designed with paid ADHD advisors who can veto any content.',
  hook: 'You are looking at a company being built by nine AI agents. Every bright point is a record of their work, read from the project ledger.',
  claim: {
    text: 'Meta stopped selling Quest headsets to businesses on 20 February 2026. That is why this product runs in a browser and treats headsets as optional.',
    source: 'https://forwork.meta.com/blog/an-update-on-meta-for-work/',
  },
  evidence: [
    { text: 'Disability simulations can raise pity and discomfort without improving attitudes, so every session ends in a debrief led by lived experience.', source: 'https://pubmed.ncbi.nlm.nih.gov/28287757/' },
    { text: 'VR shifts emotional empathy (d ≈ 0.33) far more than cognitive understanding (d ≈ 0.08). The product is therefore judged on behaviour at day 30, not on feelings.', source: 'https://tmb.apaopen.org/pub/vr-improves-emotional-empathy-only' },
    { text: 'Persistent adult ADHD is about 2.6% of adults; symptomatic adult ADHD about 6.8%.', source: 'https://www.jogh.org/documents/2021/jogh-11-04009.htm' },
  ],
  refuted: 'The original memo’s 72% success figure, “18 dB SNR”, quantum zero-latency modelling, the $14.8B TAM and CPT reimbursement were checked and found unsupported. None is used anywhere in this build.',
  hypotheses: [
    'H1 Value: managers who go through the experience, the debrief and the practice take more verified accommodation actions at day 30 than managers given equal-length information.',
    'H2 Harm: the experience does not raise pity or lower perceived competence of ADHD colleagues.',
    'H3 Buyer: a named budget owner pays for a pilot without a DEI line item.',
    'H4 Delivery: it works in a normal browser in under 20 minutes.',
  ],
  model: 'The agents’ bottom-up Monte Carlo (10,000 trials, every input labelled an assumption) gives year-5 ARR of $53k / $633k / $4.31M at P10 / P50 / P90. It puts the chance of $5M ARR by month 48 at about 0.6%. Whether H1 holds is the dominant driver: median year-5 ARR is $2.09M if it holds and $178k if it fails.',
  operating: 'The venture is a directed acyclic graph of 33 tasks. One orchestrator dispatches at most three agents at a time. Each agent reads only the files its brief lists and writes only its own outputs. Every state change goes through one tool that appends to the ledger. When a step needs the founder’s account, money, signature or a message to a real person, the agents prepare everything and that last step waits.',
  lesson: 'Measured in the first loop: tasks budgeted at 8k–15k tokens processed 73k–132k, and even the lightest run used about 73k. Most of a run’s cost is fixed context, not work, so the next loop batches small tasks of the same agent into one dispatch.',
  data: 'Nothing in this city is simulated. Statuses, timestamps, token counts and excerpts come from graph.json and ledger.jsonl, polled every 20 seconds. The one illustrative element is the construction animation on towers whose status is really "building".',
  pilot: 'A paid pilot for one manager cohort, randomized within the cohort, with the pre-registered day-30 outcome reported with its confidence interval, including a null result. Sign-ups open after the first advisory review.',
}
