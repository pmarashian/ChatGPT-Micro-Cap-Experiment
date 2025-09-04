/**
 * Handler Wrapper HOC (Higher-Order Component)
 * Wraps API handlers with automatic log flushing functionality
 */

const Logger = require("./logger");

/**
 * Higher-order function that wraps Lambda handlers with automatic log flushing
 * @param {Function} handler - The original Lambda handler function
 * @param {Object} options - Configuration options
 * @param {boolean} options.flushBefore - Whether to flush logs before handler execution (default: true)
 * @param {boolean} options.flushAfter - Whether to flush logs after handler execution (default: true)
 * @param {boolean} options.flushOnError - Whether to flush logs on error (default: true)
 * @param {string} options.handlerName - Name of the handler for logging purposes
 * @returns {Function} - Wrapped handler function
 */
function withLogFlushing(handler, options = {}) {
  const {
    flushBefore = true,
    flushAfter = true,
    flushOnError = true,
    handlerName = "unknown-handler",
  } = options;

  return async (event, context) => {
    try {
      // Flush logs before handler execution if enabled
      if (flushBefore) {
        try {
          await Logger.flush();
        } catch (flushError) {
          console.warn(
            `Failed to flush logs before ${handlerName} execution:`,
            flushError
          );
          // Don't fail the request if log flushing fails
        }
      }

      // Execute the original handler
      const result = await handler(event, context);

      // Flush logs after handler execution if enabled
      if (flushAfter) {
        try {
          await Logger.flush();
        } catch (flushError) {
          console.warn(
            `Failed to flush logs after ${handlerName} execution:`,
            flushError
          );
          // Don't modify the response if log flushing fails
        }
      }

      return result;
    } catch (error) {
      // Flush logs on error if enabled
      if (flushOnError) {
        try {
          await Logger.flush();
        } catch (flushError) {
          console.warn(
            `Failed to flush logs on ${handlerName} error:`,
            flushError
          );
        }
      }

      // Re-throw the original error
      throw error;
    }
  };
}

/**
 * Convenience wrapper for API handlers with default log flushing settings
 * @param {Function} handler - The original Lambda handler function
 * @param {string} handlerName - Name of the handler for logging purposes
 * @returns {Function} - Wrapped handler function
 */
function withApiLogFlushing(handler, handlerName = "api-handler") {
  return withLogFlushing(handler, {
    flushBefore: true,
    flushAfter: true,
    flushOnError: true,
    handlerName,
  });
}

/**
 * Wrapper for scheduled handlers (typically flush after execution)
 * @param {Function} handler - The original Lambda handler function
 * @param {string} handlerName - Name of the handler for logging purposes
 * @returns {Function} - Wrapped handler function
 */
function withScheduledLogFlushing(handler, handlerName = "scheduled-handler") {
  return withLogFlushing(handler, {
    flushBefore: false, // Don't flush before scheduled tasks
    flushAfter: true,
    flushOnError: true,
    handlerName,
  });
}

module.exports = {
  withLogFlushing,
  withApiLogFlushing,
  withScheduledLogFlushing,
};
