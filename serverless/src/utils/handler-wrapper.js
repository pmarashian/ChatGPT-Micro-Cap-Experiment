/**
 * Handler Wrapper HOC (Higher-Order Component)
 * Wraps API handlers with automatic log flushing and logging setup
 */

const Logger = require("./logger");
const ErrorHandler = require("./error-handler");
const {
  createLambdaClient,
  invokeLambdaFunction,
} = require("../utils/lambda-client");
const { updateJobStatus } = require("../services/job-orchestration-service");

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
          console.warn(`Failed to flush logs after ${handlerName} execution:`, {
            error: flushError,
          });
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
          console.warn(`Failed to flush logs on ${handlerName} error:`, {
            error: flushError,
          });
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

/**
 * Enhanced API handler wrapper with complete logging lifecycle
 * @param {Function} businessLogic - Pure business logic function that receives ({ logger, errorHandler, event, context })
 * @param {Object} options - Configuration options
 * @param {string} options.handlerName - Name for logging and error handling
 * @param {string} options.operation - Operation name for error alerts
 * @param {Function} options.validateEnvironment - Optional environment validation function
 * @returns {Function} - Wrapped handler function
 */
function withApiHandlerLifecycle(businessLogic, options = {}) {
  const {
    handlerName = "api-handler",
    operation = "api_operation",
    validateEnvironment,
  } = options;

  return async (event, context) => {
    // Initialize services
    const logger = new Logger(handlerName);
    const errorHandler = new ErrorHandler(handlerName);

    try {
      // Log function start
      logger.logLambdaStart(event, context);

      // Validate environment if provided
      if (validateEnvironment) {
        validateEnvironment();
      }

      // Execute business logic
      const result = await businessLogic({
        logger,
        errorHandler,
        event,
        context,
      });

      // Log function end
      logger.logLambdaEnd(Date.now() - context.getRemainingTimeInMillis());

      return result;
    } catch (error) {
      logger.error(`Failed to execute ${handlerName}`, { error });

      // Send error alert
      try {
        await errorHandler.sendErrorAlert(error, {
          function: handlerName,
          operation: operation,
        });
      } catch (alertError) {
        logger.error("Failed to send error alert", { error: alertError });
      }

      // Log function end with error
      logger.logLambdaEnd(
        Date.now() - context.getRemainingTimeInMillis(),
        false
      );

      // Return error response
      return {
        statusCode: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          error: `Failed to execute ${handlerName}`,
          message: error.message,
        }),
      };
    }
  };
}

/**
 * Enhanced scheduled handler wrapper with complete logging lifecycle
 * @param {Function} businessLogic - Pure business logic function that receives ({ logger, errorHandler, event, context })
 * @param {Object} options - Configuration options
 * @param {string} options.handlerName - Name for logging and error handling
 * @param {string} options.operation - Operation name for error alerts
 * @param {Function} options.validateEnvironment - Optional environment validation function
 * @returns {Function} - Wrapped handler function
 */
function withScheduledHandlerLifecycle(businessLogic, options = {}) {
  const {
    handlerName = "scheduled-handler",
    operation = "scheduled_operation",
    validateEnvironment,
  } = options;

  return async (event, context) => {
    // Generate unique ID for offline development if awsRequestId is not available
    const awsRequestId = context?.awsRequestId;

    // Initialize services
    const logger = new Logger(handlerName, { uniqueId: awsRequestId });
    const errorHandler = new ErrorHandler(handlerName, {
      uniqueId: awsRequestId,
    });

    try {
      // Log function start
      logger.logLambdaStart(event, context);

      // Validate environment if provided
      if (validateEnvironment) {
        validateEnvironment();
      }

      // Execute business logic
      const result = await businessLogic({
        logger,
        errorHandler,
        event,
        context,
        uniqueId: awsRequestId,
      });

      // Log function end
      logger.logLambdaEnd(Date.now() - context.getRemainingTimeInMillis());

      // Force flush all remaining logs before throwing error
      try {
        await logger.flush();
      } catch (flushError) {
        // Silent fail - don't let flush errors mask the original error
      }

      return result;
    } catch (error) {
      logger.error(`${handlerName} failed`, error);

      // Send error alert
      try {
        await errorHandler.sendErrorAlert(error, {
          function: handlerName,
          operation: operation,
        });
      } catch (alertError) {
        logger.error("Failed to send error alert", alertError);
      }

      // Log function end with error
      logger.logLambdaEnd(
        Date.now() - context.getRemainingTimeInMillis(),
        false
      );

      // Force flush all remaining logs before throwing error
      try {
        await logger.flush();
      } catch (flushError) {
        // Silent fail - don't let flush errors mask the original error
      }

      throw error;
    }
  };
}

/**
 * Enhanced scheduled handler lifecycle with job orchestration support
 * Automatically handles job status updates when triggered by job orchestrator
 * @param {Function} businessLogic - Pure business logic function
 * @param {Object} options - Configuration options
 * @param {string} options.handlerName - Name for logging and error handling
 * @param {string} options.operation - Operation name for error alerts
 * @param {Function} options.validateEnvironment - Optional environment validation function
 * @param {string} options.jobName - Name of the job for orchestration updates
 * @returns {Function} - Wrapped handler function with orchestration support
 */
function withJobOrchestratedHandlerLifecycle(businessLogic, options = {}) {
  const {
    handlerName = "job-orchestrated-handler",
    operation = "job_orchestrated_operation",
    validateEnvironment,
    jobName,
  } = options;

  return async (event, context) => {
    const uniqueId = event?.executionId || context?.awsRequestId;

    // Initialize services
    const logger = new Logger(handlerName, { uniqueId });
    const errorHandler = new ErrorHandler(handlerName, {
      uniqueId: context?.awsRequestId,
    });

    // Check if this is triggered by the job orchestrator
    // This is set in job-orchestrator.js
    const isOrchestrationTrigger = event?.source === "orchestration-trigger";
    const executionId = event?.executionId;

    if (isOrchestrationTrigger && executionId) {
      logger.info("Job triggered by orchestrator", {
        executionId,
        orchestrationExecutionId: event.orchestrationExecutionId,
        jobName: event.jobConfig?.jobName,
      });
    }

    try {
      // Log function start
      logger.logLambdaStart(event, context);

      // Validate environment if provided
      if (validateEnvironment) {
        validateEnvironment();
      }

      // Execute business logic (pure, no orchestration concerns)
      const result = await businessLogic({
        logger,
        errorHandler,
        event,
        context,
        executionId,
      });

      // For orchestration-triggered jobs, include completion info in response
      // The orchestrator will handle status updates centrally
      if (isOrchestrationTrigger && executionId && jobName) {
        logger.info("Job business logic completed successfully", {
          executionId,
          jobName,
          orchestrationExecutionId: event.orchestrationExecutionId,
        });

        // Return enhanced result for orchestrator
        return {
          // in case there is a typo in the worker, we can use StatusCode or statusCode
          StatusCode: 200,
          statusCode: 200,
          ...result,
          _orchestration: {
            jobName,
            executionId,
            status: "success",
            orchestrationExecutionId: event.orchestrationExecutionId,
          },
        };
      }

      // Log function end
      logger.logLambdaEnd(Date.now() - context.getRemainingTimeInMillis());

      return result;
    } catch (error) {
      logger.error(`${handlerName} failed`, error);

      // For orchestration-triggered jobs, include failure info in response
      // The orchestrator will handle status updates centrally
      if (isOrchestrationTrigger && executionId && jobName) {
        logger.error("Job business logic failed", {
          executionId,
          jobName,
          orchestrationExecutionId: event.orchestrationExecutionId,
          error: error.message,
        });

        // Return failure response with orchestration info
        // For synchronous invocations, we return the error info instead of throwing
        return {
          statusCode: 500,
          _orchestration: {
            jobName,
            executionId,
            status: "failed",
            orchestrationExecutionId: event.orchestrationExecutionId,
            originalError: error.message,
          },
          error: {
            message: error.message,
            stack: error.stack,
          },
        };
      }

      // Send error alert
      try {
        await errorHandler.sendErrorAlert(error, {
          function: handlerName,
          operation: operation,
        });
      } catch (alertError) {
        logger.error("Failed to send error alert", alertError);
      }

      // Log function end with error
      logger.logLambdaEnd(
        Date.now() - context.getRemainingTimeInMillis(),
        false
      );

      throw error;
    }
  };
}

/**
 * Enhanced API trigger wrapper for fire-and-forget Lambda invocation
 * @param {Object} options - Configuration options
 * @param {string} options.triggerHandlerName - Name of this trigger handler
 * @param {string} options.targetFunctionName - Name of the scheduled Lambda function to invoke
 * @param {string} options.operation - Operation name for error alerts
 * @param {Function} options.validateEnvironment - Optional environment validation function
 * @returns {Function} - Wrapped trigger handler function
 */
function withApiTriggerLifecycle(options = {}) {
  const {
    triggerHandlerName = "api-trigger",
    targetFunctionName,
    operation = "lambda_trigger",
    validateEnvironment,
  } = options;

  return async (event, context) => {
    // Initialize services
    const logger = new Logger(triggerHandlerName, {
      uniqueId: context?.awsRequestId,
    });
    const errorHandler = new ErrorHandler(triggerHandlerName, {
      uniqueId: context?.awsRequestId,
    });
    let lambda;

    try {
      // Log function start
      logger.logLambdaStart(event, context);

      // Validate environment if provided
      if (validateEnvironment) {
        validateEnvironment();
      }

      // Initialize Lambda client
      lambda = createLambdaClient();

      logger.debug(`Triggering ${targetFunctionName} Lambda function`);

      // Invoke the target Lambda function (fire-and-forget)
      const result = await invokeLambdaFunction(targetFunctionName, {}, lambda);

      logger.debug(`${targetFunctionName} triggered successfully`, {
        targetFunction: targetFunctionName,
        statusCode: result.StatusCode,
      });

      // Log function end
      logger.logLambdaEnd(Date.now() - context.getRemainingTimeInMillis());

      return {
        statusCode: 202, // Accepted - asynchronous operation
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          success: true,
          message: `${targetFunctionName} triggered successfully`,
          targetFunction: targetFunctionName,
          timestamp: new Date().toISOString(),
        }),
      };
    } catch (error) {
      logger.error(`Failed to trigger ${targetFunctionName}`, error);

      // Send error alert
      try {
        await errorHandler.sendErrorAlert(error, {
          function: triggerHandlerName,
          operation: operation,
          targetFunction: targetFunctionName,
        });
      } catch (alertError) {
        logger.error("Failed to send error alert", alertError);
      }

      // Log function end with error
      logger.logLambdaEnd(
        Date.now() - context.getRemainingTimeInMillis(),
        false
      );

      // Return error response
      return {
        statusCode: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          error: `Failed to trigger ${targetFunctionName}`,
          message: error.message,
        }),
      };
    }
  };
}

module.exports = {
  withLogFlushing,
  withApiLogFlushing,
  withScheduledLogFlushing,
  withApiHandlerLifecycle,
  withScheduledHandlerLifecycle,
  withJobOrchestratedHandlerLifecycle,
  withApiTriggerLifecycle,
};
