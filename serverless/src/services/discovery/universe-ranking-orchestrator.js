/**
 * Universe Ranking Orchestrator
 * Shared function for both manual and scheduled universe ranking
 */

const RankerService = require("./ranker");
const Logger = require("../../utils/logger");
const ErrorHandler = require("../../utils/error-handler");

/**
 * Execute universe ranking with consistent orchestration
 * @param {Object} options - Configuration options
 * @param {string} options.invocationType - 'manual' or 'scheduled'
 * @param {Object} options.logger - Optional logger instance
 * @param {Object} options.errorHandler - Optional error handler instance
 * @returns {Promise<Object>} Ranked universe snapshot
 */
async function performUniverseRanking(options = {}) {
  const { invocationType = "manual", logger, errorHandler } = options;

  // Use provided logger/errorHandler or create new ones
  const logInstance =
    logger || new Logger(`universe-ranking-${invocationType}`);
  const errorHandlerInstance =
    errorHandler || new ErrorHandler(`universe-ranking-${invocationType}`);

  try {
    // Log function start
    logInstance.info(`🚀 Starting ${invocationType} universe ranking`);

    // Initialize ranker service
    const rankerService = new RankerService();

    // Run ranking process
    const rankedSnapshot = await rankerService.rankUniverse();

    logInstance.info(`✅ Universe ranking completed successfully`, {
      snapshotId: rankedSnapshot.id,
      totalTickers: rankedSnapshot.totalTickers,
      topScore: rankedSnapshot.scores[0]?.compositeScore || 0,
      scoredTickers: rankedSnapshot.scores.filter((s) => s.evidenceCount > 0)
        .length,
      averageScore:
        rankedSnapshot.scores.reduce((sum, s) => sum + s.compositeScore, 0) /
        rankedSnapshot.scores.length,
    });

    return rankedSnapshot;
  } catch (error) {
    logInstance.error(`Universe ranking failed`, error);

    // Send error alert if error handler provided
    if (errorHandlerInstance) {
      try {
        await errorHandlerInstance.sendErrorAlert(error, {
          function: `universe-ranking-${invocationType}`,
          operation:
            invocationType === "manual"
              ? "manual_trigger"
              : "scheduled_refresh",
        });
      } catch (alertError) {
        logInstance.error("Failed to send error alert", alertError);
      }
    }

    throw error;
  }
}

module.exports = {
  performUniverseRanking,
};
