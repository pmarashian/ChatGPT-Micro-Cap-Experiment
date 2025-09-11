## Discovery Phase 4 — Performance Feedback Loops; Adjust Scoring and Conviction Over Time

### Objective

- Close the loop by feeding realized outcomes and catalyst results back into discovery scoring, research weighting, and portfolio conviction.

### Outcomes

- Data-driven adjustment of scores/weights based on realized performance and hit/miss of catalysts.
- Improved precision of recommendations and conviction calibration.

---

## Implementation Steps

### 1) Performance Data Collection

- Extend `ai-memory-service` to track per-ticker:
  - Entry/exit dates, invested/not invested, initial vs final value, realized P&L, holding period.
  - Outcome classification: success, failure, holding.
  - Catalyst outcomes: met/missed/delayed; time-to-event.

### 2) Attribution & Feature Store

- Build attribution features from historical research/decisions:
  - Which evidence types correlated with positive outcomes (e.g., designations, phase, cash runway)?
  - Time-based features (proximity to catalysts), momentum at entry, liquidity bands.
  - Store features for offline analysis and online scoring adjustments.

### 3) Scoring/Weight Adjustment

- Update `ranker` to support:
  - Decay-weighted performance feedback influencing feature weights.
  - Dynamic thresholds for BUY/MONITOR based on recent hit rates.
  - Penalize evidence types that correlate with poor outcomes (down-weight).

### 4) Conviction Calibration

- Map composite scores to conviction levels using calibrated bins.
- Adjust conviction upward/downward based on trailing success rates per sector/feature cluster.

### 5) Monitoring & SLOs

- KPIs: discovery precision/recall, hit rate on catalysts, avg performance, drawdown, turnover.
- Alert on degradation (e.g., hit rate drops below threshold).

### 6) Research Prompt Tuning

- Feed performance insights back into prompt instructions (e.g., emphasize evidence types with higher predictive value).
- Keep JSON schema stable; update guidance text only.

---

## Providers/Infra (v4 suggestions)

- Storage/analytics: existing DB + lightweight analytics jobs; optional warehouse.
- Optional modeling: simple online learning (e.g., logistic regression weights) or rule-based weight updates to start.

---

## Acceptance Criteria (Phase 4)

- Performance-linked features computed and persisted.
- Ranker weights update periodically based on realized outcomes.
- Conviction levels reflect calibrated mapping from scores and recent hit rates.
- Measurable, documented improvement in discovery precision or P&L stability.
