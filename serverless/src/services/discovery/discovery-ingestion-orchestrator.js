/**
 * Discovery Ingestion Orchestrator
 * Shared function for both manual and scheduled discovery ingestion
 */

const IngestionService = require("./ingestion-service");
const Logger = require("../../utils/logger");
const ErrorHandler = require("../../utils/error-handler");

/**
 * Execute discovery ingestion with consistent orchestration
 * @param {Object} options - Configuration options
 * @param {string} options.invocationType - 'manual' or 'scheduled'
 * @param {Object} options.logger - Optional logger instance
 * @param {Object} options.errorHandler - Optional error handler instance
 * @returns {Promise<Object>} Ingestion results
 */
async function performDiscoveryIngestion(options = {}) {
  const { invocationType = "manual", logger, errorHandler } = options;

  // Use provided logger/errorHandler or create new ones
  const logInstance =
    logger || new Logger(`discovery-ingestion-${invocationType}`);
  const errorHandlerInstance =
    errorHandler || new ErrorHandler(`discovery-ingestion-${invocationType}`);

  try {
    // Log function start
    logInstance.info(`🚀 Starting ${invocationType} discovery ingestion`);

    // Initialize ingestion service
    const ingestionService = new IngestionService();

    // Run full ingestion process
    const results = await ingestionService.runIngestion();

    logInstance.info(`✅ Discovery ingestion completed successfully`, {
      timestamp: results.timestamp,
      tickersProcessed: results.tickersProcessed,
      fundamentalsProcessed: results.fundamentals?.processed || 0,
      fundamentalsErrors: results.fundamentals?.errors || 0,
      newsProcessed: results.news?.processed || 0,
      newsErrors: results.news?.errors || 0,
    });

    return results;
  } catch (error) {
    logInstance.error(`Discovery ingestion failed`, error);

    // Send error alert if error handler provided
    if (errorHandlerInstance) {
      try {
        await errorHandlerInstance.sendErrorAlert(error, {
          function: `discovery-ingestion-${invocationType}`,
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
  performDiscoveryIngestion,
};
