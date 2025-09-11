## Discovery Phase 3 — Full RAG Index; Advanced Guardrails; Cost Controls; Remove Static Base Tickers

### Objective

- Build a robust retrieval-augmented generation (RAG) index over all ingested documents, enforce advanced guardrails, add cost controls, and retire static base tickers.

### Outcomes

- High-recall, citation-rich evidence retrieval per ticker/query.
- Strong safety/validity guardrails on research outputs.
- Predictable costs with caching, batching, and rate-limit strategies.
- Dynamic universe without static seed tickers.

---

## Implementation Steps

### 1) RAG Index

- Implement `src/services/discovery/rag-service.js`:
  - Chunking: semantic chunk size (e.g., 512–1024 tokens), overlap, doc-type specific rules (filings vs PRs vs trials).
  - Embeddings: provider of choice (OpenAI text-embedding-3-large or comparable).
  - Storage: vector DB (e.g., PostgreSQL + pgvector, or managed vector store).
  - Retrieval: hybrid (BM25 + vectors) if available; filter by ticker, date range, source types.

### 2) Advanced Guardrails

- Prompt contracts: enforce JSON schema; require per-claim citations with URLs.
- Evidence recency gates by document type; block outdated claims.
- Symbol/corp-action validation pre-decision; liquidity/price thresholds.
- Fallback policies: if evidence insufficient → return MONITOR/RESEARCH, not BUY/SELL.

### 3) Cost Controls

- Batch embedding and retrieval by ticker.
- Cache evidence bundles; TTL-based reuse between close-in-time runs.
- Adaptive throttling on LLM calls; early-stop when enough high-quality evidence is retrieved.
- Downsample low-priority tickers when budgets are tight.

### 4) Remove Static Base Tickers

- Stop seeding tickers in `market-data-service.js` once universe build is live and stable.
- Keep a small, rotating benchmark set (SPY/IWM/XBI) only.

### 5) Observability

- Metrics: tokens, embeddings calls, evidence count per ticker, rejection rate (schema/citations), cost per run.
- Alerts on cost spikes, retrieval failures, coverage drops.

---

## Providers/Infra (v3 suggestions)

- Embeddings: OpenAI `text-embedding-3-large` (or cost-optimized alternative).
- Vector store: pgvector on PostgreSQL or a managed vector DB.
- Search: supplement with BM25 for hybrid retrieval if using PG.

---

## Acceptance Criteria (Phase 3)

- RAG returns top-k evidence per ticker with URLs and timestamps.
- Research outputs meet guardrails (citations present, recency valid, schema valid) with <5% rejection rate.
- Static base tickers removed; universe is fully dynamic.
- Run costs tracked with thresholds and alerts; no uncontrolled spikes.
