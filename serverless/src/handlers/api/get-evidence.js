/**
 * Get Evidence API Handler
 * Returns evidence items (fundamentals + news) for a specific ticker
 */

const AIMemoryService = require("../../services/ai-memory-service");
const Logger = require("../../utils/logger");
const ErrorHandler = require("../../utils/error-handler");
const { validateEnvironment } = require("../../config/environment");

let logger;
let errorHandler;

/**
 * API handler for getting evidence items for a ticker
 * Query parameters:
 * - ticker: required, ticker symbol
 * - limit: optional, max items to return (default: 10)
 * - type: optional, "fundamentals", "news", or "all" (default: "all")
 */
module.exports.handler = async (event, context) => {
  // Initialize services
  logger = new Logger("get-evidence");
  errorHandler = new ErrorHandler("get-evidence");

  try {
    // Log function start
    logger.logLambdaStart(event, context);

    // Validate environment
    validateEnvironment();

    // Parse query parameters
    const queryParams = event.queryStringParameters || {};
    const ticker = queryParams.ticker;
    const limit = parseInt(queryParams.limit) || 10;
    const type = queryParams.type || "all";

    // Validate required parameters
    if (!ticker) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          error: "Missing required parameter: ticker",
          message: "Please provide a ticker symbol",
        }),
      };
    }

    // Validate ticker format
    if (!/^[A-Z0-9-]+$/.test(ticker)) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          error: "Invalid ticker format",
          message:
            "Ticker must contain only uppercase letters, numbers, and hyphens",
        }),
      };
    }

    logger.info("Fetching evidence for ticker", { ticker, limit, type });

    // Initialize AI memory service
    const memoryService = new AIMemoryService();

    // Get evidence based on type
    let evidence = [];
    let fundamentals = [];
    let news = [];

    if (type === "fundamentals" || type === "all") {
      fundamentals = await memoryService.getTickerResearch(
        ticker,
        type === "fundamentals" ? limit : limit / 2
      );
      fundamentals = fundamentals.filter(
        (item) => item.type === "fundamentals"
      );
    }

    if (type === "news" || type === "all") {
      news = await memoryService.getTickerResearch(
        ticker,
        type === "news" ? limit : limit / 2
      );
      news = news.filter((item) => item.type === "news");
    }

    // Combine and sort by recency
    evidence = [...fundamentals, ...news]
      .sort(
        (a, b) => new Date(b.SK || b.timestamp) - new Date(a.SK || a.timestamp)
      )
      .slice(0, limit);

    // Get evidence summary
    const summary = await memoryService.getEvidenceSummary(ticker);

    logger.info("Successfully retrieved evidence", {
      ticker,
      totalItems: evidence.length,
      fundamentalsCount: fundamentals.length,
      newsCount: news.length,
      type,
      limit,
    });

    // Log function end
    logger.logLambdaEnd(Date.now() - context.getRemainingTimeInMillis());

    // Force flush all remaining logs before returning
    await logger.flush();

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        success: true,
        ticker,
        summary,
        evidence: evidence.map((item) => ({
          id: `${item.PK}#${item.SK}`,
          type: item.type,
          source: item.source,
          timestamp: item.SK,
          asOfDate: item.asOfDate,
          publishedAt: item.publishedAt,
          recencyDays: item.recencyDays,
          stale: item.stale,
          // Include type-specific fields
          ...(item.type === "fundamentals"
            ? {
                structured: item.structured,
              }
            : {}),
          ...(item.type === "news"
            ? {
                headline: item.headline,
                snippet: item.snippet,
                url: item.url,
                sourceName: item.sourceName,
              }
            : {}),
        })),
        metadata: {
          type,
          limit,
          returnedCount: evidence.length,
          timestamp: new Date().toISOString(),
        },
      }),
    };
  } catch (error) {
    logger.error("Failed to get evidence", error);

    // Send error alert
    try {
      await errorHandler.sendErrorAlert(error, {
        function: "get-evidence",
        operation: "api_get_evidence",
        ticker: event.queryStringParameters?.ticker,
      });
    } catch (alertError) {
      logger.error("Failed to send error alert", alertError);
    }

    // Log function end with error
    logger.logLambdaEnd(Date.now() - context.getRemainingTimeInMillis(), false);

    // Force flush all remaining logs before throwing error
    try {
      await logger.flush();
    } catch (flushError) {
      // Silent fail - don't let flush errors mask the original error
    }

    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        error: "Failed to retrieve evidence",
        message: error.message,
      }),
    };
  }
};
