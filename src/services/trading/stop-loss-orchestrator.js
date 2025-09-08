/**
 * Stop Loss Orchestrator
 * Shared function for both manual and scheduled stop-loss monitoring
 */

const PortfolioService = require("../portfolio-service");
const MarketDataService = require("../market-data-service");
const BrokerageService = require("../brokerage-service");
const Logger = require("../../utils/logger");
const ErrorHandler = require("../../utils/error-handler");

/**
 * Execute stop-loss monitoring with consistent orchestration
 * @param {Object} options - Configuration options
 * @param {string} options.invocationType - 'manual' or 'scheduled'
 * @param {Object} options.logger - Optional logger instance
 * @param {Object} options.errorHandler - Optional error handler instance
 * @returns {Promise<Object>} Stop-loss monitoring results
 */
async function performStopLossMonitoring(options = {}) {
  const { invocationType = "manual", logger, errorHandler } = options;

  // Use provided logger/errorHandler or create new ones
  const logInstance = logger || new Logger(`stop-loss-${invocationType}`);
  const errorHandlerInstance =
    errorHandler || new ErrorHandler(`stop-loss-${invocationType}`);

  try {
    // Log function start
    logInstance.info(`🛡️ Starting ${invocationType} stop-loss monitoring`);

    // Check if market is open
    const brokerageService = new BrokerageService();
    const isMarketOpen = await brokerageService.isMarketOpen();

    if (!isMarketOpen) {
      logInstance.info("Market is closed, skipping stop-loss monitoring");
      return {
        message: "Market is closed",
        stopLossesChecked: 0,
        timestamp: new Date().toISOString(),
      };
    }

    // Initialize services
    const portfolioService = new PortfolioService();
    const marketDataService = new MarketDataService();

    // Get current portfolio
    logInstance.info("Fetching current portfolio for stop-loss monitoring");
    const portfolio = await portfolioService.getCurrentPortfolio();

    if (!portfolio.positions || portfolio.positions.length === 0) {
      logInstance.info("No positions to monitor for stop-loss");
      return {
        message: "No positions to monitor",
        stopLossesChecked: 0,
        timestamp: new Date().toISOString(),
      };
    }

    // Get latest market data
    logInstance.info("Fetching market data for stop-loss evaluation");
    const marketData = await marketDataService.getPortfolioMarketData(
      portfolio
    );

    const stopLossResults = [];
    let stopLossTriggered = 0;

    // Check each position for stop-loss conditions
    for (const position of portfolio.positions) {
      try {
        const ticker = position.ticker;
        const currentPrice =
          marketData[ticker]?.data?.[marketData[ticker].data.length - 1]?.close;
        const stopLossPrice = position.stopLoss;

        if (!currentPrice || !stopLossPrice) {
          stopLossResults.push({
            ticker,
            status: "skipped",
            reason: "Missing price data or stop-loss level",
          });
          continue;
        }

        const priceChange =
          ((currentPrice - position.buyPrice) / position.buyPrice) * 100;
        const stopLossTriggered = currentPrice <= stopLossPrice;

        if (stopLossTriggered) {
          logInstance.warn(`🚨 Stop-loss triggered for ${ticker}`, {
            ticker,
            currentPrice,
            stopLossPrice,
            buyPrice: position.buyPrice,
            unrealizedPnL: position.unrealizedPnL,
          });

          // Execute stop-loss order
          const stopLossOrder = await brokerageService.executeStopLossOrder(
            position
          );
          stopLossTriggered++;

          stopLossResults.push({
            ticker,
            status: "stop_loss_executed",
            currentPrice,
            stopLossPrice,
            buyPrice: position.buyPrice,
            orderId: stopLossOrder.id,
          });
        } else {
          stopLossResults.push({
            ticker,
            status: "monitored",
            currentPrice,
            stopLossPrice,
            distanceToStop: (
              ((currentPrice - stopLossPrice) / stopLossPrice) *
              100
            ).toFixed(2),
          });
        }
      } catch (positionError) {
        logInstance.error(
          `Error monitoring stop-loss for ${position.ticker}`,
          positionError
        );
        stopLossResults.push({
          ticker: position.ticker,
          status: "error",
          error: positionError.message,
        });
      }
    }

    logInstance.info("✅ Stop-loss monitoring completed", {
      positionsMonitored: stopLossResults.length,
      stopLossesTriggered: stopLossTriggered,
    });

    return {
      message: "Stop-loss monitoring completed",
      positionsMonitored: stopLossResults.length,
      stopLossesTriggered,
      results: stopLossResults,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    logInstance.error(`Stop-loss monitoring failed`, error);

    // Send error alert if error handler provided
    if (errorHandlerInstance) {
      try {
        await errorHandlerInstance.sendErrorAlert(error, {
          function: `stop-loss-${invocationType}`,
          operation: "stop_loss_monitoring",
        });
      } catch (alertError) {
        logInstance.error("Failed to send error alert", alertError);
      }
    }

    throw error;
  }
}

module.exports = {
  performStopLossMonitoring,
};
