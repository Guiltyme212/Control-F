# CONTROL F — TARGET CUSTOMERS

## Why this document exists

Control F is **not** a generic AI search tool.

It is a monitoring and verification product for people who need to track public pension fund documents, detect what changed, and verify it fast without manually checking dozens of ugly websites and PDFs.

If we do not know exactly who is desperate for this product, we will build a polished demo for nobody.

---

## The core product promise

Control F should make a user feel:

1. **I do not need to check those websites anymore**
2. **I can see what changed**
3. **I can verify it instantly**
4. **I am not being tricked by AI slop**

That means the product is not mainly about “extracting metrics.”

It is about:
- monitoring
- filtering noise
- surfacing real change
- proving where the answer came from

---

## Primary customer persona #1  
# Sarah Klein — Fund-of-Funds Analyst  
**Primary user. If Control F fails Sarah, the product fails.**

### Who she is
Sarah is a private-markets fund-of-funds analyst or research analyst.

She follows:
- public pension commitments
- private-markets performance disclosures
- manager terminations
- board agendas and approvals
- portfolio shifts by asset class and strategy

She works fast, has too many tabs open, and is usually doing this work alongside manager memos, IC prep, or market mapping.

### What she is actually trying to get done
Sarah is not trying to “search PDFs.”

She is trying to answer questions like:
- Did PSERS disclose anything new in private markets?
- Did Minnesota SBI update quarterly private-markets performance?
- Which pension approved a new infrastructure commitment this week?
- Did a pension terminate or reduce a manager?
- Did a specific asset class worsen or improve?

### What makes her desperate
Her current workflow is shit:
- dozens of pension websites
- meeting agendas buried in random pages
- giant PDFs with one useful table inside
- no reliable alerting
- manual note-taking
- lots of false positives
- high risk of missing something important

### What she fears
- missing a real update
- trusting a wrong answer
- getting an answer with no evidence
- wasting 20 minutes to find one number
- opening a result and realizing it came from the wrong document family

### What she needs to see in the product
Sarah wants:
- a very clear query input
- confidence that Control F is searching the right approved source universe
- a small number of relevant documents, not a giant PDF dump
- an answer block first
- exact evidence second
- extracted rows third
- obvious “complete / partial / weak” status
- visible report date, page, source family, and file name
- tracker alerts that tell her what changed, not just “new documents found”

### What she hates
- flashy AI copy
- generic “143 metrics extracted”
- black-box agent behavior
- hallucinated summaries
- board-meeting docs being treated like performance reports
- results that sound final when they are partial

### Her success metric
“Can I get a trustworthy answer in under 2 minutes without checking the source website myself?”

### Her quote
> “Don’t make me click around pension websites. Tell me what changed, show me the page, and don’t get it wrong.”

---

## Customer persona #2  
# Marcus Reed — Placement Agent / GP Business Development / IR Lead  
**Secondary customer. He does not care about extraction. He cares about signal.**

### Who he is
Marcus works in:
- placement
- investor relations
- private-markets business development
- market intelligence for a GP or advisory firm

He tracks public pension activity to understand:
- who is allocating to what
- where new approvals are happening
- which managers are being terminated
- which strategies are in favor
- which LPs may be active in upcoming fundraising cycles

### What he is actually trying to get done
Marcus wants to answer:
- Which pensions are approving infrastructure this quarter?
- Which LPs are reallocating from one manager or strategy to another?
- Where are there signs of new demand?
- Which public LPs are active in private credit or secondaries?
- Which board agendas mention new commitments or searches?

### What makes him desperate
He is usually doing this with:
- interns
- spreadsheets
- Google alerts
- manual site checks
- scattered PDF notes
- weak CRM notes

He does not want raw data.  
He wants **timely deal signal**.

### What he fears
- missing an LP move before competitors notice
- drowning in irrelevant alerts
- spending time on “new documents” that contain nothing useful
- a tool that looks fancy but still needs human hunting

### What he needs to see in the product
Marcus wants:
- trackers that feel like market radar
- alerts framed as business signal, not extraction output
- quick summaries like:
  - “New infrastructure commitment surfaced”
  - “Manager termination detected”
  - “Board agenda mentions new private-credit approval”
- evidence he can open fast
- easy save/share/export
- monitoring over one-off search

### What he hates
- raw extraction dumps
- over-technical analyst interfaces
- “all metrics” views as the default
- alerts that don’t explain why he should care

### His success metric
“Did this help me spot relevant public LP activity before I would have found it manually?”

### His quote
> “I don’t need every number. I need the right signal fast, with enough proof to act.”

---

## Customer persona #3  
# Rachel Wu — Research Lead / OCIO / Investment Consulting Team Lead  
**Economic buyer / team-scale user. She cares about process, trust, and repeatability.**

### Who she is
Rachel leads a small research or advisory team at:
- an investment consultant
- an OCIO
- a fund-of-funds platform
- a research desk tracking public pension behavior

She is less interested in single-query wow moments and more interested in whether Control F can become a repeatable workflow.

### What she is actually trying to get done
Rachel wants:
- reliable recurring monitoring
- repeatable research coverage
- fewer junior-hours wasted on manual website checks
- team-level trust in outputs
- documented evidence trails

### What makes her desperate
She deals with:
- juniors manually checking dozens of sites
- inconsistent note quality
- missed updates
- duplicated work across the team
- no clean handoff from discovery to review

### What she fears
- adopting a tool that generates false confidence
- paying for noise
- the team becoming dependent on a flaky AI layer
- not knowing what was reviewed and what was not

### What she needs to see in the product
Rachel wants:
- trackers as first-class objects
- clear source coverage
- clear completeness states
- clear “what changed since last scan”
- history over time
- evidence-rich export
- review workflows
- visibility into weak / partial / complete answers

### What she hates
- demo dashboards with fake confidence
- vague AI language
- inconsistent provenance
- pretty UI with no operational trust

### Her success metric
“Can my team trust this enough to stop manually checking the same sites every week?”

### Her quote
> “If the system can’t tell me what changed, what was reviewed, and how sure it is, then it’s not replacing a real workflow.”

---

## Shared truths across all 3 personas

All 3 people want the same things:

### 1. They do not want a chatbot
They want a **monitoring and verification product**.

### 2. They do not care that extraction happened
They care whether the answer:
- fits the query
- came from the right document family
- is complete enough to use
- has evidence

### 3. They need trust more than magic
Trust is built by:
- right source family
- right file
- right page
- right quote/snippet
- clear completeness state

### 4. They care about “what changed”
The product becomes much more valuable when it is framed around:
- new approvals
- new performance disclosures
- new terminations
- new manager mentions
- new strategy exposures
- new board items

### 5. They need calm, serious design
The product should feel:
- premium
- calm
- controlled
- evidence-first
- analyst-grade

Not:
- flashy
- neon
- AI-for-the-sake-of-AI
- decorative

---

## Who is NOT the target customer

This matters because bad targeting will ruin the product.

Control F is **not** for:
- casual retail investors
- general news readers
- people who want open-web search
- users who only want a PDF extractor
- people who enjoy exploring raw docs manually
- broad “AI workspace” users

If we design for everyone, we lose Sarah.

---

## Product implications forced by these personas

These personas force the following product rules:

### 1. Approved-source universe only
The product should feel grounded and intentional.

### 2. Trackers are not a side feature
Trackers are the actual product moat.

### 3. Results must be answer-first
The order should be:
1. answer summary
2. evidence
3. extracted rows

### 4. Completeness must be explicit
Every result should clearly be:
- complete
- partial
- partial from subset
- weak match

### 5. Provenance must always be visible
Every important result needs:
- source family
- file name
- report date
- page number
- evidence text

### 6. Alerts must be meaningful
Not:
- “3 new documents found”

Instead:
- “New Minnesota SBI performance report detected”
- “PSERS board agenda includes new private-credit approval”
- “Manager termination surfaced in latest board materials”

---

## The product positioning in one sentence

Control F is a high-trust monitoring and verification product for analysts who track public pension fund documents and need to know what changed without manually checking websites.

---

## Final product test

Before shipping any screen, ask:

**Would Sarah trust this enough to stop checking the website herself?**

If the answer is no, the screen is not done.