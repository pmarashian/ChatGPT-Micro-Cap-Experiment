/**
 * Market Research Handler
 * Performs intensive AI research on micro-cap biotech sector
 * Runs every 12 hours with 10-minute timeout for deep analysis
 */

const AIService = require("../../services/ai-service");
const AIMemoryService = require("../../services/ai-memory-service");
const MarketDataService = require("../../services/market-data-service");
const Logger = require("../../utils/logger");
const ErrorHandler = require("../../utils/error-handler");
const { validateEnvironment } = require("../../config/environment");

let logger;
let errorHandler;

/**
 * Scheduled Lambda handler for market research
 * Runs every 12 hours to perform deep AI analysis
 */
module.exports.handler = async (event, context) => {
  // Initialize services
  logger = new Logger("market-research");
  errorHandler = new ErrorHandler("market-research");

  try {
    // Log function start
    logger.logLambdaStart(event, context);

    // Validate environment
    validateEnvironment();

    logger.info("🚀 Starting comprehensive market research analysis");

    // Initialize services
    const aiService = new AIService();
    const memoryService = new AIMemoryService();
    const marketDataService = new MarketDataService();

    // Step 1: Load historical context and current portfolio
    logger.info("📚 Step 1: Loading historical context and portfolio data");
    const aiContext = await memoryService.buildAIContext();

    // Get current portfolio (minimal data for research context)
    const portfolioService = require("../../services/portfolio-service");
    const portfolioSvc = new portfolioService();
    const currentPortfolio = await portfolioSvc.getCurrentPortfolio();

    // Step 2: Fetch comprehensive market data
    logger.info("📊 Step 2: Fetching comprehensive market data");
    const marketData = await marketDataService.getPortfolioMarketData(
      currentPortfolio
    );

    // Cache the market data for trading decisions
    await memoryService.saveMarketData(marketData);

    // Step 3: Generate deep research analysis
    logger.info("🧠 Step 3: Performing deep AI research analysis");

    // Create focused research prompt (without trading decisions)
    const researchPrompt = aiService.buildResearchPrompt(
      currentPortfolio,
      marketData,
      aiContext
    );

    // Call AI for research-only response
    const researchResponse = await aiService.callOpenAI(researchPrompt);

    // Parse research response (different format than trading decisions)
    const parsedResearch = aiService.parseResearchResponse(researchResponse);

    // Step 4: Save comprehensive research findings
    logger.info("💾 Step 4: Saving research findings to memory");

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
        logger.info(
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
    logger.info("⚙️ Step 5: Reviewing and updating portfolio configuration");

    const portfolioConfig = await memoryService.getPortfolioConfig();
    // AI could suggest configuration changes based on research
    // For now, just log current config
    logger.info("Current portfolio configuration", portfolioConfig);

    // Step 6: Generate research summary report
    logger.info("📋 Step 6: Generating research summary report");

    const researchSummary = {
      timestamp: new Date().toISOString(),
      researchType: "scheduled_comprehensive",
      sectorsAnalyzed: ["micro-cap-biotech"],
      tickersResearched: Object.keys(marketData).length,
      newDiscoveries: parsedResearch.newDiscoveries?.length || 0,
      keyFindings: parsedResearch.researchSummary,
      nextResearchFocus: parsedResearch.nextResearchFocus,
      processingTime: Date.now() - context.getRemainingTimeInMillis(),
    };

    logger.info("✅ Market research completed successfully", researchSummary);

    // Log function end
    logger.logLambdaEnd(Date.now() - context.getRemainingTimeInMillis());

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Market research completed successfully",
        researchSummary,
        timestamp: new Date().toISOString(),
      }),
    };
  } catch (error) {
    logger.error("Market research failed", error);
    await errorHandler.sendErrorAlert(error, {
      function: "market-research",
      researchType: "scheduled_comprehensive",
    });

    // Log function end with error
    logger.logLambdaEnd(Date.now() - context.getRemainingTimeInMillis(), false);

    throw error;
  }
};
