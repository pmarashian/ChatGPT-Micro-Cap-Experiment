/**
 * Get Trading History API Handler
 * REST API endpoint for retrieving trading history
 */

const PortfolioService = require("../../services/portfolio-service");
const Logger = require("../../utils/logger");
const ErrorHandler = require("../../utils/error-handler");
const { validateEnvironment } = require("../../config/environment");

let logger;
let errorHandler;

/**
 * Lambda handler for GET /api/trading-history
 */
module.exports.handler = async (event, context) => {
  // Initialize services
  logger = new Logger("get-trading-history");
  errorHandler = new ErrorHandler("get-trading-history");

  try {
    // Log function start
    logger.logLambdaStart(event, context);

    // Validate environment
    validateEnvironment();

    // Parse query parameters
    const queryParams = event.queryStringParameters || {};
    const days = parseInt(queryParams.days) || 30;

    // Validate days parameter
    if (days < 1 || days > 365) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          error: "Invalid days parameter. Must be between 1 and 365.",
          provided: days,
        }),
      };
    }

    logger.info(`Retrieving trading history for last ${days} days`);

    // Initialize portfolio service
    const portfolioService = new PortfolioService();

    // Get trading history
    const trades = await portfolioService.getTradingHistory(days);

    // Calculate summary statistics
    const summary = {
      totalTrades: trades.length,
      buyTrades: trades.filter((t) => t.action === "BUY").length,
      sellTrades: trades.filter((t) => t.action === "SELL").length,
      totalVolume: trades.reduce((sum, t) => sum + t.shares, 0),
      totalPnL: trades.reduce((sum, t) => sum + t.pnl, 0),
      profitableTrades: trades.filter((t) => t.pnl > 0).length,
      losingTrades: trades.filter((t) => t.pnl < 0).length,
    };

    const response = {
      trades,
      summary,
      period: `${days} days`,
      generatedAt: new Date().toISOString(),
    };

    logger.info("Trading history retrieved successfully", {
      tradesCount: trades.length,
      totalPnL: summary.totalPnL,
      days: days,
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
      body: JSON.stringify(response),
    };
  } catch (error) {
    logger.error("Failed to retrieve trading history", error);

    // Log function end with error
    logger.logLambdaEnd(Date.now() - context.getRemainingTimeInMillis(), false);

    return errorHandler.createErrorResponse(error);
  }
};
