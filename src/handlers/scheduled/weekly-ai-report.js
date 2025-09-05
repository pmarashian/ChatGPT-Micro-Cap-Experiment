/**
 * Weekly AI Report Handler
 * Generates a human-readable weekly report, persists it, and emails it.
 */

const AIService = require("../../services/ai-service");
const PortfolioService = require("../../services/portfolio-service");
const Logger = require("../../utils/logger");
const ErrorHandler = require("../../utils/error-handler");
const {
  validateEnvironment,
  getEnvConfig,
} = require("../../config/environment");
const AWS = require("aws-sdk");
const { withScheduledLogFlushing } = require("../../utils/handler-wrapper");

let logger;
let errorHandler;

const baseHandler = async (event, context) => {
  logger = new Logger("weekly-ai-report");
  errorHandler = new ErrorHandler("weekly-ai-report");

  try {
    logger.logLambdaStart(event, context);
    validateEnvironment();

    const portfolioService = new PortfolioService();
    const aiService = new AIService();
    const envConfig = getEnvConfig();
    const ses = new AWS.SES({ region: envConfig.sesRegion });

    const portfolio = await portfolioService.getCurrentPortfolio();
    const recentTrades = await portfolioService.getTradingHistory(7);

    const { subject, content } = await aiService.getHumanReport({
      period: "weekly",
      portfolio,
      recentTrades,
      persist: true,
    });

    await sendEmail(ses, envConfig, subject, content);

    logger.logLambdaEnd(Date.now() - context.getRemainingTimeInMillis());
    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Weekly report sent" }),
    };
  } catch (error) {
    logger.error("Weekly AI report failed", error);
    await errorHandler.sendErrorAlert(error, { function: "weekly-ai-report" });
    logger.logLambdaEnd(Date.now() - context.getRemainingTimeInMillis(), false);
    throw error;
  }
};

async function sendEmail(ses, envConfig, subject, content) {
  const params = {
    Source: envConfig.sesSenderEmail,
    Destination: { ToAddresses: [envConfig.adminEmail] },
    Message: {
      Subject: { Data: subject },
      Body: { Text: { Data: content } },
    },
  };
  await ses.sendEmail(params).promise();
}

module.exports.handler = withScheduledLogFlushing(
  baseHandler,
  "weekly-ai-report"
);
