/**
 * Universe Ranking Handler
 * Scheduled Lambda handler for ranking universe tickers based on evidence
 * Runs after ingestion to compute deterministic composite scores
 */

const RankerService = require("../../services/discovery/ranker");
const Logger = require("../../utils/logger");
const ErrorHandler = require("../../utils/error-handler");
const { validateEnvironment } = require("../../config/environment");

let logger;
let errorHandler;

/**
 * Scheduled Lambda handler for universe ranking
 * Runs daily after universe build and ingestion
 */
module.exports.handler = async (event, context) => {
  // Initialize services
  logger = new Logger("universe-ranking");
  errorHandler = new ErrorHandler("universe-ranking");

  try {
    // Log function start
    logger.logLambdaStart(event, context);

    // Validate environment
    validateEnvironment();

    logger.info("🚀 Starting universe ranking process");

    // Initialize ranker service
    const rankerService = new RankerService();

    // Run ranking process
    const rankedSnapshot = await rankerService.rankUniverse();

    logger.info("✅ Universe ranking completed successfully", {
      snapshotId: rankedSnapshot.id,
      totalTickers: rankedSnapshot.totalTickers,
      topScore: rankedSnapshot.scores[0]?.compositeScore || 0,
      scoredTickers: rankedSnapshot.scores.filter((s) => s.evidenceCount > 0)
        .length,
      averageScore:
        rankedSnapshot.scores.reduce((sum, s) => sum + s.compositeScore, 0) /
        rankedSnapshot.scores.length,
    });

    // Log function end
    logger.logLambdaEnd(Date.now() - context.getRemainingTimeInMillis());

    // Force flush all remaining logs before returning
    await logger.flush();

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Universe ranking completed successfully",
        rankedSnapshot,
        timestamp: new Date().toISOString(),
      }),
    };
  } catch (error) {
    logger.error("Universe ranking failed", error);
    await errorHandler.sendErrorAlert(error, {
      function: "universe-ranking",
      operation: "scheduled_ranking",
    });

    // Log function end with error
    logger.logLambdaEnd(Date.now() - context.getRemainingTimeInMillis(), false);

    // Force flush all remaining logs before throwing error
    try {
      await logger.flush();
    } catch (flushError) {
      // Silent fail - don't let flush errors mask the original error
    }

    throw error;
  }
};
