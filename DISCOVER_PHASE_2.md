## Discovery Phase 2 — Clinical/Regulatory Ingestion; Scoring Refinement; Event-Driven Refresh

### Objective

- Integrate clinical trials and regulatory data, refine scoring to incorporate catalyst timing/impact, and introduce event-driven refresh on new filings/news.

### Outcomes

- Up-to-date clinical/regulatory context for each candidate.
- More accurate ranking via catalyst-aware scoring.
- Faster refresh on material events (filings/news) via webhooks/queues.

---

## Implementation Steps

### 1) Clinical Trials Ingestion

- Extend `ingestion-service.js`:
  - Source: ClinicalTrials.gov API.
  - Data: study phase, condition, intervention, enrollment, status, primary completion date, sponsors.
  - Map studies to tickers (company name → ticker mapping dictionary with manual overrides).
  - Persist raw study docs + structured fields; link to evidence by URL/NCT ID.

### 2) FDA/Regulatory Ingestion

- Extend `ingestion-service.js`:
  - Sources: FDA APIs (Drugs@FDA), public calendars for PDUFA/AdComs; BioPharmCatalyst if licensed.
  - Data: designations (Orphan/Fast Track/Breakthrough), AdCom dates, PDUFA windows, approvals/CRLs.
  - Persist raw + structured; tie to tickers and specific programs/indications.

### 3) Scoring Refinement

- Implement `src/services/discovery/ranker.js` updates:
  - Add catalyst timing/impact features: proximity to PDUFA/AdCom/primary readouts, study phases, designation bonuses.
  - Combine with fundamentals/momentum/liquidity; weights configurable.
  - Output reason codes: e.g., `CATALYST_PDUFA_30D`, `FAST_TRACK`, `PHASE_3_READOUT_Q4`.

### 4) Event-Driven Refresh

- Introduce message queue/webhook ingestion:
  - Use provider webhooks (where available) or poller that diff-detects new filings/news and enqueues work.
  - Add SQS (or SNS) to trigger re-ingestion → RAG update → re-score affected tickers.
  - Debounce duplicate events; apply rate limits.

### 5) Research Prompt Updates

- Include clinical/FDA evidence snippets with citations and recency checks.
- Require explicit linkage from claim → citation (URL/NCT/AdCom page).

### 6) Scheduling & Infra

- Add scheduled job for clinical/FDA refresh (e.g., 6–12h).
- Add SQS-based event consumer for filings/news triggers.

---

## APIs and Providers (v2 suggestions)

- Clinical: ClinicalTrials.gov API.
- Regulatory: FDA APIs (Drugs@FDA), BioPharmCatalyst (commercial), company PR/IR.
- Messaging: AWS SQS/SNS for event-driven refresh.

---

## Acceptance Criteria (Phase 2)

- Clinical/FDA ingestion operating with ≤ 12h freshness; evidence persisted with URLs/IDs.
- Scoring includes catalyst timing/impact with transparent reason codes.
- Event-driven refresh updates affected tickers within minutes of new filings/news.
