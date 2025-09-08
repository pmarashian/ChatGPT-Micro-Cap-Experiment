/**
 * Weekly AI Report Worker Handler
 * Worker Lambda function that performs the actual weekly AI report business logic
 * Invoked by both API triggers and the job orchestrator
 */

const { validateEnvironment } = require("../../config/environment");
const {
  performWeeklyAIReport,
} = require("../../services/trading/weekly-ai-report-orchestrator");

const {
  withJobOrchestratedHandlerLifecycle,
} = require("../../utils/handler-wrapper");

/**
 * Pure business logic for weekly AI report generation
 * No orchestration concerns - just the core functionality
 */
const businessLogic = async ({ logger, errorHandler, event, context }) => {
  // Execute weekly AI report using shared orchestrator
  const result = await performWeeklyAIReport({
    invocationType: "scheduled",
    logger: logger,
    errorHandler: errorHandler,
  });

  logger.info("Weekly AI report completed successfully", result);

  // No response needed for scheduled functions
  return null;
};

module.exports.handler = withJobOrchestratedHandlerLifecycle(businessLogic, {
  handlerName: "weekly-ai-report-worker",
  operation: "weekly_ai_report_processing",
  validateEnvironment: validateEnvironment,
  jobName: "weeklyAIReport",
});
