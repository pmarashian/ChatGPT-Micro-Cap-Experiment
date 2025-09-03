/**
 * Order Monitor Handler
 * Monitors pending orders for price volatility and executes protective actions
 * Runs during market hours to check for significant price changes
 */

const BrokerageService = require("../../services/brokerage-service");
const MarketDataService = require("../../services/market-data-service");
const Logger = require("../../utils/logger");
const ErrorHandler = require("../../utils/error-handler");
const { validateEnvironment } = require("../../config/environment");

let logger;
let errorHandler;

/**
 * Scheduled Lambda handler for order monitoring
 * Checks pending orders and monitors for price volatility
 */
module.exports.handler = async (event, context) => {
  // Initialize services
  logger = new Logger("order-monitor");
  errorHandler = new ErrorHandler("order-monitor");

  try {
    // Log function start
    logger.logLambdaStart(event, context);

    // Validate environment
    validateEnvironment();

    logger.info("🔍 Starting order monitoring and volatility check");

    // Initialize services
    const brokerageService = new BrokerageService();
    const marketDataService = new MarketDataService();

    // Get all open orders
    logger.info("📋 Fetching open orders");
    const openOrders = await brokerageService.getOpenOrders();

    if (!openOrders || openOrders.length === 0) {
      logger.info("✅ No open orders to monitor");
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: "No open orders to monitor",
          monitoredOrders: 0,
          timestamp: new Date().toISOString(),
        }),
      };
    }

    logger.info(`📊 Monitoring ${openOrders.length} open orders`);

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
            logger.warn(`⚠️ Price volatility alert for ${ticker}`, alert);

            // Could implement automatic actions here:
            // - Cancel order if price deviation is too large
            // - Send email alerts
            // - Adjust limit prices
            // - Notify trading system
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
          logger.warn(`Could not get market data for ${ticker}`);
          monitoringResults.push({
            ticker,
            orderId,
            status: "no_market_data",
          });
        }
      } catch (orderError) {
        logger.error(`Error monitoring order ${order.id}`, orderError);
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

    logger.info("✅ Order monitoring completed", summary);

    // Log function end
    logger.logLambdaEnd(Date.now() - context.getRemainingTimeInMillis());

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Order monitoring completed",
        summary,
        volatilityAlerts,
        monitoringResults,
        timestamp: new Date().toISOString(),
      }),
    };
  } catch (error) {
    logger.error("Order monitoring failed", error);
    await errorHandler.sendErrorAlert(error, {
      function: "order-monitor",
      monitoringType: "volatility_check",
    });

    // Log function end with error
    logger.logLambdaEnd(Date.now() - context.getRemainingTimeInMillis(), false);

    throw error;
  }
};
