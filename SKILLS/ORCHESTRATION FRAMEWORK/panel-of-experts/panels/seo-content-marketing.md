---
name: panel-seo-content-marketing
description: Expert panel for technical SEO, content strategy, conversion optimization, brand voice consistency, and content distribution
aliases: [seo-panel, content-marketing-panel, marketing-panel, content-strategy-panel, seo-review]
category: orchestration
tags: [seo, content-marketing, brand-voice, conversion-optimization, content-strategy, distribution, marketing]
version: 1.0.0
requires: [panel-of-experts]
resolutionHints:
  - SEO review
  - content marketing review
  - content strategy review
  - brand voice review
  - conversion optimization
  - content distribution review
  - marketing campaign review
---

# SEO & Content Marketing Panel

## Panel Composition

| Expert | Role | Primary Lens |
|---|---|---|
| **Michelle Torres** | Technical SEO Architect | Crawlability, indexation, Core Web Vitals, structured data |
| **Andre Williams** | Content Strategist & Editorial Director | Topic clustering, content gaps, topical authority, audience intent |
| **Dr. Rebecca Lin** | Conversion Rate Optimization Specialist | Conversion effectiveness, CTA placement, behavioral psychology |
| **Jasper Koenig** | Brand Voice & Messaging Architect | Brand consistency, messaging framework, tone alignment |
| **Sarah Blackwell** | Content Distribution & Promotion Strategist | Distribution channels, social optimization, paid amplification |

See [expert-roster.md](../expert-roster.md) for full persona definitions.

## When to Invoke

- Content publication workflow review (pre-publish quality gate)
- Technical SEO audit or site architecture review
- Content marketing campaign review or post-campaign analysis
- Brand voice consistency check across content library
- Content strategy planning and editorial calendar design
- Conversion funnel analysis for content-driven funnels
- Site migration SEO impact assessment
- New content format or channel launch

## Review Modes

### Mode A: Content Pre-Publication Review
Full SEO, brand, conversion, and distribution review of content before publication.

### Mode B: Technical SEO Audit
Comprehensive technical SEO assessment of site crawlability, indexation, performance, and structured data.

### Mode C: Content Strategy & Calendar Review
Evaluate content strategy, topic coverage, audience alignment, and editorial planning.

---

## Review Protocol

### Step 1: CONVENE — Select Mode and Experts

| Mode | Active Experts |
|---|---|
| Content Pre-Publication | Andre, Michelle, Jasper, Dr. Lin |
| Technical SEO Audit | Michelle, Andre, Sarah |
| Content Strategy & Calendar | All 5 |

### Step 2: BRIEF — Present the Artifact

**For Content Pre-Publication (Mode A):**
```
## Content Under Review
- **Content Type:** [blog post, landing page, guide, white paper, case study, product page]
- **Title/Headline:** [working title]
- **Target Keyword(s):** [primary and secondary keywords]
- **Word Count:** [length]
- **Target Audience:** [persona, funnel stage — awareness, consideration, decision]
- **Conversion Goal:** [what the reader should do after consuming this content]
- **Brand Voice Guidelines:** [link to brand guide or key voice attributes]
- **Distribution Plan:** [channels and timeline]
- **Competing Content:** [top-ranking content for target keywords]
```

**For Technical SEO Audit (Mode B):**
```
## Site Under Technical SEO Review
- **Site URL:** [domain]
- **Page Count:** [indexed pages vs total pages]
- **Platform/CMS:** [WordPress, custom, headless, etc.]
- **Rendering:** [server-side, client-side JavaScript, hybrid]
- **Core Web Vitals:** [LCP, FID/INP, CLS — current scores]
- **Crawl Budget Concerns:** [large site, faceted navigation, pagination]
- **Known Issues:** [indexation gaps, duplicate content, redirect chains]
- **Recent Changes:** [migrations, redesigns, CMS changes]
```

**For Content Strategy & Calendar (Mode C):**
```
## Content Strategy Under Review
- **Business Goals:** [traffic, leads, brand awareness, thought leadership]
- **Target Audience:** [personas and segments]
- **Current Content Volume:** [pieces per week/month]
- **Content Types:** [blog, video, podcast, newsletter, social, webinar]
- **Topic Coverage:** [primary topic clusters and coverage depth]
- **Traffic Sources:** [percentage from organic, social, paid, direct, referral]
- **Conversion Funnel:** [content role at each funnel stage]
- **Competitor Content:** [top content competitors and their strategy]
- **Budget:** [content production and distribution budget]
```

### Step 3: SOLO — Independent Expert Reviews

**Michelle Torres (Technical SEO Architect) reviews:**
- Crawlability — is the site fully crawlable by search engines? Are there blocked resources, orphaned pages, or crawl traps (infinite parameter URLs, faceted navigation)?
- Indexation gap — how many pages are in the index vs how many should be? What is causing the gap (noindex, canonicalization errors, thin content, crawl budget)?
- Core Web Vitals — does the site meet Google's performance thresholds? What is the LCP, INP, and CLS for key page templates? Are there page types that consistently fail?
- Structured data — is schema markup implemented correctly? Is the structured data type appropriate for the content (Article, FAQ, HowTo, Product, BreadcrumbList)? Are there validation errors?
- Canonical signals — are canonical URLs correct and consistent? Are there conflicting signals (canonical, hreflang, sitemap inclusion) for the same page?
- Internal linking architecture — is link equity distributed effectively? Are high-value pages linked from the site's navigation and contextually from related content?
- Render path — is Googlebot seeing what users see? Is JavaScript-rendered content visible in the initial HTML, or does it require client-side execution?
- "How many of your pages are actually in the index, and why is there a gap? What's the render path — is Googlebot seeing what users see?"

**Andre Williams (Content Strategist & Editorial Director) reviews:**
- Search intent alignment — does this content serve the right search intent (informational, navigational, commercial, transactional)? Does the content format match what ranks for this query?
- Topic cluster position — where does this content fit in the site's topic architecture? Is it a pillar page, a cluster page, or an orphan? What links to it and what does it link to?
- Content gap analysis — are there high-value topics in this domain that the site hasn't covered? Are competitors ranking for topics where this site has no content?
- Topical authority depth — does the site have enough content breadth and depth on this topic to be considered authoritative? Are there thin coverage areas that undermine the overall cluster?
- Audience stage mapping — is this content serving the right funnel stage? Is there content coverage at every stage (awareness, consideration, decision), or are there gaps?
- Content freshness — is existing content current? Are there high-traffic pages with outdated information that could lose rankings?
- Competitive content quality — how does this content compare to the top 3 ranking pieces for the target keyword? Is it meaningfully better, or just equivalent?
- "What search intent does this content serve — informational, navigational, or transactional? Where does this fit in your content cluster, and what's linking to it?"

**Dr. Rebecca Lin (Conversion Rate Optimization Specialist) reviews:**
- Conversion path clarity — after consuming this content, does the reader know what to do next? Is the desired action clear and frictionless?
- CTA placement and design — are calls-to-action placed at decision-ready moments in the content? Are they visually distinct without being intrusive?
- Objection handling — does the content address the reader's likely objections before asking for the conversion? Are trust signals (social proof, credentials, guarantees) present?
- Cognitive load — does the page design and content structure support easy scanning and decision-making? Are there too many competing actions?
- Micro-conversion opportunities — for top-of-funnel content where the reader isn't ready to buy, are there lower-commitment actions (newsletter signup, content download, free trial)?
- Form and friction analysis — if the conversion involves a form, is it appropriately short? Are fields justified by the value exchange?
- Testing readiness — is this content structured to support A/B testing of headlines, CTAs, and page layouts? Are there testable hypotheses?
- "What should the reader do after consuming this content, and is that path clear? Are you addressing the reader's objections before asking for the conversion?"

**Jasper Koenig (Brand Voice & Messaging Architect) reviews:**
- Voice consistency — does this content sound like it came from the same organization as other content on the site? If the logo were removed, could a reader identify the brand?
- Tone appropriateness — is the tone right for the topic, audience, and content type? Is a serious topic treated with appropriate gravity? Is a playful topic allowed to be engaging?
- Messaging alignment — does the content reinforce the brand's core messaging framework? Are key value propositions communicated consistently with other touchpoints?
- Terminology consistency — are product names, feature names, and industry terms used consistently with the brand's glossary? Are there inconsistencies between this piece and other content?
- Voice scalability — if 20 different writers produced content following this brand voice, would the output be consistent? Are voice guidelines specific enough to be actionable?
- Competitor voice differentiation — does the brand voice sound distinct from competitors, or could this content appear on a competitor's site without anyone noticing?
- Editorial personality — does the content have personality, or is it generic corporate writing? Is the brand's editorial point of view present?
- "If I removed the logo, could you tell this was written by your company? Is this tone right for this topic?"

**Sarah Blackwell (Content Distribution & Promotion Strategist) reviews:**
- Distribution plan completeness — is there a distribution plan for this content? Does it cover organic, social, email, paid, and partnership channels?
- Social preview optimization — are Open Graph tags and Twitter cards configured correctly? Does the social preview image and description compel clicks?
- Platform-specific adaptation — is the content adapted for each distribution channel (full article for web, excerpts for social, summary for email, repurposed for video)?
- Paid amplification strategy — is there a paid promotion budget? If so, what is the target audience and expected ROAS? If not, should there be?
- Influencer and partnership distribution — are there industry influencers, partners, or publications that should amplify this content? Has outreach been planned?
- Email distribution — is this content being sent to the subscriber list? Is the email subject line optimized? Is the send time data-informed?
- Repurposing plan — can this content be repurposed into other formats (infographic, video, podcast segment, social thread)? Is a repurposing plan documented?
- "What's the distribution plan for this piece? Have you tested the social preview — Open Graph tags, Twitter cards?"

### Step 4: CHALLENGE — Cross-Expert Debate

Key tensions for this panel:

1. **Michelle vs Jasper:** "The title tag needs to include the primary keyword in the first 60 characters for search ranking" vs "The brand voice can't be subordinated to SEO formula — keyword-stuffed titles damage brand perception"
2. **Andre vs Dr. Lin:** "Publish more content to build topical authority and cover content gaps — volume drives organic growth" vs "Fewer, higher-converting pieces generate more business value — 10 mediocre posts don't outperform 1 great one"
3. **Dr. Lin vs Jasper:** "This page needs a stronger CTA above the fold — the conversion rate is below benchmark" vs "Aggressive CTAs damage brand trust and editorial credibility — readers disengage when they feel sold to"
4. **Andre vs Jasper:** "Write what the audience searches for — search volume data should drive the editorial calendar" vs "Write what the brand should stand for — chasing search volume turns the brand into a commodity content farm"
5. **Sarah vs Michelle:** "Optimize the social preview and distribution plan — that's where the initial traffic comes from" vs "Organic search is the sustainable traffic source — social traffic spikes and fades, search traffic compounds"

### Step 5: CONVERGE — Synthesize Findings

```markdown
## SEO & Content Marketing Panel Report

### Overall Assessment: [PUBLISH / PUBLISH WITH REVISIONS / NEEDS REWORK]

### Technical SEO Findings
1. **[Finding]** — severity: [critical/high/medium/low], pages affected: [count/scope], remediation: [approach]

### Content Strategy Findings
1. **[Finding]** — impact: [high/medium/low], recommendation: [approach]

### Conversion Optimization Findings
1. **[Finding]** — current conversion rate: [if known], recommendation: [approach], expected lift: [estimate]

### Brand Voice Findings
1. **[Finding]** — consistency score: [high/medium/low], recommendation: [approach]

### Distribution Readiness Findings
1. **[Finding]** — channel: [which], readiness: [ready/needs work/not planned], recommendation: [approach]

### Risk Register
| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| [Risk 1] | [H/M/L] | [H/M/L] | [approach] | [who] |

### Content Performance Forecast
- Target keyword rankings: [expected positions and timeline]
- Traffic forecast: [estimated monthly sessions at maturity]
- Conversion forecast: [expected conversion rate and volume]
- Distribution reach: [estimated reach across channels]

### Dissenting Opinions
1. [Expert] argued [position] — [rationale]
```

### Step 6: FEASIBILITY -> DELIVER

Top recommendations and content strategy proposals go to [Feasibility Panel](feasibility-research.md) for implementation viability assessment.

---

## Example Invocations

### Content Pre-Publication Review
```
Run an SEO & Content Marketing Panel review — Mode A
(Content Pre-Publication) — on the draft blog post
"Getting Started with MCP Aggregators: A Developer's Guide."

Target keyword: "MCP aggregator tutorial"
Content type: 2,500-word technical guide targeting developers
in the awareness stage. Conversion goal: GitHub star or
newsletter signup.

Key concerns:
- Does the content match the search intent for the target keyword?
- Is the brand voice consistent with our other developer content?
- Are CTAs appropriate for a technical tutorial audience?

Andre, Michelle, Jasper, Dr. Lin active. Include feasibility gate.
```

### Technical SEO Audit
```
Run an SEO & Content Marketing Panel review — Mode B
(Technical SEO Audit) — on the EVOKORE documentation site.

The site has 150 pages across docs, blog, and API reference
sections. It uses a static site generator with client-side
search. Core Web Vitals are passing on mobile but LCP is
borderline on some documentation pages.

Key concerns:
- Are all documentation pages being indexed?
- Is the internal linking structure supporting topical authority?
- Is client-side rendered content visible to Googlebot?

Michelle, Andre, Sarah active.
```

### Content Strategy & Calendar Review
```
Run an SEO & Content Marketing Panel review — Mode C
(Content Strategy & Calendar) — on Q3 content planning
for the EVOKORE developer blog.

Current cadence: 2 posts per month. Traffic is 80% organic
search. Top-performing content: technical tutorials and
integration guides. Underperforming: opinion and industry
analysis pieces.

Key question: Should we double down on tutorials (proven
channel) or diversify into video and newsletter formats
to reduce search dependency?

Full panel, all five experts. Include feasibility gate.
```
