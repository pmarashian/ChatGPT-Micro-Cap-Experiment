/**
 * Order Monitor Worker Handler
 * Worker Lambda function that performs the actual order monitoring business logic
 * Invoked by both API triggers and the job orchestrator
 */

const { validateEnvironment } = require("../../config/environment");
const {
  performOrderMonitoring,
} = require("../../services/trading/order-monitor-orchestrator");

const {
  withJobOrchestratedHandlerLifecycle,
} = require("../../utils/handler-wrapper");

/**
 * Pure business logic for order monitoring
 * No orchestration concerns - just the core functionality
 */
const businessLogic = async ({ logger, errorHandler, event, context }) => {
  // Execute order monitoring using shared orchestrator
  const result = await performOrderMonitoring({
    invocationType: "scheduled",
    logger: logger,
    errorHandler: errorHandler,
  });

  logger.info("Order monitoring completed successfully", result);

  // No response needed for scheduled functions
  return null;
};

module.exports.handler = withJobOrchestratedHandlerLifecycle(businessLogic, {
  handlerName: "order-monitor-worker",
  operation: "order_monitoring_processing",
  validateEnvironment: validateEnvironment,
  jobName: "orderMonitor",
});
