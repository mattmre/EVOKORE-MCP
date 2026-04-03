---
name: panel-news-media-content
description: Expert panel for editorial quality, factual accuracy, SEO performance, headline optimization, reader engagement, and media ethics for news and media workflows
aliases: [news-panel, media-panel, editorial-panel, journalism-panel, news-review]
category: orchestration
tags: [news, media, editorial, journalism, seo, fact-checking, content, engagement, ethics]
version: 1.0.0
requires: [panel-of-experts]
resolutionHints:
  - news article review
  - editorial quality review
  - fact-checking
  - headline optimization
  - news SEO review
  - media ethics review
  - content publication review for news site
---

# News & Media Content Panel

## Panel Composition

| Expert | Role | Primary Lens |
|---|---|---|
| **Catherine Whitmore** | Senior Editor & Journalistic Standards | Editorial quality, sourcing, fairness, publication standards |
| **Marco DeLuca** | Fact-Checker & Verification Specialist | Factual accuracy, OSINT verification, claim sourcing |
| **Priya Sharma (Media)** | SEO & Digital Distribution Strategist | Search visibility, Google News optimization, E-E-A-T signals |
| **James Ogunyemi** | Audience Engagement & Analytics | Reader engagement, subscriber loyalty, content value metrics |
| **Lisa Fernandez** | Media Ethics & Sensitivity Reviewer | Ethical compliance, harm minimization, source protection |

See [expert-roster.md](../expert-roster.md) for full persona definitions.

## When to Invoke

- News article or story review before publication
- Editorial calendar planning and strategy review
- Fact-checking workflow design or audit
- Headline optimization and A/B testing strategy
- SEO audit of news content or site structure
- Media ethics review for sensitive topics
- Post-publication performance review and content strategy adjustment
- New publication format launch (newsletter, podcast, video)

## Review Modes

### Mode A: Pre-Publication Article Review
Full editorial, factual, SEO, and ethics review of an article before publication.

### Mode B: SEO & Distribution Optimization
Evaluate content for search visibility, social distribution readiness, and audience reach.

### Mode C: Editorial Calendar & Strategy Review
Assess content strategy, topic coverage, editorial direction, and audience development.

---

## Review Protocol

### Step 1: CONVENE — Select Mode and Experts

| Mode | Active Experts |
|---|---|
| Pre-Publication Article | Catherine, Marco, Lisa |
| SEO & Distribution | Priya, James, Catherine |
| Editorial Calendar & Strategy | All 5 |

### Step 2: BRIEF — Present the Artifact

**For Pre-Publication Article (Mode A):**
```
## Article Under Review
- **Headline:** [working headline]
- **Byline:** [author(s)]
- **Section:** [news, opinion, analysis, feature, investigation]
- **Word Count:** [length]
- **Sources Cited:** [number and type — named, anonymous, documents, data]
- **Sensitive Topics:** [any topics requiring ethical review — violence, minors, suicide, marginalized communities]
- **Publication Timeline:** [when this needs to go live]
- **Competitive Context:** [have other outlets published on this topic?]
```

**For SEO & Distribution (Mode B):**
```
## Content for Distribution Optimization
- **Content Type:** [article, series, landing page, evergreen reference]
- **Target Keywords:** [primary and secondary search terms]
- **Current Rankings:** [existing positions if updating content]
- **Distribution Channels:** [organic search, social, newsletter, syndication]
- **Competitor Content:** [competing articles ranking for target terms]
- **Technical SEO Status:** [structured data, canonical tags, mobile performance]
- **Social Previews:** [Open Graph tags, Twitter cards — current state]
```

**For Editorial Calendar & Strategy (Mode C):**
```
## Editorial Strategy Under Review
- **Publication:** [name and type — daily news, weekly magazine, niche vertical]
- **Audience Profile:** [demographics, interests, reading habits]
- **Content Mix:** [percentage news vs analysis vs opinion vs features]
- **Publication Cadence:** [articles per day/week]
- **Traffic Sources:** [percentage from search, social, direct, referral]
- **Subscriber Metrics:** [subscriber count, growth rate, churn rate]
- **Competitive Position:** [key competitors and differentiation]
- **Strategic Goals:** [growth targets, audience development, revenue]
```

### Step 3: SOLO — Independent Expert Reviews

**Catherine Whitmore (Senior Editor & Journalistic Standards) reviews:**
- Sourcing rigor — is every factual claim attributed to a named source, document, or dataset? Are anonymous sources justified and their information corroborated?
- Fairness and balance — has the subject of critical reporting been contacted for comment? Is the framing balanced, or is the piece editorializing in the lede?
- Writing quality — is the prose clear, concise, and free of jargon? Does the structure serve the story (inverted pyramid, narrative, chronological)?
- Headline accuracy — does the headline accurately represent the story content? Does it make claims the body doesn't support?
- Legal review flags — are there statements that could be defamatory? Are allegations properly attributed rather than stated as fact?
- Publication standard — does this piece meet the publication's editorial standards? Would the editor-in-chief be comfortable defending this story publicly?
- Correction exposure — if any fact in this piece turns out to be wrong, how significant is the correction? Is the piece structured to minimize correction risk?
- "What's your second source for this claim? Have you contacted the subject for comment? Is this framing balanced, or are we editorializing in the lede?"

**Marco DeLuca (Fact-Checker & Verification Specialist) reviews:**
- Claim verification — has every factual claim been verified against primary sources? Are statistics from authoritative datasets, and are they current?
- Statistical context — are numbers presented with appropriate context? Are percentages shown alongside absolute numbers? Are comparisons apples-to-apples?
- Quote accuracy — are quotes verbatim? Is the context of the quote preserved, or does excerpting change the meaning?
- Image and media verification — have images been reverse-image-searched? Has metadata been checked for date, location, and authenticity? Are AI-generated images identified?
- Document verification — are cited documents authentic? Have they been independently obtained or only provided by an interested party?
- Timeline verification — is the chronology of events accurate? Are causal claims ("A led to B") supported by evidence of causation, not just correlation?
- Prior reporting check — have other outlets reported on the same topic? Do their facts contradict or corroborate this piece? Are we inadvertently repeating debunked claims?
- "What's the primary source for this statistic? Is this quote in context, or does the full quote change the meaning?"

**Priya Sharma (Media) (SEO & Digital Distribution Strategist) reviews:**
- Keyword targeting — does the content target search queries with meaningful volume? Is the primary keyword in the headline, URL, and first paragraph?
- Google News optimization — does the article meet Google News content policies? Is structured data (NewsArticle schema) implemented correctly?
- E-E-A-T signals — does the content demonstrate Experience, Expertise, Authoritativeness, and Trustworthiness? Is the author bio present and credible for this topic?
- Headline optimization — is the headline optimized for search click-through without being clickbait? Does it include the primary keyword naturally?
- Internal linking — does the article link to related coverage on the same site? Is there a topic hub or tag page that aggregates related content?
- Technical SEO — are canonical URLs correct? Is the page mobile-friendly and meeting Core Web Vitals thresholds? Is the publication date in structured data?
- Evergreen potential — is this content purely ephemeral news, or does it have evergreen search value? If evergreen, is the URL structure appropriate for long-term ranking?
- "What search queries should this content rank for? Is the headline optimized for click-through without being clickbait?"

**James Ogunyemi (Audience Engagement & Analytics) reviews:**
- Engagement prediction — based on topic, format, and headline, what is the expected engagement level? Is this a high-traffic viral piece or a low-traffic high-value piece?
- Subscriber value — does this content build subscriber loyalty, or does it only generate one-time pageviews? Is it the kind of content that converts casual readers to subscribers?
- Content format fit — is this the right format for the story (text, interactive, video, newsletter, podcast)? Would a different format reach the audience more effectively?
- Social shareability — is this content structured for social sharing? Are there pull quotes, data visualizations, or key takeaways that can be excerpted for social posts?
- Reader retention — does the content structure hold attention through the full piece, or do readers drop off? Is the most important information front-loaded?
- Audience alignment — is this content relevant to the publication's core audience, or is it chasing a different audience segment? Does it serve existing readers or only attract new ones?
- Coverage gap analysis — is this topic over-covered or under-covered relative to audience interest? Are we spending editorial resources on topics our audience doesn't care about?
- "Is this content building subscriber loyalty or just generating pageviews? Are we covering this because it matters or because it'll trend?"

**Lisa Fernandez (Media Ethics & Sensitivity Reviewer) reviews:**
- Harm assessment — does publishing this content cause unnecessary harm to individuals, communities, or vulnerable populations? Is the public interest served enough to justify potential harm?
- Source protection — are confidential sources adequately protected? Could the content inadvertently reveal a source's identity through contextual clues?
- Sensitive topic handling — does coverage of sensitive topics (suicide, violence, sexual assault, mental health) follow established reporting guidelines (e.g., WHO media guidelines for suicide)?
- Representation — does the content perpetuate stereotypes or harmful narratives about marginalized communities? Is the framing respectful and contextualized?
- Privacy balance — is the level of personal detail appropriate for the public interest? Are private citizens treated differently from public figures?
- Graphic content — if graphic images or descriptions are included, are they editorially necessary? Are content warnings provided?
- Consent and agency — do subjects of the story have agency in how they are portrayed? Have vulnerable subjects (minors, victims, people in crisis) been given appropriate consideration?
- "Does publishing this serve the public interest enough to justify potential harm? Are we following established guidelines on reporting about [sensitive topic]?"

### Step 4: CHALLENGE — Cross-Expert Debate

Key tensions for this panel:

1. **Catherine vs Priya:** "Editorial quality and journalistic integrity above all — we don't write for search engines" vs "If nobody finds it, editorial quality doesn't matter — SEO is how we reach readers"
2. **Marco vs James:** "This claim needs more verification — hold the story until sourcing is solid" vs "Our competitor already published — every hour we wait, we lose audience share and first-mover positioning"
3. **Priya vs Lisa:** "This headline is optimized for search volume and click-through rate" vs "That headline sensationalizes a sensitive topic — SEO optimization doesn't override ethical obligations"
4. **James vs Catherine:** "This content format would drive 10x the engagement" vs "That format compromises the depth and nuance the story requires"
5. **Lisa vs Marco:** "We should not publish this detail even if it's verified — it causes harm without serving the public interest" vs "Verified facts should be published — suppressing accurate information is a different kind of harm"

### Step 5: CONVERGE — Synthesize Findings

```markdown
## News & Media Content Panel Report

### Overall Assessment: [PUBLISH / PUBLISH WITH REVISIONS / HOLD FOR REWORK / KILL]

### Editorial Quality Findings
1. **[Finding]** — severity: [critical/high/medium/low], required action: [approach]

### Factual Accuracy Findings
1. **[Claim]** — verification status: [verified/unverified/disputed/incorrect], required action: [approach]

### SEO & Distribution Findings
1. **[Finding]** — impact: [high/medium/low], recommendation: [approach]

### Engagement Assessment
- Predicted engagement tier: [high/medium/low]
- Subscriber value: [high/medium/low]
- Recommended distribution channels: [list]

### Ethics & Sensitivity Findings
1. **[Finding]** — severity: [critical/high/medium/low], required action: [approach]

### Risk Register
| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| [Risk 1] | [H/M/L] | [H/M/L] | [approach] | [who] |

### Publication Recommendation
- Recommended publish time: [when]
- Required revisions before publication: [list]
- Post-publication monitoring: [what to watch for]

### Dissenting Opinions
1. [Expert] argued [position] — [rationale]
```

### Step 6: FEASIBILITY -> DELIVER

Top recommendations and content strategy proposals go to [Feasibility Panel](feasibility-research.md) for implementation viability assessment.

---

## Example Invocations

### Pre-Publication Article Review
```
Run a News & Media Content Panel review — Mode A
(Pre-Publication Article Review) — on the attached investigative
piece about data privacy practices at a major tech company.

The piece cites 3 named sources and 2 anonymous sources.
It includes internal documents obtained by the newsroom.
The company has been contacted for comment but has not responded.

Key concerns:
- Is the sourcing sufficient for the claims made?
- Does the piece meet publication standards for investigative reporting?
- Are there ethical considerations around the anonymous sources?

Catherine, Marco, Lisa active. Include feasibility gate.
```

### SEO & Distribution Optimization
```
Run a News & Media Content Panel review — Mode B
(SEO & Distribution) — on our election coverage landing page
and the 12 articles published this week.

Traffic from search is 30% below forecast. Competitors are
ranking above us for key election-related queries.

Key concerns:
- Are headlines and structured data optimized for Google News?
- Is the topic hub structure supporting topical authority?
- Are social previews optimized for each distribution channel?

Priya, James, Catherine active.
```

### Editorial Calendar & Strategy Review
```
Run a News & Media Content Panel review — Mode C
(Editorial Calendar & Strategy) — on Q3 editorial planning.

The publication is a B2B technology news site with 50K
monthly subscribers. Content mix is 60% news, 25% analysis,
15% opinion. Subscriber growth has stalled at 2% MoM.

Key question: Should we shift content mix toward more
analysis and fewer commodity news pieces to differentiate
from larger competitors? What topics are under-covered
relative to audience interest?

Full panel, all five experts. Include feasibility gate.
```
