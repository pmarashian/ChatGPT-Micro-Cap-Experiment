/**
 * Portfolio Update Orchestrator
 * Shared function for both manual and scheduled portfolio updates
 */

const PortfolioService = require("../portfolio-service");
const MarketDataService = require("../market-data-service");
const BrokerageService = require("../brokerage-service");
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
    const brokerageService = new BrokerageService();

    // 1. Get current portfolio from Alpaca (source of truth)
    logInstance.debug("Fetching current portfolio from Alpaca");
    const alpacaPositions = await brokerageService.getPortfolio();
    const alpacaAccount = await brokerageService.getAccountInfo();

    if (!alpacaPositions || alpacaPositions.length === 0) {
      logInstance.info("No positions in Alpaca account");

      // Get local portfolio to preserve structure
      const localPortfolio = await portfolioService.getCurrentPortfolio();

      // Create updated portfolio with Alpaca account info
      const updatedPortfolio = {
        ...localPortfolio,
        cash: alpacaAccount.cash,
        totalValue: alpacaAccount.portfolioValue,
        equity: alpacaAccount.equity,
        positions: [],
        lastUpdated: new Date().toISOString(),
      };

      await portfolioService.savePortfolio(updatedPortfolio);

      return {
        message: "No positions to update - portfolio synced with Alpaca",
        portfolioValue: alpacaAccount.portfolioValue,
        cash: alpacaAccount.cash,
        timestamp: new Date().toISOString(),
      };
    }

    // 2. Get local portfolio to preserve cost basis and stop losses
    logInstance.debug("Fetching local portfolio data");
    const localPortfolio = await portfolioService.getCurrentPortfolio();

    // 3. Merge Alpaca data with local data (preserve cost basis, stop losses, etc.)
    logInstance.debug("Merging Alpaca data with local portfolio");
    const mergedPortfolio = await portfolioService.syncWithBrokerageData(
      localPortfolio,
      alpacaPositions,
      alpacaAccount
    );

    // 4. Get latest market data for all positions
    logInstance.debug("Fetching market data for portfolio positions");
    const marketData = await marketDataService.getPortfolioMarketData(
      mergedPortfolio
    );

    // 5. Update portfolio positions with latest prices
    logInstance.debug("Updating portfolio positions with market data");
    const updatedPortfolio = await portfolioService.updatePortfolioPositions(
      mergedPortfolio,
      marketData
    );

    // 6. Calculate updated performance metrics
    logInstance.debug("Calculating performance metrics");
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
    logInstance.error(`Portfolio update failed`, { error: error.message });

    // Send error alert if error handler provided
    if (errorHandlerInstance) {
      try {
        await errorHandlerInstance.sendErrorAlert(error, {
          function: `portfolio-update-${invocationType}`,
          operation: "portfolio_update_processing",
        });
      } catch (alertError) {
        logInstance.error("Failed to send error alert", {
          error: alertError.message,
        });
      }
    }

    throw error;
  }
}

module.exports = {
  performPortfolioUpdate,
};
