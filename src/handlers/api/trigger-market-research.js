/**
 * Trigger Market Research Handler
 * Manual endpoint to trigger comprehensive market research
 * Uses 10-minute timeout for deep AI analysis
 */

const AIService = require("../../services/ai-service");
const AIMemoryService = require("../../services/ai-memory-service");
const MarketDataService = require("../../services/market-data-service");
const PortfolioService = require("../../services/portfolio-service");
const Logger = require("../../utils/logger");
const ErrorHandler = require("../../utils/error-handler");
const { validateEnvironment } = require("../../config/environment");

let logger;
let errorHandler;

/**
 * Lambda handler for POST /api/trigger-market-research
 */
module.exports.handler = async (event, context) => {
  // Initialize services
  logger = new Logger("trigger-market-research");
  errorHandler = new ErrorHandler("trigger-market-research");

  try {
    // Log function start
    logger.logLambdaStart(event, context);

    // Validate environment
    validateEnvironment();

    logger.info("🚀 Starting manual comprehensive market research");

    // Initialize services
    const aiService = new AIService();
    const memoryService = new AIMemoryService();
    const marketDataService = new MarketDataService();
    const portfolioService = new PortfolioService();

    // Step 1: Load historical context
    logger.info("📚 Step 1: Loading historical research context");
    const aiContext = await memoryService.buildAIContext();

    // Get current portfolio for context
    const currentPortfolio = await portfolioService.getCurrentPortfolio();

    // Step 2: Fetch fresh market data
    logger.info("📊 Step 2: Fetching comprehensive market data");
    const marketData = await marketDataService.getPortfolioMarketData(
      currentPortfolio
    );

    // Step 3: Generate deep research analysis
    logger.info("🧠 Step 3: Performing deep AI sector analysis");

    // Create research-focused prompt
    const researchPrompt = aiService.buildResearchPrompt(
      currentPortfolio,
      marketData,
      aiContext
    );

    // Call AI for research analysis
    const researchResponse = await aiService.callOpenAI(researchPrompt);

    // Parse research response
    const parsedResearch = aiService.parseResearchResponse(researchResponse);

    // Step 4: Save comprehensive research
    logger.info("💾 Step 4: Saving research findings to memory");
    await memoryService.saveAIResearch(parsedResearch);
    await memoryService.saveMarketData(marketData);

    // Step 5: Generate summary
    const researchSummary = {
      timestamp: new Date().toISOString(),
      researchType: "manual_triggered",
      processingTimeSeconds: Math.round(
        (Date.now() - context.getRemainingTimeInMillis()) / 1000
      ),
      sectorsAnalyzed: ["micro-cap-biotech"],
      tickersResearched: Object.keys(marketData).length,
      companyEvaluations: parsedResearch.companyEvaluations?.length || 0,
      newDiscoveries: parsedResearch.newDiscoveries?.length || 0,
      keyFindings: parsedResearch.researchSummary?.substring(0, 200) + "...",
      nextResearchFocus: parsedResearch.nextResearchFocus,
    };

    logger.info(
      "✅ Manual market research completed successfully",
      researchSummary
    );

    // Log function end
    logger.logLambdaEnd(Date.now() - context.getRemainingTimeInMillis());

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
      body: JSON.stringify({
        message: "Market research completed successfully",
        researchSummary,
        researchData: parsedResearch,
        timestamp: new Date().toISOString(),
      }),
    };
  } catch (error) {
    logger.error("Manual market research failed", error);

    // Log function end with error
    logger.logLambdaEnd(Date.now() - context.getRemainingTimeInMillis(), false);

    return errorHandler.createErrorResponse(error);
  }
};
