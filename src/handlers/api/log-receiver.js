const AWS = require("aws-sdk");

// Load environment variables for offline development
const isOffline =
  process.env.IS_OFFLINE === "true" ||
  process.env.SERVERLESS_OFFLINE_HTTP_PORT ||
  !process.env.AWS_LAMBDA_FUNCTION_NAME;

if (isOffline) {
  require("dotenv").config({
    path: ".env.dev",
  });
}

// Debug logging for offline mode
if (isOffline) {
  console.log("Log Receiver: Running in offline mode");
}

// Import log processor for offline mode
let logProcessor = null;
if (isOffline) {
  try {
    logProcessor = require("../scheduled/log-processor").logProcessor;
  } catch (e) {
    console.warn("Could not import logProcessor for offline mode:", e.message);
  }
}

// Initialize AWS Lambda for async execution
const lambda = new AWS.Lambda({
  apiVersion: "2015-03-31",
  // endpoint needs to be set only if it deviates from the default
  endpoint: isOffline
    ? "http://localhost:3002" // serverless-offline Lambda port (matches serverless.yml)
    : "https://lambda.us-east-1.amazonaws.com",
});

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
    if (isOffline) {
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

    const params = {
      FunctionName: functionName,
      InvocationType: "Event", // Async execution
      Payload: JSON.stringify({ logs }),
    };

    // Await the lambda invoke to ensure internal mechanisms complete
    try {
      await lambda.invoke(params).promise();
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
