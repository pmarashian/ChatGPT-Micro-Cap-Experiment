/**
 * Email Report Orchestrator
 * Shared function for both manual and scheduled email report generation
 */

const PortfolioService = require("../portfolio-service");
const AIService = require("../ai-service");
const Logger = require("../../utils/logger");
const ErrorHandler = require("../../utils/error-handler");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");

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
 * Generate professional HTML email content
 */
function generateHTMLEmailContent(reportData) {
  const { date, portfolio, recentTrades, summary } = reportData;

  const formatCurrency = (value) => `$${parseFloat(value || 0).toFixed(2)}`;
  const formatPercent = (value) => `${parseFloat(value || 0).toFixed(2)}%`;

  let html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Micro-Cap Trading Performance Report</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8f9fa; color: #333;">
    <div style="max-width: 800px; margin: 0 auto; background-color: #ffffff;">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%); color: white; padding: 30px 20px; text-align: center;">
            <h1 style="margin: 0; font-size: 28px; font-weight: 600;">MICRO-CAP TRADING SYSTEM</h1>
            <h2 style="margin: 10px 0 0 0; font-size: 18px; font-weight: 400; opacity: 0.9;">Daily Performance Report</h2>
            <div style="margin-top: 15px; font-size: 14px; opacity: 0.8;">
                <div>Report Date: ${date}</div>
                <div>Generated: ${new Date().toLocaleString()}</div>
            </div>
        </div>

        <!-- Executive Summary -->
        <div style="padding: 30px 20px;">
            <h3 style="color: #1e3a8a; font-size: 20px; margin-bottom: 20px; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px;">EXECUTIVE SUMMARY</h3>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px;">
                <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 14px; color: #6b7280; margin-bottom: 5px;">Portfolio Value</div>
                    <div style="font-size: 24px; font-weight: 600; color: #1e3a8a;">${formatCurrency(
                      summary.totalValue
                    )}</div>
                </div>
                <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 14px; color: #6b7280; margin-bottom: 5px;">Available Cash</div>
                    <div style="font-size: 24px; font-weight: 600; color: #059669;">${formatCurrency(
                      summary.cash
                    )}</div>
                </div>
                <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 14px; color: #6b7280; margin-bottom: 5px;">Invested Capital</div>
                    <div style="font-size: 24px; font-weight: 600; color: #7c3aed;">${formatCurrency(
                      summary.equity
                    )}</div>
                </div>
                <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 14px; color: #6b7280; margin-bottom: 5px;">Active Positions</div>
                    <div style="font-size: 24px; font-weight: 600; color: #dc2626;">${
                      summary.positionCount
                    }</div>
                </div>
            </div>
        </div>`;

  // Trading Performance Section
  html += `
        <!-- Trading Performance -->
        <div style="padding: 0 20px 30px;">
            <h3 style="color: #1e3a8a; font-size: 20px; margin-bottom: 20px; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px;">TRADING PERFORMANCE (Last 7 Days)</h3>
            <table style="width: 100%; border-collapse: collapse; background: #f8f9fa; border-radius: 8px; overflow: hidden;">
                <thead>
                    <tr style="background: #1e3a8a; color: white;">
                        <th style="padding: 15px; text-align: left; font-weight: 600;">Metric</th>
                        <th style="padding: 15px; text-align: right; font-weight: 600;">Value</th>
                    </tr>
                </thead>
                <tbody>
                    <tr style="border-bottom: 1px solid #e5e7eb;">
                        <td style="padding: 15px;">Total Transactions</td>
                        <td style="padding: 15px; text-align: right; font-weight: 600;">${
                          summary.recentTradesCount
                        }</td>
                    </tr>
                    <tr style="border-bottom: 1px solid #e5e7eb;">
                        <td style="padding: 15px;">Successful Trades</td>
                        <td style="padding: 15px; text-align: right; font-weight: 600; color: #059669;">${
                          summary.profitableTrades || 0
                        }</td>
                    </tr>
                    <tr style="border-bottom: 1px solid #e5e7eb;">
                        <td style="padding: 15px;">Unsuccessful Trades</td>
                        <td style="padding: 15px; text-align: right; font-weight: 600; color: #dc2626;">${
                          summary.losingTrades || 0
                        }</td>
                    </tr>
                    <tr style="border-bottom: 1px solid #e5e7eb;">
                        <td style="padding: 15px;">Net Profit/Loss</td>
                        <td style="padding: 15px; text-align: right; font-weight: 600; color: ${
                          (summary.totalPnL || 0) >= 0 ? "#059669" : "#dc2626"
                        };">${formatCurrency(summary.totalPnL)}</td>
                    </tr>
                    <tr>
                        <td style="padding: 15px;">Average P&L per Trade</td>
                        <td style="padding: 15px; text-align: right; font-weight: 600; color: ${
                          (summary.averagePnL || 0) >= 0 ? "#059669" : "#dc2626"
                        };">${formatCurrency(summary.averagePnL)}</td>
                    </tr>
                </tbody>
            </table>
        </div>`;

  // Portfolio Positions Section
  html += `
        <!-- Portfolio Positions -->
        <div style="padding: 0 20px 30px;">
            <h3 style="color: #1e3a8a; font-size: 20px; margin-bottom: 20px; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px;">PORTFOLIO POSITIONS</h3>`;

  if (portfolio.positions && portfolio.positions.length > 0) {
    html += `
            <div style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse; background: #f8f9fa; border-radius: 8px; overflow: hidden;">
                    <thead>
                        <tr style="background: #1e3a8a; color: white;">
                            <th style="padding: 12px; text-align: left; font-weight: 600;">Security</th>
                            <th style="padding: 12px; text-align: right; font-weight: 600;">Shares</th>
                            <th style="padding: 12px; text-align: right; font-weight: 600;">Avg Cost</th>
                            <th style="padding: 12px; text-align: right; font-weight: 600;">Current</th>
                            <th style="padding: 12px; text-align: right; font-weight: 600;">Market Value</th>
                            <th style="padding: 12px; text-align: right; font-weight: 600;">P&L</th>
                            <th style="padding: 12px; text-align: right; font-weight: 600;">Stop Loss</th>
                        </tr>
                    </thead>
                    <tbody>`;

    portfolio.positions.forEach((position, index) => {
      const pnlColor =
        (position.unrealizedPnL || 0) >= 0 ? "#059669" : "#dc2626";
      html += `
                        <tr style="border-bottom: 1px solid #e5e7eb; ${
                          index % 2 === 0 ? "background: #ffffff;" : ""
                        }">
                            <td style="padding: 12px; font-weight: 600;">${
                              position.ticker
                            }</td>
                            <td style="padding: 12px; text-align: right;">${
                              position.shares
                            }</td>
                            <td style="padding: 12px; text-align: right;">${formatCurrency(
                              position.buyPrice
                            )}</td>
                            <td style="padding: 12px; text-align: right;">${formatCurrency(
                              position.currentPrice
                            )}</td>
                            <td style="padding: 12px; text-align: right;">${formatCurrency(
                              position.marketValue
                            )}</td>
                            <td style="padding: 12px; text-align: right; color: ${pnlColor}; font-weight: 600;">
                                ${formatCurrency(position.unrealizedPnL)}<br>
                                <span style="font-size: 12px; color: #6b7280;">(${formatPercent(
                                  position.unrealizedPnLPercent
                                )})</span>
                            </td>
                            <td style="padding: 12px; text-align: right;">${formatCurrency(
                              position.stopLoss
                            )}</td>
                        </tr>`;
    });

    html += `
                    </tbody>
                </table>
            </div>`;
  } else {
    html += `
            <div style="background: #f8f9fa; padding: 40px; text-align: center; border-radius: 8px; color: #6b7280;">
                <div style="font-size: 18px; margin-bottom: 10px;">No Active Positions</div>
                <div>All capital is currently in cash reserves.</div>
            </div>`;
  }

  // Recent Transactions Section
  if (recentTrades.length > 0) {
    html += `
        </div>

        <!-- Recent Transactions -->
        <div style="padding: 0 20px 30px;">
            <h3 style="color: #1e3a8a; font-size: 20px; margin-bottom: 20px; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px;">RECENT TRANSACTIONS</h3>
            <div style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse; background: #f8f9fa; border-radius: 8px; overflow: hidden;">
                    <thead>
                        <tr style="background: #1e3a8a; color: white;">
                            <th style="padding: 12px; text-align: left; font-weight: 600;">Date</th>
                            <th style="padding: 12px; text-align: left; font-weight: 600;">Action</th>
                            <th style="padding: 12px; text-align: left; font-weight: 600;">Security</th>
                            <th style="padding: 12px; text-align: right; font-weight: 600;">Quantity</th>
                            <th style="padding: 12px; text-align: right; font-weight: 600;">Price</th>
                            <th style="padding: 12px; text-align: right; font-weight: 600;">P&L</th>
                        </tr>
                    </thead>
                    <tbody>`;

    recentTrades.slice(0, 10).forEach((trade, index) => {
      const pnlColor = trade.pnl >= 0 ? "#059669" : "#dc2626";
      const actionColor =
        trade.action.toLowerCase() === "buy" ? "#059669" : "#dc2626";
      html += `
                        <tr style="border-bottom: 1px solid #e5e7eb; ${
                          index % 2 === 0 ? "background: #ffffff;" : ""
                        }">
                            <td style="padding: 12px;">${trade.date}</td>
                            <td style="padding: 12px;"><span style="background: ${actionColor}; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 600;">${trade.action.toUpperCase()}</span></td>
                            <td style="padding: 12px; font-weight: 600;">${
                              trade.ticker
                            }</td>
                            <td style="padding: 12px; text-align: right;">${
                              trade.shares
                            }</td>
                            <td style="padding: 12px; text-align: right;">${formatCurrency(
                              trade.price
                            )}</td>
                            <td style="padding: 12px; text-align: right; color: ${pnlColor}; font-weight: 600;">${formatCurrency(
        trade.pnl
      )}</td>
                        </tr>`;
    });

    html += `
                    </tbody>
                </table>
            </div>`;

    if (recentTrades.length > 10) {
      html += `
            <div style="margin-top: 15px; padding: 15px; background: #fef3c7; border-radius: 6px; color: #92400e;">
                ... and ${recentTrades.length - 10} additional transactions
            </div>`;
    }
  }

  // System Status and Footer
  html += `
        </div>

        <!-- System Status -->
        <div style="padding: 0 20px 30px;">
            <h3 style="color: #1e3a8a; font-size: 20px; margin-bottom: 20px; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px;">SYSTEM OPERATIONAL STATUS</h3>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px;">
                <div style="background: #f8f9fa; padding: 20px; border-radius: 8px;">
                    <div style="font-size: 14px; color: #6b7280; margin-bottom: 5px;">AI Engine</div>
                    <div style="font-size: 16px; font-weight: 600;">OpenAI GPT-4</div>
                </div>
                <div style="background: #f8f9fa; padding: 20px; border-radius: 8px;">
                    <div style="font-size: 14px; color: #6b7280; margin-bottom: 5px;">Trading Environment</div>
                    <div style="font-size: 16px; font-weight: 600;">${
                      process.env.EXECUTE_TRADES === "false"
                        ? "Paper Trading"
                        : "Live Trading"
                    }</div>
                </div>
                <div style="background: #f8f9fa; padding: 20px; border-radius: 8px;">
                    <div style="font-size: 14px; color: #6b7280; margin-bottom: 5px;">Data Provider</div>
                    <div style="font-size: 16px; font-weight: 600;">Financial Modeling Prep</div>
                </div>
                <div style="background: #f8f9fa; padding: 20px; border-radius: 8px;">
                    <div style="font-size: 14px; color: #6b7280; margin-bottom: 5px;">Last Sync</div>
                    <div style="font-size: 16px; font-weight: 600;">${
                      portfolio.lastUpdated || "Unknown"
                    }</div>
                </div>
            </div>
        </div>

        <!-- Footer -->
        <div style="background: #1e3a8a; color: white; padding: 30px 20px;">
            <div style="text-align: center; margin-bottom: 20px;">
                <div style="font-size: 18px; font-weight: 600; margin-bottom: 10px;">CONFIDENTIAL - SYSTEM GENERATED REPORT</div>
                <div style="font-size: 14px; opacity: 0.8;">This report contains sensitive financial information intended solely for the designated recipient.</div>
            </div>

            <div style="border-top: 1px solid rgba(255,255,255,0.2); padding-top: 20px;">
                <div style="margin-bottom: 15px; font-size: 14px;">
                    <strong>System Information:</strong><br>
                    • AI-powered automated trading system<br>
                    • Advanced risk management protocols<br>
                    • Real-time market data integration
                </div>

                <div style="font-size: 12px; opacity: 0.7; text-align: center;">
                    <div style="margin-bottom: 10px;"><strong>Important Disclaimers:</strong></div>
                    <div>This communication is for informational purposes only and does not constitute investment advice. Past performance does not guarantee future results. All trading involves risk of loss.</div>
                </div>
            </div>
        </div>
    </div>
</body>
</html>`;

  return html;
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
        Data: `Micro-Cap Trading Performance Report - ${reportData.date}`,
      },
      Body: {
        Html: {
          Data: emailContent,
        },
        Text: {
          Data: generateEmailContent(reportData),
        },
      },
    },
  };

  try {
    const result = await ses.sendEmail(params).promise();
    return result;
  } catch (error) {
    throw new Error(`Email delivery failed: ${error.message}`);
  }
}

/**
 * Generate email content in text format
 */
function generateEmailContent(reportData) {
  const { date, portfolio, recentTrades, summary } = reportData;

  let content = `MICRO-CAP TRADING SYSTEM - DAILY PERFORMANCE REPORT
${"=".repeat(60)}
Report Date: ${date}
Generated: ${new Date().toLocaleString()}
${"=".repeat(60)}

EXECUTIVE SUMMARY
${"-".repeat(20)}
Portfolio Value: $${summary.totalValue.toFixed(2)}
Available Cash: $${summary.cash.toFixed(2)}
Invested Capital: $${summary.equity.toFixed(2)}
Active Positions: ${summary.positionCount}

TRADING PERFORMANCE (Last 7 Days)
${"-".repeat(35)}
Total Transactions: ${summary.recentTradesCount}
Successful Trades: ${summary.profitableTrades || 0}
Unsuccessful Trades: ${summary.losingTrades || 0}
Net Profit/Loss: $${(summary.totalPnL || 0).toFixed(2)}
Average P&L per Trade: $${(summary.averagePnL || 0).toFixed(2)}

PORTFOLIO POSITIONS
${"-".repeat(20)}\n`;

  if (portfolio.positions && portfolio.positions.length > 0) {
    portfolio.positions.forEach((position) => {
      content += `Security: ${position.ticker}
  Shares Held: ${position.shares}
  Average Cost: $${position.buyPrice?.toFixed(2) || "0.00"}
  Current Price: $${position.currentPrice?.toFixed(2) || "N/A"}
  Market Value: $${position.marketValue?.toFixed(2) || "0.00"}
  Unrealized P&L: $${position.unrealizedPnL?.toFixed(2) || "0.00"} (${
        position.unrealizedPnLPercent?.toFixed(2) || "0.00"
      }%)
  Stop Loss Level: $${position.stopLoss?.toFixed(2) || "Not Set"}

`;
    });
  } else {
    content += "No active positions in the portfolio.\n\n";
  }

  if (recentTrades.length > 0) {
    content += `RECENT TRANSACTIONS
${"-".repeat(20)}\n`;

    recentTrades.slice(0, 10).forEach((trade) => {
      content += `Date: ${trade.date}
  Action: ${trade.action.toUpperCase()}
  Security: ${trade.ticker}
  Quantity: ${trade.shares} shares
  Execution Price: $${trade.price.toFixed(2)}
  Realized P&L: $${trade.pnl.toFixed(2)}
  Strategy Rationale: ${trade.aiReasoning || "Automated execution"}

`;
    });

    if (recentTrades.length > 10) {
      content += `... and ${
        recentTrades.length - 10
      } additional transactions\n\n`;
    }
  }

  content += `SYSTEM OPERATIONAL STATUS
${"-".repeat(25)}
AI Engine: OpenAI GPT-4
Data Synchronization: ${portfolio.lastUpdated || "Unknown"}
Trading Environment: ${
    process.env.EXECUTE_TRADES === "false"
      ? "Paper Trading (Simulation)"
      : "Live Trading"
  }
Market Data Provider: Financial Modeling Prep (FMP)

${"=".repeat(60)}
CONFIDENTIAL - SYSTEM-GENERATED REPORT
${"=".repeat(60)}

This report contains sensitive financial information and is intended solely for the designated recipient. The Micro-Cap Trading System employs advanced AI algorithms for automated trading decisions. All transactions are executed according to predefined risk management protocols.

For technical support or system inquiries:
- System Administrator: [Contact Information]
- Report Generation: Automated Process
- Data Accuracy: Real-time market data integration

This communication is for informational purposes only and does not constitute investment advice.
${"=".repeat(60)}
`;

  return content;
}

/**
 * Execute email report generation with consistent orchestration
 * @param {Object} options - Configuration options
 * @param {string} options.invocationType - 'manual' or 'scheduled'
 * @param {Object} options.logger - Optional logger instance
 * @param {Object} options.errorHandler - Optional error handler instance
 * @returns {Promise<Object>} Email report results
 */
async function performEmailReport(options = {}) {
  const { invocationType = "manual", logger, errorHandler } = options;

  // Use provided logger/errorHandler or create new ones
  const logInstance = logger || new Logger(`email-report-${invocationType}`);
  const errorHandlerInstance =
    errorHandler || new ErrorHandler(`email-report-${invocationType}`);

  try {
    // Log function start
    logInstance.info(`📧 Starting ${invocationType} email report generation`);

    // Initialize services
    const portfolioService = new PortfolioService();
    const envConfig = require("../../config/environment").getEnvConfig();

    // Initialize SES
    const ses = new AWS.SES({ region: envConfig.sesRegion });

    // 1. Get current portfolio data
    logInstance.info("Fetching portfolio data for report");
    const portfolio = await portfolioService.getCurrentPortfolio();

    // 2. Get recent trading history (last 7 days)
    logInstance.info("Fetching recent trading history");
    const recentTrades = await portfolioService.getTradingHistory(7);

    // 3. Generate base report content
    const reportData = {
      date: new Date().toISOString().split("T")[0],
      portfolio,
      recentTrades,
      summary: generatePortfolioSummary(portfolio, recentTrades),
    };

    let emailContent = generateHTMLEmailContent(reportData);

    // 3b. Optionally append AI human-readable report and persist
    if (process.env.ENABLE_AI_HUMAN_REPORTS === "true") {
      try {
        const aiService = new AIService();
        const { content: aiContent } = await aiService.getHumanReport({
          period: "daily",
          portfolio,
          recentTrades,
          persist: true,
        });

        emailContent = emailContent.replace(
          "</body>",
          `
        <!-- AI Analysis Section -->
        <div style="padding: 0 20px 30px;">
            <h3 style="color: #1e3a8a; font-size: 20px; margin-bottom: 20px; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px;">AI STRATEGY ANALYSIS & MARKET RATIONALE</h3>
            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; white-space: pre-line; font-family: 'Courier New', monospace; font-size: 14px; line-height: 1.5;">
                ${aiContent.replace(/\n/g, "<br>")}
            </div>
        </div>
</body>`
        );
      } catch (e) {
        logInstance.warn("AI human report generation failed", e);
      }
    }

    // 4. Send email
    logInstance.info("Sending email report");
    await sendEmailReport(ses, envConfig, emailContent, reportData);

    logInstance.info("✅ Email report sent successfully", {
      recipient: envConfig.adminEmail,
      portfolioValue: portfolio.totalValue,
      recentTrades: recentTrades.length,
    });

    return {
      recipient: envConfig.adminEmail,
      portfolioValue: portfolio.totalValue,
      recentTradesCount: recentTrades.length,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    logInstance.error(`Email report generation failed`, error);

    // Send error alert if error handler provided
    if (errorHandlerInstance) {
      try {
        await errorHandlerInstance.sendErrorAlert(error, {
          function: `email-report-${invocationType}`,
          operation: "email_report_generation",
        });
      } catch (alertError) {
        logInstance.error("Failed to send error alert", alertError);
      }
    }

    throw error;
  }
}

module.exports = {
  performEmailReport,
  generatePortfolioSummary,
  generateHTMLEmailContent,
  generateEmailContent,
  sendEmailReport,
};
