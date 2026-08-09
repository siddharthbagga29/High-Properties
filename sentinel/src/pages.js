/* Site content model.
   Each page owns its own subject matter, title, description and body. The
   build turns these into real HTML files — separate URLs, separate <title>s,
   separate canonicals — because a single scrolling page cannot rank for six
   different intents, and a buyer who wants pricing should not have to scroll
   past a research dashboard to reach it. */

const SITE = {
  name: 'Sentinel',
  tagline: 'AI Liability Telemetry & Coverage',
  origin: 'https://sentinel.example',      // set to the real origin before launch
  email: 'hello@sentinel.example',
};

/* Nav order is the buyer's journey: what breaks → what it costs → what we sell
   → how we know → talk to us. */
const NAV = [
  { slug: 'index',    label: 'Home',      title: 'Home' },
  { slug: 'coverage', label: 'Coverage',  title: 'Coverage & Pricing' },
  { slug: 'evidence', label: 'Evidence',  title: 'Evidence' },
  { slug: 'research', label: 'Research',  title: 'Research' },
  { slug: 'method',   label: 'Method',    title: 'Method' },
  { slug: 'contact',  label: 'Contact',   title: 'Contact' },
];

const href = slug => (slug === 'index' ? './' : './' + slug + '.html');

/* ── shared fragments ──────────────────────────────────────────────────── */

const heroStats = `
      <dl class="grid sm:grid-cols-3 gap-3 mt-7">
        <div class="glass p-4"><dd class="stat-n">45%</dd>
          <dt class="kicker mt-2">Lower premium, monitored vs unmonitored</dt></div>
        <div class="glass p-4"><dd class="stat-n">38%</dd>
          <dt class="kicker mt-2">Modeled reduction in claim frequency</dt></div>
        <div class="glass p-4"><dd class="stat-n text-amber">$243M</dd>
          <dt class="kicker mt-2">Largest upheld AI verdict to date</dt></div>
      </dl>`;

const coreSection = `
<section id="core" class="relative" aria-labelledby="core-h">
  <div class="sticky top-0 h-[100svh] overflow-hidden">
    <canvas id="core-canvas" width="1440" height="900" class="absolute inset-0 w-full h-full"
            role="img" aria-label="Animated diagram: a humanoid robot assembles from particles as you scroll. Each body part carries a documented AI failure mode and its adjudicated cost — the eye for hallucination, the mouth for misrepresentation, the hand for algorithmic discrimination, the foot for automated driving, and the chest core for training data."></canvas>
    <div class="absolute inset-0 pointer-events-none core-scrim"></div>
    <div class="relative h-full max-w-content mx-auto px-5 sm:px-7 flex items-center justify-center pt-14">
      <div class="w-full max-w-md">
        <div class="glass glass-strong p-5 sm:p-6">
          <p class="eyebrow mb-2">Failure modes</p>
          <h2 id="core-h" class="font-semibold text-[clamp(1.25rem,2vw,1.6rem)] leading-tight tracking-tight mb-3">
            Every component has a price.</h2>
          <div id="wp-active" class="min-h-[128px]">
            <p class="text-dim text-[13px]">Scroll to assemble the machine. Each part that locks
              into place is a documented failure, priced by a court.</p>
          </div>
          <div class="flex items-center gap-1.5 mt-4" id="wp-dots" aria-hidden="true"></div>
          <p class="plain">The robot builds itself as you scroll. Every piece is a real way AI has
            already gone wrong, with the real bill attached.</p>
          <div class="mt-4 pt-3 border-t border-white/10">
            <div class="flex items-center justify-between gap-3 mb-2">
              <span class="kicker" id="core-pct-label">Assembly</span>
              <span class="font-mono text-[11px] text-teal" id="core-pct">0%</span>
            </div>
            <p id="core-live" class="sr-only" role="status" aria-live="polite"></p>
            <div class="h-1 bg-white/8 rounded-full overflow-hidden" id="core-progress"
                 role="progressbar" aria-labelledby="core-pct-label"
                 aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
              <div id="core-bar" class="h-full bg-gradient-to-r from-teal-deep to-teal rounded-full core-bar"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  <div class="h-[380svh]" aria-hidden="true"></div>
</section>`;

function sectionHead(num, eyebrow, h2, lede, plain) {
  return `    <div class="max-w-3xl mb-10 reveal">
      <p class="eyebrow mb-4">${num} — ${eyebrow}</p>
      <h2 class="font-semibold text-[clamp(1.8rem,3.8vw,2.9rem)] leading-[1.06] tracking-[-0.028em] mb-4">${h2}</h2>
      <p class="lede">${lede}</p>
      ${plain ? `<p class="plain">${plain}</p>` : ''}
    </div>`;
}

const chartBlock = (id, label) =>
  `<canvas id="${id}" width="1084" height="560" class="block w-full h-full" role="img" aria-label="${label}"></canvas>` +
  `<p class="chart-fallback hidden text-[13px] text-amber py-6">This chart could not be rendered. The underlying figures are in the table below and in <code>pricing.json</code>.</p>`;

/* ── pages ─────────────────────────────────────────────────────────────── */

const PAGES = [
{
  slug: 'index',
  next: 'evidence',
  title: 'Sentinel — AI Liability Telemetry & Coverage',
  description: 'Your general liability policy may no longer cover what your AI does. Sentinel monitors production AI continuously, certifies it, and attaches liability coverage priced off that telemetry. Monitored risks pay 45% less premium.',
  h1: 'Your insurance stopped covering the machine.',
  hero: true,
  jsonld: 'Organization',
  body: `
<header class="relative min-h-[100svh] flex items-center px-5 sm:px-7 pt-28 pb-16 overflow-hidden">
  <!-- The bust is a build-time render, shipped as a baked image: no runtime
       WebGL, no GPU variance, no per-frame compositing cost. -->
  <div class="hero-bust" aria-hidden="true"></div>
  <!-- Enhancement layer. The still above is the real backdrop; this strip
       takes over once the turntable atlas has decoded and turns the bust to
       follow the pointer. Everything still works if it never appears. -->
  <div id="hero-reel" class="hero-reel" aria-hidden="true"><i></i></div>
  <div class="hero-veil" aria-hidden="true"></div>
  <div class="max-w-content mx-auto w-full relative">
    <div class="glass glass-strong p-7 sm:p-11 max-w-2xl reveal">
      <p class="eyebrow mb-5">${SITE.tagline}</p>
      <h1 class="font-semibold leading-[0.98] tracking-[-0.035em] text-[clamp(2.2rem,5.4vw,4.1rem)]">
        Your insurance stopped<br>covering <span class="text-amber">the machine.</span></h1>
      <p class="lede mt-6">In January 2026, ISO released endorsements that strip AI losses out of
        standard commercial general liability. Carriers are attaching them at renewal. Sentinel
        monitors your AI continuously, certifies it, and attaches coverage priced off that
        telemetry.</p>
      ${heroStats}
      <p class="plain">Businesses are handing decisions to AI. Their insurance is being rewritten
        so it no longer pays when that AI gets something wrong. We watch the AI, prove it behaves,
        and insure the companies that pass — at roughly half the price of going in blind.</p>
      <div class="flex flex-wrap gap-3 mt-7">
        <a href="${href('coverage')}" class="btn btn-primary no-underline">See coverage &amp; pricing</a>
        <a href="${href('evidence')}" class="btn no-underline">What failure costs</a>
      </div>
    </div>
  </div>
</header>

${coreSection}

<section id="what" class="py-24 sm:py-28 px-5 sm:px-7 border-t border-white/[0.06]">
  <div class="max-w-content mx-auto">
${sectionHead('01', 'The business in one page', 'Measure. Certify. Then insure.',
  'If you read nothing else, read these three.',
  'We install a flight recorder on a company&rsquo;s AI, turn the recording into a certificate their customers accept, and then insure it — because we already know how it behaves.')}
    <div class="grid md:grid-cols-3 gap-3">
      <article class="glass p-6 reveal"><h3 class="font-semibold text-lg mb-2">We measure</h3>
        <p class="text-[14px] text-dim">Paid assessments and continuous telemetry that record what a
          customer&rsquo;s AI actually did — every output, every refusal, every drift from tested
          behavior — against the ISO/IEC 42001 management standard.</p>
        <p class="plain tight">A flight recorder for AI.</p></article>
      <article class="glass p-6 reveal"><h3 class="font-semibold text-lg mb-2">We certify</h3>
        <p class="text-[14px] text-dim">That record becomes a defensible artifact: a score a board
          can sign, a buyer can demand in procurement, and a regulator can inspect.</p>
        <p class="plain tight">A certificate their customers and regulators accept.</p></article>
      <article class="glass p-6 reveal border-teal/45 bg-teal/[0.045]"><h3 class="font-semibold text-lg mb-2">Then we insure</h3>
        <p class="text-[14px] text-dim">Only monitored customers can buy the cover. The telemetry
          <em>is</em> the underwriting file — the one thing every competitor in this market lacks.</p>
        <p class="plain tight">We can price what nobody else can price. That is the whole advantage.</p></article>
    </div>
    <div class="glass p-6 sm:p-7 border-l-2 border-l-teal mt-8 reveal">
      <h3 class="font-semibold text-teal mb-2">Why this order matters</h3>
      <p class="text-dim text-[14.5px]">An insurer will not hand a new company the pen without loss
        data. You cannot get loss data without customers. You cannot get customers for insurance
        nobody has priced. The measurement business breaks that loop: sellable on day one, needs no
        regulator and no carrier, and it manufactures exactly the data the insurance leg requires.
        Our simulation puts the correct sequence at <b class="text-teal">2.3&times; the odds</b> of
        reaching the full stack versus insuring first.</p>
      <p class="plain">Sell the measuring tape before the insurance. You need the measurements to
        price the insurance at all.</p>
      <p class="mt-4"><a href="${href('method')}" class="text-teal no-underline hover:underline">See how the model works &rarr;</a></p>
    </div>
  </div>
</section>`
},

{
  slug: 'coverage',
  next: 'contact',
  eyebrow: 'Coverage &amp; pricing',
  intro: 'Four tiers, one premium matrix, and the competitive position — with the actuarial working shown rather than a rate card copied off a rival.',
  introPlain: 'What we sell, what it costs, and exactly how we arrived at the number.',
  title: 'AI Liability Coverage & Pricing — Sentinel',
  description: 'Technical premium built from loss cost up: Poisson frequency times a lognormal severity mixture calibrated to five adjudicated AI outcomes. Monitored risks earn a 44–49% credit. Four product tiers from $24,000.',
  h1: 'Coverage and pricing, built from loss cost up.',
  jsonld: 'Product',
  body: `
<section id="pricing" class="py-28 sm:py-32 px-5 sm:px-7">
  <div class="max-w-content mx-auto">
${sectionHead('01', 'Product mix &amp; pricing', 'Priced from loss cost up, not from a competitor&rsquo;s rate card.',
  'Poisson frequency &times; a lognormal severity mixture calibrated to five adjudicated outcomes, ceded to layer, then loaded 28% expense / 10% profit / plus a risk load proportional to volatility. 400,000 simulations.',
  'We worked out what claims will actually cost, added our costs and a margin, and that is the price. No guessing from what rivals charge.')}
    <div id="tiers" class="grid md:grid-cols-2 xl:grid-cols-4 gap-3 mb-14"></div>

    <h2 class="font-semibold text-xl mb-1 reveal">Premium matrix</h2>
    <p class="text-dim text-[14.5px] mb-5 reveal max-w-3xl">Annual technical premium by limit and
      revenue band. The credit column is what continuous telemetry earns you.</p>
    <div class="glass overflow-hidden reveal">
      <div class="overflow-x-auto">
        <table class="w-full min-w-[780px] text-[13.5px] border-collapse">
          <caption class="sr-only">Annual technical premium by limit, attachment and revenue band</caption>
          <thead><tr class="bg-white/[0.03]">
            <th scope="col" class="text-left px-4 py-3 kicker font-normal">Layer</th>
            <th scope="col" class="text-right px-4 py-3 kicker font-normal">Unmonitored</th>
            <th scope="col" class="text-right px-4 py-3 kicker font-normal">Monitored</th>
            <th scope="col" class="text-right px-4 py-3 kicker font-normal">Credit</th>
            <th scope="col" class="text-right px-4 py-3 kicker font-normal">Rate on line</th>
          </tr></thead>
          <tbody id="matrixTable"></tbody>
        </table>
      </div>
    </div>

    <h2 class="font-semibold text-xl mt-14 mb-1 reveal">Competitive position</h2>
    <p class="text-dim text-[14.5px] mb-5 reveal max-w-3xl">Limits and paper are verified from trade
      press. Rates are <strong class="text-amber">simulated</strong> — these MGAs write on Lloyd&rsquo;s
      and surplus-lines paper, where rates are not publicly filed. We will not present a guess as a fact.</p>
    <div class="glass overflow-hidden reveal">
      <div class="overflow-x-auto">
        <table class="w-full min-w-[820px] text-[13.5px] border-collapse">
          <caption class="sr-only">Competitive comparison of AI liability writers</caption>
          <thead><tr class="bg-white/[0.03]">
            <th scope="col" class="text-left px-4 py-3 kicker font-normal">Writer</th>
            <th scope="col" class="text-left px-4 py-3 kicker font-normal">Paper</th>
            <th scope="col" class="text-left px-4 py-3 kicker font-normal">Limit</th>
            <th scope="col" class="text-left px-4 py-3 kicker font-normal">Continuous telemetry</th>
            <th scope="col" class="text-left px-4 py-3 kicker font-normal">Rate</th>
          </tr></thead>
          <tbody id="compTable"></tbody>
        </table>
      </div>
    </div>

    <div class="glass p-6 sm:p-7 border-l-2 border-l-teal mt-8 reveal">
      <h3 class="font-semibold text-teal mb-2">The gap we price into</h3>
      <p class="text-dim text-[14.5px]">Every competitor underwrites on a judgment made at inception
        and then waits. None holds <b>continuous behavioral telemetry</b> on the insured system
        during the policy period. That record converts AI liability from a guess into an actuarial
        line — and it lets us return roughly 45% of premium to the customer while improving our own
        loss ratio.</p>
      <p class="plain">Everyone else checks your AI once, then hopes. We watch it all year, so we
        can charge you less and still lose less.</p>
      <p class="mt-4"><a href="${href('contact')}" class="text-teal no-underline hover:underline">Get an indicative quote &rarr;</a></p>
    </div>
  </div>
</section>`
},

{
  slug: 'evidence',
  next: 'research',
  eyebrow: 'The loss record',
  intro: 'Five adjudicated AI failures spanning five orders of magnitude, plus every market claim on this site graded A to D against its source.',
  introPlain: 'Real cases, real amounts, real citations — including the four figures we checked and threw out.',
  title: 'The AI Loss Record — Five Adjudicated Outcomes | Sentinel',
  description: 'Moffatt v. Air Canada, Mata v. Avianca, Mobley v. Workday, Benavides v. Tesla and Bartz v. Anthropic — five real AI failures from $476 to $1.5 billion, each cited. Plus 29 market claims graded A to D, with four discarded in public.',
  h1: 'What AI failure has actually cost.',
  jsonld: 'Article',
  body: `
<section id="failures" class="py-28 sm:py-32 px-5 sm:px-7">
  <div class="max-w-content mx-auto">
${sectionHead('01', 'Loss record', 'Five adjudicated outcomes. Five orders of magnitude.',
  'Not projections. Court records and disclosed settlements, each cited. The spread between the smallest and largest is a factor of three million — which is exactly why carriers are excluding the risk instead of pricing it.',
  'Below is what real companies actually paid when their AI failed. The smallest was $476. The largest was $1.5 billion.')}
    <div id="dossier" class="space-y-3"></div>
    <div class="glass p-6 sm:p-7 border-l-2 border-l-amber mt-8 reveal">
      <h3 class="font-semibold text-amber mb-2">Frequency is compounding</h3>
      <p class="text-dim text-[14.5px]">Stanford HAI&rsquo;s AI Index recorded 233 AI incidents in
        2024 and 362 in 2025 — roughly 55% annual growth. IBM&rsquo;s 2026 breach study puts the
        average AI-involved breach at $5.9M against $4.99M without AI. Rising frequency against an
        unpriced severity tail is the definition of an uninsurable line, until someone measures it.</p>
      <p class="plain">Failures get more common every year, and nobody knows what the worst one will
        cost. That is why we measure.</p>
    </div>
  </div>
</section>

<section id="evidence" class="py-24 sm:py-28 px-5 sm:px-7 border-t border-white/[0.06]">
  <div class="max-w-content mx-auto">
${sectionHead('02', 'Evidence ledger', 'Every claim, graded and sourced.',
  '<strong class="text-teal">A</strong> court records, regulators, statistical agencies, standards bodies · <strong class="text-sky">B</strong> named-company disclosures and reputable trade press · <strong class="text-amber">C</strong> vendor surveys, shown only with the conflict disclosed · <strong class="text-rose">D</strong> report-mill projections with no traceable basis, discarded and shown anyway.',
  'We checked everything. The four claims we could not verify are still on the page, marked red, so you can see what we threw out.')}
    <dl class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8 reveal">
      <div class="glass p-5"><dd class="stat-n" id="cA">0</dd><dt class="kicker mt-2.5">Tier A — primary</dt></div>
      <div class="glass p-5"><dd class="stat-n text-sky" id="cB">0</dd><dt class="kicker mt-2.5">Tier B — corroborated</dt></div>
      <div class="glass p-5"><dd class="stat-n text-amber" id="cC">0</dd><dt class="kicker mt-2.5">Tier C — labeled</dt></div>
      <div class="glass p-5"><dd class="stat-n text-rose" id="cD">0</dd><dt class="kicker mt-2.5">Tier D — discarded</dt></div>
    </dl>
    <div id="ledger" class="space-y-2.5"></div>
    <noscript><p class="text-amber mt-5">The ledger is interactive. All claims and sources are in
      <code>evidence.json</code> beside this page.</p></noscript>
  </div>
</section>

<section id="sources" class="py-24 sm:py-28 px-5 sm:px-7 border-t border-white/[0.06]">
  <div class="max-w-content mx-auto">
${sectionHead('03', 'Sources', 'Check us.',
  'Every source behind every graded claim. Links open in a new tab.', null)}
    <div id="srcList" class="glass p-5 sm:p-6 columns-1 lg:columns-2 gap-6 reveal"></div>
  </div>
</section>`
},

{
  slug: 'research',
  next: 'coverage',
  eyebrow: 'Market research',
  intro: 'Where the exposure actually sits, which sectors carry it, and the ceiling test that separates a real market from a sales forecast.',
  introPlain: 'The data behind the business, with the estimates labeled as estimates.',
  title: 'AI Liability Market Research & Sector Exposure — Sentinel',
  description: 'Which sectors are most exposed to AI failure, and why. Exposure multipliers anchored to named court cases, monitored versus unmonitored premium by sector, and the cyber-insurance ceiling test that discards inflated market forecasts.',
  h1: 'Market research and sector exposure.',
  jsonld: 'Article',
  body: `
<section id="dashboard" class="py-28 sm:py-32 px-5 sm:px-7">
  <div class="max-w-content mx-auto">
${sectionHead('01', 'Market dashboard', 'The exposure is growing faster than the cover.',
  'Every figure is derived from the graded evidence set. Counters animate from the underlying growth rates — they are modeled, not a live market feed, and this page says so rather than faking a ticker.',
  'A dashboard of the real numbers, clearly labeled as estimates where they are estimates.')}
    <dl class="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4 reveal">
      <div class="glass p-5"><dd class="stat-n" data-count="19.8" data-suffix="%" data-dp="1">19.8%</dd>
        <dt class="kicker mt-2.5">US businesses using AI</dt>
        <p class="text-[12.5px] text-faint mt-2">Census Bureau BTOS, May 2026. Not the 74% vendor surveys claim.</p></div>
      <div class="glass p-5"><dd class="stat-n text-amber" data-count="362" data-dp="0">362</dd>
        <dt class="kicker mt-2.5">Recorded AI incidents, 2025</dt>
        <p class="text-[12.5px] text-faint mt-2">Stanford HAI AI Index. Up ~55% on 2024.</p></div>
      <div class="glass p-5"><dd class="stat-n" data-count="5.9" data-prefix="$" data-suffix="M" data-dp="1">$5.9M</dd>
        <dt class="kicker mt-2.5">Avg AI-involved breach</dt>
        <p class="text-[12.5px] text-faint mt-2">IBM 2026. $0.9M above a breach without AI.</p></div>
      <div class="glass p-5"><dd class="stat-n text-rose" data-count="8" data-dp="0">8</dd>
        <dt class="kicker mt-2.5">Rival writers already live</dt>
        <p class="text-[12.5px] text-faint mt-2">Armilla, Testudo, AIUC, HSB, Munich Re, +3.</p></div>
    </dl>
    <div class="grid lg:grid-cols-2 gap-4">
      <div class="glass p-5 sm:p-6 reveal">
        <h3 class="font-semibold mb-1">Cyber is the honest ceiling test</h3>
        <p class="text-[13.5px] text-dim mb-4">Global cyber premium took 25 years to reach $15.3B.
          Any forecast showing AI liability passing that within a decade is a sales document.</p>
        <div class="h-[260px]">${chartBlock('chartCyber','Line chart: global cyber insurance premium reached $15.3 billion in 2024 after 25 years, against a much smaller bottom-up estimate for standalone AI liability premium')}</div>
        <p class="plain">Insurance lines grow slowly. We planned for the slow version.</p>
      </div>
      <div class="glass p-5 sm:p-6 reveal">
        <h3 class="font-semibold mb-1">Where the revenue actually is</h3>
        <p class="text-[13.5px] text-dim mb-4">Gartner sizes AI governance platforms at $492M in
          2026, passing $1B by 2030 — roughly three times the standalone AI insurance pool today.</p>
        <div class="h-[260px]">${chartBlock('chartPools','Bar chart comparing the AI governance software market with the standalone AI liability premium pool for 2026, 2028 and 2030')}</div>
        <p class="plain">The software business is bigger and more certain than the insurance
          business. So we lead with software.</p>
      </div>
      <div class="glass p-5 sm:p-6 reveal lg:col-span-2">
        <h3 class="font-semibold mb-1">Your return on a Sentinel subscription</h3>
        <p class="text-[13.5px] text-dim mb-4">Modeled for a mid-market insured buying $5M xs $100k.
          Bars show annual cost; the line shows cumulative net position after avoided premium and
          avoided expected loss.</p>
        <div class="flex flex-wrap items-end gap-5 mb-4">
          <div class="min-w-[220px] flex-1">
            <label for="roiVert" class="field-label">Sector</label>
            <select id="roiVert" class="field"></select></div>
          <div class="min-w-[220px] flex-1">
            <label for="roiBand" class="field-label">Revenue band</label>
            <select id="roiBand" class="field"></select></div>
          <dl class="glass px-4 py-3 min-w-[190px]">
            <dt class="kicker mb-1">5-year net benefit</dt>
            <dd class="font-mono text-2xl text-teal" id="roiNet">—</dd></dl>
          <dl class="glass px-4 py-3 min-w-[150px]">
            <dt class="kicker mb-1">Payback</dt>
            <dd class="font-mono text-2xl text-amber" id="roiPayback">—</dd></dl>
        </div>
        <div class="h-[280px]">${chartBlock('chartRoi','Combined bar and line chart showing annual Sentinel subscription cost against annual benefit, with the cumulative net position over five years')}</div>
        <p class="plain">What you pay us versus what you save. Where the line crosses zero is when
          the subscription has paid for itself.</p>
      </div>
    </div>
  </div>
</section>

<section id="research" class="py-24 sm:py-28 px-5 sm:px-7 border-t border-white/[0.06]">
  <div class="max-w-content mx-auto">
${sectionHead('02', 'Sector analysis', 'Which sectors are most exposed.',
  'Exposure multipliers are anchored to specific adjudicated cases, not opinion. Each sector&rsquo;s loading traces to a real proceeding you can look up.',
  'Some industries get sued far more than others when AI fails. Here is the ranking, and the actual court case behind each one.')}
    <div class="grid lg:grid-cols-2 gap-4 mb-4">
      <div class="glass p-5 sm:p-6 reveal">
        <h3 class="font-semibold mb-1">Relative exposure by sector</h3>
        <p class="text-[13.5px] text-dim mb-4">Frequency multiplier against a commercial baseline of 1.00.</p>
        <div class="h-[340px]">${chartBlock('chartVert','Horizontal bar chart ranking sectors by AI claim frequency multiplier, from automotive at 2.4 times baseline down to retail at 0.9 times')}</div>
      </div>
      <div class="glass p-5 sm:p-6 reveal">
        <h3 class="font-semibold mb-1">Technical premium by sector</h3>
        <p class="text-[13.5px] text-dim mb-4">$5M xs $100k. Monitored versus unmonitored — the gap
          is the telemetry credit, and it is the product.</p>
        <div class="h-[340px]">${chartBlock('chartVertPrem','Horizontal bar chart comparing monitored and unmonitored annual technical premium by sector at a five million dollar limit')}</div>
      </div>
    </div>
    <div class="glass overflow-hidden reveal">
      <div class="overflow-x-auto">
        <table class="w-full min-w-[720px] text-[13.5px] border-collapse">
          <caption class="sr-only">Sector exposure multipliers, anchoring case, and modeled premium</caption>
          <thead><tr class="bg-white/[0.03]">
            <th scope="col" class="text-left px-4 py-3 kicker font-normal">Sector</th>
            <th scope="col" class="text-left px-4 py-3 kicker font-normal">Mult</th>
            <th scope="col" class="text-left px-4 py-3 kicker font-normal">Anchoring case</th>
            <th scope="col" class="text-right px-4 py-3 kicker font-normal">Unmonitored</th>
            <th scope="col" class="text-right px-4 py-3 kicker font-normal">Monitored</th>
            <th scope="col" class="text-right px-4 py-3 kicker font-normal">You save</th>
          </tr></thead>
          <tbody id="vertTable"></tbody>
        </table>
      </div>
    </div>
    <p class="plain reveal mt-5">If you are in HR software, healthcare, finance, law, or anything
      that moves physically, you are in the high-exposure group — and the savings from monitoring
      are largest for you.</p>
  </div>
</section>`
},

{
  slug: 'method',
  next: 'coverage',
  eyebrow: 'Method',
  intro: 'Three models, all reproducible from the files shipped beside this page, with fixed seeds and the assumptions written down.',
  introPlain: 'How every number on this site was produced, so you can re-run it.',
  title: 'Method — How the Pricing and Viability Models Work | Sentinel',
  description: 'The actuarial method behind Sentinel: excess-of-loss ratemaking on a severity mixture calibrated to real outcomes, a 60,000-trial strategy simulation, and the evidence grading scheme that discarded four widely-quoted market figures.',
  h1: 'How the models work.',
  jsonld: 'Article',
  body: `
<section id="method" class="py-28 sm:py-32 px-5 sm:px-7">
  <div class="max-w-content mx-auto">
${sectionHead('01', 'Method', 'Show the working, or do not show the number.',
  'Three models sit behind this site. All three are reproducible from the files shipped alongside it, with fixed seeds.',
  'Everything on this site comes from code you can re-run. Here is what each model does.')}

    <div class="grid lg:grid-cols-3 gap-3 mb-10">
      <article class="glass p-6 reveal"><p class="kicker mb-2">Model 01</p>
        <h3 class="font-semibold text-lg mb-2">Actuarial pricing</h3>
        <p class="text-[14px] text-dim">Standard excess-of-loss ratemaking. Poisson frequency,
          modified by sector and revenue band; a three-component lognormal severity mixture;
          aggregate annual loss ceded to layer; then 28% expense, 10% profit and a risk load
          proportional to the layer&rsquo;s coefficient of variation.</p>
        <p class="text-[12px] text-faint mt-3">400,000 simulations · seed 4711 · <code>pricing.py</code></p></article>
      <article class="glass p-6 reveal"><p class="kicker mb-2">Model 02</p>
        <h3 class="font-semibold text-lg mb-2">Strategy viability</h3>
        <p class="text-[14px] text-dim">Three go-to-market strategies over five years. Success is
          defined strictly: still holds carrier capacity, clears $10M of year-five revenue, and is
          cumulatively cash-positive. Assurance-first wins at 81.6% against 2.4% and 0.2%.</p>
        <p class="text-[12px] text-faint mt-3">60,000 trials · seed 20260808 · <code>montecarlo_v2.py</code></p></article>
      <article class="glass p-6 reveal"><p class="kicker mb-2">Model 03</p>
        <h3 class="font-semibold text-lg mb-2">Evidence grading</h3>
        <p class="text-[14px] text-dim">Twenty-nine claims, each graded A to D by source quality.
          Four were discarded and are shown struck through rather than deleted, so a reader can see
          what was rejected and why.</p>
        <p class="text-[12px] text-faint mt-3"><code>evidence.json</code> · <a href="${href('evidence')}" class="text-teal no-underline hover:underline">read the ledger</a></p></article>
    </div>

    <h2 class="font-semibold text-xl mb-3 reveal">Severity calibration</h2>
    <p class="text-dim text-[14.5px] mb-5 reveal max-w-3xl">A severity model is only worth
      something if it reproduces outcomes that actually happened. Ours is tuned until its quantiles
      land on the five adjudicated results:</p>
    <div class="glass overflow-hidden reveal mb-4">
      <div class="overflow-x-auto">
        <table class="w-full min-w-[560px] text-[13.5px] border-collapse">
          <caption class="sr-only">Simulated severity quantiles against real adjudicated outcomes</caption>
          <thead><tr class="bg-white/[0.03]">
            <th scope="col" class="text-left px-4 py-3 kicker font-normal">Quantile</th>
            <th scope="col" class="text-right px-4 py-3 kicker font-normal">Model</th>
            <th scope="col" class="text-left px-4 py-3 kicker font-normal">Real-world anchor</th>
          </tr></thead>
          <tbody>
            <tr class="border-b border-white/[0.05]"><td class="px-4 py-3 font-mono">p50</td><td class="px-4 py-3 text-right font-mono text-teal">$82,479</td><td class="px-4 py-3 text-dim">Operational corrections and small settlements</td></tr>
            <tr class="border-b border-white/[0.05]"><td class="px-4 py-3 font-mono">p90</td><td class="px-4 py-3 text-right font-mono text-teal">$1,307,268</td><td class="px-4 py-3 text-dim">Litigated disputes</td></tr>
            <tr class="border-b border-white/[0.05]"><td class="px-4 py-3 font-mono">p99</td><td class="px-4 py-3 text-right font-mono text-teal">$31,575,310</td><td class="px-4 py-3 text-dim">Class exposure and regulatory action</td></tr>
            <tr class="border-b border-white/[0.05]"><td class="px-4 py-3 font-mono">p99.9</td><td class="px-4 py-3 text-right font-mono text-amber">$335,693,320</td><td class="px-4 py-3 text-dim">Benavides v. Tesla — $243M, upheld Feb 2026</td></tr>
            <tr><td class="px-4 py-3 font-mono">p99.99</td><td class="px-4 py-3 text-right font-mono text-amber">$1,226,046,093</td><td class="px-4 py-3 text-dim">Bartz v. Anthropic — $1.5B settlement</td></tr>
          </tbody>
        </table>
      </div>
    </div>
    <p class="plain reveal mb-10">We kept adjusting the model until the disasters it predicts match
      the disasters that actually happened.</p>

    <div class="glass p-6 sm:p-7 border-l-2 border-l-amber reveal">
      <h3 class="font-semibold text-amber mb-2">What we refuse to do</h3>
      <ul class="space-y-2 text-[14.5px] text-dim mt-3">
        <li class="flex gap-2.5"><span class="text-amber shrink-0">&times;</span>Quote a layer whose rate on line exceeds 4%. At that burn rate the policy is a payment plan, not a risk transfer.</li>
        <li class="flex gap-2.5"><span class="text-amber shrink-0">&times;</span>Present a competitor&rsquo;s rate as fact. Lloyd&rsquo;s and surplus-lines rates are not publicly filed; ours are labeled simulated.</li>
        <li class="flex gap-2.5"><span class="text-amber shrink-0">&times;</span>Use a market figure we cannot trace to a primary source, however widely it is repeated.</li>
      </ul>
      <p class="plain">If we cannot show you where a number came from, it does not go on the site.</p>
    </div>
  </div>
</section>`
},

{
  slug: 'contact',
  next: 'method',
  eyebrow: 'Collaborate',
  intro: 'Give us the sector, revenue band and limit you need covered. You get back a modeled premium — the monitored figure, the unmonitored figure, and the assumptions behind both.',
  introPlain: 'Tell us what you need covered and we will send a real price with the working shown.',
  title: 'Get an Indicative AI Liability Quote — Sentinel',
  description: 'Tell us your sector, revenue band and required limit. You get back a modeled premium with the monitored and unmonitored figures, and the assumptions behind both. For risk buyers, brokers, carriers and assurance partners.',
  h1: 'Get an indicative quote.',
  jsonld: 'ContactPage',
  body: `
<section id="contact" class="py-28 sm:py-32 px-5 sm:px-7">
  <div class="max-w-content mx-auto grid lg:grid-cols-2 gap-8 items-start">
    <div class="reveal">
      <h2 class="font-semibold text-xl mb-3">What happens next</h2>
      <ol class="space-y-3 text-[14.5px] text-dim mb-7">
        <li class="flex gap-3"><span class="font-mono text-teal shrink-0">1</span>You send the
          sector, revenue band and limit. That is enough to run the model.</li>
        <li class="flex gap-3"><span class="font-mono text-teal shrink-0">2</span>We return the
          monitored and unmonitored technical premium, with the frequency and severity assumptions
          that produced each — not a range, a number and its working.</li>
        <li class="flex gap-3"><span class="font-mono text-teal shrink-0">3</span>If the layer prices
          above a 4% rate on line we say so and decline it, rather than selling you a payment plan.</li>
      </ol>
      <div class="glass p-5">
        <p class="kicker mb-3">Who this is for</p>
        <ul class="space-y-2 text-[14px] text-dim">
          <li class="flex gap-2.5"><span class="text-teal shrink-0">&rarr;</span>Companies running customer-facing AI who found an exclusion at renewal</li>
          <li class="flex gap-2.5"><span class="text-teal shrink-0">&rarr;</span>Brokers whose clients are asking about AI coverage</li>
          <li class="flex gap-2.5"><span class="text-teal shrink-0">&rarr;</span>Carriers and syndicates evaluating capacity for this line</li>
          <li class="flex gap-2.5"><span class="text-teal shrink-0">&rarr;</span>Auditors and assurance firms looking for a telemetry partner</li>
        </ul>
      </div>
    </div>

    <form id="quoteForm" class="glass glass-strong p-6 sm:p-8 reveal" novalidate>
      <div class="grid sm:grid-cols-2 gap-4">
        <div><label class="field-label" for="fName">Name<span class="text-amber" aria-hidden="true">*</span></label>
          <input class="field" id="fName" name="name" type="text" autocomplete="name" required aria-required="true" aria-describedby="formErr"></div>
        <div><label class="field-label" for="fEmail">Work email<span class="text-amber" aria-hidden="true">*</span></label>
          <input class="field" id="fEmail" name="email" type="email" autocomplete="email" required aria-required="true" aria-describedby="formErr"></div>
        <div><label class="field-label" for="fCompany">Company</label>
          <input class="field" id="fCompany" name="company" type="text" autocomplete="organization"></div>
        <div><label class="field-label" for="fRole">I am a…</label>
          <select class="field" id="fRole" name="role">
            <option>Risk / insurance buyer</option><option>Broker</option>
            <option>Carrier or syndicate</option><option>Engineering / AI lead</option>
            <option>Investor</option><option>Other</option></select></div>
        <div><label class="field-label" for="fSector">Sector</label>
          <select class="field" id="fSector" name="sector"></select></div>
        <div><label class="field-label" for="fLimit">Limit required</label>
          <select class="field" id="fLimit" name="limit"></select></div>
      </div>
      <div class="mt-4"><label class="field-label" for="fMsg">What are you trying to cover?</label>
        <textarea class="field" id="fMsg" name="message" rows="4"
          placeholder="e.g. a customer-facing support agent handling 40k conversations a month"></textarea></div>
      <dl class="glass p-4 mt-5 flex items-start justify-between gap-4 flex-wrap">
        <div><dt class="kicker mb-1">Indicative annual premium, monitored</dt>
          <dd class="font-mono text-2xl text-teal" id="fQuote">—</dd></div>
        <div class="text-right"><dt class="kicker mb-1">Unmonitored</dt>
          <dd class="font-mono text-lg text-amber line-through decoration-amber/50" id="fQuoteRaw">—</dd></div>
      </dl>
      <div class="flex items-start gap-2.5 mt-5">
        <input type="checkbox" id="fConsent" name="consent" class="mt-1 accent-[#1cc0a8] w-4 h-4 shrink-0" required aria-required="true" aria-describedby="formErr">
        <label for="fConsent" class="text-[13px] text-dim">I agree to be contacted about this
          inquiry. No marketing lists, no data sold.</label>
      </div>
      <p id="formErr" role="alert" aria-live="polite" class="text-rose text-[13px] mt-4 hidden"></p>
      <p id="formOk" role="status" aria-live="polite" class="text-teal text-[13.5px] mt-4 hidden"></p>
      <button type="submit" class="btn btn-primary w-full mt-5 py-3">Request indicative quote</button>
      <p class="plain tight">Nothing you type here is sent anywhere or saved. Pressing the button
        opens your own email app with the details filled in, and you decide whether to send it.</p>
      <p class="text-[12px] text-faint mt-3">This is a static site: submitting composes an email in
        your own client. Nothing is transmitted to a server and nothing is stored in your browser.</p>
    </form>
  </div>
</section>`
},
];

module.exports = { SITE, NAV, PAGES, href };
