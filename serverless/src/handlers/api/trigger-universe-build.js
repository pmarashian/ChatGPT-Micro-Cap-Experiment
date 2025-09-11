/**
 * Trigger Universe Build API Handler
 * Manually invokes the universe build scheduled function
 */

const { validateEnvironment } = require("../../config/environment");
const { withApiTriggerLifecycle } = require("../../utils/handler-wrapper");

// Wrap the handler with trigger lifecycle management
module.exports.handler = withApiTriggerLifecycle({
  triggerHandlerName: "trigger-universe-build",
  targetFunctionName: `${process.env.SERVICE_NAME}-${process.env.STAGE}-universeBuildWorker`,
  operation: "manual_api_trigger",
  validateEnvironment: validateEnvironment,
});
