const Validators = require("./src/utils/validators");

const response = {
  version: "2.0",
  generatedAt: "2025-09-05T20:04:48.985Z",
  researchSummary:
    "The micro-cap biotech sector remains neutral-to-bullish, with innovation in oncology, rare diseases, and CNS disorders driving selective upside. Companies with near-term clinical catalysts, strong cash positions, and prudent burn rates are favored. Current portfolio holdings are well-aligned with these themes, but further diversification is needed to reach the target of 8-12 positions. Liquidity remains sufficient in most tickers, and risk/reward profiles are attractive for several names with upcoming catalysts.",
  decisions: [
    {
      action: "BUY",
      ticker: "BPTH",
      shares: 989,
      orderType: "limit",
      limitPrice: 0.12,
      timeInForce: "day",
      stopLoss: 0.09,
      research:
        "Bio-Path Holdings (BPTH) trades near cash value, offering asymmetric upside if pipeline assets progress. The company is high risk but has a low valuation and potential for clinical catalysts in the next 12-18 months. Liquidity is sufficient for position sizing.",
      confidence: 0.75,
      rationale:
        "BPTH fits the criteria for undervalued micro-cap with near-term catalysts and manageable risk. Position size is at the portfolio max (12%) to optimize risk/reward.",
    },
    {
      action: "HOLD",
      ticker: "INMB",
      shares: 60,
      orderType: "market",
      limitPrice: 0,
      timeInForce: "day",
      stopLoss: 1.52,
      research:
        "INmune Bio (INMB) provides exposure to neurodegeneration and immunology, with a differentiated pipeline and upcoming clinical milestones. Cash position is adequate for near-term operations.",
      confidence: 0.8,
      rationale:
        "Maintain position as INMB offers diversification and potential upside from clinical readouts. Set stop-loss at 22% below entry to manage downside.",
    },
    {
      action: "HOLD",
      ticker: "MBRX",
      shares: 315,
      orderType: "market",
      limitPrice: 0,
      timeInForce: "day",
      stopLoss: 0.3,
      research:
        "Moleculin Biotech (MBRX) is a high-risk/high-reward play with multiple oncology assets. The company is undervalued but faces execution risk. Near-term catalysts could drive upside.",
      confidence: 0.7,
      rationale:
        "Hold position to capture potential upside from pipeline progress. Set stop-loss at 21% below entry to limit losses.",
    },
    {
      action: "HOLD",
      ticker: "PDSB",
      shares: 92,
      orderType: "market",
      limitPrice: 0,
      timeInForce: "day",
      stopLoss: 0.95,
      research:
        "PDS Biotechnology (PDSB) offers diversified pipeline exposure, including immuno-oncology and infectious disease. Upcoming clinical data could be a catalyst.",
      confidence: 0.75,
      rationale:
        "Maintain position for pipeline diversification and potential near-term catalysts. Set stop-loss at 21% below entry.",
    },
    {
      action: "RESEARCH",
      ticker: "CDTX",
      shares: 0,
      orderType: "market",
      limitPrice: 0,
      timeInForce: "day",
      stopLoss: 0,
      research:
        "Cidara Therapeutics (CDTX) has a high share price for a micro-cap and may offer differentiated anti-infective assets. Further research needed on pipeline, cash runway, and upcoming catalysts.",
      confidence: 0.6,
      rationale:
        "Potential candidate for portfolio diversification, but requires updated analysis on valuation and clinical progress.",
    },
    {
      action: "RESEARCH",
      ticker: "SNGX",
      shares: 0,
      orderType: "market",
      limitPrice: 0,
      timeInForce: "day",
      stopLoss: 0,
      research:
        "Soligenix (SNGX) is a micro-cap with pipeline assets in rare diseases and biodefense. Need to assess cash position, burn rate, and near-term catalysts.",
      confidence: 0.55,
      rationale:
        "May provide additional diversification; further diligence required before allocation.",
    },
  ],
  newDiscoveries: [],
  portfolioStrategy:
    "Continue building toward 8-12 diversified micro-cap biotech positions, each sized at 3-12% of portfolio value. Prioritize companies with near-term clinical catalysts, strong cash positions, and differentiated pipelines. Use available cash to add BPTH at max allocation. Hold current positions with stop-losses to manage risk. Research CDTX and SNGX for potential addition to increase diversification.",
  riskAssessment:
    "Portfolio is concentrated in a few names, increasing idiosyncratic risk. Stop-losses are set at 20-22% below entry to limit downside. Further diversification is needed to reduce risk. Monitor liquidity and execution risk, especially in thinly traded names. Macro risks (funding, regulatory) remain but are mitigated by focusing on companies with strong cash positions and near-term catalysts.",
  nextResearchFocus:
    "Deep dive on CDTX and SNGX for pipeline strength, cash runway, and upcoming catalysts. Screen for additional micro-cap biotechs with $50M-$500M market cap, strong balance sheets, and clinical events in the next 12-24 months to further diversify the portfolio.",
};

const validators = new Validators();

try {
  validators.validateAiDecisionResponse(response);
  console.log("✅ Validation passed!");
} catch (error) {
  console.log("❌ Validation failed:", error.message);
}
