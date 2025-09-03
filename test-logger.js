#!/usr/bin/env node

/**
 * Test script for the new proxy-based Logtail logger
 */

const Logger = require("./src/utils/logger");

async function testLogger() {
  console.log("🧪 Testing Proxy-based Logtail Logger\n");

  // Test basic logging methods
  console.log("1. Testing basic logging methods...");
  Logger.info("This is an info message", {
    user: "test-user",
    action: "login",
  });
  Logger.warn("This is a warning message", { warningType: "deprecated" });
  Logger.error("This is an error message", new Error("Test error"), {
    errorCode: 500,
  });
  Logger.debug("This is a debug message", { debugInfo: "extra data" });

  // Test business logic methods
  console.log("\n2. Testing business logic methods...");
  Logger.logTradeDecision({
    ticker: "AAPL",
    action: "BUY",
    shares: 100,
    reasoning: "Strong momentum",
    confidence: 0.85,
  });

  Logger.logTradeExecution(
    "order-123",
    {
      ticker: "AAPL",
      action: "BUY",
      shares: 100,
      price: 150.25,
    },
    true
  );

  Logger.logPortfolioUpdate({
    totalValue: 15000.5,
    cash: 5000.0,
    positions: [{ ticker: "AAPL", shares: 100 }],
    lastUpdated: new Date().toISOString(),
  });

  Logger.logApiCall("alpaca", "getAccount", true, 250);

  // Test lambda methods
  console.log("\n3. Testing Lambda methods...");
  Logger.logLambdaStart(
    { type: "test" },
    {
      awsRequestId: "test-request-id",
      functionName: "test-function",
    }
  );

  Logger.logLambdaEnd(1250, true);

  // Test context-specific logger
  console.log("\n4. Testing context-specific logger...");
  const apiLogger = Logger.create("api-service");
  apiLogger.info("API request received", {
    endpoint: "/portfolio",
    method: "GET",
  });
  apiLogger.warn("Rate limit approaching", { remaining: 5 });

  // Wait a bit for batch processing
  console.log("\n5. Waiting for batch processing...");
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Manual flush
  console.log("\n6. Manual flush...");
  await Logger.flush();

  console.log("\n✅ Logger test completed!");
  console.log("Check your Logtail dashboard and console output for results.");
}

// Handle errors
process.on("unhandledRejection", (error) => {
  console.error("Unhandled rejection:", error);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
  process.exit(1);
});

// Run the test
testLogger().catch(console.error);
