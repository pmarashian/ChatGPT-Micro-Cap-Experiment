/**
 * Trigger Market Research API Handler
 * Manually invokes the market research worker using job orchestration pattern
 */

const { validateEnvironment } = require("../../config/environment");
const { withApiTriggerLifecycle } = require("../../utils/handler-wrapper");

const functionName =
  process.env.MARKET_RESEARCH_WORKER_FUNCTION_NAME ||
  `${process.env.SERVICE_NAME}-${process.env.STAGE}-marketResearchWorker`;

module.exports.handler = withApiTriggerLifecycle({
  triggerHandlerName: "trigger-market-research",
  targetFunctionName: functionName,
  operation: "manual_market_research_trigger",
  validateEnvironment: validateEnvironment,
});
