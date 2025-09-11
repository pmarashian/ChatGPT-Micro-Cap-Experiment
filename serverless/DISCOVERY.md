## Discovery and Research Pipeline

### Goal

- Build a fully automated, evidence-grounded discovery pipeline for micro-cap biotech that continuously identifies, validates, and ranks investment candidates to maximize risk-adjusted return — with zero human touch after initial API setup.

### Vision

- Replace model-capped, prompt-only “discovery” with a live, data-driven system that:
  - Continuously enumerates the investable universe (sector, market-cap, liquidity filters).
  - Ingests filings, clinical/regulatory data, company materials, and news via APIs.
  - Grounds LLM analysis in retrieved documents (citations required) rather than training data.
  - Scores and ranks tickers with transparent evidence and quality metrics.
  - Publishes discoveries and updates the portfolio/trading workflows automatically.

---

## End-to-End Automation (Zero-Touch)

### 1) Universe Build (daily)

- Inputs: Listing/screener APIs (e.g., Polygon/FMP/Intrinio/Nasdaq Data Link/IEX).
- Filters: sector/industry = biotech/pharma, market cap (e.g., $50M–$500M), liquidity, price floor, primary exchange.
- Output: Canonical list of candidate tickers for the day.

### 2) Data Ingestion (continuous + batch)

- Fundamentals & ownership: market cap, cash, burn, shares out, float, short interest.
- Filings: 10-K/10-Q/8-K via SEC EDGAR (or sec-api for convenience).
- Clinical & regulatory: ClinicalTrials.gov, FDA (AdComs, PDUFA, designations).
- Company materials: PR/IR pages, pipeline PDFs, investor decks (prefer APIs/feeds over scraping).
- News & sentiment: Finnhub/Benzinga/NewsAPI (licensed providers preferred).
- Price/volume: Yahoo Finance (current), Stooq fallback; optionally upgrade to Polygon/IEX for robustness.

### 3) Normalization & Storage

- Ticker normalization, dedupe, symbol validation.
- Parse/structure key fields (cash runway, phase, catalysts) via deterministic parsing + LLM extraction on raw docs.
- Persist raw + structured forms with provenance metadata (source, timestamp, URL).

### 4) Retrieval & Grounding (RAG)

- Chunk and embed documents; index by ticker and topic.
- Retrieve top-k evidence per ticker/query; prepare an evidence bundle with URLs/snippets.

### 5) Evidence-Grounded LLM Research (citations required)

- Prompt enforces: strict JSON schema, include citations (URLs) for each claim.
- Reject/redo on missing citations or invalid schema.
- Result: research JSON with sector view, company evaluations, catalysts/risks, recommendation, conviction, quality score drivers, and citations.

### 6) Validation & Guardrails

- Symbol verification, market-cap/price sanity bounds, liquidity checks.
- Deduplication, blacklist, evidence score thresholds.
- Schema validation with hard fails on missing mandatory fields.

### 7) Scoring & Ranking

- Composite scoring across: fundamentals (cash/runway), catalysts (timing/impact), clinical phase, competitive position, momentum/liquidity, and risk flags.
- Rank and shortlist candidates with reason codes and links to supporting evidence.

### 8) Publishing & Memory

- Persist discoveries including: ticker, name, marketCap, sector, catalysts, risks, valuation, recommendation, conviction, qualityScore, citations.
- Track performance and update conviction as catalysts hit.

### 9) Orchestration & Monitoring

- Serverless scheduled jobs for universe build, ingestion, research, ranking, and publishing.
- Event-driven refresh on new filings/news; retries with backoff; dead-letter queues; alerting.

---

## Integration With Existing System

### What stays the same

- `src/services/market-data-service.js`: Continue using Yahoo/Stooq (or upgraded market data) for price/volume; this remains the market-data layer.
- `src/services/ai-memory-service.js`: Continue as the persistence layer for research, decisions, and market data. Extend to store evidence/citations.

### What is added

- New discovery services (example structure; keep minimal, incremental changes):
  - `src/services/discovery/universe-service.js`: builds the daily micro-cap biotech universe via screening APIs.
  - `src/services/discovery/ingestion-service.js`: pulls fundamentals, filings, clinical/regulatory, news, and company materials.
  - `src/services/discovery/rag-service.js`: embeds, indexes, and retrieves evidence bundles per ticker.
  - `src/services/discovery/ranker.js`: computes composite scores and produces a ranked shortlist.

### What is updated

- `src/config/prompts.js`:

  - Add/modify research prompt to require citations (URLs) and reject uncited claims.
  - Keep response_format as strict JSON; include fields for `citations` per company and per finding.

- `src/services/ai-service.js`:

  - Add a research method that accepts an evidence bundle (RAG results) and produces grounded research JSON.
  - Maintain `callOpenAI` usage, but ensure prompts include retrieved snippets and citation requirements.

- `src/services/ai-memory-service.js`:

  - Extend saved discovery schema to include `citations` array and `evidenceSummary` fields while preserving current keys (backward compatible).
  - Keep quality scoring functions; enrich scoring using evidence quality (source types, recency).

- `src/handlers/scheduled/market-research.js`:

  - Replace the LLM-only discovery loop with: Universe → Ingestion → RAG → Evidence-grounded research → Rank → Save discoveries → Fetch market data for shortlisted tickers.
  - Keep saving market data and research summaries as today, but include evidence in memory.

- `src/handlers/api/trigger-market-research.js`:

  - Mirror the scheduled path for manual triggers (for observability/testing), returning ranked discoveries with citations.

- `serverless.yml`:
  - Add scheduled functions for universe build, ingestion, and ranking cycles.
  - Optionally add event-driven triggers on new filings/news (e.g., SQS/Kinesis).

### What this replaces

- The current “discovery loop” where the LLM invents `newDiscoveries` from training data alone.
- Static base ticker seeding in `market-data-service.js` (can remain as a fallback during rollout but should not drive discovery).
- Research prompts that lack document grounding and citations.

### Backward Compatibility & Rollout

- Phase 1: Universe + fundamentals/news ingestion; enforce citations in research; persist evidence.
- Phase 2: Add clinical/regulatory ingestion; refine scoring; introduce event-driven refresh.
- Phase 3: Full RAG index; advanced guardrails and cost controls; remove static base tickers.
- Phase 4: Performance feedback loops to adjust scoring and conviction over time.

---

## Operational Notes

- Prefer licensed APIs over scraping to avoid captchas and fragility.
- Handle rate limits with batching, caching, and backoff.
- Monitor costs and set budget guardrails.
- Log provenance for every discovery (sources, timestamps) for auditability.

---

## Full System Loop (Services, Calls, Data Flow)

### Schedules and Triggers

- Nightly: Universe Build
- Hourly (or more frequent): Ingestion (fundamentals, filings, clinical/regulatory, news)
- Every 12 hours: Market Research (existing)
- Hourly/Daily: Ranking & Publish
- Daily market open (and/or manual): Daily Trading

### 1) Universe Build (scheduled)

- Service: `src/services/discovery/universe-service.js` (new)
- Uses: Polygon/FMP/Intrinio/Nasdaq/IEX reference & screening APIs
- Does: Enumerates micro-cap biotech by sector/market-cap/liquidity; validates symbols
- Output: Canonical `universe.candidates` persisted (extend `ai-memory-service` or dedicated table)

### 2) Data Ingestion (scheduled + event-driven)

- Service: `src/services/discovery/ingestion-service.js` (new)
- Uses: SEC EDGAR (or sec-api), ClinicalTrials.gov, FDA APIs, company PR/IR feeds, Finnhub/Benzinga/NewsAPI, fundamentals provider, Yahoo/Polygon/IEX for price/volume
- Does: Fetches raw docs and structured data; normalizes tickers; extracts key fields
- Output: Raw documents with metadata + structured facts stored with provenance

### 3) Retrieval & Grounding (RAG)

- Service: `src/services/discovery/rag-service.js` (new)
- Uses: Embeddings store and vector index
- Does: Chunks/embeds docs; retrieves top-k evidence bundles per ticker/query
- Output: Evidence bundle (snippets + URLs) for research prompts

### 4) Evidence-Grounded Research (existing flow extended)

- Handler: `src/handlers/scheduled/market-research.js`
- Uses: `rag-service` (new), `ai-service`, `ai-memory-service`, `market-data-service`, `portfolio-service`
- Does: Builds prompt with portfolio snapshot + market data + historical context + retrieved evidence; calls LLM; enforces JSON schema with citations; parses and saves research; caches market data
- Output: Research JSON with company evaluations, discoveries, citations; market data cached

### 5) Scoring &how Ranking

- Service: `src/services/discovery/ranker.js` (new)
- Uses: Structured fundamentals, catalysts, momentum/liquidity, evidence quality
- Does: Computes composite scores; ranks shortlist with reason codes
- Output: Ranked discoveries persisted (extend `ai-memory-service`)

### 6) Publish & Memory Update

- Services: `ai-memory-service`, optional `publisher` (new) for summaries
- Does: Saves discoveries (ticker, metrics, citations), updates performance tracking fields
- Output: Discoveries and summaries available to downstream consumers

### 7) Daily Trading (integration point)

- Handlers: `src/handlers/scheduled/daily-trading.js`, `src/handlers/api/trigger-daily-trading.js`
- Uses: `portfolio-service.getCurrentPortfolio`, `market-data-service.getPortfolioMarketData`, `ai-service.getTradingDecision`, `ai-memory-service.buildAIContext`
- Does: Pulls current portfolio and fresh market data; builds trading prompt that includes research context (recent research, discoveries, quality/performance summary); obtains trading decisions; executes or simulates per config; saves decisions
- Output: Executed/simulated trades; decisions and rationales saved; performance fed back into memory

### Data Flow Summary

- Universe/ingestion → evidence bundles → grounded research with citations → ranked discoveries → research context consumed by daily trading → decisions/trades → performance fed back into memory for future context.

---

## Freshness & Guardrails (SLAs and Preconditions)

### Data Freshness SLAs

- Market data: ≤ 15 minutes old at decision time
- Fundamentals: latest filing ingested or ≤ 7 days
- News/PR: ≤ 24 hours
- Clinical/FDA: ≤ 7 days (plus event proximity checks for upcoming catalysts)
- Universe: rebuilt within ≤ 24 hours with symbol reconciliation

### Evidence Requirements

- Every material claim in research must include at least one citation URL
- Enforce evidence recency per data-type SLA
- Reject/redo LLM outputs that are missing citations or use stale evidence

### Time Alignment

- Use exchange calendar and timezone alignment (e.g., US/Eastern)
- Ensure “last trading day” calculations are correct for research/trading runs
- Handle pre/post-market explicitly where applicable

### Corporate Actions & Symbol Hygiene

- Validate active listing status; detect delistings and symbol changes
- Process splits/mergers; adjust historical data and holdings context
- Remove stale/invalid tickers from the universe automatically

### Liquidity & Tradability Guardrails

- Minimum price threshold (configurable, e.g., ≥ $1.00)
- Minimum average daily dollar volume (configurable)
- Trading halts/SSR checks where available
- Exclude OTC/ADR if policy requires

### API Reliability & Fallbacks

- Retries with exponential backoff and circuit breakers on repeated failures
- Use last-known-good cached datasets tagged “stale”; skip real trades when critical data is stale
- Alert on provider outages or sustained rate-limit denials

### RAG Index Hygiene

- Scheduled re-embedding and re-index cadence
- Document deduplication and versioning; retire superseded filings/PRs
- Validate embedding coverage; alert on sudden coverage drops

### Memory Window & Decay

- Parameterize historical context window (e.g., last 3 research, last 5 decisions)
- Apply decay weights to older research to avoid overfitting to outdated theses

### Pre-Trade Execution Checklist (Hard Preconditions)

- Freshness SLAs pass for market data, fundamentals, news, and clinical/FDA
- Research JSON schema valid; citations present and within recency windows
- Corporate actions/symbol validation OK
- Liquidity/price thresholds met; no halts/SSR violations per policy
- If any mandatory check fails → simulate or skip, emit alert, and record reason

### Monitoring & Alerting

- Error budgets and rate-limit threshold alerts
- Anomaly detection on data coverage (e.g., sharp drop in universe candidates or evidence results)
- End-to-end run health metrics with SLO reporting
