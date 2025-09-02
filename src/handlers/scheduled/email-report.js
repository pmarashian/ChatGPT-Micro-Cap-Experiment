/**
 * Email Report Lambda Handler
 * Generates and sends daily email reports
 * Summarizes trading activity, portfolio performance, and key metrics
 */

const PortfolioService = require("../../services/portfolio-service");
const Logger = require("../../utils/logger");
const ErrorHandler = require("../../utils/error-handler");
const {
  validateEnvironment,
  getEnvConfig,
} = require("../../config/environment");
const AWS = require("aws-sdk");

let logger;
let errorHandler;

/**
 * Lambda handler for email report generation and delivery
 */
module.exports.handler = async (event, context) => {
  // Initialize services
  logger = new Logger("email-report");
  errorHandler = new ErrorHandler("email-report");

  try {
    // Log function start
    logger.logLambdaStart(event, context);

    // Validate environment
    validateEnvironment();

    logger.info("Starting daily email report generation");

    // Initialize services
    const portfolioService = new PortfolioService();
    const envConfig = getEnvConfig();

    // Initialize SES
    const ses = new AWS.SES({ region: envConfig.sesRegion });

    // 1. Get current portfolio data
    logger.info("Fetching portfolio data for report");
    const portfolio = await portfolioService.getCurrentPortfolio();

    // 2. Get recent trading history (last 7 days)
    logger.info("Fetching recent trading history");
    const recentTrades = await portfolioService.getTradingHistory(7);

    // 3. Generate report content
    const reportData = {
      date: new Date().toISOString().split("T")[0],
      portfolio,
      recentTrades,
      summary: generatePortfolioSummary(portfolio, recentTrades),
    };

    const emailContent = generateEmailContent(reportData);

    // 4. Send email
    logger.info("Sending email report");
    await sendEmailReport(ses, envConfig, emailContent, reportData);

    logger.info("Daily email report sent successfully", {
      recipient: envConfig.adminEmail,
      portfolioValue: portfolio.totalValue,
      recentTrades: recentTrades.length,
    });

    // Log function end
    logger.logLambdaEnd(Date.now() - context.getRemainingTimeInMillis());

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Email report sent successfully",
        recipient: envConfig.adminEmail,
        portfolioValue: portfolio.totalValue,
        timestamp: new Date().toISOString(),
      }),
    };
  } catch (error) {
    logger.error("Email report generation failed", error);
    await errorHandler.sendErrorAlert(error, { function: "email-report" });

    // Log function end with error
    logger.logLambdaEnd(Date.now() - context.getRemainingTimeInMillis(), false);

    throw error;
  }
};

/**
 * Generate portfolio summary statistics
 */
function generatePortfolioSummary(portfolio, recentTrades) {
  const summary = {
    totalValue: portfolio.totalValue,
    cash: portfolio.cash,
    equity: portfolio.equity || 0,
    positionCount: portfolio.positions?.length || 0,
    recentTradesCount: recentTrades.length,
  };

  // Calculate trade statistics
  if (recentTrades.length > 0) {
    const profitableTrades = recentTrades.filter((trade) => trade.pnl > 0);
    const losingTrades = recentTrades.filter((trade) => trade.pnl < 0);

    summary.profitableTrades = profitableTrades.length;
    summary.losingTrades = losingTrades.length;
    summary.totalPnL = recentTrades.reduce((sum, trade) => sum + trade.pnl, 0);
    summary.averagePnL = summary.totalPnL / recentTrades.length;
  }

  return summary;
}

/**
 * Generate email content in text format
 */
function generateEmailContent(reportData) {
  const { date, portfolio, recentTrades, summary } = reportData;

  let content = `ChatGPT Micro-Cap Trading - Daily Report
${"=".repeat(50)}
Date: ${date}
${"=".repeat(50)}

PORTFOLIO SUMMARY
${"-".repeat(20)}
Total Value: $${summary.totalValue.toFixed(2)}
Cash: $${summary.cash.toFixed(2)}
Equity: $${summary.equity.toFixed(2)}
Positions: ${summary.positionCount}

RECENT TRADING ACTIVITY (Last 7 Days)
${"-".repeat(35)}
Trades: ${summary.recentTradesCount}
Profitable: ${summary.profitableTrades || 0}
Losing: ${summary.losingTrades || 0}
Total P&L: $${(summary.totalPnL || 0).toFixed(2)}
Average P&L: $${(summary.averagePnL || 0).toFixed(2)}

CURRENT POSITIONS
${"-".repeat(20)}\n`;

  if (portfolio.positions && portfolio.positions.length > 0) {
    portfolio.positions.forEach((position) => {
      content += `${position.ticker}: ${position.shares} shares @ $${
        position.buyPrice?.toFixed(2) || "0.00"
      }
  Current: $${position.currentPrice?.toFixed(2) || "N/A"}
  Market Value: $${position.marketValue?.toFixed(2) || "0.00"}
  P&L: $${position.unrealizedPnL?.toFixed(2) || "0.00"} (${
        position.unrealizedPnLPercent?.toFixed(2) || "0.00"
      }%)
  Stop Loss: $${position.stopLoss?.toFixed(2) || "None"}
\n`;
    });
  } else {
    content += "No positions currently held.\n";
  }

  if (recentTrades.length > 0) {
    content += `
RECENT TRADES
${"-".repeat(15)}\n`;

    recentTrades.slice(0, 10).forEach((trade) => {
      content += `${trade.date}: ${trade.action} ${trade.shares} ${
        trade.ticker
      } @ $${trade.price.toFixed(2)}
  P&L: $${trade.pnl.toFixed(2)}
  Reasoning: ${trade.aiReasoning || "N/A"}
\n`;
    });

    if (recentTrades.length > 10) {
      content += `... and ${recentTrades.length - 10} more trades\n`;
    }
  }

  content += `
SYSTEM STATUS
${"-".repeat(15)}
AI Provider: OpenAI GPT-4
Last Updated: ${portfolio.lastUpdated || "Unknown"}
Trading Mode: ${process.env.EXECUTE_TRADES === "false" ? "Simulation" : "Live"}

---
This is an automated report from your ChatGPT Micro-Cap Trading System.
For questions or issues, check the logs or contact the system administrator.
`;

  return content;
}

/**
 * Send email report via SES
 */
async function sendEmailReport(ses, envConfig, emailContent, reportData) {
  const params = {
    Source: envConfig.sesSenderEmail,
    Destination: {
      ToAddresses: [envConfig.adminEmail],
    },
    Message: {
      Subject: {
        Data: `ChatGPT Trading Report - ${reportData.date}`,
      },
      Body: {
        Text: {
          Data: emailContent,
        },
      },
    },
  };

  try {
    const result = await ses.sendEmail(params).promise();
    logger.info("Email sent successfully", {
      messageId: result.MessageId,
      recipient: envConfig.adminEmail,
    });
    return result;
  } catch (error) {
    logger.error("Failed to send email", error);
    throw new Error(`Email delivery failed: ${error.message}`);
  }
}
