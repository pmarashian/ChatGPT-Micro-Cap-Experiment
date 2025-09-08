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
 * Uses cron-parser library for proper cron expression parsing
 */
function getNextRunTime(cronExpression, timezone = "America/New_York") {
  try {
    // Parse the cron expression and get the next occurrence
    const interval = cronParser.parseExpression(cronExpression);

    // Get the next occurrence in UTC
    const nextRunUTC = interval.next();

    // Convert to the specified timezone using moment-timezone
    const nextRun = moment.utc(nextRunUTC).tz(timezone);

    return nextRun.toDate();
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
  Logger.debug("Checking if job should run", {
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

  console.log("now", now);
  console.log("nextRun", nextRun);
  console.log("now >= nextRun", now >= nextRun);

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

    logger.info(`Checking ${runningJobs.length} running jobs for timeouts`);

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
      logger.info("No jobs timed out this cycle");
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

module.exports = {
  getJobsToRun,
  updateJobStatus,
  getJobStatus,
  handleTimedOutJobs,
  initializeJob,
  getNextRunTime,
};
