/**
 * Portfolio Update Orchestrator
 * Shared function for both manual and scheduled portfolio updates
 */

const PortfolioService = require("../portfolio-service");
const MarketDataService = require("../market-data-service");
const Logger = require("../../utils/logger");
const ErrorHandler = require("../../utils/error-handler");

/**
 * Execute portfolio update with consistent orchestration
 * @param {Object} options - Configuration options
 * @param {string} options.invocationType - 'manual' or 'scheduled'
 * @param {Object} options.logger - Optional logger instance
 * @param {Object} options.errorHandler - Optional error handler instance
 * @returns {Promise<Object>} Portfolio update results
 */
async function performPortfolioUpdate(options = {}) {
  const { invocationType = "manual", logger, errorHandler } = options;

  // Use provided logger/errorHandler or create new ones
  const logInstance =
    logger || new Logger(`portfolio-update-${invocationType}`);
  const errorHandlerInstance =
    errorHandler || new ErrorHandler(`portfolio-update-${invocationType}`);

  try {
    // Log function start
    logInstance.info(`💼 Starting ${invocationType} portfolio update`);

    // Initialize services
    const portfolioService = new PortfolioService();
    const marketDataService = new MarketDataService();

    // 1. Get current portfolio from dynamo
    logInstance.info("Fetching current portfolio");
    const portfolio = await portfolioService.getCurrentPortfolio();

    if (!portfolio.positions || portfolio.positions.length === 0) {
      logInstance.info("No positions to update");
      return {
        message: "No positions to update",
        portfolioValue: portfolio.totalValue,
        cash: portfolio.cash,
        timestamp: new Date().toISOString(),
      };
    }

    // 2. Get latest market data for all positions
    logInstance.info("Fetching market data for portfolio positions");
    const marketData = await marketDataService.getPortfolioMarketData(
      portfolio
    );

    // 3. Update portfolio positions with latest prices
    logInstance.info("Updating portfolio positions");
    const updatedPortfolio = await portfolioService.updatePortfolioPositions(
      portfolio,
      marketData
    );

    // 4. Calculate updated performance metrics
    logInstance.info("Calculating performance metrics");
    const performanceMetrics =
      await portfolioService.calculatePerformanceMetrics(updatedPortfolio);

    logInstance.info("✅ Portfolio update completed successfully", {
      totalValue: updatedPortfolio.totalValue,
      positionsCount: updatedPortfolio.positions?.length || 0,
      lastUpdated: updatedPortfolio.lastUpdated,
    });

    return {
      totalValue: updatedPortfolio.totalValue,
      cash: updatedPortfolio.cash,
      positionsCount: updatedPortfolio.positions?.length || 0,
      performanceMetrics,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    logInstance.error(`Portfolio update failed`, error);

    // Send error alert if error handler provided
    if (errorHandlerInstance) {
      try {
        await errorHandlerInstance.sendErrorAlert(error, {
          function: `portfolio-update-${invocationType}`,
          operation: "portfolio_update_processing",
        });
      } catch (alertError) {
        logInstance.error("Failed to send error alert", alertError);
      }
    }

    throw error;
  }
}

module.exports = {
  performPortfolioUpdate,
};
