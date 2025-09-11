/**
 * Trigger Discovery Ingestion API Handler
 * Manually invokes the discovery ingestion scheduled function
 */

const { validateEnvironment } = require("../../config/environment");
const { withApiTriggerLifecycle } = require("../../utils/handler-wrapper");

// Wrap the handler with trigger lifecycle management
module.exports.handler = withApiTriggerLifecycle({
  triggerHandlerName: "trigger-discovery-ingestion",
  targetFunctionName: `${process.env.SERVICE_NAME}-${process.env.STAGE}-discoveryIngestionWorker`,
  operation: "manual_api_trigger",
  validateEnvironment: validateEnvironment,
});
