const MarketDataService = require("../../services/market-data-service");
const Logger = require("../../utils/logger");
const ErrorHandler = require("../../utils/error-handler");
const { validateEnvironment } = require("../../config/environment");

let logger;
let errorHandler;

/**
 * Lambda handler for GET /api/test-market-data
 */
module.exports.handler = async (event, context) => {
  // Initialize services
  logger = new Logger("test-market-data");
  errorHandler = new ErrorHandler("test-market-data");

  try {
    // Log function start
    logger.logLambdaStart(event, context);

    // Validate environment
    validateEnvironment();

    logger.info("Testing market data fetching for XBI");

    const marketDataService = new MarketDataService();

    // Test XBI specifically
    const xbiData = await marketDataService.getStockData("XBI", "1d");

    logger.info("XBI Market Data Result", {
      source: xbiData.source,
      dataPoints: xbiData.data.length,
      lastUpdated: xbiData.lastUpdated,
    });

    if (xbiData.data.length > 0) {
      const latest = xbiData.data[xbiData.data.length - 1];
      logger.info("Latest XBI Data", {
        date: latest.date,
        close: latest.close,
        volume: latest.volume,
      });
    }

    // Test all tickers
    const tickers = ["SPY", "IWO", "XBI", "IWM"];
    const allResults = {};

    for (const ticker of tickers) {
      try {
        const data = await marketDataService.getStockData(ticker, "1d");
        allResults[ticker] = {
          source: data.source,
          dataPoints: data.data.length,
          latestPrice:
            data.data.length > 0 ? data.data[data.data.length - 1].close : null,
          latestDate:
            data.data.length > 0 ? data.data[data.data.length - 1].date : null,
        };
      } catch (error) {
        allResults[ticker] = {
          error: error.message,
        };
      }
    }

    const response = {
      success: true,
      timestamp: new Date().toISOString(),
      xbiSpecific: {
        source: xbiData.source,
        latestPrice:
          xbiData.data.length > 0
            ? xbiData.data[xbiData.data.length - 1].close
            : null,
        dataPoints: xbiData.data.length,
      },
      allTickers: allResults,
      alpacaComparison: {
        userReported: 92.86,
        systemPrice:
          xbiData.data.length > 0
            ? xbiData.data[xbiData.data.length - 1].close
            : null,
        difference:
          xbiData.data.length > 0
            ? (xbiData.data[xbiData.data.length - 1].close - 92.86).toFixed(2)
            : null,
      },
    };

    logger.info("Market data test completed", response);

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
      body: JSON.stringify(response, null, 2),
    };
  } catch (error) {
    logger.error("Market data test failed", error);

    // Log function end with error
    logger.logLambdaEnd(Date.now() - context.getRemainingTimeInMillis(), false);

    return errorHandler.createErrorResponse(error);
  }
};
