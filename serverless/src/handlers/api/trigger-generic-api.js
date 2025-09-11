/**
 * Trigger Migration API Handler
 * Manually runs the trade records migration to add GSI2 attributes
 */

const Logger = require("../../utils/logger");
const ErrorHandler = require("../../utils/error-handler");

const { withApiLogFlushing } = require("../../utils/handler-wrapper");
const { getNextRunTime } = require("../../services/job-orchestration-service");

let logger;
let errorHandler;

/**
 * Generic API handler
 */
const baseHandler = async (event, context) => {
  // Initialize services
  logger = new Logger("generic-api-trigger");
  errorHandler = new ErrorHandler("generic-api-trigger");

  const nextRunTime = getNextRunTime("0 16 * * ?", "America/New_York");

  logger.info(`Next run time: ${nextRunTime.toISOString()}`);

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
      message: "",
    }),
  };
};

// Wrap the handler with automatic log flushing
module.exports.handler = withApiLogFlushing(baseHandler, "generic-api-trigger");
