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
  tryMarkJobRunning,
  handleTimedOutJobs,
  acquireOrchestratorLock,
  deleteOrchestratorLock,
  completeJobExecution,
  isOrchestrationEnabled,
} = require("../../services/job-orchestration-service");

/**
 * Generate unique execution ID for tracking
 */
function generateExecutionId(uniqueId) {
  if (uniqueId) return uniqueId;

  // Generate a more unique ID using crypto if available, otherwise fallback to random
  let randomPart;
  try {
    // Use crypto.randomBytes for better uniqueness if available
    const crypto = require("crypto");
    randomPart = crypto.randomBytes(4).toString("hex");
  } catch (error) {
    // Fallback to Math.random
    randomPart =
      Math.random().toString(36).substr(2, 9) +
      Math.random().toString(36).substr(2, 9);
  }

  return `exec_${Date.now()}_${randomPart}`;
}

/**
 * Pure business logic for job orchestration
 * Runs every minute to coordinate job execution
 */
const businessLogic = async ({ logger, errorHandler, uniqueId }) => {
  const executionId = generateExecutionId(uniqueId);

  try {
    // 1. Check if orchestration is enabled
    const orchestrationEnabled = await isOrchestrationEnabled(logger);

    if (!orchestrationEnabled) {
      logger.debug("Orchestration is disabled, skipping this cycle", {
        executionId,
      });
      return null;
    }

    logger.debug("Starting job orchestration cycle", { executionId });

    // 2. Try to acquire orchestrator lock to prevent concurrent execution
    const lockResult = await acquireOrchestratorLock({ logger, executionId });

    if (!lockResult.success) {
      logger.debug(
        "Another orchestrator instance is already running, skipping this cycle",
        {
          executionId,
        }
      );
      return null;
    }

    const orchestratorExecutionId = executionId;

    try {
      // 2. Handle any timed-out jobs from previous runs
      try {
        await handleTimedOutJobs(logger);
      } catch (error) {
        if (
          error.name === "ResourceNotFoundException" ||
          error.code === "ResourceNotFoundException"
        ) {
          logger.debug(
            "DynamoDB table not found for timeout handling (development mode)",
            {
              executionId,
            }
          );
          // Continue - timeout handling is not critical
        } else {
          logger.warn("Failed to handle timed-out jobs", {
            executionId,
            error: error.message,
          });
          // Continue - timeout handling failure shouldn't stop orchestration
        }
      }

      // 3. Get jobs that need to run (excludes running jobs)
      let jobsToRun;
      try {
        jobsToRun = await getJobsToRun(logger);
      } catch (error) {
        if (
          error.name === "ResourceNotFoundException" ||
          error.code === "ResourceNotFoundException"
        ) {
          logger.warn(
            "DynamoDB table not found, no jobs to run (development mode)",
            {
              executionId,
              orchestratorExecutionId,
            }
          );
          return null;
        }
        throw error; // Re-throw other errors
      }

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

      logger.debug(
        `Executing ${jobsToRun.length} jobs in parallel: ${maxConcurrency}`
      );

      for (let i = 0; i < Math.min(jobsToRun.length, maxConcurrency); i++) {
        const job = jobsToRun[i];
        executionPromises.push(
          executeJob(job, orchestratorExecutionId, logger)
        );
      }

      logger.debug(`Waiting for ${executionPromises.length} jobs to complete`);

      // // Wait for all job invocations to complete
      const results = await Promise.allSettled(executionPromises);

      // const result = await executeJob(
      //   jobsToRun[0],
      //   orchestratorExecutionId,
      //   logger
      // );

      // const results = [result];

      // Log results
      const successful = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.filter((r) => r.status === "rejected").length;

      logger.debug("Job orchestration cycle completed", {
        executionId,
        orchestratorExecutionId,
        totalJobs: jobsToRun.length,
        executedJobs: 1,
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
  const jobExecutionId = generateExecutionId(orchestrationExecutionId); // Generate unique ID for this job execution
  const jobName = job.jobName;

  logger.debug(`Starting job execution`, {
    jobName,
    jobExecutionId,
    orchestrationExecutionId,
    targetFunction: job.targetFunction,
  });

  try {
    // 1. Try to mark job as running with conditional update (prevents race conditions)

    const markResult = await tryMarkJobRunning(jobName, jobExecutionId, logger);

    if (!markResult.success) {
      logger.debug(`Job already running, skipping execution`, {
        jobName,
        jobExecutionId,
        orchestrationExecutionId,
        reason: markResult.reason,
      });
      return null; // Skip this job execution
    }

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
    // console.log("Invoking worker function synchronously", job.targetFunction);
    logger.debug(`🔥 CRITICAL: Orchestrator invoking worker function`, {
      jobName,
      targetFunction: job.targetFunction,
      jobExecutionId,
      orchestrationExecutionId,
      timestamp: new Date().toISOString(),
      payload: JSON.stringify(payload),
    });

    const result = await invokeLambdaFunctionSync(
      job.targetFunction,
      payload,
      lambda
    );

    logger.debug(`✅ Worker function invocation completed`, {
      jobName,
      targetFunction: job.targetFunction,
      jobExecutionId,
      orchestrationExecutionId,
      statusCode: result.StatusCode,
      hasPayload: !!result.payload,
    });

    logger.debug(`Worker function completed`, {
      jobName,
      jobExecutionId,
      statusCode: result.StatusCode,
      hasOrchestrationInfo: !!result.payload?._orchestration,
    });

    // 5. Handle job completion centrally
    if (result.statusCode === 200 && result._orchestration) {
      // Worker completed successfully with orchestration info
      const orchInfo = result._orchestration;
      await completeJobExecution(jobName, jobExecutionId, true, null, logger);

      logger.debug(`Job completed successfully via centralized orchestration`, {
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
    } else if (result?._orchestration?.status === "failed") {
      // Worker failed with orchestration info
      const orchInfo = result._orchestration;
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
