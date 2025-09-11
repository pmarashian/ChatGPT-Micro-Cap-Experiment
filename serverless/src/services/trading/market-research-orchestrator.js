/**
 * Market Research Orchestrator
 * Shared function for both manual and scheduled market research execution
 *
 * TODO: Future Enhancements
 * ========================
 *
 * 1. PERFORMANCE METRICS CALCULATION
 *    - Replace hard-coded performance metrics in formatPerformanceMetrics()
 *    - Calculate actual Sharpe/Sortino ratios from portfolio returns
 *    - Implement real Beta and Alpha calculations vs benchmarks
 *    - Add R² fit quality metrics from historical data
 *
 * 2. REAL-TIME PORTFOLIO CONTEXT
 *    - Add current portfolio performance summary to research prompt
 *    - Include recent trading performance (win rate, avg gain/loss)
 *    - Show current sector allocation and diversification metrics
 *    - Add portfolio risk metrics (VaR, max drawdown)
 *
 * 3. CITATION HANDLING IMPROVEMENTS
 *    - Add fallback guidance for company evaluations with limited sources
 *    - Implement citation quality scoring and validation
 *    - Handle cases where required citations aren't available
 *    - Add citation freshness checks (prefer recent sources)
 *
 * 4. DATE CONSISTENCY IMPROVEMENTS
 *    - Ensure consistent date formatting throughout research process
 *    - Use trading date for all timestamps in research output
 *    - Align JSON schema generatedAt with actual research execution time
 */

const AIService = require("../ai-service");
const AIMemoryService = require("../ai-memory-service");
const MarketDataService = require("../market-data-service");
const PortfolioService = require("../portfolio-service");
const Logger = require("../../utils/logger");
const ErrorHandler = require("../../utils/error-handler");

/**
 * Execute market research with consistent orchestration
 * @param {Object} options - Configuration options
 * @param {string} options.invocationType - 'manual' or 'scheduled'
 * @param {Object} options.logger - Optional logger instance
 * @param {Object} options.errorHandler - Optional error handler instance
 * @returns {Promise<Object>} Research results
 */
async function performMarketResearch(options = {}) {
  const { invocationType = "manual", logger, errorHandler } = options;

  // Use provided logger/errorHandler or create new ones
  const logInstance = logger || new Logger(`market-research-${invocationType}`);
  const errorHandlerInstance =
    errorHandler || new ErrorHandler(`market-research-${invocationType}`);

  try {
    // Log function start
    logInstance.info(`🚀 Starting ${invocationType} market research analysis`);

    // Initialize services
    const aiService = new AIService();
    const memoryService = new AIMemoryService();
    const marketDataService = new MarketDataService();

    // Step 1: Load historical context and current portfolio
    logInstance.info(
      "📚 Step 1: Loading historical context and portfolio data"
    );
    const aiContext = await memoryService.buildAIContext();

    // Get current portfolio (minimal data for research context)
    const portfolioService = new PortfolioService();
    const currentPortfolio = await portfolioService.getCurrentPortfolio();

    // Step 2: Fetch comprehensive market data
    logInstance.info("📊 Step 2: Fetching comprehensive market data");
    const marketData = await marketDataService.getPortfolioMarketData(
      currentPortfolio
    );

    // Cache the market data for trading decisions
    await memoryService.saveMarketData(marketData);

    // Step 3: Generate deep research analysis
    logInstance.info("🧠 Step 3: Performing deep AI research analysis");

    // Create focused research prompt (without trading decisions)
    const researchPrompt = aiService.buildResearchPrompt(
      currentPortfolio,
      marketData,
      aiContext
    );

    logInstance.debug(`🔍 RESEARCH PROMPT: ${researchPrompt}`);

    // Call AI for research-only response
    const researchResponse = await aiService.callOpenAI(researchPrompt, true); // true for research

    // Parse research response (different format than trading decisions)
    const parsedResearch = aiService.parseResearchResponse(researchResponse);

    // Step 4: Save comprehensive research findings
    logInstance.info("💾 Step 4: Saving research findings to memory");

    await memoryService.saveAIResearch({
      ...parsedResearch,
      researchType: "comprehensive_sector_analysis",
      analysisDepth: "deep",
      marketDataSnapshot: {
        timestamp: new Date().toISOString(),
        tickersAnalyzed: Object.keys(marketData).length,
        dataSources: ["yahoo", "stooq"],
      },
    });

    // Extract and save newly discovered tickers with quality scoring
    if (
      parsedResearch.newDiscoveries &&
      parsedResearch.newDiscoveries.length > 0
    ) {
      // Use the full discovery objects with quality scoring
      const discoveries = parsedResearch.newDiscoveries.filter(
        (discovery) => discovery.ticker && typeof discovery.ticker === "string"
      );

      if (discoveries.length > 0) {
        await memoryService.saveDiscoveredTickersWithQuality(discoveries);
        logInstance.info(
          `Saved ${discoveries.length} discoveries with quality scores`,
          {
            discoveries: discoveries.map((d) => ({
              ticker: d.ticker,
              qualityScore: d.qualityScore || "pending",
              recommendation: d.recommendation,
            })),
          }
        );
      }
    }

    // Step 5: Update portfolio configuration if needed
    logInstance.info(
      "⚙️ Step 5: Reviewing and updating portfolio configuration"
    );

    const portfolioConfig = await memoryService.getPortfolioConfig();
    // AI could suggest configuration changes based on research
    // For now, just log current config
    logInstance.info("Current portfolio configuration", portfolioConfig);

    // Step 6: Generate research summary report
    logInstance.info("📋 Step 6: Generating research summary report");

    const researchSummary = {
      timestamp: new Date().toISOString(),
      researchType: "scheduled_comprehensive",
      sectorsAnalyzed: ["micro-cap-biotech"],
      tickersResearched: Object.keys(marketData).length,
      newDiscoveries: parsedResearch.newDiscoveries?.length || 0,
      keyFindings: parsedResearch.researchSummary,
      nextResearchFocus: parsedResearch.nextResearchFocus,
      processingTime: "completed", // This would be calculated based on actual timing
    };

    logInstance.info(
      "✅ Market research completed successfully",
      researchSummary
    );

    return researchSummary;
  } catch (error) {
    logInstance.error(`Market research failed`, error);

    // Send error alert if error handler provided
    if (errorHandlerInstance) {
      try {
        await errorHandlerInstance.sendErrorAlert(error, {
          function: `market-research-${invocationType}`,
          researchType: "scheduled_comprehensive",
        });
      } catch (alertError) {
        logInstance.error("Failed to send error alert", alertError);
      }
    }

    throw error;
  }
}

module.exports = {
  performMarketResearch,
};
