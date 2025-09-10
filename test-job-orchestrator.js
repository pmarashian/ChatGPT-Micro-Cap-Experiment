/**
 * Test script to verify job orchestrator DynamoDB operations work with AWS SDK v3
 */

const Logger = require("./src/utils/logger");
const {
  acquireOrchestratorLock,
  getAllOrchestratorLocks,
} = require("./src/services/job-orchestration-service");

async function testJobOrchestrator() {
  const logger = Logger("test-job-orchestrator");

  try {
    console.log("🧪 Testing job orchestrator DynamoDB operations...");

    // Test acquiring an orchestrator lock
    console.log("1. Testing acquireOrchestratorLock...");
    const executionId = `test-${Date.now()}`;
    const lockResult = await acquireOrchestratorLock({ logger, executionId });

    console.log("Lock result:", lockResult);

    // Test getting all orchestrator locks
    console.log("2. Testing getAllOrchestratorLocks...");
    const locks = await getAllOrchestratorLocks(logger);

    console.log("Found locks:", locks.length);

    console.log("✅ All tests passed! DynamoDB operations working correctly.");
  } catch (error) {
    console.error("❌ Test failed:", error.message);
    console.error("Stack:", error.stack);
    process.exit(1);
  }
}

// Only run if called directly
if (require.main === module) {
  testJobOrchestrator();
}

module.exports = { testJobOrchestrator };
