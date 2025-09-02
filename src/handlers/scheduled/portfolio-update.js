/**
 * Portfolio Update Lambda Handler
 * Updates portfolio positions and recalculates values
 * Runs after daily trading to ensure accurate portfolio state
 */

const PortfolioService = require("../../services/portfolio-service");
const MarketDataService = require("../../services/market-data-service");
const Logger = require("../../utils/logger");
const ErrorHandler = require("../../utils/error-handler");
const { validateEnvironment } = require("../../config/environment");

let logger;
let errorHandler;

/**
 * Lambda handler for portfolio updates
 */
module.exports.handler = async (event, context) => {
  // Initialize services
  logger = new Logger("portfolio-update");
  errorHandler = new ErrorHandler("portfolio-update");

  try {
    // Log function start
    logger.logLambdaStart(event, context);

    // Validate environment
    validateEnvironment();

    logger.info("Starting portfolio update");

    // Initialize services
    const portfolioService = new PortfolioService();
    const marketDataService = new MarketDataService();

    // 1. Get current portfolio
    logger.info("Fetching current portfolio");
    const portfolio = await portfolioService.getCurrentPortfolio();

    if (!portfolio.positions || portfolio.positions.length === 0) {
      logger.info("No positions to update");
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: "No positions to update",
          portfolioValue: portfolio.totalValue,
          cash: portfolio.cash,
          timestamp: new Date().toISOString(),
        }),
      };
    }

    // 2. Get current market data for all positions
    logger.info(
      `Updating market data for ${portfolio.positions.length} positions`
    );
    const tickers = portfolio.positions.map((pos) => pos.ticker);

    const marketDataPromises = tickers.map((ticker) =>
      marketDataService.getStockData(ticker, "1d")
    );

    const marketDataResults = await Promise.allSettled(marketDataPromises);

    // 3. Update portfolio with current prices
    let updatedPositions = 0;
    let totalValue = portfolio.cash;

    for (let i = 0; i < portfolio.positions.length; i++) {
      const position = portfolio.positions[i];
      const marketResult = marketDataResults[i];

      if (
        marketResult.status === "fulfilled" &&
        marketResult.value.data.length > 0
      ) {
        const latestData =
          marketResult.value.data[marketResult.value.data.length - 1];
        const currentPrice = latestData.close || latestData.adjClose;

        if (currentPrice) {
          position.currentPrice = currentPrice;
          position.marketValue = position.shares * currentPrice;
          position.unrealizedPnL = position.marketValue - position.costBasis;
          position.unrealizedPnLPercent =
            (position.unrealizedPnL / position.costBasis) * 100;

          totalValue += position.marketValue;
          updatedPositions++;

          logger.debug(
            `Updated ${position.ticker}: $${currentPrice.toFixed(2)}`
          );
        }
      } else {
        logger.warn(
          `Failed to update price for ${position.ticker}`,
          marketResult.reason
        );
      }
    }

    // 4. Update portfolio totals
    portfolio.totalValue = totalValue;
    portfolio.equity = totalValue - portfolio.cash;
    portfolio.lastUpdated = new Date().toISOString();

    // 5. Save updated portfolio
    await portfolioService.savePortfolio(portfolio);

    logger.info("Portfolio update completed", {
      positionsUpdated: updatedPositions,
      totalValue: portfolio.totalValue,
      cash: portfolio.cash,
      equity: portfolio.equity,
    });

    // Log function end
    logger.logLambdaEnd(Date.now() - context.getRemainingTimeInMillis());

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Portfolio update completed successfully",
        positionsUpdated: updatedPositions,
        totalValue: portfolio.totalValue,
        cash: portfolio.cash,
        equity: portfolio.equity,
        timestamp: new Date().toISOString(),
      }),
    };
  } catch (error) {
    logger.error("Portfolio update failed", error);
    await errorHandler.sendErrorAlert(error, { function: "portfolio-update" });

    // Log function end with error
    logger.logLambdaEnd(Date.now() - context.getRemainingTimeInMillis(), false);

    throw error;
  }
};
