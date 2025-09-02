/**
 * Get Portfolio API Handler
 * REST API endpoint for retrieving current portfolio data
 */

const PortfolioService = require("../../services/portfolio-service");
const Logger = require("../../utils/logger");
const ErrorHandler = require("../../utils/error-handler");
const { validateEnvironment } = require("../../config/environment");

let logger;
let errorHandler;

/**
 * Lambda handler for GET /api/portfolio
 */
module.exports.handler = async (event, context) => {
  // Initialize services
  logger = new Logger("get-portfolio");
  errorHandler = new ErrorHandler("get-portfolio");

  try {
    // Log function start
    logger.logLambdaStart(event, context);

    // Validate environment
    validateEnvironment();

    logger.info("Retrieving portfolio data");

    // Initialize portfolio service
    const portfolioService = new PortfolioService();

    // Get current portfolio
    const portfolio = await portfolioService.getCurrentPortfolio();

    // Format response
    const response = {
      totalValue: portfolio.totalValue,
      cash: portfolio.cash,
      equity: portfolio.equity || 0,
      positions: portfolio.positions || [],
      lastUpdated: portfolio.lastUpdated,
      positionCount: portfolio.positions?.length || 0,
    };

    logger.info("Portfolio data retrieved successfully", {
      totalValue: response.totalValue,
      positionCount: response.positionCount,
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
    logger.error("Failed to retrieve portfolio data", error);

    // Log function end with error
    logger.logLambdaEnd(Date.now() - context.getRemainingTimeInMillis(), false);

    return errorHandler.createErrorResponse(error);
  }
};
