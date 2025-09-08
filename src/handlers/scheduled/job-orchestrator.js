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
  invokeLambdaFunctionSync,
} = require("../../utils/lambda-client");
const {
  getJobsToRun,
  updateJobStatus,
  handleTimedOutJobs,
  acquireOrchestratorLock,
  deleteOrchestratorLock,
  completeJobExecution,
  isOrchestrationEnabled,
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

  logger.debug("Starting job orchestration cycle", { executionId });

  try {
    // 1. Check if orchestration is enabled
    const orchestrationEnabled = await isOrchestrationEnabled(logger);

    if (!orchestrationEnabled) {
      logger.debug("Orchestration is disabled, skipping this cycle", {
        executionId,
      });
      return null;
    }

    // 2. Try to acquire orchestrator lock to prevent concurrent execution
    const lockResult = await acquireOrchestratorLock(logger);

    if (!lockResult.success) {
      logger.debug(
        "Another orchestrator instance is already running, skipping this cycle",
        {
          executionId,
        }
      );
      return null;
    }

    const orchestratorExecutionId = lockResult.executionId;

    try {
      // 2. Handle any timed-out jobs from previous runs
      await handleTimedOutJobs(logger);

      // 3. Get jobs that need to run (excludes running jobs)
      const jobsToRun = await getJobsToRun(logger);

      if (jobsToRun.length === 0) {
        logger.debug("No jobs to run this cycle", {
          executionId,
          orchestratorExecutionId,
        });
        return null;
      }

      logger.debug(`Found ${jobsToRun.length} jobs to run`, {
        executionId,
        orchestratorExecutionId,
        jobs: jobsToRun.map((j) => j.jobName),
      });

      // 4. Execute jobs in parallel (up to concurrency limit)
      const maxConcurrency = parseInt(process.env.MAX_JOB_CONCURRENCY || "1");
      const executionPromises = [];

      for (let i = 0; i < Math.min(jobsToRun.length, maxConcurrency); i++) {
        const job = jobsToRun[i];
        console.log("--------------------------------");
        console.log("Executing job", job.jobName);
        console.log("--------------------------------");
        executionPromises.push(
          executeJob(job, orchestratorExecutionId, logger)
        );
      }

      // Wait for all job invocations to complete
      const results = await Promise.allSettled(executionPromises);

      // Log results
      const successful = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.filter((r) => r.status === "rejected").length;

      logger.info("Job orchestration cycle completed", {
        executionId,
        orchestratorExecutionId,
        totalJobs: jobsToRun.length,
        executedJobs: executionPromises.length,
        successful,
        failed,
      });

      return null;
    } finally {
      // Always delete the lock
      await deleteOrchestratorLock(orchestratorExecutionId, logger);
    }
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
    // 1. Mark job as running (worker will handle completion status)
    console.log("Marking job as running", jobName);
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

    // 4. Invoke the worker Lambda function synchronously
    console.log("Invoking worker function synchronously", job.targetFunction);
    logger.debug(`Invoking worker function synchronously`, {
      jobName,
      targetFunction: job.targetFunction,
      jobExecutionId,
    });

    const result = await invokeLambdaFunctionSync(
      job.targetFunction,
      payload,
      lambda
    );

    console.log("Worker function completed", job.targetFunction, {
      statusCode: result.StatusCode,
      hasOrchestrationInfo: !!result.payload?._orchestration,
    });

    logger.debug(`Worker function completed`, {
      jobName,
      jobExecutionId,
      statusCode: result.StatusCode,
      hasOrchestrationInfo: !!result.payload?._orchestration,
    });

    // 5. Handle job completion centrally
    if (result.StatusCode === 200 && result.payload?._orchestration) {
      // Worker completed successfully with orchestration info
      const orchInfo = result.payload._orchestration;
      await completeJobExecution(jobName, jobExecutionId, true, null, logger);

      logger.info(`Job completed successfully via centralized orchestration`, {
        jobName,
        jobExecutionId,
        orchestrationExecutionId,
        workerStatus: orchInfo.status,
      });

      return {
        jobName,
        status: "completed",
        executionId: jobExecutionId,
      };
    } else if (result.payload?._orchestration?.status === "failed") {
      // Worker failed with orchestration info
      const orchInfo = result.payload._orchestration;
      const workerError = new Error(
        orchInfo.originalError || "Worker reported failure"
      );

      await completeJobExecution(
        jobName,
        jobExecutionId,
        false,
        workerError,
        logger
      );

      logger.error(`Job failed via centralized orchestration`, {
        jobName,
        jobExecutionId,
        orchestrationExecutionId,
        workerStatus: orchInfo.status,
        error: workerError.message,
      });

      throw workerError;
    } else {
      // Lambda execution failed or no orchestration info
      const executionError = new Error(
        `Worker execution failed: Status ${result.StatusCode}, ${
          result.payload?.message || "Unknown error"
        }`
      );

      await completeJobExecution(
        jobName,
        jobExecutionId,
        false,
        executionError,
        logger
      );

      logger.error(`Job execution failed`, {
        jobName,
        jobExecutionId,
        statusCode: result.StatusCode,
        error: executionError.message,
      });

      throw executionError;
    }
  } catch (error) {
    logger.error(`Job execution failed`, {
      jobName,
      jobExecutionId,
      error: error.message,
      targetFunction: job.targetFunction,
    });

    // Handle job completion centrally
    try {
      await completeJobExecution(jobName, jobExecutionId, false, error, logger);
    } catch (statusError) {
      logger.error(`Failed to complete job execution`, {
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
