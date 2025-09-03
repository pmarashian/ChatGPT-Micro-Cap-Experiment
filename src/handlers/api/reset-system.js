/**
 * Reset System API Handler
 * Resets the system by clearing local data and syncing with brokerage
 */

const PortfolioService = require("../../services/portfolio-service");
const BrokerageService = require("../../services/brokerage-service");
const Logger = require("../../utils/logger");
const ErrorHandler = require("../../utils/error-handler");
const AWS = require("aws-sdk");

let logger;
let errorHandler;

/**
 * Lambda handler for POST /api/reset-system
 */
module.exports.handler = async (event, context) => {
  // Initialize services
  logger = new Logger("reset-system");
  errorHandler = new ErrorHandler("reset-system");

  try {
    // Log function start
    logger.logLambdaStart(event, context);

    const body = JSON.parse(event.body || "{}");
    const { resetType = "sync", confirm = true } = body;

    logger.info("Reset system requested", { resetType, confirm });

    // Safety check - require explicit confirmation
    if (!confirm) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
        },
        body: JSON.stringify({
          error: "Confirmation required",
          message: "Please set confirm=true to proceed with system reset",
          availableOptions: {
            sync: "Sync with real brokerage portfolio (recommended)",
            full_reset: "Clear all data and reset to starting cash",
            clear_trades: "Clear only trade history",
          },
        }),
      };
    }

    const portfolioService = new PortfolioService();
    const brokerageService = new BrokerageService();

    let result = {
      success: true,
      resetType,
      timestamp: new Date().toISOString(),
      actions: [],
    };

    switch (resetType) {
      case "sync":
        // Sync with real brokerage portfolio
        logger.info("Syncing with brokerage portfolio");

        const accountInfo = await brokerageService.getAccountInfo();
        const brokeragePositions = await brokerageService.getPortfolio();

        // Create portfolio from brokerage data
        const syncedPortfolio = {
          totalValue: accountInfo.equity,
          cash: accountInfo.cash,
          equity: accountInfo.equity - accountInfo.cash,
          positions: brokeragePositions.map((pos) => ({
            ticker: pos.ticker,
            shares: pos.shares,
            buyPrice: 0, // Will be updated by AI/market data
            costBasis: pos.marketValue,
            stopLoss: null, // Will be set by AI if needed
            currentPrice: pos.currentPrice,
            marketValue: pos.marketValue,
            unrealizedPnL: pos.unrealizedPnL,
            unrealizedPnLPercent: pos.unrealizedPnLPercent,
          })),
          lastUpdated: new Date().toISOString(),
        };

        await portfolioService.savePortfolio(syncedPortfolio);

        result.actions.push({
          action: "synced_portfolio",
          brokerageCash: accountInfo.cash,
          brokerageEquity: accountInfo.equity,
          positionCount: brokeragePositions.length,
        });
        break;

      case "full_reset":
        // Clear all data and reset to starting cash
        logger.info("Performing full system reset");

        const startingCash = parseFloat(process.env.STARTING_CASH) || 1000;
        const emptyPortfolio = portfolioService.createEmptyPortfolio();

        await portfolioService.savePortfolio(emptyPortfolio);
        await clearTradeHistory();

        result.actions.push({
          action: "full_reset",
          startingCash: startingCash,
          message: "System reset to initial state",
        });
        break;

      case "clear_trades":
        // Clear only trade history
        logger.info("Clearing trade history");

        await clearTradeHistory();

        result.actions.push({
          action: "cleared_trades",
          message: "Trade history cleared",
        });
        break;

      default:
        throw new Error(`Unknown reset type: ${resetType}`);
    }

    // Get final portfolio state
    const finalPortfolio = await portfolioService.getCurrentPortfolio();

    result.finalState = {
      totalValue: finalPortfolio.totalValue,
      cash: finalPortfolio.cash,
      positionCount: finalPortfolio.positions?.length || 0,
      lastUpdated: finalPortfolio.lastUpdated,
    };

    logger.info("System reset completed", {
      resetType,
      finalCash: finalPortfolio.cash,
      finalPositions: finalPortfolio.positions?.length || 0,
    });

    // Log function end
    logger.logLambdaEnd(Date.now() - context.getRemainingTimeInMillis());

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
      body: JSON.stringify(result),
    };
  } catch (error) {
    logger.error("System reset failed", error);

    // Log function end with error
    logger.logLambdaEnd(Date.now() - context.getRemainingTimeInMillis(), false);

    return errorHandler.createErrorResponse(error);
  }
};

/**
 * Clear trade history from DynamoDB
 */
async function clearTradeHistory() {
  const dynamodb = new AWS.DynamoDB.DocumentClient({
    region: process.env.AWS_REGION || "us-east-1",
  });

  const tableName =
    process.env.TRADING_TABLE_NAME ||
    `${process.env.SERVICE_NAME}-${process.env.STAGE || "dev"}`;

  // Query for all trade items
  const params = {
    TableName: tableName,
    FilterExpression: "begins_with(id, :prefix)",
    ExpressionAttributeValues: {
      ":prefix": "trade#",
    },
  };

  try {
    const result = await dynamodb.scan(params).promise();

    // Delete each trade item
    for (const item of result.Items || []) {
      await dynamodb
        .delete({
          TableName: tableName,
          Key: {
            id: item.id,
          },
        })
        .promise();
    }

    logger.info(`Cleared ${result.Items?.length || 0} trade records`);
  } catch (error) {
    logger.warn("Failed to clear trade history", error);
  }
}
