/**
 * Get OpenAI Models API Handler
 * Fetches available models from OpenAI API
 */

const OpenAI = require("openai");
const Logger = require("../../utils/logger");
const ErrorHandler = require("../../utils/error-handler");
const { validateEnvironment } = require("../../config/environment");

let logger;
let errorHandler;
let openai;

/**
 * Lambda handler for GET /api/openai-models
 */
module.exports.handler = async (event, context) => {
  // Initialize services
  logger = new Logger("get-openai-models");
  errorHandler = new ErrorHandler("get-openai-models");

  try {
    // Log function start
    logger.logLambdaStart(event, context);

    // Validate environment
    validateEnvironment();

    // Initialize OpenAI client
    if (!openai) {
      openai = new OpenAI({
        apiKey: process.env.AI_API_KEY,
      });
    }

    logger.info("Fetching available OpenAI models");

    // Fetch available models from OpenAI
    const modelsResponse = await openai.models.list();

    // Filter and format the models
    const models = modelsResponse.data
      .filter((model) => model.id.includes("gpt")) // Only GPT models
      .map((model) => ({
        id: model.id,
        object: model.object,
        created: model.created,
        owned_by: model.owned_by,
        // Calculate age in days
        age_days: Math.floor(
          (Date.now() / 1000 - model.created) / (24 * 60 * 60)
        ),
        // Check if it's a chat model
        is_chat_model:
          model.id.includes("gpt-3.5") || model.id.includes("gpt-4"),
        // Check if it's a turbo model
        is_turbo: model.id.includes("turbo") || model.id.includes("gpt-4"),
      }))
      .sort((a, b) => b.created - a.created); // Sort by newest first

    // Group models by type
    const groupedModels = {
      gpt4: models.filter((m) => m.id.includes("gpt-4")),
      gpt35: models.filter((m) => m.id.includes("gpt-3.5")),
      all: models,
    };

    // Get model statistics
    const stats = {
      total_models: models.length,
      gpt4_models: groupedModels.gpt4.length,
      gpt35_models: groupedModels.gpt35.length,
      newest_model: models[0]?.id || "N/A",
      oldest_model: models[models.length - 1]?.id || "N/A",
      chat_models: models.filter((m) => m.is_chat_model).length,
      turbo_models: models.filter((m) => m.is_turbo).length,
    };

    const response = {
      success: true,
      timestamp: new Date().toISOString(),
      stats: stats,
      models: groupedModels,
      current_model: process.env.AI_MODEL || "Not set",
      provider: process.env.AI_PROVIDER || "Not set",
    };

    logger.info("OpenAI models fetched successfully", {
      totalModels: models.length,
      gpt4Models: groupedModels.gpt4.length,
      gpt35Models: groupedModels.gpt35.length,
    });

    // Log function end
    logger.logLambdaEnd(Date.now() - context.getRemainingTimeInMillis());

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
      },
      body: JSON.stringify(response),
    };
  } catch (error) {
    logger.error("Failed to fetch OpenAI models", error);

    // Log function end with error
    logger.logLambdaEnd(Date.now() - context.getRemainingTimeInMillis(), false);

    return errorHandler.createErrorResponse(error);
  }
};
