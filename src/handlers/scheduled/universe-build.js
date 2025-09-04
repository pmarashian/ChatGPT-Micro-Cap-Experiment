/**
 * Universe Build Handler
 * Scheduled Lambda handler for building daily micro-cap biotech universe
 */

const UniverseService = require("../../services/discovery/universe-service");
const Logger = require("../../utils/logger");
const ErrorHandler = require("../../utils/error-handler");
const { validateEnvironment } = require("../../config/environment");

let logger;
let errorHandler;

/**
 * Scheduled Lambda handler for universe build
 * Runs daily at 03:00 UTC
 */
module.exports.handler = async (event, context) => {
  // Initialize services
  logger = new Logger("universe-build");
  errorHandler = new ErrorHandler("universe-build");

  try {
    // Log function start
    logger.logLambdaStart(event, context);

    // Validate environment
    validateEnvironment();

    logger.info("🚀 Starting daily universe build");

    // Initialize universe service
    const universeService = new UniverseService();

    // Build the universe
    const universeSnapshot = await universeService.buildUniverse();

    logger.info("✅ Universe build completed successfully", {
      snapshotId: universeSnapshot.id,
      totalTickers: universeSnapshot.tickers.length,
      date: universeSnapshot.date,
      avgMarketCap: universeSnapshot.stats.avgMarketCap,
      avgPrice: universeSnapshot.stats.avgPrice,
    });

    // Log function end
    logger.logLambdaEnd(Date.now() - context.getRemainingTimeInMillis());

    // Force flush all remaining logs before returning
    await logger.flush();

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Universe build completed successfully",
        universeSnapshot: {
          id: universeSnapshot.id,
          date: universeSnapshot.date,
          totalTickers: universeSnapshot.tickers.length,
          stats: universeSnapshot.stats,
        },
        timestamp: new Date().toISOString(),
      }),
    };
  } catch (error) {
    logger.error("Universe build failed", error);

    // Send error alert
    try {
      await errorHandler.sendErrorAlert(error, {
        function: "universe-build",
        operation: "daily_universe_refresh",
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

    throw error;
  }
};
