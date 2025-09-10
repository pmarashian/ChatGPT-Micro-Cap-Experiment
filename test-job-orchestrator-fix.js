/**
 * Test script to verify job orchestrator can invoke workers properly
 */

const Logger = require("./src/utils/logger");
const { getJobsToRun } = require("./src/services/job-orchestration-service");
const {
  createLambdaClient,
  invokeLambdaFunctionSync,
} = require("./src/utils/lambda-client");

async function testJobOrchestratorInvocation() {
  const logger = Logger("test-job-orchestrator-invocation");

  try {
    console.log("🧪 Testing job orchestrator worker invocation...");

    // 1. Check what jobs are available
    console.log("1. Checking available jobs...");
    const jobsToRun = await getJobsToRun(logger);

    console.log(`Found ${jobsToRun.length} jobs to run:`);
    jobsToRun.forEach((job, index) => {
      console.log(`  ${index + 1}. ${job.jobName} -> ${job.targetFunction}`);
    });

    if (jobsToRun.length === 0) {
      console.log(
        "❌ No jobs to run - job orchestration may not be initialized"
      );
      return;
    }

    // 2. Try to invoke the first job
    const job = jobsToRun[0];
    console.log(`\n2. Testing invocation of ${job.jobName}...`);

    const lambda = createLambdaClient();
    const payload = {
      source: "orchestration-trigger",
      triggeredBy: "test-script",
      timestamp: new Date().toISOString(),
      executionId: `test-${Date.now()}`,
      invocationType: "test",
      jobConfig: {
        jobName: job.jobName,
        schedule: job.schedule,
        timezone: job.timezone,
      },
    };

    console.log(`Invoking ${job.targetFunction}...`);

    const result = await invokeLambdaFunctionSync(
      job.targetFunction,
      payload,
      lambda
    );

    console.log("✅ Invocation result:");
    console.log(`  StatusCode: ${result.StatusCode}`);
    console.log(`  Has orchestration info: ${!!result._orchestration}`);
    console.log(`  Has statusCode: ${!!result.statusCode}`);

    if (result._orchestration) {
      console.log(`  Orchestration status: ${result._orchestration.status}`);
    }

    console.log("✅ Job orchestrator invocation test completed successfully!");
  } catch (error) {
    console.error("❌ Test failed:", error.message);
    console.error("Stack:", error.stack);
    process.exit(1);
  }
}

// Only run if called directly
if (require.main === module) {
  testJobOrchestratorInvocation();
}

module.exports = { testJobOrchestratorInvocation };
