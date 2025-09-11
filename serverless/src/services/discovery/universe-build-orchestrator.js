/**
 * Universe Build Orchestrator
 * Shared function for both manual and scheduled universe builds
 */

const UniverseService = require("./universe-service");
const Logger = require("../../utils/logger");
const ErrorHandler = require("../../utils/error-handler");

/**
 * Execute universe build with consistent orchestration
 * @param {Object} options - Configuration options
 * @param {string} options.invocationType - 'manual' or 'scheduled'
 * @param {Object} options.logger - Optional logger instance
 * @param {Object} options.errorHandler - Optional error handler instance
 * @returns {Promise<Object>} Universe snapshot result
 */
async function performUniverseBuild(options = {}) {
  const { invocationType = "manual", logger, errorHandler } = options;

  // Use provided logger/errorHandler or create new ones
  const logInstance = logger || new Logger(`universe-build-${invocationType}`);
  const errorHandlerInstance =
    errorHandler || new ErrorHandler(`universe-build-${invocationType}`);

  try {
    // Log function start
    logInstance.info(`🚀 Starting ${invocationType} universe build`);

    // Initialize universe service
    const universeService = new UniverseService();

    // Build the universe
    const universeSnapshot = await universeService.buildUniverse();

    logInstance.info(`✅ Universe build completed successfully`, {
      snapshotId: universeSnapshot.id,
      totalTickers: universeSnapshot.tickers.length,
      date: universeSnapshot.date,
      avgMarketCap: universeSnapshot.stats.avgMarketCap,
      avgPrice: universeSnapshot.stats.avgPrice,
    });

    return universeSnapshot;
  } catch (error) {
    logInstance.error(`Universe build failed`, error);

    // Send error alert if error handler provided
    if (errorHandlerInstance) {
      try {
        await errorHandlerInstance.sendErrorAlert(error, {
          function: `universe-build-${invocationType}`,
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
  performUniverseBuild,
};
