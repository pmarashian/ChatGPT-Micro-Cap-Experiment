/**
 * Update Configuration API Handler
 * REST API endpoint for updating system configuration
 */

const PortfolioService = require("../../services/portfolio-service");
const Logger = require("../../utils/logger");
const ErrorHandler = require("../../utils/error-handler");
const { validateEnvironment } = require("../../config/environment");
const { RISK_PARAMS } = require("../../config/constants");

let logger;
let errorHandler;

/**
 * Lambda handler for PUT /api/configuration
 */
module.exports.handler = async (event, context) => {
  // Initialize services
  logger = new Logger("update-configuration");
  errorHandler = new ErrorHandler("update-configuration");

  try {
    // Log function start
    logger.logLambdaStart(event, context);

    // Validate environment
    validateEnvironment();

    // Parse request body
    let configUpdates;
    try {
      configUpdates = JSON.parse(event.body || "{}");
    } catch (error) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          error: "Invalid JSON in request body",
          message: error.message,
        }),
      };
    }

    logger.info("Updating system configuration", {
      updates: Object.keys(configUpdates),
    });

    // Initialize portfolio service for config storage
    const portfolioService = new PortfolioService();

    // Get current config
    let currentConfig;
    try {
      // Try to get existing config from DynamoDB
      const configItem = await portfolioService.dynamodb
        .get({
          TableName: portfolioService.tableName,
          Key: { id: "config" },
        })
        .promise();

      currentConfig = configItem.Item || {};
    } catch (error) {
      logger.warn("Could not retrieve current config, using defaults", error);
      currentConfig = {};
    }

    // Validate and merge configuration updates
    const validatedConfig = await validateConfigurationUpdates(
      configUpdates,
      currentConfig
    );

    // Save updated configuration
    const configItem = {
      id: "config",
      ...validatedConfig,
      lastUpdated: new Date().toISOString(),
    };

    await portfolioService.dynamodb
      .put({
        TableName: portfolioService.tableName,
        Item: configItem,
      })
      .promise();

    logger.info("Configuration updated successfully", {
      updatedFields: Object.keys(configUpdates),
      newConfig: validatedConfig,
    });

    // Log function end
    logger.logLambdaEnd(Date.now() - context.getRemainingTimeInMillis());

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "PUT, OPTIONS",
      },
      body: JSON.stringify({
        message: "Configuration updated successfully",
        updatedFields: Object.keys(configUpdates),
        configuration: validatedConfig,
        timestamp: new Date().toISOString(),
      }),
    };
  } catch (error) {
    logger.error("Configuration update failed", error);

    // Log function end with error
    logger.logLambdaEnd(Date.now() - context.getRemainingTimeInMillis(), false);

    return errorHandler.createErrorResponse(error);
  }
};

/**
 * Validate configuration updates
 */
async function validateConfigurationUpdates(updates, currentConfig) {
  const validatedConfig = { ...currentConfig };

  // Validate stop loss percentage
  if (updates.stopLossPercentage !== undefined) {
    const stopLoss = parseFloat(updates.stopLossPercentage);
    if (isNaN(stopLoss) || stopLoss < 0 || stopLoss > 1) {
      throw new Error(
        "stopLossPercentage must be a number between 0 and 1 (e.g., 0.15 for 15%)"
      );
    }
    validatedConfig.stopLossPercentage = stopLoss;
  }

  // Validate max position size
  if (updates.maxPositionSize !== undefined) {
    const maxSize = parseFloat(updates.maxPositionSize);
    if (isNaN(maxSize) || maxSize < 0 || maxSize > 1) {
      throw new Error(
        "maxPositionSize must be a number between 0 and 1 (e.g., 0.25 for 25%)"
      );
    }
    validatedConfig.maxPositionSize = maxSize;
  }

  // Validate AI provider (PHASE 1: OpenAI only)
  if (updates.aiProvider !== undefined) {
    if (updates.aiProvider !== "openai") {
      throw new Error(
        "PHASE 1: Only OpenAI provider is supported. Multi-provider support in future phases."
      );
    }
    validatedConfig.aiProvider = updates.aiProvider;
  }

  // Validate AI model
  if (updates.aiModel !== undefined) {
    const validModels = ["gpt-4", "gpt-4-turbo", "gpt-3.5-turbo"];
    if (!validModels.includes(updates.aiModel)) {
      throw new Error(
        `Invalid AI model. Supported models: ${validModels.join(", ")}`
      );
    }
    validatedConfig.aiModel = updates.aiModel;
  }

  // Validate risk-free rate
  if (updates.riskFreeRate !== undefined) {
    const rfRate = parseFloat(updates.riskFreeRate);
    if (isNaN(rfRate) || rfRate < 0 || rfRate > 0.1) {
      throw new Error(
        "riskFreeRate must be a number between 0 and 0.1 (e.g., 0.045 for 4.5%)"
      );
    }
    validatedConfig.riskFreeRate = rfRate;
  }

  // Validate execution mode
  if (updates.executeTrades !== undefined) {
    if (typeof updates.executeTrades !== "boolean") {
      throw new Error(
        "executeTrades must be a boolean (true for live trading, false for simulation)"
      );
    }
    validatedConfig.executeTrades = updates.executeTrades;
  }

  // Set defaults for missing required fields
  validatedConfig.stopLossPercentage =
    validatedConfig.stopLossPercentage ||
    RISK_PARAMS.DEFAULT_STOP_LOSS_PERCENTAGE;
  validatedConfig.maxPositionSize =
    validatedConfig.maxPositionSize || RISK_PARAMS.DEFAULT_MAX_POSITION_SIZE;
  validatedConfig.aiProvider = validatedConfig.aiProvider || "openai";
  validatedConfig.aiModel = validatedConfig.aiModel || "gpt-4";
  validatedConfig.riskFreeRate =
    validatedConfig.riskFreeRate || RISK_PARAMS.RISK_FREE_RATE_ANNUAL;

  return validatedConfig;
}
