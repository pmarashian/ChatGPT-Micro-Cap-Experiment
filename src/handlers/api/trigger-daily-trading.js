/**
 * Manual Daily Trading Trigger API Handler
 * Allows manual execution of daily trading cycle for testing purposes
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
 * Lambda handler for manual daily trading trigger
 */
const baseHandler = async (event, context) => {
  // Initialize services
  logger = new Logger("trigger-daily-trading");
  errorHandler = new ErrorHandler("trigger-daily-trading");
  lambda = createLambdaClient();

  try {
    // Log function start
    logger.logLambdaStart(event, context);

    // Validate environment
    validateEnvironment();

    logger.info("Manually triggering daily trading Lambda");

    const functionName =
      process.env.DAILY_TRADING_FUNCTION_NAME ||
      `${process.env.SERVICE_NAME}-${process.env.STAGE}-dailyTrading`;

    const result = await invokeLambdaFunction(functionName, {}, lambda);

    logger.info("Daily trading triggered successfully", {
      functionName,
      requestId: result.$response.requestId,
      statusCode: result.StatusCode,
    });

    // Log function end
    logger.logLambdaEnd(Date.now() - context.getRemainingTimeInMillis());

    return {
      statusCode: 202,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        success: true,
        message: "Daily trading triggered successfully",
        functionName,
        requestId: result.$response.requestId,
        timestamp: new Date().toISOString(),
      }),
    };
  } catch (error) {
    logger.error("Manual daily trading failed", error);
    await errorHandler.sendErrorAlert(error, {
      function: "trigger-daily-trading",
      triggeredBy: "manual",
    });

    // Log function end with error
    logger.logLambdaEnd(Date.now() - context.getRemainingTimeInMillis(), false);

    return errorHandler.createErrorResponse(error);
  }
};

module.exports.handler = withApiLogFlushing(
  baseHandler,
  "trigger-daily-trading"
);
