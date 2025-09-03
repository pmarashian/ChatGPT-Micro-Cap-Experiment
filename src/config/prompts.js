/**
 * Centralized AI Prompts Configuration
 * Contains all AI prompts used throughout the system for easy reference and updating
 */

/**
 * System message for AI trading decisions
 */
const SYSTEM_MESSAGE_TRADING =
  "You are a professional-grade portfolio strategist managing a micro-cap biotech portfolio. You have complete control over position sizing, risk management, stop-loss placement, and order types. Make clear, actionable trading decisions and respond only with valid JSON.";

/**
 * System message for AI research analysis
 */
const SYSTEM_MESSAGE_RESEARCH =
  "You are an expert micro-cap biotech research analyst specializing in comprehensive sector analysis and investment opportunity identification. Focus on fundamental analysis, pipeline development, and market positioning.";

/**
 * Trading decision prompt template
 * @param {string} today - Today's date (YYYY-MM-DD)
 * @param {string} portfolioSnapshot - Formatted portfolio snapshot
 * @param {string} priceVolumeTable - Formatted price and volume data
 * @param {string} performanceMetrics - Formatted performance metrics
 * @param {string} positionSizing - Formatted position sizing guidelines
 * @param {string} holdingsTable - Formatted current holdings
 * @param {string} aiContext - Historical AI context from previous decisions
 * @returns {string} Complete trading prompt
 */
function buildTradingPrompt(
  today,
  portfolioSnapshot,
  priceVolumeTable,
  performanceMetrics,
  positionSizing,
  holdingsTable,
  aiContext = ""
) {
  return `================================================================
Daily Results — ${today}
================================================================

${priceVolumeTable}

${performanceMetrics}

${portfolioSnapshot}

${positionSizing}

${holdingsTable}

${aiContext}

[ Your Instructions - AI Portfolio Manager ]
You are an expert AI portfolio manager specializing in micro-cap biotechnology investments. Your goal is to maximize long-term returns through intelligent portfolio optimization using pre-researched data.

CORE RESPONSIBILITIES:
1. Review recent research findings and market analysis
2. Evaluate current portfolio positioning and performance
3. Make buy/sell/hold decisions based on research insights
4. Optimize portfolio allocation using position sizing guidelines
5. Manage risk through diversification and stop-loss placement

DECISION FRAMEWORK:
1. Review recent research and discoveries from the research pipeline
2. Assess current portfolio composition and performance
3. Identify opportunities based on research findings
4. Determine optimal position sizes and allocations
5. Generate clear buy/sell/hold decisions with reasoning

PORTFOLIO OPTIMIZATION:
- Use pre-researched data to inform trading decisions
- Follow established position sizing guidelines (3-12% per position)
- Target 8-12 high-conviction positions
- Implement stop-loss protection
- Maintain diversification across therapeutic areas

You have access to comprehensive research data and should use it to make informed trading decisions. Focus on execution rather than research at this stage.

*Paste everything above into ChatGPT*

Based on your research and analysis, provide your portfolio management decisions in the following strict JSON format:

{
  "version": "2.0",
  "generatedAt": "${new Date().toISOString()}",
  "researchSummary": "Brief summary of sector analysis and key findings",
  "decisions": [
    {
      "action": "BUY|SELL|HOLD|RESEARCH",
      "ticker": "SYMBOL",
      "shares": 100,
      "orderType": "market|limit",
      "limitPrice": 6.25,
      "timeInForce": "day|gtc",
      "stopLoss": 5.4,
      "research": "Company analysis, pipeline, valuation, catalysts",
      "confidence": 0.85,
      "rationale": "Investment thesis and expected outcome"
    }
  ],
  "newDiscoveries": [
    {
      "ticker": "SYMBOL",
      "companyName": "Company Name",
      "marketCap": 75000000,
      "researchNotes": "Key findings and investment potential",
      "recommendedAction": "BUY|HOLD|MONITOR"
    }
  ],
  "portfolioStrategy": "Overall portfolio positioning and rebalancing plan",
  "riskAssessment": "Risk factors and mitigation strategies",
  "nextResearchFocus": "Areas for further investigation"
}`;
}

/**
 * Research-focused prompt template
 * @param {string} today - Today's date (YYYY-MM-DD)
 * @param {string} portfolioSnapshot - Formatted portfolio snapshot
 * @param {string} priceVolumeTable - Formatted price and volume data
 * @param {string} performanceMetrics - Formatted performance metrics
 * @param {string} aiContext - Historical AI context from previous decisions
 * @returns {string} Complete research prompt
 */
function buildResearchPrompt(
  today,
  portfolioSnapshot,
  priceVolumeTable,
  performanceMetrics,
  aiContext = ""
) {
  return `================================================================
Market Research Analysis — ${today}
================================================================

${priceVolumeTable}

${performanceMetrics}

${portfolioSnapshot}

${aiContext}

[ Your Instructions - Research Analyst ]
You are an expert micro-cap biotech research analyst. Your task is to perform comprehensive sector analysis and identify promising investment opportunities.

RESEARCH OBJECTIVES:
1. Analyze the current micro-cap biotech sector landscape
2. Identify emerging trends and therapeutic areas with potential
3. Evaluate individual company fundamentals and growth prospects
4. Assess competitive positioning and market opportunities
5. Identify catalysts and timeline expectations

ANALYSIS FRAMEWORK:
- Focus on companies with market cap $50M-$500M
- Evaluate clinical pipelines and development timelines
- Assess management quality and strategic execution
- Consider cash positions, burn rates, and financing needs
- Look for undervalued opportunities with strong fundamentals

Based on your analysis, provide comprehensive research findings in the following strict JSON format:

{
  "version": "2.0",
  "generatedAt": "${new Date().toISOString()}",
  "researchSummary": "Comprehensive sector analysis summary",
  "sectorAnalysis": {
    "overallSentiment": "bullish|neutral|bearish",
    "keyTrends": ["trend1", "trend2"],
    "riskFactors": ["risk1", "risk2"],
    "opportunityAreas": ["area1", "area2"]
  },
  "companyEvaluations": [
    {
      "ticker": "TICKER",
      "companyName": "Company Name",
      "marketCap": 75000000,
      "sector": "oncology|neurology|cardiology|etc",
      "fundamentalAnalysis": "Detailed analysis of pipeline, management, financials",
      "competitivePosition": "Market position and differentiation",
      "catalysts": ["catalyst1", "catalyst2"],
      "risks": ["risk1", "risk2"],
      "valuation": "undervalued|fair|overvalued",
      "recommendation": "BUY|MONITOR|AVOID",
      "convictionLevel": "high|medium|low",
      "qualityScore": 85,
      "researchNotes": "Key investment highlights and concerns"
    }
  ],
  "newDiscoveries": [
    {
      "ticker": "TICKER",
      "companyName": "Company Name",
      "discoveryReason": "Why this company is interesting",
      "initialAnalysis": "Preliminary assessment"
    }
  ],
  "nextResearchFocus": "Areas requiring further investigation"
}`;
}

/**
 * Portfolio snapshot format
 * @param {Object} portfolioData - Portfolio data
 * @returns {string} Formatted portfolio snapshot
 */
function formatPortfolioSnapshot(portfolioData) {
  return `[ Snapshot ]
Latest ChatGPT Equity: $${portfolioData.totalValue?.toFixed(2) || "0.00"}
Cash Balance: $${portfolioData.cash?.toFixed(2) || "0.00"}`;
}

/**
 * Performance metrics format
 * @returns {string} Formatted performance metrics
 */
function formatPerformanceMetrics() {
  // This would calculate actual performance metrics
  // For now, return placeholder
  return `[ Risk & Return ]
Sharpe Ratio (annualized):                2.145
Sortino Ratio (annualized):               3.234

[ CAPM vs Benchmarks ]
Beta (daily) vs ^GSPC:                    1.234
Alpha (annualized) vs ^GSPC:             15.67%
R² (fit quality):                          0.456`;
}

/**
 * Position sizing guidelines format
 * @param {Object} portfolioData - Portfolio data
 * @param {Object} marketData - Market data
 * @returns {string} Formatted position sizing guidelines
 */
function formatPositionSizing(portfolioData, marketData) {
  const lines = [];
  lines.push(`[ Portfolio Management Guidelines ]`);
  lines.push(`Available Cash: $${portfolioData.cash?.toFixed(2) || "0.00"}`);
  lines.push(
    `Current Portfolio Value: $${
      portfolioData.totalValue?.toFixed(2) || "0.00"
    }`
  );
  lines.push(``);
  lines.push(`PORTFOLIO CONSTRUCTION RULES:`);
  lines.push(`• Target: ${8}-${12} micro-cap biotech positions`);
  lines.push(
    `• Max per position: ${12}% of total portfolio ($${
      (portfolioData.totalValue * 0.12)?.toFixed(2) || "0.00"
    })`
  );
  lines.push(
    `• Min per position: ${3}% of total portfolio ($${
      (portfolioData.totalValue * 0.03)?.toFixed(2) || "0.00"
    })`
  );
  lines.push(`• Risk management: Stop losses at 20-30% below entry`);
  lines.push(`• Diversification: Spread across different therapeutic areas`);
  lines.push(``);
  lines.push(`POSITION SIZING EXAMPLES:`);

  // Calculate position sizes for promising micro-cap biotech stocks
  const promisingTickers = ["OCUP", "BPTH", "PDSB", "VTVT", "INMB"];

  promisingTickers.forEach((ticker) => {
    const data = marketData[ticker];
    if (data && data.data && data.data.length > 0) {
      const latest = data.data[data.data.length - 1];
      const price = latest.close || latest.price || 0;

      if (price > 0) {
        const maxPositionValue = portfolioData.totalValue * 0.12;
        const maxShares = Math.floor(maxPositionValue / price);
        const positionValue = (maxShares * price).toFixed(2);
        lines.push(
          `${ticker}: Max ${maxShares} shares ($${positionValue}) at $${price.toFixed(
            2
          )}`
        );
      }
    }
  });

  lines.push(``);
  lines.push(`RESEARCH PRIORITIES:`);
  lines.push(`• Focus on companies with market cap $50M-$500M`);
  lines.push(
    `• Prioritize companies with clinical catalysts in next 12-24 months`
  );
  lines.push(`• Look for undervalued stocks with strong pipelines`);
  lines.push(`• Consider cash position and burn rate`);
  lines.push(``);
  lines.push(
    `💡 IMPORTANT: Build a diversified portfolio through research-driven stock selection`
  );

  return lines.join("\n");
}

module.exports = {
  SYSTEM_MESSAGE_TRADING,
  SYSTEM_MESSAGE_RESEARCH,
  buildTradingPrompt,
  buildResearchPrompt,
  formatPortfolioSnapshot,
  formatPerformanceMetrics,
  formatPositionSizing,
};
