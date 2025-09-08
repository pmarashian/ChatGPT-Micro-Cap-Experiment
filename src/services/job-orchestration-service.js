/**
 * Job Orchestration Service
 * Manages job scheduling, execution tracking, and status management
 */

const AWS = require("aws-sdk");
const cronParser = require("cron-parser");
const moment = require("moment-timezone");
const Logger = require("../utils/logger");

/**
 * Create DynamoDB client
 */
function createDynamoClient() {
  return new AWS.DynamoDB.DocumentClient({
    region: process.env.AWS_REGION || "us-east-1",
  });
}

/**
 * Get job configuration table name (uses main trading table)
 */
function getJobTableName() {
  const service = process.env.SERVICE_NAME || "chatgpt-trading-phase1";
  const stage = process.env.STAGE || "dev";
  return `${service}-${stage}`;
}

/**
 * Parse cron expression to get next run time
 * Uses cron-parser library for proper cron expression parsing with timezone support
 */
function getNextRunTime(cronExpression, timezone = "America/New_York") {
  console.log("Getting next run time for", cronExpression, timezone);
  try {
    // Parse the cron expression to extract the schedule information
    const interval = cronParser.parseExpression(cronExpression);
    const fields = interval.fields;

    // Extract hour and minute from the cron expression
    const hour = fields.hour[0];
    const minute = fields.minute[0];

    console.log(
      `Cron expression ${cronExpression} parsed: hour=${hour}, minute=${minute}`
    );

    // Get current time in the target timezone
    const now = moment();
    const nowInTimezone = now.clone().tz(timezone);

    console.log(`Current time UTC: ${now.toISOString()}`);
    console.log(`Current time in ${timezone}: ${nowInTimezone.format()}`);

    // Create today's scheduled time in the target timezone
    let scheduledTime = nowInTimezone
      .clone()
      .hour(hour)
      .minute(minute)
      .second(0)
      .millisecond(0);

    console.log(
      `Today's scheduled time in ${timezone}: ${scheduledTime.format()}`
    );

    // If the scheduled time has already passed today, move to tomorrow
    if (
      scheduledTime.isBefore(nowInTimezone) ||
      scheduledTime.isSame(nowInTimezone)
    ) {
      scheduledTime = scheduledTime.add(1, "day");
      console.log(
        `Scheduled time moved to tomorrow: ${scheduledTime.format()}`
      );
    }

    // Convert the scheduled time back to UTC for storage
    const scheduledTimeUTC = scheduledTime.clone().utc();

    console.log(
      `${cronExpression} next run in ${timezone}: ${scheduledTime.format()}`
    );
    console.log(
      `${cronExpression} next run UTC: ${scheduledTimeUTC.toISOString()}`
    );

    return scheduledTimeUTC.toDate();
  } catch (error) {
    Logger.error(
      `Failed to parse cron expression "${cronExpression}": ${error.message}`,
      {
        cronExpression,
        timezone,
        error: error.message,
      }
    );

    // Fallback: return a time 1 hour from now in the specified timezone
    const fallback = moment().tz(timezone).add(1, "hour").startOf("hour");
    Logger.warn(`Using fallback schedule: ${fallback.format()}`, {
      cronExpression,
      timezone,
      fallbackTime: fallback.format(),
    });

    return fallback.toDate();
  }
}

/**
 * Check if a job should run based on its schedule and status
 */
function shouldRunJob(job) {
  Logger.debug(`Checking if job should run: ${job.jobName}`, {
    jobName: job.jobName,
    status: job.status,
    enabled: job.enabled,
    nextRun: job.nextRun,
  });

  if (!job.enabled) {
    return false;
  }

  if (job.status === "running") {
    return false; // Don't run if already running
  }

  const now = new Date();
  const nextRun = new Date(job.nextRun);

  return now >= nextRun;
}

/**
 * Get all enabled jobs that need to run
 */
async function getJobsToRun(logger) {
  const dynamo = createDynamoClient();
  const tableName = getJobTableName();

  try {
    // Query for all enabled job configurations using TickerIndex
    const result = await dynamo
      .query({
        TableName: tableName,
        IndexName: "TickerIndex",
        KeyConditionExpression: "GSI1PK = :gsi1pk",
        ExpressionAttributeValues: {
          ":gsi1pk": "JOB#enabled",
        },
      })
      .promise();

    const jobs = result.Items || [];

    // Filter jobs that should run
    const jobsToRun = jobs.filter(shouldRunJob);

    return jobsToRun;
  } catch (error) {
    logger.error("Failed to query jobs", error);
    throw error;
  }
}

/**
 * Update job status and execution tracking
 */
async function updateJobStatus(
  jobName,
  status,
  executionId = null,
  error = null
) {
  const dynamo = createDynamoClient();
  const tableName = getJobTableName();
  const now = new Date();

  try {
    const updateParams = {
      TableName: tableName,
      Key: {
        PK: `JOB#${jobName}`,
        SK: "JOB",
      },
      UpdateExpression: `
        SET #status = :status,
            lastUpdated = :lastUpdated,
            executionId = :executionId
        ${error ? ", lastError = :error" : ""}
        ${status === "running" ? ", startedAt = :startedAt" : ""}
        ${status === "completed" ? ", completedAt = :completedAt" : ""}
        ${status === "failed" ? ", failedAt = :failedAt" : ""}
        ${
          status === "completed"
            ? " REMOVE failedAt, lastError, lastFailure"
            : ""
        }
      `,
      ExpressionAttributeNames: {
        "#status": "status",
      },
      ExpressionAttributeValues: {
        ":status": status,
        ":lastUpdated": now.toISOString(),
        ":executionId": executionId || null,
      },
    };

    if (error) {
      updateParams.ExpressionAttributeValues[":error"] = error.message;
    }

    if (status === "running") {
      updateParams.ExpressionAttributeValues[":startedAt"] = now.toISOString();
    } else if (status === "completed") {
      updateParams.ExpressionAttributeValues[":completedAt"] =
        now.toISOString();
    } else if (status === "failed") {
      updateParams.ExpressionAttributeValues[":failedAt"] = now.toISOString();
    }

    await dynamo.update(updateParams).promise();

    // If job completed or failed, update next run time
    if (status === "completed" || status === "failed") {
      await updateNextRunTime(jobName);
    }
  } catch (error) {
    Logger.error(`Failed to update job status for ${jobName}`, {
      jobName,
      status,
      executionId,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Update job's next run time based on its schedule
 */
async function updateNextRunTime(jobName) {
  const dynamo = createDynamoClient();
  const tableName = getJobTableName();

  try {
    // Get job configuration
    const configResult = await dynamo
      .get({
        TableName: tableName,
        Key: {
          PK: `JOB#${jobName}`,
          SK: "JOB",
        },
      })
      .promise();

    if (!configResult.Item) {
      throw new Error(`Job configuration not found: ${jobName}`);
    }

    const job = configResult.Item;
    const nextRun = getNextRunTime(job.schedule, job.timezone);

    console.log(
      `Updating ${jobName} next run time to ${nextRun.toISOString()}`
    );

    // Update next run time
    await dynamo
      .update({
        TableName: tableName,
        Key: {
          PK: `JOB#${jobName}`,
          SK: "JOB",
        },
        UpdateExpression:
          "SET nextRun = :nextRun, lastScheduled = :lastScheduled",
        ExpressionAttributeValues: {
          ":nextRun": nextRun.toISOString(),
          ":lastScheduled": new Date().toISOString(),
        },
      })
      .promise();
  } catch (error) {
    Logger.error(`Failed to update next run time for ${jobName}`, {
      jobName,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Get current job status
 */
async function getJobStatus(jobName) {
  const dynamo = createDynamoClient();
  const tableName = getJobTableName();

  try {
    const result = await dynamo
      .get({
        TableName: tableName,
        Key: {
          PK: `JOB#${jobName}`,
          SK: "JOB",
        },
      })
      .promise();

    return result.Item || { status: "unknown" };
  } catch (error) {
    Logger.error(`Failed to get job status for ${jobName}`, {
      jobName,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Check for and handle timed-out jobs
 */
async function handleTimedOutJobs(logger) {
  const dynamo = createDynamoClient();
  const tableName = getJobTableName();

  try {
    // Query for enabled jobs and filter for running status
    const result = await dynamo
      .query({
        TableName: tableName,
        IndexName: "TickerIndex",
        KeyConditionExpression: "GSI1PK = :enabled",
        FilterExpression: "#status = :runningStatus",
        ExpressionAttributeNames: {
          "#status": "status",
        },
        ExpressionAttributeValues: {
          ":enabled": "JOB#enabled",
          ":runningStatus": "running",
        },
      })
      .promise();

    const runningJobs = result.Items || [];
    const now = new Date();

    logger.debug(`Checking ${runningJobs.length} running jobs for timeouts`);

    let timedOutCount = 0;

    for (const job of runningJobs) {
      try {
        const startedAt = new Date(job.startedAt);
        const configResult = await dynamo
          .get({
            TableName: tableName,
            Key: {
              PK: job.PK,
              SK: "JOB",
            },
          })
          .promise();

        const config = configResult.Item;
        if (config && config.maxRuntime) {
          const maxRuntimeMs = config.maxRuntime * 1000;
          const elapsedMs = now - startedAt;

          if (elapsedMs > maxRuntimeMs) {
            const jobName = job.PK.replace("JOB#", "");

            logger.warn(`Job ${jobName} timed out - marking as failed`, {
              jobName,
              executionId: job.executionId,
              startedAt: job.startedAt,
              elapsedMs,
              maxRuntimeMs,
              timeoutMinutes: config.maxRuntime / 60,
            });

            const timeoutError = new Error(
              `Job timed out after ${Math.round(
                elapsedMs / 1000 / 60
              )} minutes (max: ${config.maxRuntime / 60} minutes)`
            );

            await updateJobStatus(
              jobName,
              "timed_out",
              job.executionId,
              timeoutError
            );
            timedOutCount++;

            // Send alert for timed out jobs
            try {
              // TODO: Send alert to admin about timed out job
              logger.error(`CRITICAL: Job ${jobName} timed out`, {
                jobName,
                executionId: job.executionId,
                startedAt: job.startedAt,
                elapsedMs,
                maxRuntimeMs,
              });
            } catch (alertError) {
              logger.error("Failed to send timeout alert", alertError);
            }
          }
        }
      } catch (jobError) {
        logger.error(`Error processing job timeout check`, {
          jobPK: job.PK,
          error: jobError.message,
        });
      }
    }

    if (timedOutCount > 0) {
      logger.warn(`${timedOutCount} jobs were marked as timed out`);
    } else {
      logger.debug("No jobs timed out this cycle");
    }
  } catch (error) {
    logger.error("Failed to handle timed out jobs", error);
    // Don't throw here - timeout handling failure shouldn't break the orchestration
  }
}

/**
 * Initialize job configuration (one-time setup)
 * Creates a single item containing all job information
 */
async function initializeJob(jobConfig) {
  const dynamo = createDynamoClient();
  const tableName = getJobTableName();

  const jobName = jobConfig.jobName;
  const nextRun = getNextRunTime(jobConfig.schedule, jobConfig.timezone);

  // Create single job item with all configuration and status information
  await dynamo
    .put({
      TableName: tableName,
      Item: {
        PK: `JOB#${jobName}`,
        SK: "JOB",
        GSI1PK: "JOB#enabled", // For querying enabled jobs
        GSI1SK: jobName,
        // Job configuration
        ...jobConfig,
        nextRun: nextRun.toISOString(),
        createdAt: new Date().toISOString(),
        enabled: true,
        // Job status (initial state)
        status: "pending",
        lastUpdated: new Date().toISOString(),
        executionId: null,
      },
    })
    .promise();
}

/**
 * Clean up expired orchestrator locks
 */
async function cleanupExpiredLocks(logger) {
  const dynamo = createDynamoClient();
  const tableName = getJobTableName();

  try {
    // Query for expired orchestrator locks
    const result = await dynamo
      .query({
        TableName: tableName,
        IndexName: "TickerIndex",
        KeyConditionExpression: "GSI1PK = :gsi1pk",
        FilterExpression: "expiresAt < :now",
        ExpressionAttributeValues: {
          ":gsi1pk": "LOCK#orchestrator",
          ":now": new Date().toISOString(),
        },
      })
      .promise();

    const expiredLocks = result.Items || [];

    if (expiredLocks.length > 0) {
      logger.info(
        `Found ${expiredLocks.length} expired orchestrator locks to clean up`,
        {
          expiredLocks: result.Items,
        }
      );

      // Delete expired locks
      for (const lock of expiredLocks) {
        try {
          await dynamo
            .delete({
              TableName: tableName,
              Key: {
                PK: lock.PK,
                SK: lock.SK,
              },
            })
            .promise();

          logger.debug("Cleaned up expired orchestrator lock", {
            executionId: lock.executionId,
            expiredAt: lock.expiresAt,
          });
        } catch (deleteError) {
          logger.warn("Failed to delete expired lock", {
            executionId: lock.executionId,
            error: deleteError.message,
          });
        }
      }
    } else {
      logger.debug("No expired orchestrator locks found");
    }
  } catch (error) {
    logger.warn("Failed to cleanup expired locks", { error: error.message });
    // Don't throw - cleanup failure shouldn't block lock acquisition
  }
}

/**
 * Acquire orchestrator lock to prevent concurrent execution
 */
async function acquireOrchestratorLock(logger) {
  const dynamo = createDynamoClient();
  const tableName = getJobTableName();
  const lockId = "orchestrator-lock";
  const executionId = `exec_${Date.now()}_${Math.random()
    .toString(36)
    .substr(2, 9)}`;
  const lockExpiry = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minute lock

  try {
    // First, try to clean up any expired locks
    await cleanupExpiredLocks(logger);

    // Try to create/update the lock item with proper GSI indexing
    await dynamo
      .put({
        TableName: tableName,
        Item: {
          PK: `LOCK#${lockId}`,
          SK: "LOCK",
          GSI1PK: "LOCK#orchestrator", // For querying all orchestrator locks
          GSI1SK: executionId,
          executionId,
          acquiredAt: new Date().toISOString(),
          expiresAt: lockExpiry,
          status: "active",
          lockType: "orchestrator",
        },
        ConditionExpression: "attribute_not_exists(PK) OR expiresAt < :now",
        ExpressionAttributeValues: {
          ":now": new Date().toISOString(),
        },
      })
      .promise();

    logger.debug("Orchestrator lock acquired", { executionId, lockExpiry });
    return { success: true, executionId };
  } catch (error) {
    if (error.code === "ConditionalCheckFailedException") {
      return { success: false, executionId: null };
    }
    logger.error("Unexpected error acquiring orchestrator lock", {
      executionId,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Delete orchestrator lock
 */
async function deleteOrchestratorLock(executionId, logger) {
  const dynamo = createDynamoClient();
  const tableName = getJobTableName();
  const lockId = "orchestrator-lock";

  try {
    // First, try to get the current lock to verify it exists and matches our executionId
    const getResult = await dynamo
      .get({
        TableName: tableName,
        Key: {
          PK: `LOCK#${lockId}`,
          SK: "LOCK",
        },
      })
      .promise();

    if (!getResult.Item) {
      logger.warn("Orchestrator lock not found for release", { executionId });
      return;
    }

    const lock = getResult.Item;

    // Check if this is our lock
    if (lock.executionId !== executionId) {
      logger.warn("Orchestrator lock executionId mismatch", {
        requestedExecutionId: executionId,
        actualExecutionId: lock.executionId,
      });
      return;
    }

    // Delete the lock entirely
    await dynamo
      .delete({
        TableName: tableName,
        Key: {
          PK: `LOCK#${lockId}`,
          SK: "LOCK",
        },
      })
      .promise();

    logger.info("Orchestrator lock deleted successfully", { executionId });
  } catch (error) {
    logger.error("Failed to delete orchestrator lock", {
      executionId,
      error: error.message,
      stack: error.stack,
    });
  }
}

/**
 * Complete a job execution (centralized status management)
 * This should be called by the orchestrator, not by worker wrappers
 */
async function completeJobExecution(
  jobName,
  executionId,
  success = true,
  error = null,
  logger
) {
  const dynamo = createDynamoClient();
  const tableName = getJobTableName();
  const now = new Date();

  try {
    const status = success ? "completed" : "failed";

    const updateParams = {
      TableName: tableName,
      Key: {
        PK: `JOB#${jobName}`,
        SK: "JOB",
      },
      UpdateExpression: `
        SET #status = :status,
            lastUpdated = :lastUpdated,
            executionId = :executionId,
            completedAt = :completedAt
        ${error ? ", lastError = :error" : ""}
        ${
          success
            ? ", lastSuccess = :lastSuccess"
            : ", lastFailure = :lastFailure"
        }
        ${success ? " REMOVE failedAt, lastError, lastFailure" : ""}
      `,
      ExpressionAttributeNames: {
        "#status": "status",
      },
      ExpressionAttributeValues: {
        ":status": status,
        ":lastUpdated": now.toISOString(),
        ":executionId": executionId,
        ":completedAt": now.toISOString(),
      },
    };

    if (error) {
      updateParams.ExpressionAttributeValues[":error"] = error.message;
    }

    if (success) {
      updateParams.ExpressionAttributeValues[":lastSuccess"] =
        now.toISOString();
    } else {
      updateParams.ExpressionAttributeValues[":lastFailure"] =
        now.toISOString();
    }

    await dynamo.update(updateParams).promise();

    // Update next run time for completed or failed jobs
    await updateNextRunTime(jobName);

    logger.info(`Job ${status} and next run time updated`, {
      jobName,
      executionId,
      status,
      nextRunUpdated: true,
    });

    return { success: true };
  } catch (error) {
    logger.error(`Failed to complete job execution for ${jobName}`, {
      jobName,
      executionId,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Check if orchestration is enabled
 */
async function isOrchestrationEnabled(logger) {
  const dynamo = createDynamoClient();
  const tableName = getJobTableName();

  try {
    const result = await dynamo
      .get({
        TableName: tableName,
        Key: {
          PK: "SYSTEM#orchestration",
          SK: "CONFIG",
        },
      })
      .promise();

    const isEnabled = result.Item ? result.Item.enabled : true; // Default to true if not set

    logger.debug("Orchestration enabled status checked", {
      enabled: isEnabled,
      hasConfig: !!result.Item,
      result: result.Item,
    });

    return isEnabled;
  } catch (error) {
    logger.error("Failed to check orchestration enabled status", {
      error: error.message,
    });
    // Default to false on error to prevent orchestration
    return false;
  }
}

/**
 * Set orchestration enabled/disabled flag
 */
async function setOrchestrationEnabled(enabled, logger) {
  const dynamo = createDynamoClient();
  const tableName = getJobTableName();

  try {
    await dynamo
      .put({
        TableName: tableName,
        Item: {
          PK: "SYSTEM#orchestration",
          SK: "CONFIG",
          enabled,
          lastUpdated: new Date().toISOString(),
          type: "orchestration_config",
        },
      })
      .promise();

    logger.info("Orchestration enabled status updated", {
      enabled,
      updatedAt: new Date().toISOString(),
    });

    return { success: true, enabled };
  } catch (error) {
    logger.error("Failed to set orchestration enabled status", {
      enabled,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Query all orchestrator locks (for debugging/monitoring)
 */
async function getAllOrchestratorLocks(logger) {
  const dynamo = createDynamoClient();
  const tableName = getJobTableName();

  try {
    const result = await dynamo
      .query({
        TableName: tableName,
        IndexName: "TickerIndex",
        KeyConditionExpression: "GSI1PK = :gsi1pk",
        ExpressionAttributeValues: {
          ":gsi1pk": "LOCK#orchestrator",
        },
        ScanIndexForward: false, // Most recent first
      })
      .promise();

    const locks = result.Items || [];
    logger.debug(`Found ${locks.length} orchestrator locks`, {
      locks: locks.map((lock) => ({
        executionId: lock.executionId,
        status: lock.status,
        acquiredAt: lock.acquiredAt,
        expiresAt: lock.expiresAt,
        releasedAt: lock.releasedAt,
      })),
    });

    return locks;
  } catch (error) {
    logger.error("Failed to query orchestrator locks", {
      error: error.message,
    });
    throw error;
  }
}

module.exports = {
  getJobsToRun,
  updateJobStatus,
  getJobStatus,
  handleTimedOutJobs,
  initializeJob,
  getNextRunTime,
  acquireOrchestratorLock,
  deleteOrchestratorLock,
  completeJobExecution,
  getAllOrchestratorLocks,
  cleanupExpiredLocks,
  isOrchestrationEnabled,
  setOrchestrationEnabled,
};
