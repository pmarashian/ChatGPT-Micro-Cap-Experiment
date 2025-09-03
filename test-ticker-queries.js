/**
 * Test script for new ticker-based DynamoDB queries
 * Tests the new functionality for querying data by ticker
 */

const AIMemoryService = require("./src/services/ai-memory-service");
const Logger = require("./src/utils/logger");

const logger = new Logger("test-ticker-queries");

async function testTickerQueries() {
  const memoryService = new AIMemoryService();

  try {
    logger.info("Starting ticker query tests...");

    // Test tickers to query
    const testTickers = ["OCUP", "BPTH", "PDSB"];

    for (const ticker of testTickers) {
      logger.info(`Testing queries for ${ticker}`);

      // Test individual query methods
      const research = await memoryService.getTickerResearch(ticker, 5);
      const decisions = await memoryService.getTickerDecisions(ticker, 10);
      const marketData = await memoryService.getTickerMarketData(ticker, 3);
      const trades = await memoryService.getTickerTrades(ticker, 20);

      logger.info(`${ticker} query results:`, {
        researchItems: research.length,
        decisionItems: decisions.length,
        marketDataPoints: marketData.length,
        tradeItems: trades.length,
      });

      // Test complete history query
      const completeHistory = await memoryService.getCompleteTickerHistory(
        ticker
      );
      logger.info(`${ticker} complete history:`, completeHistory.summary);
    }

    logger.info("Ticker query tests completed successfully!");
  } catch (error) {
    logger.error("Ticker query tests failed", error);
    throw error;
  }
}

/**
 * Test the new API endpoint structure
 */
async function testAPIEndpointStructure() {
  const GetTickerHistoryHandler = require("./src/handlers/api/get-ticker-history");

  try {
    logger.info("Testing API endpoint structure...");

    const handler = new GetTickerHistoryHandler();

    // Simulate API call
    const mockEvent = {
      queryStringParameters: {
        ticker: "OCUP",
        includeTrades: "true",
      },
    };

    const response = await handler.handle(mockEvent);

    logger.info("API endpoint test successful:", {
      statusCode: response.statusCode,
      hasData: !!response.body,
    });

    const responseBody = JSON.parse(response.body);
    if (responseBody.success) {
      logger.info("API returned data:", responseBody.data.summary);
    }
  } catch (error) {
    logger.error("API endpoint test failed", error);
    throw error;
  }
}

// Run tests if called directly
if (require.main === module) {
  Promise.all([testTickerQueries(), testAPIEndpointStructure()])
    .then(() => {
      console.log("✅ All tests completed successfully!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Tests failed:", error);
      process.exit(1);
    });
}

module.exports = {
  testTickerQueries,
  testAPIEndpointStructure,
};
