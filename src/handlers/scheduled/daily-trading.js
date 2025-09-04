/**
 * Daily Trading Lambda Handler
 * Main orchestration function for automated trading cycle
 * Replicates the core logic from Python trading_script.py main() function
 */

const AIService = require("../../services/ai-service");
const BrokerageService = require("../../services/brokerage-service");
const MarketDataService = require("../../services/market-data-service");
const PortfolioService = require("../../services/portfolio-service");
const Logger = require("../../utils/logger");
const ErrorHandler = require("../../utils/error-handler");
const { validateEnvironment } = require("../../config/environment");

let logger;
let errorHandler;

/**
 * Lambda handler for daily trading execution
 */

/**
 * Lambda handler for scheduled daily trading execution
 */
module.exports.handler = async (event, context) => {
  // Initialize services
  logger = new Logger("daily-trading");
  errorHandler = new ErrorHandler("daily-trading");

  try {
    // Log function start
    logger.logLambdaStart(event, context);

    // Validate environment
    validateEnvironment();

    // Check if trading is enabled
    if (process.env.EXECUTE_TRADES === "false") {
      logger.info("Trade execution disabled, running in simulation mode");
    }

    logger.info("Starting daily trading session");

    // Initialize services
    const portfolioService = new PortfolioService();
    const marketDataService = new MarketDataService();
    const aiService = new AIService();
    const brokerageService = new BrokerageService();

    // 1. Fetch current portfolio
    logger.info("Step 1: Fetching current portfolio");
    const currentPortfolio = await portfolioService.getCurrentPortfolio();

    // 2. Fetch market data for portfolio holdings
    logger.info("Step 2: Fetching market data");
    const marketData = await marketDataService.getPortfolioMarketData(
      currentPortfolio
    );

    // 3. Get AI trading decisions
    logger.info("Step 3: Getting AI trading decisions");
    const tradingDecisions = await aiService.getTradingDecision(
      currentPortfolio,
      marketData
    );

    // 4. Execute trades (if enabled)
    logger.info("Step 4: Executing trades");
    const tradeResults = await executeTrades(
      tradingDecisions.decisions,
      brokerageService
    );

    // 5. Update stop losses
    if (
      tradingDecisions.stopLossUpdates &&
      tradingDecisions.stopLossUpdates.length > 0
    ) {
      logger.info("Step 5: Updating stop losses");
      await portfolioService.updateStopLosses(tradingDecisions.stopLossUpdates);
    }

    // 6. Update portfolio with trade results
    logger.info("Step 6: Updating portfolio");
    const updatedPortfolio = await portfolioService.updatePortfolio(
      tradeResults
    );

    // Log completion
    const successCount = tradeResults.filter((r) => r.success).length;
    const totalCount = tradeResults.length;

    logger.info("Daily trading completed successfully", {
      tradesProcessed: totalCount,
      tradesSuccessful: successCount,
      aiProvider: "openai",
      aiModel: "gpt-4",
      portfolioValue: updatedPortfolio.totalValue,
      cashBalance: updatedPortfolio.cash,
    });

    // Log function end
    logger.logLambdaEnd(Date.now() - context.getRemainingTimeInMillis());

    // Force flush all remaining logs before returning
    await logger.flush();

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Daily trading completed successfully",
        tradesProcessed: totalCount,
        tradesSuccessful: successCount,
        portfolioValue: updatedPortfolio.totalValue,
        timestamp: new Date().toISOString(),
        aiProvider: "openai",
        aiModel: "gpt-4",
      }),
    };
  } catch (error) {
    logger.error("Daily trading failed", error);
    await errorHandler.sendErrorAlert(error, { function: "daily-trading" });

    // Log function end with error
    logger.logLambdaEnd(Date.now() - context.getRemainingTimeInMillis(), false);

    // Force flush all remaining logs before throwing error
    try {
      await logger.flush();
    } catch (flushError) {
      // Silent fail - don't let flush errors mask the original error
    }

    throw error; // Let Lambda handle the error response
  }
};

/**
 * Execute trades based on AI decisions
 * @param {Array} decisions - AI trading decisions
 * @param {BrokerageService} brokerageService - Brokerage service instance
 * @returns {Promise<Array>} Trade execution results
 */
async function executeTrades(decisions, brokerageService) {
  const results = [];

  // Enforce portfolio-level utilization target for BUY orders
  try {
    const portfolioService = new PortfolioService();
    const portfolio = await portfolioService.getCurrentPortfolio();
    const { PORTFOLIO_CONFIG } = require("../../config/constants");

    const targetInvestedValue =
      (portfolio.totalValue || 0) *
      (PORTFOLIO_CONFIG?.UTILIZATION?.TARGET_PERCENT ?? 1.0);
    const currentInvestedValue =
      (portfolio.totalValue || 0) - (portfolio.cash || 0);
    let remainingBudget = Math.max(
      0,
      targetInvestedValue - currentInvestedValue
    );

    // Pre-fetch prices for BUY decisions to compute spend
    const buyDecisions = decisions.filter((d) => d.action === "BUY");
    const tickers = [...new Set(buyDecisions.map((d) => d.ticker))];
    const marketDataService = new MarketDataService();
    const md = await marketDataService.getPortfolioMarketData({
      positions: tickers.map((t) => ({ ticker: t })),
    });

    // Adjust shares if needed to not exceed remainingBudget
    for (const d of buyDecisions) {
      const series = md[d.ticker]?.data;
      const price =
        series && series.length > 0 ? series[series.length - 1].close : null;
      if (!price || !Number.isFinite(price) || !Number.isFinite(d.shares))
        continue;
      const intendedCost = d.shares * price;
      if (intendedCost > remainingBudget && remainingBudget > 0) {
        const adjustedShares = Math.floor(remainingBudget / price);
        if (adjustedShares >= 1) {
          logger.info(
            `Adjusting ${d.ticker} shares from ${d.shares} to ${adjustedShares} to respect utilization target`
          );
          d.shares = adjustedShares;
          remainingBudget -= adjustedShares * price;
        } else {
          // No budget left for at least 1 share; convert to HOLD
          logger.info(
            `Skipping ${d.ticker} BUY due to utilization cap; insufficient remaining budget`
          );
          d.action = "HOLD";
        }
      } else if (intendedCost <= remainingBudget) {
        remainingBudget -= intendedCost;
      }
    }
  } catch (e) {
    logger.warn(
      "Utilization enforcement skipped due to error",
      e?.message || e
    );
  }

  for (const decision of decisions) {
    try {
      // Skip HOLD decisions
      if (decision.action === "HOLD") {
        logger.debug(`Skipping HOLD decision for ${decision.ticker}`);
        continue;
      }

      // Check if trading is enabled
      if (process.env.EXECUTE_TRADES === "false") {
        logger.info(
          `SIMULATION: Would execute ${decision.action} ${decision.shares} ${decision.ticker}`
        );
        results.push({
          ...decision,
          success: true,
          simulated: true,
          message: "Trade simulated (execution disabled)",
        });
        continue;
      }

      // Execute real trade
      logger.info(
        `Executing ${decision.action} order: ${decision.shares} ${decision.ticker}`
      );
      const result = await brokerageService.executeTrade(decision);
      results.push(result);
    } catch (error) {
      logger.error(`Trade execution failed for ${decision.ticker}`, error);

      results.push({
        ...decision,
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  return results;
}
