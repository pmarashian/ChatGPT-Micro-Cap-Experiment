/**
 * Market Research Worker Handler
 * Worker Lambda function that performs the actual market research business logic
 * Invoked by both API triggers and the job orchestrator
 */

const { validateEnvironment } = require("../../config/environment");
const {
  performMarketResearch,
} = require("../../services/trading/market-research-orchestrator");

const {
  withJobOrchestratedHandlerLifecycle,
} = require("../../utils/handler-wrapper");

/**
 * Pure business logic for market research
 * No orchestration concerns - just the core functionality
 */
const businessLogic = async ({ logger, errorHandler, event, context }) => {
  // Execute market research using shared orchestrator
  const result = await performMarketResearch({
    invocationType: "scheduled",
    logger: logger,
    errorHandler: errorHandler,
  });

  logger.info("Market research completed successfully", result);

  // No response needed for scheduled functions
  return null;
};

module.exports.handler = withJobOrchestratedHandlerLifecycle(businessLogic, {
  handlerName: "market-research-worker",
  operation: "market_research_processing",
  validateEnvironment: validateEnvironment,
  jobName: "marketResearch",
});
