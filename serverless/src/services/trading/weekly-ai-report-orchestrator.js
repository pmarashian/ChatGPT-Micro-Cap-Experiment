/**
 * Weekly AI Report Orchestrator
 * Shared function for both manual and scheduled weekly AI report generation
 */

const AIService = require("../ai-service");
const PortfolioService = require("../portfolio-service");
const Logger = require("../../utils/logger");
const ErrorHandler = require("../../utils/error-handler");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");
const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses");

/**
 * Execute weekly AI report with consistent orchestration
 * @param {Object} options - Configuration options
 * @param {string} options.invocationType - 'manual' or 'scheduled'
 * @param {Object} options.logger - Optional logger instance
 * @param {Object} options.errorHandler - Optional error handler instance
 * @returns {Promise<Object>} Weekly report results
 */
async function performWeeklyAIReport(options = {}) {
  const { invocationType = "manual", logger, errorHandler } = options;

  // Use provided logger/errorHandler or create new ones
  const logInstance =
    logger || new Logger(`weekly-ai-report-${invocationType}`);
  const errorHandlerInstance =
    errorHandler || new ErrorHandler(`weekly-ai-report-${invocationType}`);

  try {
    // Log function start
    logInstance.info(
      `📊 Starting ${invocationType} weekly AI report generation`
    );

    const portfolioService = new PortfolioService();
    const aiService = new AIService();
    const envConfig = require("../../config/environment").getEnvConfig();
    const ses = new SESClient({ region: envConfig.sesRegion });

    const portfolio = await portfolioService.getCurrentPortfolio();
    const recentTrades = await portfolioService.getTradingHistory(7);

    const { subject, content } = await aiService.getHumanReport({
      period: "weekly",
      portfolio,
      recentTrades,
      persist: true,
    });

    await sendEmail(ses, envConfig, subject, content);

    logInstance.info("✅ Weekly AI report sent successfully", {
      recipient: envConfig.adminEmail,
      subject,
    });

    return {
      message: "Weekly AI report sent successfully",
      recipient: envConfig.adminEmail,
      subject,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    logInstance.error(`Weekly AI report failed`, error);

    // Send error alert if error handler provided
    if (errorHandlerInstance) {
      try {
        await errorHandlerInstance.sendErrorAlert(error, {
          function: `weekly-ai-report-${invocationType}`,
          operation: "weekly_ai_report_generation",
        });
      } catch (alertError) {
        logInstance.error("Failed to send error alert", alertError);
      }
    }

    throw error;
  }
}

async function sendEmail(ses, envConfig, subject, content) {
  const params = {
    Source: envConfig.sesSenderEmail,
    Destination: { ToAddresses: [envConfig.adminEmail] },
    Message: {
      Subject: { Data: subject },
      Body: { Text: { Data: content } },
    },
  };
  const command = new SendEmailCommand(params);
  await ses.send(command);
}

module.exports = {
  performWeeklyAIReport,
};
