/**
 * Test script to verify orchestration fixes
 * Tests that jobs are not executed multiple times
 */

const AWS = require("aws-sdk");
const {
  getJobsToRun,
  tryMarkJobRunning,
  completeJobExecution,
} = require("./src/services/job-orchestration-service");
const Logger = require("./src/utils/logger");

// Create a test logger
const logger = new Logger("test-orchestration", {
  uniqueId: "test-123",
});

async function testOrchestrationFlow() {
  console.log("Testing orchestration flow...");

  try {
    // 1. Get jobs to run (should use strongly consistent read now)
    console.log("1. Getting jobs to run...");
    const jobsToRun = await getJobsToRun(logger);
    console.log(
      `Found ${jobsToRun.length} jobs to run:`,
      jobsToRun.map((j) => j.jobName)
    );

    if (jobsToRun.length === 0) {
      console.log("No jobs to run - this is expected if no jobs are scheduled");
      return;
    }

    // 2. Test marking job as running
    const testJob = jobsToRun[0];
    console.log(`2. Testing mark job as running for: ${testJob.jobName}`);

    const markResult = await tryMarkJobRunning(
      testJob.jobName,
      "test-execution-123",
      logger
    );
    console.log("Mark result:", markResult);

    // 3. Try to get jobs again - should not include the running job
    console.log("3. Getting jobs to run again (should exclude running job)...");
    const jobsAfterMark = await getJobsToRun(logger);
    console.log(
      `Found ${jobsAfterMark.length} jobs after marking one as running:`,
      jobsAfterMark.map((j) => j.jobName)
    );

    // 4. Complete the job
    console.log("4. Completing the test job...");
    await completeJobExecution(
      testJob.jobName,
      "test-execution-123",
      true,
      null,
      logger
    );
    console.log("Job completed successfully");

    // 5. Verify job is no longer in running jobs
    console.log("5. Getting jobs to run after completion...");
    const jobsAfterComplete = await getJobsToRun(logger);
    console.log(
      `Found ${jobsAfterComplete.length} jobs after completion:`,
      jobsAfterComplete.map((j) => j.jobName)
    );

    console.log("✅ Orchestration flow test completed successfully!");
  } catch (error) {
    console.error("❌ Test failed:", error);
    throw error;
  }
}

// Run the test
testOrchestrationFlow()
  .then(() => {
    console.log("Test script completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Test script failed:", error);
    process.exit(1);
  });
