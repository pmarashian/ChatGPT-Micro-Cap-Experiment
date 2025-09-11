const AIMemoryService = require("../../services/ai-memory-service");
const Logger = require("../../utils/logger");
const ErrorHandler = require("../../utils/error-handler");
const { validateEnvironment } = require("../../config/environment");

let logger;
let errorHandler;

/**
 * Lambda handler for GET /api/ai-memory
 */
module.exports.handler = async (event, context) => {
  // Initialize services
  logger = new Logger("get-ai-memory");
  errorHandler = new ErrorHandler("get-ai-memory");

  try {
    // Log function start
    logger.logLambdaStart(event, context);

    // Validate environment
    validateEnvironment();

    logger.info("Retrieving AI memory and research history");

    const memoryService = new AIMemoryService();

    // Get recent research and decisions
    const [recentResearch, recentDecisions, portfolioConfig] =
      await Promise.all([
        memoryService.getRecentResearch(10),
        memoryService.getRecentDecisions(15),
        memoryService.getPortfolioConfig(),
      ]);

    // Build comprehensive memory report
    const memoryReport = {
      summary: {
        totalResearchItems: recentResearch.length,
        totalDecisionItems: recentDecisions.length,
        portfolioConfig: portfolioConfig,
        dateRange:
          recentResearch.length > 0
            ? {
                oldest: recentResearch[recentResearch.length - 1]?.timestamp,
                newest: recentResearch[0]?.timestamp,
              }
            : null,
      },
      recentResearch: recentResearch.map((item) => ({
        timestamp: item.timestamp,
        researchSummary: item.researchSummary,
        newDiscoveries: item.newDiscoveries?.length || 0,
        portfolioStrategy: item.portfolioStrategy,
        nextResearchFocus: item.nextResearchFocus,
      })),
      recentDecisions: recentDecisions.map((item) => ({
        timestamp: item.timestamp,
        decisionCount: item.decisions?.length || 0,
        decisions:
          item.decisions
            ?.filter((d) => d.action !== "HOLD")
            .map((d) => ({
              action: d.action,
              ticker: d.ticker,
              shares: d.shares,
              rationale: d.rationale,
            })) || [],
        researchSummary: item.researchSummary,
      })),
      // Extract all unique tickers the AI has researched
      discoveredTickers: extractUniqueTickers(recentResearch, recentDecisions),
      // Show AI learning patterns
      patterns: analyzeAIPatterns(recentDecisions),
    };

    logger.info("AI memory retrieved successfully", {
      researchItems: memoryReport.summary.totalResearchItems,
      decisionItems: memoryReport.summary.totalDecisionItems,
      uniqueTickers: memoryReport.discoveredTickers.length,
    });

    // Log function end
    logger.logLambdaEnd(Date.now() - context.getRemainingTimeInMillis());

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
      },
      body: JSON.stringify(memoryReport, null, 2),
    };
  } catch (error) {
    logger.error("AI memory retrieval failed", error);

    // Log function end with error
    logger.logLambdaEnd(Date.now() - context.getRemainingTimeInMillis(), false);

    return errorHandler.createErrorResponse(error);
  }
};

/**
 * Extract all unique tickers from research and decisions
 */
function extractUniqueTickers(research, decisions) {
  const tickers = new Set();

  // From research discoveries
  research.forEach((item) => {
    if (item.newDiscoveries) {
      item.newDiscoveries.forEach((discovery) => {
        if (discovery.ticker) {
          tickers.add(discovery.ticker);
        }
      });
    }
  });

  // From decisions
  decisions.forEach((item) => {
    if (item.decisions) {
      item.decisions.forEach((decision) => {
        if (decision.ticker) {
          tickers.add(decision.ticker);
        }
      });
    }
  });

  return Array.from(tickers).sort();
}

/**
 * Analyze AI decision patterns
 */
function analyzeAIPatterns(decisions) {
  const patterns = {
    totalDecisions: 0,
    buyDecisions: 0,
    sellDecisions: 0,
    holdDecisions: 0,
    researchDecisions: 0,
    topTickers: {},
    avgSharesPerDecision: 0,
  };

  let totalShares = 0;

  decisions.forEach((item) => {
    if (item.decisions) {
      item.decisions.forEach((decision) => {
        patterns.totalDecisions++;

        // Count by action
        switch (decision.action) {
          case "BUY":
            patterns.buyDecisions++;
            break;
          case "SELL":
            patterns.sellDecisions++;
            break;
          case "HOLD":
            patterns.holdDecisions++;
            break;
          case "RESEARCH":
            patterns.researchDecisions++;
            break;
        }

        // Track tickers
        if (decision.ticker) {
          patterns.topTickers[decision.ticker] =
            (patterns.topTickers[decision.ticker] || 0) + 1;
        }

        // Track shares
        if (decision.shares) {
          totalShares += decision.shares;
        }
      });
    }
  });

  patterns.avgSharesPerDecision =
    patterns.totalDecisions > 0
      ? Math.round(totalShares / patterns.totalDecisions)
      : 0;

  // Sort top tickers
  patterns.topTickers = Object.entries(patterns.topTickers)
    .sort(([, a], [, b]) => b - a)
    .reduce((obj, [key, value]) => ({ ...obj, [key]: value }), {});

  return patterns;
}
