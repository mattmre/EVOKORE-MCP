---
name: panel-business-product-strategy
description: Expert panel for market analysis, financial modeling, competitive intelligence, go-to-market strategy, and business model validation
aliases: [business-panel, strategy-panel, gtm-panel, market-panel, business-review]
category: orchestration
tags: [business, strategy, market-analysis, go-to-market, unit-economics, competitive-intelligence, product-strategy]
version: 1.0.0
requires: [panel-of-experts]
resolutionHints:
  - business strategy review
  - market analysis
  - go-to-market strategy review
  - business model validation
  - competitive analysis
  - unit economics review
  - business case review
---

# Business & Product Strategy Panel

## Panel Composition

| Expert | Role | Primary Lens |
|---|---|---|
| **Victoria Langston** | Market Strategist & Competitive Intelligence | Market sizing, competitive positioning, differentiation |
| **Robert Chiang** | Financial Modeler & Unit Economics | Financial viability, unit economics, pricing sustainability |
| **Amanda Frost** | Go-to-Market & Growth Strategist | GTM motion selection, growth channels, sales cycle validation |
| **Dr. Samuel Osei** | Business Model Innovation & Platform Strategy | Business model design, network effects, platform economics |

See [expert-roster.md](../expert-roster.md) for full persona definitions.

## When to Invoke

- Quarterly business review and strategy assessment
- New market entry decision or geographic expansion
- Business case review for major features or product investments
- Go-to-market strategy development or pivot
- Competitive positioning review after market changes
- Fundraising preparation and investor pitch review
- Pricing model changes or new revenue stream design
- Partnership or acquisition evaluation

## Review Modes

### Mode A: Market Opportunity & Competitive Review
Evaluate market sizing, competitive landscape, and positioning differentiation.

### Mode B: Unit Economics & Financial Model Review
Assess financial viability, pricing model sustainability, and growth assumption defensibility.

### Mode C: Go-to-Market Strategy Review
Review GTM motion, growth channel strategy, and sales cycle alignment with buyer behavior.

---

## Review Protocol

### Step 1: CONVENE — Select Mode and Experts

| Mode | Active Experts |
|---|---|
| Market Opportunity & Competitive | Victoria, Dr. Osei, Amanda |
| Unit Economics & Financial Model | Robert, Victoria, Amanda |
| Go-to-Market Strategy | Amanda, Victoria, Robert |

### Step 2: BRIEF — Present the Artifact

**For Market Opportunity & Competitive (Mode A):**
```
## Market Opportunity Under Review
- **Product/Service:** [what is being offered]
- **Target Market:** [who is the buyer — segment, persona, geography]
- **Market Size Estimate:** [TAM, SAM, SOM with methodology]
- **Competitive Landscape:** [key competitors and their positioning]
- **Differentiation Claim:** [why customers choose this over alternatives]
- **Market Timing:** [why now — trends, regulatory changes, technology shifts]
- **Customer Evidence:** [existing customers, pilots, LOIs, or pipeline]
```

**For Unit Economics & Financial Model (Mode B):**
```
## Financial Model Under Review
- **Revenue Model:** [subscription, usage-based, transaction, marketplace, licensing]
- **Pricing:** [current pricing tiers and basis]
- **Key Metrics:** [CAC, LTV, payback period, gross margin — actuals or estimates]
- **Growth Assumptions:** [revenue growth rate, customer acquisition rate, expansion rate]
- **Cost Structure:** [major cost categories and their behavior at scale]
- **Cash Position:** [current runway, funding status]
- **Break-Even Target:** [when and at what revenue level]
- **Model Spreadsheet:** [link or file path if available]
```

**For Go-to-Market Strategy (Mode C):**
```
## GTM Strategy Under Review
- **GTM Motion:** [product-led, sales-assisted, enterprise sales, marketplace, channel]
- **Target Buyer:** [title, company size, industry]
- **Sales Cycle:** [expected length, stages, decision-makers involved]
- **Growth Channels:** [organic, paid, content, partnerships, referral, outbound]
- **Channel Validation:** [which channels have been tested, with what results]
- **Competitive Win Rate:** [if known — percentage of deals won vs specific competitors]
- **Onboarding:** [time-to-value for new customers]
- **Expansion Strategy:** [how existing customers grow — upsell, cross-sell, usage expansion]
```

### Step 3: SOLO — Independent Expert Reviews

**Victoria Langston (Market Strategist & Competitive Intelligence) reviews:**
- Market sizing methodology — is the TAM/SAM/SOM breakdown credible? Is it built bottom-up from customer counts and willingness-to-pay, or top-down from industry reports? Are the sources cited?
- Competitive positioning — who are the three closest competitors, and what is the honest assessment of their advantages? Is the differentiation real and sustainable, or is it a temporary feature gap?
- Positioning clarity — can the team articulate why a customer would choose this product in one sentence? Is that sentence different from what competitors say?
- Market timing — why is this the right time to enter or expand? Is there a forcing function (regulatory change, technology shift, market disruption) or is timing arbitrary?
- Competitive response — how will competitors respond to this entry or positioning? Have they historically responded aggressively to new entrants?
- Customer segmentation — is the target segment well-defined, or is the product trying to serve too many segments with a single positioning?
- Market validation evidence — is the market opportunity validated by customer evidence (LOIs, pilots, paid customers) or only by market research and reports?
- "What's your TAM/SAM/SOM breakdown, and how did you calculate each? Who are your three closest competitors, and what's your honest assessment of their advantages?"

**Robert Chiang (Financial Modeler & Unit Economics) reviews:**
- Unit economics viability — do the unit economics work at current scale? Do they improve or deteriorate at 10x scale? What is the CAC payback period?
- Pricing model sustainability — is the pricing model aligned with value delivery? Does the customer pay more as they get more value, or is there a disconnect?
- Growth assumption sensitivity — what assumptions would need to change for the model to break? Which assumptions have the widest confidence interval?
- Gross margin trajectory — what is the current gross margin, and how does it change at scale? Are there cost components that don't scale (human review, custom integration)?
- Cash flow timing — when does the business reach cash flow breakeven? Is the path to breakeven within the current funding runway?
- Revenue concentration — what percentage of revenue comes from the top 3 customers? Is revenue concentration a risk?
- Scenario modeling — has the model been stress-tested with pessimistic assumptions? What does the "everything goes wrong but we survive" scenario look like?
- "What's your CAC, and does it decrease at scale or increase? What assumptions would need to change for this model to break?"

**Amanda Frost (Go-to-Market & Growth Strategist) reviews:**
- GTM motion fit — is the GTM motion right for the buyer? Is this a self-serve, sales-assisted, or enterprise sales product — and how does the team know?
- Growth channel validation — have any growth channels been validated with actual spend and measured results? Or are channel plans based on hypotheses?
- Sales cycle realism — is the expected sales cycle length realistic for the buyer persona and deal size? Has the team sold to this buyer before?
- Onboarding and activation — how long does it take a new customer to reach time-to-value? Is there a product-led onboarding path, or does every customer require human handholding?
- Expansion motion — how do existing customers grow? Is expansion driven by usage growth, new use cases, or new teams within the organization?
- Channel conflict — if using multiple channels (direct sales + partners + self-serve), are there conflicts in pricing, attribution, or customer ownership?
- Competitive displacement — for deals against established competitors, what is the win rate? What is the primary reason for winning and losing?
- "Is this a self-serve, sales-assisted, or enterprise sales motion — and how do you know? Have you validated any of these growth channels with actual spend?"

**Dr. Samuel Osei (Business Model Innovation & Platform Strategy) reviews:**
- Value capture position — where does value accrue in this business model? Does value accrue to the business, or does it leak to customers, suppliers, or platform intermediaries?
- Network effects — is there a network effect? If so, is it direct (more users = more value per user) or indirect (more users attract complementary participants)? How strong is the effect?
- Switching costs — what is the switching cost for customers? Is it based on data lock-in, workflow integration, learning curve, or contractual commitment? Is the switching cost durable?
- Cold start problem — if there is a marketplace or platform component, how is the chicken-and-egg problem solved? What is the strategy for the first 100 participants on each side?
- Business model evolution — does the current business model allow for evolution? Can new revenue streams be added without cannibalizing existing ones?
- Platform vs product — is this a product (delivers value directly) or a platform (enables value creation by others)? Is the team building the right one for the opportunity?
- Defensibility assessment — what structural advantages does this business model create? Are they based on scale, data, network effects, or regulatory moats?
- "Where does value accrue in this model — to you or to your users? Is there a network effect, and if so, is it direct or indirect?"

### Step 4: CHALLENGE — Cross-Expert Debate

Key tensions for this panel:

1. **Victoria vs Amanda:** "The market is crowded — you need sharper differentiation before going to market" vs "Execution beats positioning — the best positioning strategy is to outrun the competition on speed and customer intimacy"
2. **Robert vs Dr. Osei:** "The unit economics don't work at current scale — this isn't a viable business yet" vs "The unit economics change fundamentally once the network effect kicks in — judging a platform's economics before critical mass is misleading"
3. **Amanda vs Victoria:** "Ship and iterate the GTM motion — you learn more from 10 sales calls than 10 market studies" vs "Wrong positioning will burn your initial market credibility — you don't get a second chance at a first impression with early adopters"
4. **Dr. Osei vs Robert:** "Invest in platform infrastructure now to create long-term defensibility" vs "Platform economics are speculative — prove the single-player use case first before betting on network effects"
5. **Victoria vs Robert:** "The market opportunity is large enough to justify the investment even with conservative assumptions" vs "The market size is irrelevant if the unit economics don't support the GTM motion required to capture that market"

### Step 5: CONVERGE — Synthesize Findings

```markdown
## Business & Product Strategy Panel Report

### Overall Assessment: [PROCEED / PROCEED WITH MODIFICATIONS / PIVOT / NEEDS REWORK]

### Market Opportunity Findings
1. **[Finding]** — confidence: [high/medium/low], evidence: [description], recommendation: [approach]

### Competitive Positioning Assessment
- Differentiation strength: [strong/moderate/weak]
- Competitive moat: [description of sustainable advantage, or lack thereof]
- Key competitive risks: [list]

### Unit Economics Findings
1. **[Metric]** — current value: [number], target: [number], gap: [description], remediation: [approach]

### GTM Strategy Findings
1. **[Finding]** — severity: [critical/high/medium/low], recommendation: [approach]

### Business Model Assessment
- Model type: [product/platform/marketplace/hybrid]
- Network effects: [present/absent/potential — description]
- Switching costs: [high/medium/low — basis]
- Defensibility: [strong/moderate/weak — basis]

### Risk Register
| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| [Risk 1] | [H/M/L] | [H/M/L] | [approach] | [who] |

### Financial Model Sensitivity
- Most sensitive assumption: [which assumption, and what happens if it's wrong]
- Break-even scenario: [conditions required]
- Worst-case viable scenario: [minimum conditions for survival]

### Dissenting Opinions
1. [Expert] argued [position] — [rationale]
```

### Step 6: FEASIBILITY -> DELIVER

Top recommendations and strategic alternatives go to [Feasibility Panel](feasibility-research.md) for implementation viability assessment.

---

## Example Invocations

### Market Opportunity & Competitive Review
```
Run a Business & Product Strategy Panel review — Mode A
(Market Opportunity & Competitive) — on the proposed MCP
aggregator market entry for enterprise developer tools.

The product is EVOKORE-MCP, a multi-server MCP aggregator
targeting engineering teams that use multiple AI coding tools.
The MCP protocol is emerging and there are fewer than 10
known aggregator implementations.

Key concerns:
- Is the MCP aggregator market real, or is it too early?
- Who are the likely competitors if the market develops?
- What is the defensible positioning for an aggregator?

Victoria, Dr. Osei, Amanda active. Include feasibility gate.
```

### Unit Economics & Financial Model Review
```
Run a Business & Product Strategy Panel review — Mode B
(Unit Economics & Financial Model) — on the proposed
freemium-to-enterprise pricing model.

The model assumes free tier (open source), pro tier ($49/mo
per seat), and enterprise tier (custom pricing). CAC is
estimated at $150 for self-serve and $5,000 for enterprise.

Key question: Do the unit economics support a self-serve
GTM motion, or does the CAC require enterprise sales at
current pricing?

Robert, Victoria, Amanda active. Include feasibility gate.
```

### Go-to-Market Strategy Review
```
Run a Business & Product Strategy Panel review — Mode C
(Go-to-Market Strategy) — on the developer-first GTM plan.

The plan targets individual developers through open source,
conference talks, and technical blog content, with a
bottom-up enterprise expansion motion.

Key concerns:
- Is bottom-up adoption realistic for an infrastructure tool?
- What is the conversion trigger from free to paid?
- How does the sales cycle work when the buyer isn't the user?

Amanda, Victoria, Robert active.
```
