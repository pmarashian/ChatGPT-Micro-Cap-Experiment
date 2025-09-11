/**
 * Email Report Worker Handler
 * Worker Lambda function that performs the actual email report business logic
 * Invoked by both API triggers and the job orchestrator
 */

const { validateEnvironment } = require("../../config/environment");
const {
  performEmailReport,
} = require("../../services/trading/email-report-orchestrator");

const {
  withJobOrchestratedHandlerLifecycle,
} = require("../../utils/handler-wrapper");

/**
 * Pure business logic for email report generation
 * No orchestration concerns - just the core functionality
 */
const businessLogic = async ({ logger, errorHandler, event, context }) => {
  // Execute email report using shared orchestrator
  const result = await performEmailReport({
    invocationType: "scheduled",
    logger: logger,
    errorHandler: errorHandler,
  });

  logger.info("Email report completed successfully", result);

  // No response needed for scheduled functions
  return null;
};

module.exports.handler = withJobOrchestratedHandlerLifecycle(businessLogic, {
  handlerName: "email-report-worker",
  operation: "email_report_processing",
  validateEnvironment: validateEnvironment,
  jobName: "emailReport",
});
