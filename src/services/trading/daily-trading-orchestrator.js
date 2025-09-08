/**
 * Daily Trading Orchestrator
 * Shared function for both manual and scheduled daily trading execution
 */

const AIService = require("../ai-service");
const BrokerageService = require("../brokerage-service");
const MarketDataService = require("../market-data-service");
const PortfolioService = require("../portfolio-service");
const Logger = require("../../utils/logger");
const ErrorHandler = require("../../utils/error-handler");

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
          console.log(
            `Adjusting ${d.ticker} shares from ${d.shares} to ${adjustedShares} to respect utilization target`
          );
          d.shares = adjustedShares;
          remainingBudget -= adjustedShares * price;
        } else {
          // No budget left for at least 1 share; convert to HOLD
          console.log(
            `Skipping ${d.ticker} BUY due to utilization cap; insufficient remaining budget`
          );
          d.action = "HOLD";
        }
      } else if (intendedCost <= remainingBudget) {
        remainingBudget -= intendedCost;
      }
    }
  } catch (e) {
    console.warn(
      "Utilization enforcement skipped due to error",
      e?.message || e
    );
  }

  for (const decision of decisions) {
    try {
      // Skip HOLD and RESEARCH decisions (not executable trades)
      if (decision.action === "HOLD") {
        console.debug(`Skipping HOLD decision for ${decision.ticker}`);
        continue;
      }

      if (decision.action === "RESEARCH") {
        console.debug(
          `Skipping RESEARCH decision for ${decision.ticker} - further analysis needed`
        );
        continue;
      }

      // Check if trading is enabled
      if (process.env.EXECUTE_TRADES === "false") {
        console.log(
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

      // RESEARCH actions should not reach here due to early skip above, but add safeguard
      if (decision.action === "RESEARCH") {
        console.warn(
          `RESEARCH action should have been skipped: ${decision.ticker}`
        );
        results.push({
          ...decision,
          success: false,
          error: "RESEARCH actions are not executable trades",
          message: "Skipped - further research needed",
        });
        continue;
      }

      // Validate tradability before executing trade
      const isTradable = await brokerageService.isTradable(decision.ticker);
      if (!isTradable) {
        console.warn(
          `Skipping ${decision.action} for ${decision.ticker} - not tradable on Alpaca`
        );
        results.push({
          ...decision,
          success: false,
          error: "Asset is not tradable on Alpaca",
          message: "Skipped - not tradable",
          timestamp: new Date().toISOString(),
        });
        continue;
      }

      // Execute real trade
      console.log(
        `Executing ${decision.action} order: ${decision.shares} ${decision.ticker}`
      );
      const result = await brokerageService.executeTrade(decision);
      results.push(result);
    } catch (error) {
      console.error(`Trade execution failed for ${decision.ticker}`, error);

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

/**
 * Execute daily trading with consistent orchestration
 * @param {Object} options - Configuration options
 * @param {string} options.invocationType - 'manual' or 'scheduled'
 * @param {Object} options.logger - Optional logger instance
 * @param {Object} options.errorHandler - Optional error handler instance
 * @returns {Promise<Object>} Trading results
 */
async function performDailyTrading(options = {}) {
  const { invocationType = "manual", logger, errorHandler } = options;

  // Use provided logger/errorHandler or create new ones
  const logInstance = logger || new Logger(`daily-trading-${invocationType}`);
  const errorHandlerInstance =
    errorHandler || new ErrorHandler(`daily-trading-${invocationType}`);

  try {
    // Log function start
    logInstance.info(`🚀 Starting ${invocationType} daily trading session`);

    // Check if trading is enabled
    if (process.env.EXECUTE_TRADES === "false") {
      logInstance.info("Trade execution disabled, running in simulation mode");
    }

    // Initialize services
    const portfolioService = new PortfolioService();
    const marketDataService = new MarketDataService();
    const aiService = new AIService();
    const brokerageService = new BrokerageService();

    // 1. Fetch current portfolio
    logInstance.info("Step 1: Fetching current portfolio");
    const currentPortfolio = await portfolioService.getCurrentPortfolio();

    // 2. Fetch market data for portfolio holdings
    logInstance.info("Step 2: Fetching market data");
    const marketData = await marketDataService.getPortfolioMarketData(
      currentPortfolio
    );

    // 3. Get AI trading decisions
    logInstance.info("Step 3: Getting AI trading decisions");
    const tradingDecisions = await aiService.getTradingDecision(
      currentPortfolio,
      marketData
    );

    // 4. Execute trades (if enabled)
    logInstance.info("Step 4: Executing trades");
    const tradeResults = await executeTrades(
      tradingDecisions.decisions,
      brokerageService
    );

    // 5. Update stop losses
    if (
      tradingDecisions.stopLossUpdates &&
      tradingDecisions.stopLossUpdates.length > 0
    ) {
      logInstance.info("Step 5: Updating stop losses");
      await portfolioService.updateStopLosses(tradingDecisions.stopLossUpdates);
    }

    // 6. Update portfolio with trade results
    logInstance.info("Step 6: Updating portfolio");
    const updatedPortfolio = await portfolioService.updatePortfolio(
      tradeResults
    );

    // Log completion
    const successCount = tradeResults.filter((r) => r.success).length;
    const totalCount = tradeResults.length;

    logInstance.info("✅ Daily trading completed successfully", {
      tradesProcessed: totalCount,
      tradesSuccessful: successCount,
      aiProvider: "openai",
      aiModel: "gpt-4",
      portfolioValue: updatedPortfolio.totalValue,
      cashBalance: updatedPortfolio.cash,
    });

    return {
      tradesProcessed: totalCount,
      tradesSuccessful: successCount,
      portfolioValue: updatedPortfolio.totalValue,
      cashBalance: updatedPortfolio.cash,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    logInstance.error(`Daily trading failed`, error);

    // Send error alert if error handler provided
    if (errorHandlerInstance) {
      try {
        await errorHandlerInstance.sendErrorAlert(error, {
          function: `daily-trading-${invocationType}`,
          operation: "daily_trading_execution",
        });
      } catch (alertError) {
        logInstance.error("Failed to send error alert", alertError);
      }
    }

    throw error;
  }
}

module.exports = {
  performDailyTrading,
  executeTrades,
};
