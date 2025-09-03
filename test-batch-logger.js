#!/usr/bin/env node

/**
 * Test script to verify batching functionality
 */

const Logger = require("./src/utils/logger");

async function testBatching() {
  console.log("🧪 Testing Logger Batching\n");

  console.log("Generating 15 log messages (batch size is 10)...");

  // Generate more than batch size to trigger immediate flush
  for (let i = 1; i <= 15; i++) {
    Logger.info(`Batch test message ${i}`, {
      batchId: i,
      timestamp: new Date().toISOString(),
      testData: "batching-verification",
    });
  }

  console.log("\nWaiting for automatic batch processing...");
  await new Promise((resolve) => setTimeout(resolve, 6000)); // Wait for flush interval

  console.log("Manual flush...");
  await Logger.flush();

  console.log("\n✅ Batching test completed!");
  console.log("Check your Logtail dashboard for batched log entries.");
}

// Run the test
testBatching().catch(console.error);
