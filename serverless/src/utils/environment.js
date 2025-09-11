/**
 * Environment utilities for detecting runtime context
 */

/**
 * Detect if the application is running in offline/development mode
 * @returns {boolean} True if running offline, false if running in production
 */
function isOffline() {
  return (
    process.env.IS_OFFLINE === "true" ||
    process.env.SERVERLESS_OFFLINE_HTTP_PORT ||
    !process.env.AWS_LAMBDA_FUNCTION_NAME
  );
}

module.exports = {
  isOffline,
};
