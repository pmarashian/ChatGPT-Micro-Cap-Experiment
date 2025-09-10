/**
 * Universe Build Worker Handler
 * Worker Lambda function that performs the actual universe building business logic
 * Invoked by both API triggers and cron triggers
 */

const { validateEnvironment } = require("../../config/environment");
const {
  performUniverseBuild,
} = require("../../services/discovery/universe-build-orchestrator");

const {
  withJobOrchestratedHandlerLifecycle,
} = require("../../utils/handler-wrapper");

/**
 * Pure business logic for universe build
 * No orchestration concerns - just the core functionality
 */
const businessLogic = async ({ logger, errorHandler }) => {
  // Execute universe build using shared orchestrator

  logger.info("Starting universe build", {
    invocationType: "scheduled",
  });

  // Execute actual universe build
  const universeSnapshot = await performUniverseBuild({
    invocationType: "scheduled",
    logger: logger,
    errorHandler: errorHandler,
  });

  logger.info("Universe build completed successfully", {
    snapshotId: universeSnapshot.id,
    totalTickers: universeSnapshot.tickers.length,
    date: universeSnapshot.date,
    avgMarketCap: universeSnapshot.stats.avgMarketCap,
    avgPrice: universeSnapshot.stats.avgPrice,
  });

  // No response needed for cron-triggered functions
  return null;
};

module.exports.handler = withJobOrchestratedHandlerLifecycle(businessLogic, {
  handlerName: "universe-build-worker",
  operation: "universe_build_processing",
  validateEnvironment: validateEnvironment,
  jobName: "universeBuild", // Used for orchestration updates
});
