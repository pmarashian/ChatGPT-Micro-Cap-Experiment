/**
 * Get System Status API Handler
 * REST API endpoint for system health monitoring
 */

const PortfolioService = require("../../services/portfolio-service");
const BrokerageService = require("../../services/brokerage-service");
const Logger = require("../../utils/logger");
const ErrorHandler = require("../../utils/error-handler");
const { getEnvConfig } = require("../../config/environment");

let logger;
let errorHandler;

/**
 * Lambda handler for GET /api/status
 */
module.exports.handler = async (event, context) => {
  // Initialize services
  logger = new Logger("get-system-status");
  errorHandler = new ErrorHandler("get-system-status");

  try {
    // Log function start
    logger.logLambdaStart(event, context);

    logger.info("Checking system status");

    const envConfig = getEnvConfig();
    const status = {
      systemStatus: "healthy",
      timestamp: new Date().toISOString(),
      aiProvider: envConfig.aiProvider,
      aiModel: envConfig.aiModel,
      tradingMode: envConfig.executeTrades ? "live" : "simulation",
    };

    // Check portfolio service
    try {
      const portfolioService = new PortfolioService();
      const portfolio = await portfolioService.getCurrentPortfolio();
      status.portfolioStatus = "connected";
      status.lastTradingExecution = portfolio.lastUpdated || null;
      status.portfolioValue = portfolio.totalValue;
      status.positionCount = portfolio.positions?.length || 0;
    } catch (error) {
      logger.warn("Portfolio service check failed", error);
      status.portfolioStatus = "error";
      status.portfolioError = error.message;
    }

    // Check brokerage service
    try {
      const brokerageService = new BrokerageService();
      const accountInfo = await brokerageService.getAccountInfo();
      status.brokerageStatus = "connected";
      status.accountCash = accountInfo.cash;
      status.accountEquity = accountInfo.equity;
      status.buyingPower = accountInfo.buyingPower;
    } catch (error) {
      logger.warn("Brokerage service check failed", error);
      status.brokerageStatus = "error";
      status.brokerageError = error.message;
    }

    // Check database connectivity
    try {
      const portfolioService = new PortfolioService();
      // Simple query to test connectivity
      await portfolioService.getCurrentPortfolio();
      status.databaseStatus = "connected";
    } catch (error) {
      logger.warn("Database connectivity check failed", error);
      status.databaseStatus = "error";
      status.databaseError = error.message;
    }

    // Determine overall system status
    const criticalServices = [
      status.portfolioStatus,
      status.brokerageStatus,
      status.databaseStatus,
    ];
    if (criticalServices.includes("error")) {
      status.systemStatus = "degraded";
    }

    // Calculate uptime (simplified - would need persistent storage for real uptime)
    status.uptime = "99.9%"; // Placeholder

    logger.info("System status check completed", {
      systemStatus: status.systemStatus,
      portfolioStatus: status.portfolioStatus,
      brokerageStatus: status.brokerageStatus,
      databaseStatus: status.databaseStatus,
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
      body: JSON.stringify(status),
    };
  } catch (error) {
    logger.error("System status check failed", error);

    // Log function end with error
    logger.logLambdaEnd(Date.now() - context.getRemainingTimeInMillis(), false);

    return errorHandler.createErrorResponse(error);
  }
};
