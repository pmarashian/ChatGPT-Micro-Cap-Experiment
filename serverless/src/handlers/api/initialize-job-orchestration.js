/**
 * Initialize Job Orchestration API Handler
 * API endpoint to initialize all cron jobs in the orchestration system
 * Replaces serverless.yml cron triggers with database-driven scheduling
 */

const { validateEnvironment } = require("../../config/environment");
const { withApiHandlerLifecycle } = require("../../utils/handler-wrapper");
const {
  initializeJob,
  setOrchestrationEnabled,
} = require("../../services/job-orchestration-service");

/**
 * Business logic for initializing job orchestration
 */
const businessLogic = async ({ logger, errorHandler }) => {
  logger.info("Initializing job orchestration system with all cron jobs");

  // Initialize orchestration-enabled flag (default to true)
  try {
    await setOrchestrationEnabled(true, logger);
    logger.info("Orchestration enabled flag initialized to true");
  } catch (error) {
    logger.error("Failed to initialize orchestration enabled flag", error);
    // Continue with job initialization even if flag initialization fails
  }

  // Define all cron jobs that replace serverless.yml schedules
  const jobConfigs = [
    {
      jobName: "universeBuild",
      schedule: "0 3 * * ?", // Daily at 3:00 UTC (11:00 PM ET)
      timezone: "America/New_York",
      targetFunction: `${process.env.SERVICE_NAME}-${process.env.STAGE}-universeBuildWorker`,
      maxRuntime: 300, // 5 minutes
      invocationType: "scheduled",
      description: "Builds the trading universe from market data",
      enabled: true,
    },
    {
      jobName: "discoveryIngestion",
      schedule: "0 0,6,12,18 * * ?", // Every 6 hours at 00:00, 06:00, 12:00, 18:00 UTC
      timezone: "UTC",
      targetFunction: `${process.env.SERVICE_NAME}-${process.env.STAGE}-discoveryIngestionWorker`,
      maxRuntime: 600, // 10 minutes
      invocationType: "scheduled",
      description: "Collects fundamentals and news data for universe tickers",
      enabled: true,
    },
    {
      jobName: "universeRanking",
      schedule: "0 4 * * ?", // 4 AM ET (9 PM UTC)
      timezone: "America/New_York",
      targetFunction: `${process.env.SERVICE_NAME}-${process.env.STAGE}-universeRankingWorker`,
      maxRuntime: 300, // 5 minutes
      invocationType: "scheduled",
      description:
        "Computes composite scores for universe tickers based on evidence",
      enabled: true,
    },
    {
      jobName: "marketResearch",
      schedule: "0 1 * * ?", // 8 PM ET (1 AM UTC)
      timezone: "America/New_York",
      targetFunction: `${process.env.SERVICE_NAME}-${process.env.STAGE}-marketResearchWorker`,
      maxRuntime: 600, // 10 minutes
      invocationType: "scheduled",
      description: "Generates deep AI analysis for high-potential tickers",
      enabled: true,
    },
    {
      jobName: "dailyTrading",
      schedule: "0 20 * * MON-FRI", // 4 PM ET (9 PM UTC), Monday through Friday
      timezone: "America/New_York",
      targetFunction: `${process.env.SERVICE_NAME}-${process.env.STAGE}-dailyTradingWorker`,
      maxRuntime: 180, // 3 minutes
      invocationType: "scheduled",
      description: "Makes automated buy/sell decisions based on AI analysis",
      enabled: true,
    },
    {
      jobName: "portfolioUpdate",
      schedule: "30 13 * * ?", // 1:30 PM ET (5:30 PM UTC)
      timezone: "America/New_York",
      targetFunction: `${process.env.SERVICE_NAME}-${process.env.STAGE}-portfolioUpdateWorker`,
      maxRuntime: 300, // 5 minutes
      invocationType: "scheduled",
      description:
        "Updates portfolio positions and calculates performance metrics",
      enabled: true,
    },
    {
      jobName: "stopLoss",
      schedule: "0 14 * * ?", // 10 AM ET (2 PM UTC)
      timezone: "America/New_York",
      targetFunction: `${process.env.SERVICE_NAME}-${process.env.STAGE}-stopLossWorker`,
      maxRuntime: 120, // 2 minutes
      invocationType: "scheduled",
      description:
        "Monitors positions and executes stop-loss orders (10 AM ET)",
      enabled: true,
    },
    {
      jobName: "emailReport",
      schedule: "30 20 * * ?", // 4:30 PM ET (9:30 PM UTC)
      timezone: "America/New_York",
      targetFunction: `${process.env.SERVICE_NAME}-${process.env.STAGE}-emailReportWorker`,
      maxRuntime: 300, // 5 minutes
      invocationType: "scheduled",
      description: "Sends end-of-day performance and activity reports",
      enabled: true,
    },
    {
      jobName: "weeklyAIReport",
      schedule: "30 20 ? * SUN *", // Sundays 4:30 PM ET (9:30 PM UTC)
      timezone: "America/New_York",
      targetFunction: `${process.env.SERVICE_NAME}-${process.env.STAGE}-weeklyAIReportWorker`,
      maxRuntime: 120, // 2 minutes
      invocationType: "scheduled",
      description: "Sends a weekly human-readable AI report",
      enabled: true,
    },
    {
      jobName: "orderMonitor",
      schedule: "0 15 * * ?", // 11 AM ET (3 PM UTC)
      timezone: "America/New_York",
      targetFunction: `${process.env.SERVICE_NAME}-${process.env.STAGE}-orderMonitorWorker`,
      maxRuntime: 120, // 2 minutes
      invocationType: "scheduled",
      description:
        "Monitors pending orders and handles order status updates (11 AM ET)",
      enabled: true,
    },
    // {
    //   jobName: "logProcessor",
    //   schedule: "0 * * * ?", // Every hour
    //   timezone: "UTC",
    //   targetFunction: `${process.env.SERVICE_NAME}-${process.env.STAGE}-logProcessor`,
    //   maxRuntime: 60, // 1 minute
    //   invocationType: "scheduled",
    //   description: "Processes and analyzes log data for monitoring and alerts",
    //   enabled: true,
    // },
  ];

  logger.info(
    `Initializing ${jobConfigs.length} cron jobs in the orchestration system`
  );

  const results = [];
  let successCount = 0;
  let errorCount = 0;

  // Initialize each job
  for (const jobConfig of jobConfigs) {
    try {
      logger.info(`Creating job configuration`, {
        jobName: jobConfig.jobName,
        schedule: jobConfig.schedule,
        targetFunction: jobConfig.targetFunction,
        timezone: jobConfig.timezone,
      });

      await initializeJob(jobConfig);

      results.push({
        jobName: jobConfig.jobName,
        status: "success",
        schedule: jobConfig.schedule,
        targetFunction: jobConfig.targetFunction,
      });

      successCount++;
      logger.info(`Successfully initialized job: ${jobConfig.jobName}`);
    } catch (error) {
      logger.error(`Failed to initialize job: ${jobConfig.jobName}`, error);

      results.push({
        jobName: jobConfig.jobName,
        status: "error",
        error: error.message,
      });

      errorCount++;
    }
  }

  const summary = {
    totalJobs: jobConfigs.length,
    successful: successCount,
    failed: errorCount,
    jobs: results,
  };

  logger.info("Job orchestration initialization completed", summary);

  if (errorCount > 0) {
    // Send error alert if any jobs failed to initialize
    try {
      await errorHandler.sendErrorAlert(
        new Error(`${errorCount} jobs failed to initialize`),
        {
          function: "initialize-job-orchestration",
          operation: "job_orchestration_initialization",
          summary: summary,
        }
      );
    } catch (alertError) {
      logger.error("Failed to send error alert", alertError);
    }
  }

  return {
    statusCode: errorCount > 0 ? 207 : 200, // 207 Multi-Status for partial success
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify({
      message:
        errorCount === 0
          ? "All job orchestration cron jobs initialized successfully"
          : `${successCount} jobs initialized successfully, ${errorCount} failed`,
      summary: summary,
    }),
  };
};

module.exports.handler = withApiHandlerLifecycle(businessLogic, {
  handlerName: "initialize-job-orchestration",
  operation: "job_orchestration_initialization",
  validateEnvironment: validateEnvironment,
});
