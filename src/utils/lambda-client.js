/**
 * Lambda Client Utility
 * Centralized AWS Lambda client creation for trigger handlers
 */

const AWS = require("aws-sdk");

/**
 * Create and return AWS Lambda client with proper configuration
 * @returns {AWS.Lambda} Configured Lambda client
 */
function createLambdaClient() {
  return new AWS.Lambda({
    apiVersion: "2015-03-31",
    region: process.env.AWS_REGION || "us-east-1",
    endpoint: process.env.IS_OFFLINE
      ? "http://localhost:3002" // serverless-offline Lambda port (matches serverless.yml)
      : "https://lambda.us-east-1.amazonaws.com",
  });
}

/**
 * Invoke a Lambda function asynchronously
 * @param {string} functionName - Name of the function to invoke
 * @param {Object} payload - Payload to send to the function
 * @param {AWS.Lambda} lambdaClient - Lambda client instance (optional)
 * @returns {Promise<Object>} Lambda invocation result
 */
async function invokeLambdaFunction(
  functionName,
  payload = {},
  lambdaClient = null
) {
  const client = lambdaClient || createLambdaClient();

  const params = {
    FunctionName: functionName,
    InvocationType: "Event", // Asynchronous invocation
    Payload: JSON.stringify({
      source: "manual-api-trigger",
      triggeredBy: "api",
      timestamp: new Date().toISOString(),
      ...payload,
    }),
  };

  return await client.invoke(params).promise();
}

module.exports = {
  createLambdaClient,
  invokeLambdaFunction,
};
