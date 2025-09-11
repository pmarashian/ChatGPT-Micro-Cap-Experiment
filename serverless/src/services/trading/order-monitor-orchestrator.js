/**
 * Order Monitor Orchestrator
 * Shared function for both manual and scheduled order monitoring
 */

const BrokerageService = require("../brokerage-service");
const MarketDataService = require("../market-data-service");
const Logger = require("../../utils/logger");
const ErrorHandler = require("../../utils/error-handler");

/**
 * Execute order monitoring with consistent orchestration
 * @param {Object} options - Configuration options
 * @param {string} options.invocationType - 'manual' or 'scheduled'
 * @param {Object} options.logger - Optional logger instance
 * @param {Object} options.errorHandler - Optional error handler instance
 * @returns {Promise<Object>} Order monitoring results
 */
async function performOrderMonitoring(options = {}) {
  const { invocationType = "manual", logger, errorHandler } = options;

  // Use provided logger/errorHandler or create new ones
  const logInstance = logger || new Logger(`order-monitor-${invocationType}`);
  const errorHandlerInstance =
    errorHandler || new ErrorHandler(`order-monitor-${invocationType}`);

  try {
    // Log function start
    logInstance.info(
      `🔍 Starting ${invocationType} order monitoring and volatility check`
    );

    // Initialize services
    const brokerageService = new BrokerageService();
    const marketDataService = new MarketDataService();

    // Get all open orders
    logInstance.info("📋 Fetching open orders");
    const openOrders = await brokerageService.getOpenOrders();

    if (!openOrders || openOrders.length === 0) {
      logInstance.info("✅ No open orders to monitor");
      return {
        message: "No open orders to monitor",
        monitoredOrders: 0,
        timestamp: new Date().toISOString(),
      };
    }

    logInstance.info(`📊 Monitoring ${openOrders.length} open orders`);

    const monitoringResults = [];
    const volatilityAlerts = [];

    // Monitor each open order
    for (const order of openOrders) {
      try {
        const ticker = order.symbol;
        const orderId = order.id;
        const orderType = order.type;
        const submittedPrice = order.limit_price || order.stop_price;

        // Get current market data for this ticker
        const marketData = await marketDataService.getPortfolioMarketData({
          positions: [{ ticker }],
        });

        if (marketData[ticker]?.data?.length > 0) {
          const currentPrice =
            marketData[ticker].data[marketData[ticker].data.length - 1].close;
          const volatilityThreshold = 0.08; // 8% threshold for limit orders

          let priceChange = 0;
          let actionTaken = null;

          // Check for significant price deviation
          if (submittedPrice && currentPrice) {
            if (
              order.side === "buy" &&
              currentPrice > submittedPrice * (1 + volatilityThreshold)
            ) {
              // Buy limit price is too low compared to current price
              priceChange =
                ((currentPrice - submittedPrice) / submittedPrice) * 100;
              actionTaken = "PRICE_ALERT_BUY_TOO_LOW";
            } else if (
              order.side === "sell" &&
              currentPrice < submittedPrice * (1 - volatilityThreshold)
            ) {
              // Sell limit price is too high compared to current price
              priceChange =
                ((submittedPrice - currentPrice) / submittedPrice) * 100;
              actionTaken = "PRICE_ALERT_SELL_TOO_HIGH";
            }
          }

          // Log significant price changes
          if (Math.abs(priceChange) > 5) {
            // Log any change > 5%
            const alert = {
              ticker,
              orderId,
              orderType,
              submittedPrice,
              currentPrice,
              priceChangePercent: priceChange.toFixed(2),
              actionTaken,
              timestamp: new Date().toISOString(),
            };

            volatilityAlerts.push(alert);
            logInstance.warn(`⚠️ Price volatility alert for ${ticker}`, alert);
          }

          monitoringResults.push({
            ticker,
            orderId,
            orderType,
            submittedPrice,
            currentPrice,
            priceChangePercent: priceChange.toFixed(2),
            status: "monitored",
          });
        } else {
          logInstance.warn(`Could not get market data for ${ticker}`);
          monitoringResults.push({
            ticker,
            orderId,
            status: "no_market_data",
          });
        }
      } catch (orderError) {
        logInstance.error(`Error monitoring order ${order.id}`, orderError);
        monitoringResults.push({
          ticker: order.symbol,
          orderId: order.id,
          status: "error",
          error: orderError.message,
        });
      }
    }

    const summary = {
      totalOrdersMonitored: monitoringResults.length,
      volatilityAlerts: volatilityAlerts.length,
      alertsByType: volatilityAlerts.reduce((acc, alert) => {
        acc[alert.actionTaken] = (acc[alert.actionTaken] || 0) + 1;
        return acc;
      }, {}),
      monitoredTickers: [...new Set(monitoringResults.map((r) => r.ticker))]
        .length,
    };

    logInstance.info("✅ Order monitoring completed", summary);

    return {
      message: "Order monitoring completed",
      summary,
      volatilityAlerts,
      monitoringResults,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    logInstance.error(`Order monitoring failed`, error);

    // Send error alert if error handler provided
    if (errorHandlerInstance) {
      try {
        await errorHandlerInstance.sendErrorAlert(error, {
          function: `order-monitor-${invocationType}`,
          monitoringType: "volatility_check",
        });
      } catch (alertError) {
        logInstance.error("Failed to send error alert", alertError);
      }
    }

    throw error;
  }
}

module.exports = {
  performOrderMonitoring,
};
