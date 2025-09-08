/**
 * Trigger Migration API Handler
 * Manually runs the trade records migration to add GSI2 attributes
 */

const Logger = require("../../utils/logger");
const ErrorHandler = require("../../utils/error-handler");
const { validateEnvironment } = require("../../config/environment");
const {
  migrateTradeRecords,
  verifyMigration,
} = require("../../utils/trade-migration");

const { withApiLogFlushing } = require("../../utils/handler-wrapper");

let logger;
let errorHandler;

/**
 * API handler for triggering trade records migration
 */
const baseHandler = async (event, context) => {
  // Initialize services
  logger = new Logger("trigger-migration");
  errorHandler = new ErrorHandler("trigger-migration");

  try {
    // Log function start
    logger.logLambdaStart(event, context);

    // Validate environment
    validateEnvironment();

    logger.info("Starting trade records migration");

    // Run the migration
    const migrationResult = await migrateTradeRecords();

    // Verify the migration
    const verificationResult = await verifyMigration();

    logger.info("Trade records migration completed", {
      migrated: migrationResult.migrated,
      verified: verificationResult.verified,
    });

    // Log function end
    logger.logLambdaEnd(Date.now() - context.getRemainingTimeInMillis());

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
      body: JSON.stringify({
        success: true,
        message: "Trade records migration completed successfully",
        results: {
          migration: migrationResult,
          verification: verificationResult,
        },
        timestamp: new Date().toISOString(),
      }),
    };
  } catch (error) {
    logger.error("Trade records migration failed", error);

    // Send error alert
    try {
      await errorHandler.sendErrorAlert(error, {
        function: "trigger-migration",
        operation: "manual_migration",
      });
    } catch (alertError) {
      logger.error("Failed to send error alert", alertError);
    }

    // Log function end with error
    logger.logLambdaEnd(Date.now() - context.getRemainingTimeInMillis(), false);

    // Force flush all remaining logs before returning error
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
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
      body: JSON.stringify({
        error: "Trade records migration failed",
        message: error.message,
        timestamp: new Date().toISOString(),
      }),
    };
  }
};

// Wrap the handler with automatic log flushing
module.exports.handler = withApiLogFlushing(baseHandler, "trigger-migration");
