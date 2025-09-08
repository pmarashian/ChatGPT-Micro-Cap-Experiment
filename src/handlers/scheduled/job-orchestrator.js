/**
 * Job Orchestrator Handler
 * Runs every minute to check for and execute scheduled jobs
 * Filters out jobs that are already running
 */

const { validateEnvironment } = require("../../config/environment");
const {
  withScheduledHandlerLifecycle,
} = require("../../utils/handler-wrapper");
const {
  createLambdaClient,
  invokeLambdaFunction,
} = require("../../utils/lambda-client");
const {
  getJobsToRun,
  updateJobStatus,
  handleTimedOutJobs,
} = require("../../services/job-orchestration-service");

/**
 * Generate unique execution ID for tracking
 */
function generateExecutionId() {
  return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Pure business logic for job orchestration
 * Runs every minute to coordinate job execution
 */
const businessLogic = async ({ logger, errorHandler }) => {
  const executionId = generateExecutionId();

  // logger.debug("Starting job orchestration cycle", { executionId });

  try {
    // 1. Handle any timed-out jobs from previous runs
    await handleTimedOutJobs(logger);

    // 2. Get jobs that need to run (excludes running jobs)
    const jobsToRun = await getJobsToRun(logger);

    if (jobsToRun.length === 0) {
      logger.debug("No jobs to run this cycle", { executionId });
      return null;
    }

    console.log("jobsToRun", jobsToRun);

    // 3. Execute jobs in parallel (up to concurrency limit)
    const maxConcurrency = parseInt(process.env.MAX_JOB_CONCURRENCY || "3");
    const executionPromises = [];

    for (let i = 0; i < Math.min(jobsToRun.length, maxConcurrency); i++) {
      const job = jobsToRun[i];
      executionPromises.push(executeJob(job, executionId, logger));
    }

    // Wait for all jobs to complete
    const results = await Promise.allSettled(executionPromises);

    // Log results
    const successful = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;

    logger.debug("Job orchestration cycle completed", {
      executionId,
      totalJobs: jobsToRun.length,
      executedJobs: executionPromises.length,
      successful,
      failed,
    });

    return null;
  } catch (error) {
    logger.error("Job orchestration cycle failed", { executionId, error });
    throw error;
  }
};

/**
 * Execute a single job
 */
async function executeJob(job, orchestrationExecutionId, logger) {
  const jobExecutionId = generateExecutionId();
  const jobName = job.jobName;

  logger.debug(`Starting job execution`, {
    jobName,
    jobExecutionId,
    orchestrationExecutionId,
    targetFunction: job.targetFunction,
  });

  try {
    // 1. Mark job as running
    await updateJobStatus(jobName, "running", jobExecutionId);

    // 2. Create Lambda client
    const lambda = createLambdaClient();

    // 3. Prepare payload for the worker function
    const payload = {
      source: "orchestration-trigger",
      triggeredBy: "job-orchestrator",
      timestamp: new Date().toISOString(),
      executionId: jobExecutionId,
      orchestrationExecutionId,
      invocationType: job.invocationType || "scheduled",
      jobConfig: {
        jobName: job.jobName,
        schedule: job.schedule,
        timezone: job.timezone,
      },
    };

    // 4. Invoke the worker Lambda function
    logger.debug(`Invoking worker function`, {
      jobName,
      targetFunction: job.targetFunction,
      jobExecutionId,
    });

    const result = await invokeLambdaFunction(
      job.targetFunction,
      payload,
      lambda
    );

    logger.debug(`Worker function invoked successfully`, {
      jobName,
      jobExecutionId,
      requestId: result.$response.requestId,
      statusCode: result.StatusCode,
    });

    // 5. Mark job as completed (we don't wait for the async function to complete)
    await updateJobStatus(jobName, "completed", jobExecutionId);

    logger.debug(`Job execution completed`, {
      jobName,
      jobExecutionId,
      targetFunction: job.targetFunction,
    });

    return {
      jobName,
      status: "success",
      executionId: jobExecutionId,
    };
  } catch (error) {
    logger.error(`Job execution failed`, {
      jobName,
      jobExecutionId,
      error: error.message,
      targetFunction: job.targetFunction,
    });

    // Mark job as failed
    try {
      await updateJobStatus(jobName, "failed", jobExecutionId, error);
    } catch (statusError) {
      logger.error(`Failed to update job status to failed`, {
        jobName,
        jobExecutionId,
        statusError: statusError.message,
      });
    }

    throw error;
  }
}

module.exports.handler = withScheduledHandlerLifecycle(businessLogic, {
  handlerName: "job-orchestrator",
  operation: "job_orchestration",
  validateEnvironment: validateEnvironment,
});
