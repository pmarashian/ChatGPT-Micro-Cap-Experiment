/**
 * Stop Loss Worker Handler
 * Worker Lambda function that performs the actual stop-loss monitoring business logic
 * Invoked by both API triggers and the job orchestrator
 */

const { validateEnvironment } = require("../../config/environment");
const {
  performStopLossMonitoring,
} = require("../../services/trading/stop-loss-orchestrator");

const {
  withJobOrchestratedHandlerLifecycle,
} = require("../../utils/handler-wrapper");

/**
 * Pure business logic for stop-loss monitoring
 * No orchestration concerns - just the core functionality
 */
const businessLogic = async ({ logger, errorHandler, event, context }) => {
  // Execute stop-loss monitoring using shared orchestrator
  const result = await performStopLossMonitoring({
    invocationType: "scheduled",
    logger: logger,
    errorHandler: errorHandler,
  });

  logger.info("Stop-loss monitoring completed successfully", result);

  // No response needed for scheduled functions
  return null;
};

module.exports.handler = withJobOrchestratedHandlerLifecycle(businessLogic, {
  handlerName: "stop-loss-worker",
  operation: "stop_loss_monitoring_processing",
  validateEnvironment: validateEnvironment,
  jobName: "stopLoss",
});
