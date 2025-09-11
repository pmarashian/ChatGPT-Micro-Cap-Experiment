/**
 * Portfolio Update Worker Handler
 * Worker Lambda function that performs the actual portfolio update business logic
 * Invoked by both API triggers and the job orchestrator
 */

const { validateEnvironment } = require("../../config/environment");
const {
  performPortfolioUpdate,
} = require("../../services/trading/portfolio-update-orchestrator");

const {
  withJobOrchestratedHandlerLifecycle,
} = require("../../utils/handler-wrapper");

/**
 * Pure business logic for portfolio update
 * No orchestration concerns - just the core functionality
 */
const businessLogic = async ({ logger, errorHandler, event, context }) => {
  // Execute portfolio update using shared orchestrator
  const result = await performPortfolioUpdate({
    invocationType: "scheduled",
    logger: logger,
    errorHandler: errorHandler,
  });

  logger.info("Portfolio update completed successfully", result);

  // No response needed for scheduled functions
  return null;
};

module.exports.handler = withJobOrchestratedHandlerLifecycle(businessLogic, {
  handlerName: "portfolio-update-worker",
  operation: "portfolio_update_processing",
  validateEnvironment: validateEnvironment,
  jobName: "portfolioUpdate",
});
