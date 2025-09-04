/**
 * Discovery Ingestion Handler
 * Scheduled Lambda handler for ingesting fundamentals and news data
 */

const IngestionService = require("../../services/discovery/ingestion-service");
const Logger = require("../../utils/logger");
const ErrorHandler = require("../../utils/error-handler");
const { validateEnvironment } = require("../../config/environment");

let logger;
let errorHandler;

/**
 * Scheduled Lambda handler for discovery ingestion
 * Runs every 6 hours at 00:00, 06:00, 12:00, 18:00 UTC
 */
module.exports.handler = async (event, context) => {
  // Initialize services
  logger = new Logger("discovery-ingestion");
  errorHandler = new ErrorHandler("discovery-ingestion");

  try {
    // Log function start
    logger.logLambdaStart(event, context);

    // Validate environment
    validateEnvironment();

    logger.info("🚀 Starting discovery ingestion process");

    // Initialize ingestion service
    const ingestionService = new IngestionService();

    // Run full ingestion process
    const results = await ingestionService.runIngestion();

    logger.info("✅ Discovery ingestion completed", {
      timestamp: results.timestamp,
      tickersProcessed: results.tickersProcessed,
      fundamentalsProcessed: results.fundamentals?.processed || 0,
      fundamentalsErrors: results.fundamentals?.errors || 0,
      newsProcessed: results.news?.processed || 0,
      newsErrors: results.news?.errors || 0,
    });

    // Log function end
    logger.logLambdaEnd(Date.now() - context.getRemainingTimeInMillis());

    // Force flush all remaining logs before returning
    await logger.flush();

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Discovery ingestion completed successfully",
        results: {
          timestamp: results.timestamp,
          tickersProcessed: results.tickersProcessed,
          fundamentals: results.fundamentals,
          news: results.news,
        },
        timestamp: new Date().toISOString(),
      }),
    };
  } catch (error) {
    logger.error("Discovery ingestion failed", error);

    // Send error alert
    try {
      await errorHandler.sendErrorAlert(error, {
        function: "discovery-ingestion",
        operation: "scheduled_ingestion",
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
