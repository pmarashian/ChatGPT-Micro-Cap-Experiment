/**
 * Test Trading Execution API Handler
 * Tests the exact trading order that the AI generated
 */

const BrokerageService = require("../../services/brokerage-service");
const Logger = require("../../utils/logger");
const ErrorHandler = require("../../utils/error-handler");
const { validateEnvironment } = require("../../config/environment");

let logger;
let errorHandler;

/**
 * Lambda handler for POST /api/test-trading
 */
module.exports.handler = async (event, context) => {
  // Initialize services
  logger = new Logger("test-trading");
  errorHandler = new ErrorHandler("test-trading");

  try {
    // Log function start
    logger.logLambdaStart(event, context);

    // Validate environment
    validateEnvironment();

    logger.info("Testing trading execution with AI-generated order");

    const brokerageService = new BrokerageService();

    // Test both the AI-generated order and a simpler working order
    const aiGeneratedOrder = {
      ticker: "XBI",
      action: "BUY",
      shares: 11,
      orderType: "market",
      limitPrice: null,
      timeInForce: "day",
      stopLoss: 80,
    };

    const simpleWorkingOrder = {
      ticker: "AAPL",
      action: "BUY",
      shares: 1,
      orderType: "limit",
      limitPrice: "1.00", // Very low price, won't execute
      timeInForce: "day",
    };

    // Test with same parameters as test-brokerage but different approach
    const exactWorkingOrder = {
      ticker: "AAPL",
      action: "BUY",
      shares: 1,
      orderType: "limit",
      limitPrice: "1.00",
      timeInForce: "day",
    };

    // Test just the working order first
    logger.info("=== TESTING WORKING ORDER ===");
    logger.info("Order details", simpleWorkingOrder);

    try {
      const simpleResult = await brokerageService.executeTrade(
        simpleWorkingOrder
      );
      logger.info("✅ WORKING ORDER SUCCEEDED", simpleResult);
      // Continue to test other orders instead of returning
    } catch (simpleError) {
      logger.error("❌ WORKING ORDER FAILED", simpleError);
      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
        },
        body: JSON.stringify({
          success: false,
          message: "Even working order failed - check Alpaca connection",
          orderData: simpleWorkingOrder,
          error: simpleError.message,
          timestamp: new Date().toISOString(),
        }),
      };
    }

    // Test AI order without stop loss
    logger.info("=== TESTING AI ORDER WITHOUT STOP LOSS ===");
    const aiOrderNoStopLoss = {
      ...aiGeneratedOrder,
      stopLoss: null,
    };
    logger.info("Order details", aiOrderNoStopLoss);

    try {
      const noStopResult = await brokerageService.executeTrade(
        aiOrderNoStopLoss
      );
      logger.info("✅ AI ORDER WITHOUT STOP LOSS SUCCEEDED", noStopResult);
    } catch (noStopError) {
      logger.error("❌ AI ORDER WITHOUT STOP LOSS FAILED", noStopError);
    }

    // Test variations to isolate the issue
    const testVariations = [
      {
        name: "XBI Market Order (no stop loss)",
        order: {
          ticker: "XBI",
          action: "BUY",
          shares: 1,
          orderType: "market",
          limitPrice: null,
          timeInForce: "day",
          stopLoss: null,
        },
      },
      {
        name: "XBI Market Order (with stop loss)",
        order: {
          ticker: "XBI",
          action: "BUY",
          shares: 1,
          orderType: "market",
          limitPrice: null,
          timeInForce: "day",
          stopLoss: 80,
        },
      },
      {
        name: "XBI Market Order (11 shares, no stop loss)",
        order: {
          ticker: "XBI",
          action: "BUY",
          shares: 5,
          orderType: "market",
          limitPrice: null,
          timeInForce: "day",
          stopLoss: null,
        },
      },
      {
        name: "Original AI Order",
        order: aiGeneratedOrder,
      },
    ];

    const results = {
      timestamp: new Date().toISOString(),
      tests: [],
    };

    for (const test of testVariations) {
      logger.info(`=== TESTING: ${test.name} ===`);
      logger.info("Order details", test.order);

      try {
        const result = await brokerageService.executeTrade(test.order);
        logger.info(`✅ ${test.name} SUCCEEDED`, result);

        results.tests.push({
          name: test.name,
          success: true,
          order: test.order,
          result: result,
        });

        // Continue testing all variations, don't return early
      } catch (error) {
        logger.error(`❌ ${test.name} FAILED`, error);

        results.tests.push({
          name: test.name,
          success: false,
          order: test.order,
          error: {
            message: error.message,
            status: error.response?.status,
            details: error.response?.data,
          },
        });
      }
    }

    // Return results of all tests
    const successfulTests = results.tests.filter((test) => test.success);
    const failedTests = results.tests.filter((test) => !test.success);

    if (successfulTests.length > 0) {
      // At least one test succeeded
      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
        },
        body: JSON.stringify({
          success: true,
          message: `${successfulTests.length} tests succeeded, ${failedTests.length} failed`,
          successfulTests: successfulTests,
          failedTests: failedTests,
          allResults: results,
          timestamp: new Date().toISOString(),
        }),
      };
    } else {
      // All tests failed
      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
        },
        body: JSON.stringify({
          success: false,
          message: "All order variations failed",
          failedTests: failedTests,
          allResults: results,
          timestamp: new Date().toISOString(),
        }),
      };
    }
  } catch (error) {
    logger.error("Trading test failed", error);

    // Log function end with error
    logger.logLambdaEnd(Date.now() - context.getRemainingTimeInMillis(), false);

    return errorHandler.createErrorResponse(error);
  }
};
