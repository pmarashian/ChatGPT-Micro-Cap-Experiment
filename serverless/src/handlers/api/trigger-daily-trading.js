/**
 * Manual Daily Trading Trigger API Handler
 * Allows manual execution of daily trading cycle for testing purposes
 * Uses job orchestration pattern for consistent behavior
 */

const { validateEnvironment } = require("../../config/environment");
const { withApiTriggerLifecycle } = require("../../utils/handler-wrapper");

const functionName =
  process.env.DAILY_TRADING_WORKER_FUNCTION_NAME ||
  `${process.env.SERVICE_NAME}-${process.env.STAGE}-dailyTradingWorker`;

module.exports.handler = withApiTriggerLifecycle({
  triggerHandlerName: "trigger-daily-trading",
  targetFunctionName: functionName,
  operation: "manual_daily_trading_trigger",
  validateEnvironment: validateEnvironment,
});
