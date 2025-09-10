/**
 * Discovery Ingestion Worker Handler
 * Worker Lambda function that performs the actual discovery ingestion business logic
 * Invoked by both API triggers and cron triggers
 */

const { validateEnvironment } = require("../../config/environment");
const {
  performDiscoveryIngestion,
} = require("../../services/discovery/discovery-ingestion-orchestrator");

const {
  withJobOrchestratedHandlerLifecycle,
} = require("../../utils/handler-wrapper");

/**
 * Pure business logic for discovery ingestion
 * No orchestration concerns - just the core functionality
 */
const businessLogic = async ({ logger, errorHandler }) => {
  // Execute discovery ingestion using shared orchestrator
  const results = await performDiscoveryIngestion({
    invocationType: "scheduled",
    logger: logger,
    errorHandler: errorHandler,
  });

  logger.info("Discovery ingestion completed successfully", {
    timestamp: results.timestamp,
    tickersProcessed: results.tickersProcessed,
    fundamentalsProcessed: results.fundamentals?.processed || 0,
    fundamentalsErrors: results.fundamentals?.errors || 0,
    newsProcessed: results.news?.processed || 0,
    newsErrors: results.news?.errors || 0,
  });

  // No response needed for cron-triggered functions
  return null;
};

module.exports.handler = withJobOrchestratedHandlerLifecycle(businessLogic, {
  handlerName: "discovery-ingestion-worker",
  operation: "discovery_ingestion_processing",
  validateEnvironment: validateEnvironment,
  jobName: "discoveryIngestion", // Used for orchestration updates
});
