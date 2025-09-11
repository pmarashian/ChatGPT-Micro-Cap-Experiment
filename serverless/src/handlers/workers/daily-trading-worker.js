/**
 * Daily Trading Worker Handler
 * Worker Lambda function that performs the actual daily trading business logic
 * Invoked by both API triggers and the job orchestrator
 */

const { validateEnvironment } = require("../../config/environment");
const {
  performDailyTrading,
} = require("../../services/trading/daily-trading-orchestrator");

const {
  withJobOrchestratedHandlerLifecycle,
} = require("../../utils/handler-wrapper");

/**
 * Pure business logic for daily trading
 * No orchestration concerns - just the core functionality
 */
const businessLogic = async ({ logger, errorHandler, event, context }) => {
  // Execute daily trading using shared orchestrator
  const result = await performDailyTrading({
    invocationType: "scheduled",
    logger: logger,
    errorHandler: errorHandler,
  });

  logger.info("Daily trading completed successfully", result);

  // No response needed for scheduled functions
  return null;
};

module.exports.handler = withJobOrchestratedHandlerLifecycle(businessLogic, {
  handlerName: "daily-trading-worker",
  operation: "daily_trading_processing",
  validateEnvironment: validateEnvironment,
  jobName: "dailyTrading",
});
