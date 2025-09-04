/**
 * Trigger Universe Build API Handler
 * Manually invokes the universe build scheduled function
 */

const Logger = require("../../utils/logger");
const ErrorHandler = require("../../utils/error-handler");
const { validateEnvironment } = require("../../config/environment");
const {
  createLambdaClient,
  invokeLambdaFunction,
} = require("../../utils/lambda-client");

let logger;
let errorHandler;
let lambda;

/**
 * API handler for triggering universe build manually
 */
module.exports.handler = async (event, context) => {
  // Initialize services
  logger = new Logger("trigger-universe-build");
  errorHandler = new ErrorHandler("trigger-universe-build");

  try {
    // Log function start
    logger.logLambdaStart(event, context);

    // Validate environment
    validateEnvironment();

    // Initialize Lambda client
    lambda = createLambdaClient();

    logger.info("Manually triggering universe build");

    // Get function name from environment
    const functionName =
      process.env.UNIVERSE_BUILD_FUNCTION_NAME ||
      `${process.env.SERVICE_NAME}-${process.env.STAGE}-universeBuild`;

    // Invoke the universe build function
    const result = await invokeLambdaFunction(functionName, {}, lambda);

    logger.info("Universe build triggered successfully", {
      functionName: functionName,
      requestId: result.$response.requestId,
      statusCode: result.StatusCode,
    });

    // Log function end
    logger.logLambdaEnd(Date.now() - context.getRemainingTimeInMillis());

    // Force flush all remaining logs before returning
    await logger.flush();

    return {
      statusCode: 202, // Accepted - asynchronous operation
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        success: true,
        message: "Universe build triggered successfully",
        functionName: functionName,
        requestId: result.$response.requestId,
        timestamp: new Date().toISOString(),
      }),
    };
  } catch (error) {
    logger.error("Failed to trigger universe build", error);

    // Send error alert
    try {
      await errorHandler.sendErrorAlert(error, {
        function: "trigger-universe-build",
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
      },
      body: JSON.stringify({
        error: "Failed to trigger universe build",
        message: error.message,
      }),
    };
  }
};
