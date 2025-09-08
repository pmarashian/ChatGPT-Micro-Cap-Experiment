/**
 * Universe Ranking Worker Handler
 * Worker Lambda function that performs the actual universe ranking business logic
 * Invoked by both API triggers and cron triggers
 */

const { validateEnvironment } = require("../../config/environment");
const {
  performUniverseRanking,
} = require("../../services/discovery/universe-ranking-orchestrator");

const {
  withJobOrchestratedHandlerLifecycle,
} = require("../../utils/handler-wrapper");

/**
 * Pure business logic for universe ranking
 * No orchestration concerns - just the core functionality
 */
const businessLogic = async ({ logger, errorHandler, event, context }) => {
  // Execute universe ranking using shared orchestrator
  const rankedSnapshot = await performUniverseRanking({
    invocationType: "scheduled",
    logger: logger,
    errorHandler: errorHandler,
  });

  logger.info("Universe ranking completed successfully", {
    snapshotId: rankedSnapshot.id,
    totalTickers: rankedSnapshot.totalTickers,
    topScore: rankedSnapshot.scores[0]?.compositeScore || 0,
    scoredTickers: rankedSnapshot.scores.filter((s) => s.evidenceCount > 0)
      .length,
    averageScore:
      rankedSnapshot.scores.reduce((sum, s) => sum + s.compositeScore, 0) /
      rankedSnapshot.scores.length,
  });

  // No response needed for cron-triggered functions
  return null;
};

module.exports.handler = withJobOrchestratedHandlerLifecycle(businessLogic, {
  handlerName: "universe-ranking-worker",
  operation: "universe_ranking_processing",
  validateEnvironment: validateEnvironment,
  jobName: "universeRanking", // Used for orchestration updates
});
