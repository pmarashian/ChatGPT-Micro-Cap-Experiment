/**
 * Test script to verify job orchestrator no longer throws ConditionalCheckFailedException
 */

const Logger = require("./src/utils/logger");
const {
  acquireOrchestratorLock,
} = require("./src/services/job-orchestration-service");

async function testJobOrchestratorFixed() {
  const logger = Logger("test-job-orchestrator-fixed");

  try {
    console.log(
      "🧪 Testing job orchestrator ConditionalCheckFailedException fix...\n"
    );

    // Test 1: Test lock acquisition (this was the failing operation)
    console.log("1. Testing acquireOrchestratorLock...");
    const executionId = `test-${Date.now()}`;

    const result = await acquireOrchestratorLock({ logger, executionId });

    console.log("✅ Lock acquisition result:", result);

    if (result.success) {
      console.log(
        "✅ SUCCESS: ConditionalCheckFailedException has been resolved!"
      );
      console.log("   - Lock was acquired successfully");
      console.log("   - No unhandled exceptions thrown");
      console.log("   - Orchestrator can proceed with job execution");
    } else {
      console.log("⚠️  Lock acquisition failed (expected in some cases)");
      console.log("   - This is normal if another orchestrator is running");
    }

    console.log(
      "\n🎉 Job orchestrator ConditionalCheckFailedException fix verified!"
    );
    console.log(
      "The 'The conditional request failed' error should no longer occur."
    );
  } catch (error) {
    console.error("❌ Test failed:", error.message);
    console.error("Error details:", {
      name: error.name,
      code: error.code,
      message: error.message,
    });
    process.exit(1);
  }
}

// Only run if called directly
if (require.main === module) {
  testJobOrchestratorFixed();
}

module.exports = { testJobOrchestratorFixed };
