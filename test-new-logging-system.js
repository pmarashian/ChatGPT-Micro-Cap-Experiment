#!/usr/bin/env node

/**
 * Test script for the new logging system with logReceiver and logProcessor
 */

const Logger = require("./src/utils/logger");

// Test basic logging functionality
async function testNewLoggingSystem() {
  console.log(
    "Testing new logging system with logReceiver and logProcessor...\n"
  );

  // Create a logger instance
  const logger = Logger.create("test-context");

  // Test basic log levels
  logger.info("This is an info message from new system", {
    userId: 123,
    action: "login",
  });
  logger.warn("This is a warning message from new system", {
    warningType: "deprecated",
  });
  logger.error("This is an error message from new system", {
    errorCode: 500,
    stack: "fake stack",
  });
  logger.debug("This is a debug message from new system", {
    debugData: { key: "value" },
  });

  // Test business logic methods
  logger.logTradeDecision({
    ticker: "AAPL",
    action: "BUY",
    shares: 100,
    reasoning: "AI predicted growth",
    confidence: 0.85,
  });

  logger.logTradeExecution(
    "order-123",
    {
      ticker: "AAPL",
      action: "BUY",
      shares: 100,
      price: 150.5,
    },
    true
  );

  logger.logPortfolioUpdate({
    totalValue: 10000,
    cash: 5000,
    positions: [{ ticker: "AAPL", shares: 100 }],
    lastUpdated: new Date().toISOString(),
  });

  logger.logApiCall("alpaca", "getAccount", true, 250);

  // Test Lambda methods
  logger.logLambdaStart(
    { body: "{}" },
    {
      awsRequestId: "test-request-id",
      functionName: "test-function",
    }
  );

  logger.logLambdaEnd(150, true);

  // Wait a bit for batching to trigger and logs to be sent
  console.log("\nWaiting 5 seconds for batch processing and HTTP requests...");
  await new Promise((resolve) => setTimeout(resolve, 5000));

  // Force flush remaining logs
  console.log("Forcing flush of remaining logs...");
  await logger.flush();

  console.log("\nNew logging system test completed successfully!");
  console.log("Check your logReceiver endpoint and logProcessor for the logs.");
}

// Run the test
testNewLoggingSystem().catch(console.error);
