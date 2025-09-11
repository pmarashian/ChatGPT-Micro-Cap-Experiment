/**
 * Trigger Email Report API Handler
 * Manually invokes the email report worker using job orchestration pattern
 */

const { validateEnvironment } = require("../../config/environment");
const { withApiTriggerLifecycle } = require("../../utils/handler-wrapper");

const functionName =
  process.env.EMAIL_REPORT_WORKER_FUNCTION_NAME ||
  `${process.env.SERVICE_NAME}-${process.env.STAGE}-emailReportWorker`;

module.exports.handler = withApiTriggerLifecycle({
  triggerHandlerName: "trigger-email-report",
  targetFunctionName: functionName,
  operation: "manual_email_report_trigger",
  validateEnvironment: validateEnvironment,
});
