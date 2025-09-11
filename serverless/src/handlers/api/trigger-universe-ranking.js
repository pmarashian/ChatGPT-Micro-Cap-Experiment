/**
 * Trigger Universe Ranking API Handler
 * Manually invokes the universe ranking scheduled function
 */

const { validateEnvironment } = require("../../config/environment");
const { withApiTriggerLifecycle } = require("../../utils/handler-wrapper");

// Wrap the handler with trigger lifecycle management
module.exports.handler = withApiTriggerLifecycle({
  triggerHandlerName: "trigger-universe-ranking",
  targetFunctionName: `${process.env.SERVICE_NAME}-${process.env.STAGE}-universeRankingWorker`,
  operation: "manual_api_trigger",
  validateEnvironment: validateEnvironment,
});
