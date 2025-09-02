/**
 * Trigger Backtest API Handler
 * REST API endpoint for triggering manual backtests
 */

const Logger = require("../../utils/logger");
const ErrorHandler = require("../../utils/error-handler");
const { validateEnvironment } = require("../../config/environment");

let logger;
let errorHandler;

/**
 * Lambda handler for POST /api/backtest
 */
module.exports.handler = async (event, context) => {
  // Initialize services
  logger = new Logger("trigger-backtest");
  errorHandler = new ErrorHandler("trigger-backtest");

  try {
    // Log function start
    logger.logLambdaStart(event, context);

    // Validate environment
    validateEnvironment();

    // Parse request body
    let requestBody;
    try {
      requestBody = JSON.parse(event.body || "{}");
    } catch (error) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          error: "Invalid JSON in request body",
          message: error.message,
        }),
      };
    }

    const { startDate, endDate, tickers } = requestBody;

    // Validate required parameters
    if (!startDate || !endDate) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          error: "Missing required parameters",
          required: ["startDate", "endDate"],
          provided: { startDate, endDate, tickers },
        }),
      };
    }

    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          error: "Invalid date format. Use YYYY-MM-DD format.",
          provided: { startDate, endDate },
        }),
      };
    }

    // Validate date range
    const start = new Date(startDate);
    const end = new Date(endDate);
    const now = new Date();

    if (start >= end) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          error: "Start date must be before end date",
          provided: { startDate, endDate },
        }),
      };
    }

    if (end > now) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          error: "End date cannot be in the future",
          provided: endDate,
          currentDate: now.toISOString().split("T")[0],
        }),
      };
    }

    logger.info("Starting backtest", {
      startDate,
      endDate,
      tickers: tickers || "all",
    });

    // TODO: Implement actual backtest logic
    // For now, return a placeholder response
    const backtestResult = {
      status: "initiated",
      backtestId: `backtest_${Date.now()}`,
      parameters: {
        startDate,
        endDate,
        tickers: tickers || ["ABEO", "CADL", "CSAI"], // Default test tickers
        aiProvider: "openai",
        aiModel: "gpt-4",
      },
      message:
        "Backtest framework not yet implemented. This is a placeholder response.",
      estimatedCompletion: "TBD",
    };

    logger.info("Backtest initiated", {
      backtestId: backtestResult.backtestId,
      tickers: backtestResult.parameters.tickers.length,
    });

    // Log function end
    logger.logLambdaEnd(Date.now() - context.getRemainingTimeInMillis());

    return {
      statusCode: 202, // Accepted - processing will happen asynchronously
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
      body: JSON.stringify(backtestResult),
    };
  } catch (error) {
    logger.error("Backtest trigger failed", error);

    // Log function end with error
    logger.logLambdaEnd(Date.now() - context.getRemainingTimeInMillis(), false);

    return errorHandler.createErrorResponse(error);
  }
};
