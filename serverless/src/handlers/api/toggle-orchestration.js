/**
 * Toggle Orchestration API Handler
 * API endpoint to enable/disable the job orchestration system
 */

const { validateEnvironment } = require("../../config/environment");
const { withApiHandlerLifecycle } = require("../../utils/handler-wrapper");
const {
  isOrchestrationEnabled,
  setOrchestrationEnabled,
} = require("../../services/job-orchestration-service");

/**
 * Business logic for toggling orchestration
 */
const businessLogic = async ({ logger, errorHandler, event }) => {
  try {
    const httpMethod = event.httpMethod;
    const body = event.body ? JSON.parse(event.body) : {};

    if (httpMethod === "GET") {
      // Get current orchestration status
      const isEnabled = await isOrchestrationEnabled(logger);

      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          orchestrationEnabled: isEnabled,
          message: `Orchestration is currently ${
            isEnabled ? "enabled" : "disabled"
          }`,
        }),
      };
    } else if (httpMethod === "POST" || httpMethod === "PUT") {
      // Set orchestration status
      const enabled = body.enabled;

      if (typeof enabled !== "boolean") {
        return {
          statusCode: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
          body: JSON.stringify({
            error: "Invalid request body. 'enabled' must be a boolean value.",
          }),
        };
      }

      const result = await setOrchestrationEnabled(enabled, logger);

      logger.info(`Orchestration ${enabled ? "enabled" : "disabled"} via API`, {
        enabled,
        updatedAt: new Date().toISOString(),
      });

      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          success: true,
          orchestrationEnabled: enabled,
          message: `Orchestration ${
            enabled ? "enabled" : "disabled"
          } successfully`,
          updatedAt: new Date().toISOString(),
        }),
      };
    } else {
      return {
        statusCode: 405,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          error:
            "Method not allowed. Use GET to check status or POST/PUT to set status.",
        }),
      };
    }
  } catch (error) {
    logger.error("Failed to handle orchestration toggle request", error);

    try {
      await errorHandler.sendErrorAlert(error, {
        function: "toggle-orchestration",
        operation: "orchestration_toggle",
        httpMethod: event.httpMethod,
        body: event.body,
      });
    } catch (alertError) {
      logger.error("Failed to send error alert", alertError);
    }

    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        error:
          "Internal server error while processing orchestration toggle request",
      }),
    };
  }
};

module.exports.handler = withApiHandlerLifecycle(businessLogic, {
  handlerName: "toggle-orchestration",
  operation: "orchestration_toggle",
  validateEnvironment: validateEnvironment,
});
