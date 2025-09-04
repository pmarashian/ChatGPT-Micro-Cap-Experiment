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

let logger;
let errorHandler;
let lambda;

/**
 * Lambda handler for manual daily trading trigger
 */
module.exports.handler = async (event, context) => {
  // Initialize services
  logger = new Logger("trigger-daily-trading");
  errorHandler = new ErrorHandler("trigger-daily-trading");
  lambda = createLambdaClient();

  try {
    // Log function start
    logger.logLambdaStart(event, context);

    // Debug environment variables
    logger.info("🔍 DEBUG: Environment check", {
      EXECUTE_TRADES: process.env.EXECUTE_TRADES,
      EXECUTE_TRADES_type: typeof process.env.EXECUTE_TRADES,
      EXECUTE_TRADES_length: process.env.EXECUTE_TRADES?.length,
      all_env_keys: Object.keys(process.env).filter((key) =>
        key.includes("EXECUTE")
      ),
      NODE_ENV: process.env.NODE_ENV,
    });

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
