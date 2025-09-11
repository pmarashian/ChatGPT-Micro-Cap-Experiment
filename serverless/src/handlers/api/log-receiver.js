const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");
const { isOffline } = require("../../utils/environment");
const { invokeLambdaFunction } = require("../../utils/lambda-client");

// Load environment variables for offline development
if (isOffline()) {
  require("dotenv").config({
    path: ".env.dev",
  });
}

// Debug logging for offline mode
if (isOffline()) {
  // console.log("Log Receiver: Running in offline mode");
}

// Import log processor for offline mode
let logProcessor = null;
if (isOffline()) {
  try {
    logProcessor = require("../scheduled/log-processor").logProcessor;
  } catch (e) {
    console.warn("Could not import logProcessor for offline mode:", e.message);
  }
}

/**
 * POST endpoint that receives batched logs and triggers async processing
 */
module.exports.logReceiver = async (event) => {
  try {
    const body = JSON.parse(event.body);
    const { logs } = body;

    if (!logs || !Array.isArray(logs)) {
      return {
        statusCode: 400,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Credentials": true,
        },
        body: JSON.stringify({ error: "Invalid logs format" }),
      };
    }

    // For offline development, process logs directly to avoid Lambda invoke issues
    if (isOffline()) {
      // console.log("Processing logs directly in offline mode...");
      // Process logs directly without Lambda invoke
      if (logProcessor) {
        await logProcessor({ logs });
      } else {
        console.warn(
          "Log processor not available in offline mode, logs will not be processed"
        );
      }

      return {
        statusCode: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Credentials": true,
        },
        body: JSON.stringify({ success: true, processed: logs.length }),
      };
    }

    // For AWS deployment, trigger async Lambda function
    const functionName = `${process.env.AWS_LAMBDA_FUNCTION_NAME?.replace(
      "logReceiver",
      "logProcessor"
    )}`;

    // Await the lambda invoke to ensure internal mechanisms complete
    try {
      await invokeLambdaFunction(functionName, { logs });
    } catch (err) {
      console.error("Failed to invoke log processor:", err);
    }

    // Return immediately
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": true,
      },
      body: JSON.stringify({ success: true, processed: logs.length }),
    };
  } catch (error) {
    console.error("Log receiver error:", error);
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": true,
      },
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};
