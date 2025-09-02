/**
 * Stop-Loss Lambda Handler
 * Monitors positions and executes stop-loss orders automatically
 * Runs every 15 minutes during trading hours
 */

const PortfolioService = require("../../services/portfolio-service");
const MarketDataService = require("../../services/market-data-service");
const BrokerageService = require("../../services/brokerage-service");
const Logger = require("../../utils/logger");
const ErrorHandler = require("../../utils/error-handler");
const { validateEnvironment } = require("../../config/environment");

let logger;
let errorHandler;

/**
 * Lambda handler for stop-loss monitoring and execution
 */
module.exports.handler = async (event, context) => {
  // Initialize services
  logger = new Logger("stop-loss");
  errorHandler = new ErrorHandler("stop-loss");

  try {
    // Log function start
    logger.logLambdaStart(event, context);

    // Validate environment
    validateEnvironment();

    logger.info("Starting stop-loss monitoring");

    // Check if market is open
    const brokerageService = new BrokerageService();
    const isMarketOpen = await brokerageService.isMarketOpen();

    if (!isMarketOpen) {
      logger.info("Market is closed, skipping stop-loss monitoring");
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: "Market is closed",
          stopLossesChecked: 0,
          timestamp: new Date().toISOString(),
        }),
      };
    }

    // Initialize services
    const portfolioService = new PortfolioService();
    const marketDataService = new MarketDataService();

    // 1. Get current portfolio
    logger.info("Fetching current portfolio for stop-loss monitoring");
    const portfolio = await portfolioService.getCurrentPortfolio();

    if (!portfolio.positions || portfolio.positions.length === 0) {
      logger.info("No positions to monitor for stop-loss");
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: "No positions to monitor",
          stopLossesChecked: 0,
          timestamp: new Date().toISOString(),
        }),
      };
    }

    // 2. Check stop-loss triggers
    const stopLossCandidates = portfolio.positions.filter(
      (pos) => pos.stopLoss && pos.stopLoss > 0
    );

    if (stopLossCandidates.length === 0) {
      logger.info("No positions have stop-loss levels set");
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: "No stop-loss levels set",
          positionsMonitored: portfolio.positions.length,
          timestamp: new Date().toISOString(),
        }),
      };
    }

    logger.info(
      `Monitoring ${stopLossCandidates.length} positions for stop-loss triggers`
    );

    // 3. Get current market data for positions with stop losses
    const tickers = stopLossCandidates.map((pos) => pos.ticker);
    const marketDataPromises = tickers.map((ticker) =>
      marketDataService.getStockData(ticker, "1d")
    );

    const marketDataResults = await Promise.allSettled(marketDataPromises);

    // 4. Check for stop-loss triggers
    const stopLossTrades = [];

    for (let i = 0; i < stopLossCandidates.length; i++) {
      const position = stopLossCandidates[i];
      const marketResult = marketDataResults[i];

      if (
        marketResult.status === "fulfilled" &&
        marketResult.value.data.length > 0
      ) {
        const latestData =
          marketResult.value.data[marketResult.value.data.length - 1];
        const currentPrice = latestData.close || latestData.adjClose;
        const lowOfDay = latestData.low;

        if (currentPrice && lowOfDay) {
          // Check if stop-loss was triggered (low of day <= stop loss)
          if (lowOfDay <= position.stopLoss) {
            const executionPrice = Math.min(currentPrice, position.stopLoss);

            logger.warn(`Stop-loss triggered for ${position.ticker}`, {
              stopLoss: position.stopLoss,
              lowOfDay: lowOfDay,
              currentPrice: currentPrice,
              executionPrice: executionPrice,
              shares: position.shares,
            });

            stopLossTrades.push({
              ticker: position.ticker,
              action: "SELL",
              shares: position.shares,
              orderType: "market",
              stopLoss: position.stopLoss,
              triggeredPrice: executionPrice,
              reasoning: `AUTOMATED SELL - STOPLOSS TRIGGERED at $${position.stopLoss.toFixed(
                2
              )}`,
            });
          } else {
            logger.debug(`Stop-loss not triggered for ${position.ticker}`, {
              stopLoss: position.stopLoss,
              currentPrice: currentPrice,
              lowOfDay: lowOfDay,
            });
          }
        }
      }
    }

    // 5. Execute stop-loss trades
    let executedTrades = 0;
    if (stopLossTrades.length > 0) {
      logger.info(`Executing ${stopLossTrades.length} stop-loss trades`);

      for (const trade of stopLossTrades) {
        try {
          // Check if trading is enabled
          if (process.env.EXECUTE_TRADES === "false") {
            logger.info(
              `SIMULATION: Would execute stop-loss for ${trade.ticker}`
            );
            executedTrades++;
            continue;
          }

          const result = await brokerageService.executeTrade(trade);

          // Save trade to portfolio
          await portfolioService.saveTrade({
            ticker: trade.ticker,
            action: trade.action,
            shares: trade.shares,
            price: result.filledPrice,
            aiReasoning: trade.reasoning,
            pnl: (result.filledPrice - trade.triggeredPrice) * trade.shares,
          });

          executedTrades++;
          logger.info(`Stop-loss executed for ${trade.ticker}`, {
            orderId: result.orderId,
            price: result.filledPrice,
            shares: trade.shares,
          });
        } catch (error) {
          logger.error(`Stop-loss execution failed for ${trade.ticker}`, error);
          await errorHandler.sendErrorAlert(error, {
            function: "stop-loss",
            ticker: trade.ticker,
            stopLoss: trade.stopLoss,
          });
        }
      }

      // Update portfolio after stop-loss executions
      if (executedTrades > 0 && process.env.EXECUTE_TRADES !== "false") {
        const updatedPortfolio = await portfolioService.getCurrentPortfolio();
        logger.info("Portfolio updated after stop-loss executions", {
          totalValue: updatedPortfolio.totalValue,
          cash: updatedPortfolio.cash,
        });
      }
    }

    logger.info("Stop-loss monitoring completed", {
      positionsMonitored: stopLossCandidates.length,
      stopLossesTriggered: stopLossTrades.length,
      tradesExecuted: executedTrades,
    });

    // Log function end
    logger.logLambdaEnd(Date.now() - context.getRemainingTimeInMillis());

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Stop-loss monitoring completed",
        positionsMonitored: stopLossCandidates.length,
        stopLossesTriggered: stopLossTrades.length,
        tradesExecuted: executedTrades,
        timestamp: new Date().toISOString(),
      }),
    };
  } catch (error) {
    logger.error("Stop-loss monitoring failed", error);
    await errorHandler.sendErrorAlert(error, { function: "stop-loss" });

    // Log function end with error
    logger.logLambdaEnd(Date.now() - context.getRemainingTimeInMillis(), false);

    throw error;
  }
};
