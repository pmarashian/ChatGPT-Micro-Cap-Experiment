/**
 * Get Latest Universe API Handler
 * Returns the latest universe snapshot
 */

const UniverseService = require("../../services/discovery/universe-service");
const Logger = require("../../utils/logger");
const ErrorHandler = require("../../utils/error-handler");
const { validateEnvironment } = require("../../config/environment");

let logger;
let errorHandler;

/**
 * API handler for getting the latest universe snapshot
 */
module.exports.handler = async (event, context) => {
  // Initialize services
  logger = new Logger("get-universe-latest");
  errorHandler = new ErrorHandler("get-universe-latest");

  try {
    // Log function start
    logger.logLambdaStart(event, context);

    // Validate environment
    validateEnvironment();

    logger.info("Fetching latest universe snapshot");

    // Initialize universe service
    const universeService = new UniverseService();

    // Get latest universe
    const latestUniverse = await universeService.getLatestUniverse();

    if (!latestUniverse) {
      logger.warn("No universe snapshot found");
      return {
        statusCode: 404,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          error: "No universe snapshot found",
          message:
            "Please wait for the next universe build or trigger it manually",
        }),
      };
    }

    logger.info("Successfully retrieved latest universe", {
      snapshotId: latestUniverse.id,
      date: latestUniverse.date,
      totalTickers: latestUniverse.tickers.length,
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
        universe: latestUniverse,
        timestamp: new Date().toISOString(),
      }),
    };
  } catch (error) {
    logger.error("Failed to get latest universe", error);

    // Send error alert
    try {
      await errorHandler.sendErrorAlert(error, {
        function: "get-universe-latest",
        operation: "api_get_latest_universe",
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
        error: "Failed to retrieve universe",
        message: error.message,
      }),
    };
  }
};
