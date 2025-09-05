/**
 * Trigger Market Research API Handler
 * Manually invokes the market research scheduled function
 */

const Logger = require("../../utils/logger");
const ErrorHandler = require("../../utils/error-handler");
const { validateEnvironment } = require("../../config/environment");
const {
  createLambdaClient,
  invokeLambdaFunction,
} = require("../../utils/lambda-client");

const { withApiLogFlushing } = require("../../utils/handler-wrapper");

let logger;
let errorHandler;
let lambda;

/**
 * API handler for triggering market research manually
 */
const baseHandler = async (event, context) => {
  // Initialize services
  logger = new Logger("trigger-market-research");
  errorHandler = new ErrorHandler("trigger-market-research");

  try {
    // Log function start
    logger.logLambdaStart(event, context);

    // Validate environment
    validateEnvironment();

    // Initialize Lambda client
    lambda = createLambdaClient();

    logger.info("Manually triggering market research");

    // Get function name from environment
    const functionName =
      process.env.MARKET_RESEARCH_FUNCTION_NAME ||
      `${process.env.SERVICE_NAME}-${process.env.STAGE}-marketResearch`;

    // Invoke the market research function
    const result = await invokeLambdaFunction(functionName, {}, lambda);

    logger.info("Market research triggered successfully", {
      functionName: functionName,
      requestId: result.$response.requestId,
      statusCode: result.StatusCode,
    });

    // Log function end
    logger.logLambdaEnd(Date.now() - context.getRemainingTimeInMillis());

    return {
      statusCode: 202, // Accepted - asynchronous operation
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
      body: JSON.stringify({
        success: true,
        message: "Market research triggered successfully",
        functionName: functionName,
        requestId: result.$response.requestId,
        timestamp: new Date().toISOString(),
      }),
    };
  } catch (error) {
    logger.error("Failed to trigger market research", error);

    // Send error alert
    try {
      await errorHandler.sendErrorAlert(error, {
        function: "trigger-market-research",
        operation: "manual_api_trigger",
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
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
      body: JSON.stringify({
        error: "Failed to trigger market research",
        message: error.message,
      }),
    };
  }
};

// Wrap the handler with automatic log flushing
module.exports.handler = withApiLogFlushing(
  baseHandler,
  "trigger-market-research"
);
