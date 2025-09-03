/**
 * Test Brokerage Connection API Handler
 * Tests Alpaca API connectivity and credentials
 */

const BrokerageService = require("../../services/brokerage-service");
const Logger = require("../../utils/logger");
const ErrorHandler = require("../../utils/error-handler");
const { validateEnvironment } = require("../../config/environment");

let logger;
let errorHandler;

/**
 * Lambda handler for POST /api/test-brokerage
 */
module.exports.handler = async (event, context) => {
  // Initialize services
  logger = new Logger("test-brokerage");
  errorHandler = new ErrorHandler("test-brokerage");

  try {
    // Log function start
    logger.logLambdaStart(event, context);

    // Validate environment
    validateEnvironment();

    logger.info("Testing brokerage API connection");

    const brokerageService = new BrokerageService();
    const testResults = {
      timestamp: new Date().toISOString(),
      tests: {},
      overall: "unknown",
    };

    // Test 1: Account Info
    try {
      logger.info("Testing account info endpoint");
      const accountInfo = await brokerageService.getAccountInfo();

      testResults.tests.account = {
        status: "success",
        data: {
          id: accountInfo.id,
          status: accountInfo.status,
          cash: accountInfo.cash,
          equity: accountInfo.equity,
          buyingPower: accountInfo.buying_power,
        },
      };
    } catch (error) {
      testResults.tests.account = {
        status: "failed",
        error: error.message,
        code: error.response?.status,
      };
    }

    // Test 2: Portfolio/Positions
    try {
      logger.info("Testing portfolio endpoint");
      const positions = await brokerageService.getPortfolio();

      testResults.tests.portfolio = {
        status: "success",
        positionCount: positions.length,
        positions: positions.map((p) => ({
          ticker: p.ticker,
          shares: p.shares,
          marketValue: p.marketValue,
        })),
      };
    } catch (error) {
      testResults.tests.portfolio = {
        status: "failed",
        error: error.message,
        code: error.response?.status,
      };
    }

    // Test 3: Recent Orders (if any)
    try {
      logger.info("Testing orders endpoint");
      const orders = await brokerageService.getRecentOrders(5);

      testResults.tests.orders = {
        status: "success",
        recentOrderCount: orders.length,
      };
    } catch (error) {
      testResults.tests.orders = {
        status: "failed",
        error: error.message,
        code: error.response?.status,
      };
    }

    // Test 4: Trading Permissions (try a test order)
    try {
      logger.info("Testing trading permissions with dry run");

      // Create a test order that won't execute (very small quantity)
      const testOrder = {
        ticker: "AAPL",
        action: "BUY",
        shares: 1,
        orderType: "limit",
        limitPrice: "1.00", // Very low price, won't execute
        timeInForce: "day",
      };

      await brokerageService.executeTrade(testOrder);

      testResults.tests.trading = {
        status: "success",
        message: "Trading permissions confirmed",
      };
    } catch (error) {
      testResults.tests.trading = {
        status: "failed",
        error: error.message,
        code: error.response?.status,
        message: "Account may not be approved for trading",
      };
    }

    // Determine overall status
    const failedTests = Object.values(testResults.tests).filter(
      (test) => test.status === "failed"
    ).length;
    const totalTests = Object.keys(testResults.tests).length;

    if (failedTests === 0) {
      testResults.overall = "healthy";
    } else if (failedTests === totalTests) {
      testResults.overall = "failed";
    } else {
      testResults.overall = "degraded";
    }

    // Add configuration info (without exposing secrets)
    testResults.config = {
      baseUrl: process.env.ALPACA_BASE_URL,
      keyConfigured: !!process.env.ALPACA_KEY_ID,
      secretConfigured: !!process.env.ALPACA_SECRET_KEY,
      isPaperTrading: process.env.ALPACA_BASE_URL?.includes("paper-api"),
    };

    logger.info("Brokerage connection test completed", {
      overall: testResults.overall,
      accountTest: testResults.tests.account.status,
      portfolioTest: testResults.tests.portfolio.status,
      ordersTest: testResults.tests.orders.status,
      tradingTest: testResults.tests.trading?.status || "not_tested",
    });

    // Log function end
    logger.logLambdaEnd(Date.now() - context.getRemainingTimeInMillis());

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
      body: JSON.stringify(testResults),
    };
  } catch (error) {
    logger.error("Brokerage connection test failed", error);

    // Log function end with error
    logger.logLambdaEnd(Date.now() - context.getRemainingTimeInMillis(), false);

    return errorHandler.createErrorResponse(error);
  }
};
