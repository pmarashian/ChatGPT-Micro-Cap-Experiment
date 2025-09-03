#!/usr/bin/env node

/**
 * Test script for the new manual HTTP POST logger
 */

const Logger = require("./src/utils/logger");

// Test basic logging functionality
async function testLogger() {
  console.log("Testing new logger implementation...\n");

  // Create a logger instance
  const logger = Logger.create("test-context");

  // Test basic log levels
  logger.info("This is an info message", { userId: 123, action: "login" });
  logger.warn("This is a warning message", { warningType: "deprecated" });
  logger.error("This is an error message", {
    errorCode: 500,
    stack: "fake stack",
  });
  logger.debug("This is a debug message", { debugData: { key: "value" } });

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

  // Wait a bit for batching to trigger
  console.log("\nWaiting 2 seconds for batch processing...");
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Force flush remaining logs
  console.log("Forcing flush of remaining logs...");
  await logger.flush();

  console.log("\nLogger test completed successfully!");
}

// Run the test
testLogger().catch(console.error);
