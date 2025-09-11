/**
 * Lambda Client Utility
 * Centralized AWS Lambda client creation for trigger handlers
 */

const { LambdaClient, InvokeCommand } = require("@aws-sdk/client-lambda");
const { isOffline } = require("./environment");

/**
 * Create and return AWS Lambda client with proper configuration
 * @returns {LambdaClient} Configured Lambda client
 */
function createLambdaClient() {
  return new LambdaClient({
    region: process.env.AWS_REGION || "us-east-1",
    endpoint: isOffline()
      ? "http://localhost:3002" // serverless-offline Lambda port (matches serverless.yml)
      : "https://lambda.us-east-1.amazonaws.com",
  });
}

/**
 * Invoke a Lambda function asynchronously (for manual/API triggers)
 * @param {string} functionName - Name of the function to invoke
 * @param {Object} payload - Payload to send to the function
 * @param {LambdaClient} lambdaClient - Lambda client instance (optional)
 * @returns {Promise<Object>} Lambda invocation result
 */
async function invokeLambdaFunction(
  functionName,
  payload = {},
  lambdaClient = null
) {
  const client = lambdaClient || createLambdaClient();

  const command = new InvokeCommand({
    FunctionName: functionName,
    InvocationType: "Event", // Asynchronous invocation
    Payload: JSON.stringify({
      source: "manual-api-trigger",
      triggeredBy: "api",
      timestamp: new Date().toISOString(),
      ...payload,
    }),
  });

  return await client.send(command);
}

/**
 * Invoke a Lambda function synchronously (for orchestration)
 * Waits for completion and returns the result
 * @param {string} functionName - Name of the function to invoke
 * @param {Object} payload - Payload to send to the function
 * @param {LambdaClient} lambdaClient - Lambda client instance (optional)
 * @returns {Promise<Object>} Lambda invocation result with payload
 */
async function invokeLambdaFunctionSync(
  functionName,
  payload = {},
  lambdaClient = null
) {
  const client = lambdaClient || createLambdaClient();

  const command = new InvokeCommand({
    FunctionName: functionName,
    InvocationType: "RequestResponse", // Synchronous invocation
    Payload: JSON.stringify(payload),
  });

  const result = await client.send(command);

  // Parse the response payload (SDK v3 returns Uint8Array)
  let responsePayload;

  try {
    const payloadString = new TextDecoder().decode(result.Payload);
    responsePayload = JSON.parse(payloadString);
  } catch (parseError) {
    responsePayload =
      result.Payload && typeof result.Payload === "object"
        ? result.Payload
        : {};
  }

  return {
    // Include Lambda invocation metadata
    StatusCode: result.StatusCode,
    ExecutedVersion: result.ExecutedVersion,
    FunctionError: result.FunctionError,
    LogResult: result.LogResult,

    // Include the parsed payload data
    ...responsePayload,
  };
}

module.exports = {
  createLambdaClient,
  invokeLambdaFunction,
  invokeLambdaFunctionSync,
};
