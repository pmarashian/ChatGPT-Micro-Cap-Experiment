/**
 * Get Ranked Universe API Handler
 * Returns the latest ranked universe snapshot with ticker scores and reason codes
 */

const AIMemoryService = require("../../services/ai-memory-service");
const Logger = require("../../utils/logger");
const ErrorHandler = require("../../utils/error-handler");
const { validateEnvironment } = require("../../config/environment");

let logger;
let errorHandler;

/**
 * API handler for getting the latest ranked universe snapshot
 */
module.exports.handler = async (event, context) => {
  // Initialize services
  logger = new Logger("get-ranked-universe");
  errorHandler = new ErrorHandler("get-ranked-universe");

  try {
    // Log function start
    logger.logLambdaStart(event, context);

    // Validate environment
    validateEnvironment();

    logger.info("Fetching latest ranked universe snapshot");

    // Initialize AI memory service
    const aiMemoryService = new AIMemoryService();

    // Get latest ranked universe
    const rankedUniverse = await aiMemoryService.getLatestRankedUniverse();

    if (!rankedUniverse) {
      logger.warn("No ranked universe snapshot found");
      return {
        statusCode: 404,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          error: "No ranked universe snapshot found",
          message:
            "Please wait for the ranking process to complete or trigger it manually",
        }),
      };
    }

    logger.info("Successfully retrieved ranked universe", {
      snapshotId: rankedUniverse.snapshotId,
      date: rankedUniverse.date,
      totalTickers: rankedUniverse.totalTickers,
      topScore: rankedUniverse.scores?.[0]?.compositeScore || 0,
    });

    // Log function end
    logger.logLambdaEnd(Date.now() - context.getRemainingTimeInMillis());

    // Force flush all remaining logs before returning
    await logger.flush();

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        success: true,
        rankedUniverse,
        timestamp: new Date().toISOString(),
      }),
    };
  } catch (error) {
    logger.error("Failed to get ranked universe", error);

    // Send error alert
    try {
      await errorHandler.sendErrorAlert(error, {
        function: "get-ranked-universe",
        operation: "api_get_ranked_universe",
      });
    } catch (alertError) {
      logger.error("Failed to send error alert", alertError);
    }

    // Log function end with error
    logger.logLambdaEnd(Date.now() - context.getRemainingTimeInMillis(), false);

    // Force flush all remaining logs before throwing error
    try {
      await logger.flush();
    } catch (flushError) {
      // Silent fail - don't let flush errors mask the original error
    }

    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        error: "Failed to retrieve ranked universe",
        message: error.message,
      }),
    };
  }
};
