## Discovery Phase 1 — Universe + Fundamentals/News Ingestion; Evidence-Grounded Research

### Objective

- Establish a reliable daily universe and ingest fundamentals/news; enforce citations in research outputs; persist evidence for future runs.

### Outcomes

- Daily canonical micro-cap biotech universe.
- Structured fundamentals and recent news for each candidate.
- Research prompts grounded by retrieved evidence with mandatory citations.
- Evidence and research outputs persisted with provenance.

## Decisions Summary (v1)

- **Providers**: FMP for universe, fundamentals, and news (v1 only); Yahoo Finance for symbol validation and ADV approximation; Yahoo/Stooq remain for market prices.
- **Rate limit & batching**: Target ≤ 250 RPM (FMP cap 300 RPM). Batch size 25, concurrency 4, exponential backoff 1s→2s→4s→8s with jitter, max 3 retries; skip failed batches and continue.
- **Universe filters**: Sector keywords ["biotechnology", "biotech", "biopharma", "pharmaceuticals", "drug manufacturers", "drug manufacturers—specialty & generic"]; market cap $50M–$500M; price ≥ $1.00; ADV ≥ $200k (Yahoo 20d avg vol × latest close; if unavailable, skip ADV filter); exchanges = NASDAQ/NYSE/NYSE American; exclude OTC/ADR; dedupe/validate via Yahoo; universe snapshot TTL 14d.
- **Scheduling (UTC)**: Universe 03:00; Ingestion (fundamentals + news) 00:00, 06:00, 12:00, 18:00; Research 01:00 and 13:00 (runs after ingestion for freshness).
- **Evidence & citations**: Persist fundamentals/news with provenance; store structured fields plus trimmed `raw` to stay well under 400KB; evidence TTL 30d; evidence bundle = latest fundamentals (≤7d) + ≤5 news (≤24h); research requires per-company citations; retry once on citation/schema failure; drop ticker if still invalid.
- **DynamoDB & keys**: Use composite keys `PK`/`SK` and `TickerIndex` (`GSI1PK`/`GSI1SK`) for all reads/writes; remove legacy `id` queries; enable table TTL on attribute `ttl` via CloudFormation.
- **Diagnostics endpoints**: `GET /api/universe-latest`, `GET /api/evidence?ticker=ABEO&limit=10`.
- **Environment**: Require `FMP_API_KEY`; optional tunables `UNIVERSE_*`, `NEWS_MAX_ITEMS_PER_TICKER`, `DISCOVERY_MAX_CONCURRENCY`.

---

## Implementation Steps

### 1) Universe Build (Daily)

- Implement `src/services/discovery/universe-service.js`:
  - Sources: FMP Screener ONLY (v1); Yahoo Finance used for validation and ADV approximation. Optional redundancy (Polygon/IEX/Nasdaq) deferred to later phases.
  - Filters: sector/industry (biotech/pharma), market cap ($50M–$500M configurable), min price, min ADV (if available), primary exchange.
  - Normalize tickers; validate via reference endpoint; dedupe.
  - Persist: `universe.candidates` (extend `ai-memory-service` or dedicated table).

### 2) Fundamentals Ingestion

- Implement `src/services/discovery/ingestion-service.js` fundamentals module:
  - Sources: Financial Modeling Prep (FMP) ONLY (v1).
  - Data: market cap, shares outstanding, float (if available), cash, total debt, OCF/CapEx, revenue, EPS (if available).
  - Transform: compute cash runway (configurable approximation), valuation flags.
  - Persist raw JSON + structured fields with `source`, `asOfDate`.

### 3) News Ingestion

- Ingestion module for company and sector-level news:
  - Sources: FMP News ONLY (v1). (Sector-level news deferred.)
  - Data: headline, summary, publishedAt, url, source, tickers.
  - Persist raw + extracted key facts (sentiment optional in v1) with timestamps.

### 4) Evidence Assembly for Research

- New `src/services/discovery/evidence-service.js`:
  - For each ticker, fetch most recent fundamentals and the last N news items (e.g., 5 within 24–72h).
  - Build an evidence bundle (snippets + URLs), mark recency and source.
  - Return to research step for prompt grounding.

### 5) Research Prompt with Citation Enforcement

- Update `src/config/prompts.js` research template to:
  - Require citations (URLs) for material claims per ticker.
  - Include evidence snippets (quote-sized) and metadata (publishedAt/source).
  - Keep strict JSON schema with fields for `citations` per claim/company.

### 6) AI Service Integration

- Extend `src/services/ai-service.js` with a method:
  - `getGroundedResearch({ portfolio, marketData, aiContext, evidenceBundle })` that calls `callOpenAI` with research system prompt and enforces `response_format: json_object`.
  - Validate JSON schema post-response; if citations missing, re-prompt or discard.

### 7) Persistence

- Extend `src/services/ai-memory-service.js` saves:
  - Research JSON including `citations`.
  - Evidence items with provenance (source, url, publishedAt) keyed by ticker and date.

### 8) Scheduling

- Add serverless schedules:
  - Nightly universe build.
  - Fundamentals + news ingestion every 6h (00:00, 06:00, 12:00, 18:00 UTC).
  - Research at 01:00 and 13:00 UTC (immediately after ingestion) and supplied with evidence bundles.

---

## Providers (v1 FINAL)

- Universe/Reference: Financial Modeling Prep (FMP) Screener ONLY (v1).
- Fundamentals: Financial Modeling Prep (FMP) ONLY (v1).
- News: Financial Modeling Prep (FMP) News ONLY (v1). No fallback.
- Validation: Yahoo Finance (no API key) used to validate ticker existence and to approximate ADV.
- Market Data: Yahoo Finance (existing), Stooq fallback for market prices only.

---

## Acceptance Criteria (Phase 1)

- Universe refresh ≤ 24h; valid symbols only; deduped.
- Fundamentals ≤ 7d; news ≤ 24h for each covered ticker.
- Research JSON contains citations for all material claims; invalid outputs rejected.
- Evidence (snippets + URLs) persisted with timestamps and sources.

---

## Decisions (Budget v1) — Finalized

### Providers and Environment

- **Universe/Reference**: Financial Modeling Prep (FMP) Screener (budget)
  - Env: `FMP_API_KEY`
- **Fundamentals**: FMP (budget)
  - Fields: marketCap, sharesOutstanding, cashAndCashEquivalents, totalDebt, operatingCashFlow, capitalExpenditure, revenue, eps (when available)
- **News**: FMP News (primary)
  - Env: `FMP_API_KEY` (already required)
  - Scope: company-level headlines via FMP news endpoints; optional NewsAPI fallback if enabled
- **Validation**: Yahoo Finance quote endpoints (no key) for symbol existence checks

### Universe Definition (Daily)

- **Sector/industry filters**: Include biotech/pharma; include keywords: "biotechnology", "biotech", "biopharma", "pharmaceuticals", "drug manufacturers", "drug manufacturers—specialty & generic" (configurable)
- **Market cap**: $50M–$500M (configurable)
- **Price floor**: ≥ $1.00
- **Liquidity**: Target ADV ≥ $200k notional; budget fallback: use 20-day average volume × latest close from Yahoo to approximate ADV; if unavailable, skip ADV filter
- **Exchanges**: Include NASDAQ, NYSE, NYSE American; exclude OTC/ADR
- **Dedup/normalize**: Uppercase tickers; validate via Yahoo; drop invalid/stale
- **Persistence**: `PK = "universe#candidates"`, `SK = YYYY-MM-DD`, item contains `tickers[]`, `filters`, `source: "FMP"`, `generatedAt`
  - TTL: 14 days

### Fundamentals Ingestion (Every 6h)

- **Source**: FMP
- **Fields**: `marketCap`, `sharesOutstanding`, `float` (if available), `cashAndCashEquivalents`, `totalDebt`, `operatingCashFlow`, `capitalExpenditure`, `revenue`, `eps`
- **Transforms**:
  - Cash runway (months): `runwayMonths = cash / max(1, monthlyBurn)`
    - `monthlyBurn = max(0, (-(operatingCashFlow) - capitalExpenditure) / 12)`
    - Fallbacks: if OCF/CapEx missing, estimate monthlyBurn as `(revenue * 0.15) / 12`; if still missing, set `runwayMonths = null`
  - Valuation flags: `undervalued` if `marketCap < revenue` and `runwayMonths ≥ 12`
- **Recency**: accept fundamentals with `asOfDate ≤ 7d` else mark `stale: true` and exclude from evidence bundle
- **Persistence**: `PK = "evidence#<TICKER>"`, `SK = <ISO timestamp>`, with `type: "fundamentals"`, `source: "FMP"`, `asOfDate`, `raw`, `structured`
  - TTL: 30 days

### News Ingestion (Every 6h)

- **Source**: FMP News ONLY (v1)
- **Window**: last 24h; take up to `N` items per ticker per run (`N = NEWS_MAX_ITEMS_PER_TICKER`, default 5)
- **Fields**: `headline`, `description` (stored as `snippet`), `url`, `publishedAt`, `sourceName`, `tickers: [TICKER]`
- **Deduplication**: drop duplicates by (`url`, `publishedAt`); ignore re-ingestion of identical items across runs
- **Sector-level**: Not persisted in v1
- **Persistence**: `PK = "evidence#<TICKER>"`, `SK = <ISO timestamp>`, `GSI1PK = <TICKER>`, `GSI1SK = timestamp`, with `type: "news"`, `source: "FMP"`, `publishedAt`, `url`, `snippet`, `sourceName`, `recencyDays`, `stale`
  - TTL: 30 days

### Evidence Assembly for Research

- **Bundle per ticker**: latest valid fundamentals snapshot (≤ 7d) + last `N` news items (≤ 5 within 24h; configurable via `NEWS_MAX_ITEMS_PER_TICKER`)
- **Schema**:

```json
{
  "ticker": "ABEO",
  "fundamentals": {
    "asOfDate": "2025-09-01",
    "marketCap": 100000000,
    "sharesOutstanding": 30000000,
    "cash": 25000000,
    "totalDebt": 5000000,
    "operatingCashFlow": -12000000,
    "capitalExpenditure": 1000000,
    "runwayMonths": 18
  },
  "news": [
    {
      "headline": "Company announces positive Phase 2 data",
      "snippet": "The Phase 2 trial met primary endpoints...",
      "url": "https://example.com/article",
      "source": "FMP",
      "publishedAt": "2025-09-02T12:00:00Z"
    }
  ]
}
```

- **Recency enforcement**: exclude tickers from research if fundamentals are stale (> 7d) or there is no news in last 24h
  - Ticker-level gating only: the research run proceeds; excluded tickers are simply omitted for that run.

### Prompt and Citation Enforcement (FINAL)

- **Prompt updates**: research template must include evidence snippets and metadata; require citations (URLs) for each company evaluation.
- **Granularity (v1)**: per-company citations required (not per-claim).
- **Response schema (additions)**: `companyEvaluations[].citations: [{ url, source, publishedAt, snippet }]`.
- **Enforcement**: API calls use `response_format: json_object`; post-parse strict validation ensures citations array length ≥ 1 for each evaluated company.
- **Retry policy**: on missing/invalid citations or schema errors, retry once with a short backoff (≈1s ± jitter); if still invalid, DROP THAT TICKER and continue others; log the rejection.

### AI Service Method (Research)

- **Signature**: `getGroundedResearch({ portfolio, marketData, aiContext, evidenceBundle })` (v1 addition)
- **Model**: use configured `AI_MODEL` with `response_format: json_object`
- **Validation**: enforce schema defined above, including `companyEvaluations[].citations`; apply retry policy.

### DynamoDB Read/Write Alignment

- **Key model**: All new reads/writes use `PK`/`SK` and `GSI1PK`/`GSI1SK` (TickerIndex) as defined in `serverless.yml`.
- **Summary items**: for research/decisions summaries use `PK = "<type>#SUMMARY"`, `SK = <ISO timestamp>`, and set `GSI1PK = "SUMMARY"`, `GSI1SK = timestamp` to support descending recent queries via the GSI.
- **Legacy**: REMOVE all legacy `id`-based queries; update `getRecentResearch`, `getRecentDecisions`, and `getCachedMarketData` to use composite keys and/or the `SUMMARY` GSI pattern.

### Scheduling (UTC)

- **Universe build**: daily at 03:00 UTC
- **Ingestion (fundamentals + news)**: every 6 hours at 00:00, 06:00, 12:00, 18:00 UTC
- **Research**: 01:00 and 13:00 UTC (runs after ingestion to meet freshness SLAs)

### Rate Limits, Batching, and Backoff (FINAL)

- **Max tickers per ingestion run**: 150 (cap per run). Selection prioritizes oldest-stale tickers first to rotate through the full universe across runs; if staleness is equal, tie-break by ADV descending.
- **Batch size**: 25 tickers per API batch
- **Concurrency**: up to 4 concurrent batches (configurable)
- **Backoff on 429/5xx**: exponential backoff starting at 1s, doubling to max 8s with jitter; max 3 retries per batch; failed batches are skipped and logged; run continues.
- **Time windows**: ensure ingestion completes before research windows to meet freshness requirements.
  - Global rate limit guard: target ≤ 250 calls/minute effective to stay safely under provider 300 RPM cap.

### Environment Variables (Additions)

- Required: `FMP_API_KEY`
- Optional tuning:
  - `UNIVERSE_MIN_PRICE=1`
  - `UNIVERSE_MIN_MARKET_CAP=50000000`
  - `UNIVERSE_MAX_MARKET_CAP=500000000`
  - `UNIVERSE_MIN_ADV_USD=200000`
  - `UNIVERSE_MAX_TICKERS_PER_RUN=150`
  - `UNIVERSE_BATCH_SIZE=25`
  - `NEWS_MAX_ITEMS_PER_TICKER=5`
  - `DISCOVERY_MAX_CONCURRENCY=4`

### Acceptance Clarifications (v1)

- Ingestion freshness: fundamentals ≤ 7d; news ≤ 24h (per ticker)
- Research outputs must include per-company citations with URLs; outputs missing citations are retried once then rejected (ticker-level drop)

---

## Finalized Details (v1) — No Ambiguity

### DynamoDB Read/Write Alignment (Authoritative)

- All reads/writes will use composite keys: `PK`/`SK` with GSI `GSI1PK`/`GSI1SK` (TickerIndex).
- Remove all legacy `id`-based reads. Replace with:
  - Recent research summaries: `PK = "ai_research#SUMMARY"`, `SK` = ISO timestamp (descending query)
  - Recent decision summaries: `PK = "ai_decision#SUMMARY"`, `SK` = ISO timestamp
  - Cached market data: `PK = "market_data#SUMMARY"`, `SK` = ISO timestamp
  - Ticker-scoped items (research/decisions/marketData): `PK = "<type>#<TICKER>"`, `GSI1PK = <TICKER>`, `GSI1SK = timestamp`

### Evidence Persistence Schema

- Keying: `PK = "evidence#<TICKER>", SK = <ISO timestamp>, TTL = 30 days (attribute: "ttl")`, `GSI1PK = <TICKER>`, `GSI1SK = timestamp`
  - DynamoDB TTL must be enabled on the table with attribute name `ttl` via CloudFormation `TimeToLiveSpecification`.
- Common fields: `type (fundamentals|news)`, `source`, `asOfDate|publishedAt`, `raw` (provider JSON, trimmed when necessary to stay well under 400KB), `recencyDays`, `stale`
- Fundamentals `structured` fields: `marketCap`, `sharesOutstanding`, `float`, `cashAndCashEquivalents`, `totalDebt`, `operatingCashFlow`, `capitalExpenditure`, `revenue`, `eps`, `runwayMonths`, `monthlyBurn`, `valuationFlags`
  - Runway: `monthlyBurn = max(0, (-(operatingCashFlow) - capitalExpenditure) / 12)`; fallback `monthlyBurn = (revenue * 0.15) / 12`; if unavailable → `runwayMonths = null`
  - Valuation flags: include `undervalued` if `marketCap < revenue` and `runwayMonths ≥ 12`
- News fields: `headline`, `snippet` (description/excerpt), `url`, `sourceName`, `publishedAt`, `tickers: [TICKER]`

### Evidence Bundle to AI

- Per ticker: latest valid fundamentals (≤ 7d) + last `N ≤ 5` news items within 24h (configurable).
- If fundamentals are stale or no recent news exists → EXCLUDE ticker from research for that run.

### Citation Scope and Enforcement

- Per-company citations required in research output (not per-claim for v1).
- Schema addition: `companyEvaluations[].citations: [{ url, source, publishedAt, snippet }]`.
- Retry policy: on missing/invalid citations or schema errors → retry once; still invalid → discard ticker output and log.

### Environment Variables (Additions)

- Required: `FMP_API_KEY`
- Optional tuning:
  - `UNIVERSE_MIN_PRICE=1`
  - `UNIVERSE_MIN_MARKET_CAP=50000000`
  - `UNIVERSE_MAX_MARKET_CAP=500000000`
  - `UNIVERSE_MIN_ADV_USD=200000`
  - `UNIVERSE_MAX_TICKERS_PER_RUN=150`
  - `UNIVERSE_BATCH_SIZE=25`
  - `NEWS_MAX_ITEMS_PER_TICKER=5`
  - `DISCOVERY_MAX_CONCURRENCY=4`

### Scheduling (Confirmed UTC)

- Universe build: 03:00 UTC daily
- Ingestion (fundamentals + news): 00:00, 06:00, 12:00, 18:00 UTC
- Research: 01:00 and 13:00 UTC (shifted to run right after ingestion to meet freshness SLAs)

### Provider Plans and Rate Limits (Budget v1)

- FMP (Universe + Fundamentals + News): start with Starter plan; upgrade if rate/capacity needs rise.
  - Use batch size 25, concurrency up to 4, exponential backoff on 429/5xx (1s→2s→4s→8s with jitter, max 3 retries).
  - If quota is exhausted mid-run, skip remaining batches for that entity type, mark data as `stale: true` for affected tickers, and continue.
- Yahoo Finance (Validation/quotes/ADV approximation): no API key required.
  - FMP rate limit: 300 calls/minute. Enforce a global limiter targeting ≤ 250 calls/minute across concurrent batches to leave safety margin.

### Universe-Driven Coverage

- Filters: sector keywords, market cap [$50M, $500M], price floor $1.00, ADV ≥ $200k (Yahoo approximation), exchanges = NASDAQ/NYSE/NYSE American, exclude OTC/ADR.
- ADV approximation: use Yahoo 20-day average volume × latest close; if unavailable for a ticker, skip ADV filter for that ticker.
- After `universe-service` is live, remove all hardcoded example tickers from prompts and market-data fetching; use the canonical universe (+ holdings/benchmarks) only.
  - Universe size is not capped; ingestion processes up to 150 tickers per run based on freshness rotation until all eligible tickers are covered.

### Lightweight Diagnostics Endpoints (v1)

- `GET /api/universe-latest`: returns latest universe snapshot (`PK = "universe#candidates"` most recent `SK`).
- `GET /api/evidence?ticker=ABEO&limit=10`: returns latest evidence items (news+fundamentals) for a ticker from `TickerIndex`.
- `GET /api/discovery-quality`: returns discovered tickers with quality scores (existing).
- Purpose: operational visibility during rollout; not user-facing features.
