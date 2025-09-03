#!/usr/bin/env node

/**
 * Direct test of the logger to see if it's working
 */

const Logger = require("./src/utils/logger");

async function testLoggerDirect() {
  console.log("Testing logger directly...\n");

  const logger = Logger.create("direct-test");

  // Add some test logs
  logger.info("Direct logger test - info message", { test: "data" });
  logger.warn("Direct logger test - warning message");
  logger.error("Direct logger test - error message", { errorCode: 500 });

  // Wait for batching
  console.log("Waiting for batch processing...");
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Force flush
  await logger.flush();

  console.log("Direct logger test completed");
}

testLoggerDirect().catch(console.error);
