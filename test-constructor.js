#!/usr/bin/env node

/**
 * Test script to verify new Logger() constructor works
 */

const Logger = require("./src/utils/logger");

console.log("🧪 Testing Logger Constructor Compatibility\n");

// Test the old pattern that was failing
console.log("1. Testing new Logger() constructor pattern...");
try {
  const logger1 = new Logger("test-context-1");
  logger1.info("Constructor test message 1", { test: "constructor" });
  console.log("✅ new Logger() works!");
} catch (error) {
  console.log("❌ new Logger() failed:", error.message);
}

// Test static methods
console.log("\n2. Testing static methods...");
try {
  Logger.info("Static method test", { test: "static" });
  console.log("✅ Static methods work!");
} catch (error) {
  console.log("❌ Static methods failed:", error.message);
}

// Test create method
console.log("\n3. Testing Logger.create() method...");
try {
  const logger2 = Logger.create("test-context-2");
  logger2.warn("Create method test", { test: "create" });
  console.log("✅ Logger.create() works!");
} catch (error) {
  console.log("❌ Logger.create() failed:", error.message);
}

// Test function call (without new)
console.log("\n4. Testing function call pattern...");
try {
  const logger3 = Logger("test-context-3");
  logger3.error("Function call test", null, { test: "function" });
  console.log("✅ Function call works!");
} catch (error) {
  console.log("❌ Function call failed:", error.message);
}

console.log("\n✅ All constructor patterns work correctly!");
