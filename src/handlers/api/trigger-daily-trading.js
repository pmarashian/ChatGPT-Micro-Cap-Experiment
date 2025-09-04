/**
 * Manual Daily Trading Trigger API Handler
 * Allows manual execution of daily trading cycle for testing purposes
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
 * Execute trades based on AI decisions
 * @param {Array} decisions - AI trading decisions
 * @param {BrokerageService} brokerageService - Brokerage service instance
 * @returns {Promise<Array>} Trade execution results
 */
async function executeTrades(decisions, brokerageService, logger) {
  console.log("🔍 DEBUG: Number of Decisions", decisions.length);

  const results = [];

  // Enforce portfolio-level utilization target for BUY orders
  try {
    const portfolioService = new PortfolioService();
    const portfolio = await portfolioService.getCurrentPortfolio();
    const { PORTFOLIO_CONFIG } = require("../../config/constants");

    const targetInvestedValue =
      (portfolio.totalValue || 0) * (PORTFOLIO_CONFIG?.UTILIZATION?.TARGET_PERCENT ?? 1.0);
    const currentInvestedValue = (portfolio.totalValue || 0) - (portfolio.cash || 0);
    let remainingBudget = Math.max(0, targetInvestedValue - currentInvestedValue);

    // Pre-fetch prices for BUY decisions to compute spend
    const buyDecisions = decisions.filter((d) => d.action === "BUY");
    const tickers = [...new Set(buyDecisions.map((d) => d.ticker))];
    const marketDataService = new MarketDataService();
    const md = await marketDataService.getPortfolioMarketData({ positions: tickers.map((t) => ({ ticker: t })) });

    // Adjust shares if needed to not exceed remainingBudget
    for (const d of buyDecisions) {
      const series = md[d.ticker]?.data;
      const price = series && series.length > 0 ? series[series.length - 1].close : null;
      if (!price || !Number.isFinite(price) || !Number.isFinite(d.shares)) continue;
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
    logger.warn("Utilization enforcement skipped due to error", e?.message || e);
  }

  for (const decision of decisions) {
    try {
      // Skip HOLD decisions
      if (decision.action === "HOLD") {
        logger.debug(`Skipping HOLD decision for ${decision.ticker}`);
        continue;
      }

      // TEMPORARY: Force simulation mode to test AI logic
      // TODO: Fix EXECUTE_TRADES environment variable issue
      const forceSimulation = false;

      if (forceSimulation || process.env.EXECUTE_TRADES === "false") {
        console.log("✅ SIMULATION MODE: Skipping trade execution");
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
      logger.debug("AI Decision object being sent to brokerage", decision);

      // Get current market price for protective pricing
      let referencePrice = null;
      try {
        const marketData = await marketDataService.getPortfolioMarketData({
          positions: [{ ticker: decision.ticker }],
        });
        if (marketData[decision.ticker]?.data?.length > 0) {
          referencePrice =
            marketData[decision.ticker].data[
              marketData[decision.ticker].data.length - 1
            ].close;
        }
      } catch (error) {
        logger.warn(
          `Could not get reference price for ${decision.ticker}`,
          error.message
        );
      }

      // Ensure the decision object has the correct structure
      const orderData = {
        ticker: decision.ticker,
        action: decision.action,
        shares: decision.shares,
        orderType: decision.orderType || "limit", // Default to limit for protection
        limitPrice: decision.limitPrice || null,
        timeInForce: decision.timeInForce || "day",
        stopLoss: decision.stopLoss || null,
        referencePrice: referencePrice, // Add reference price for protective limits
      };

      logger.debug("Formatted order data for brokerage", orderData);
      logger.info("🚀 ABOUT TO EXECUTE TRADE", {
        ticker: orderData.ticker,
        action: orderData.action,
        shares: orderData.shares,
        hasStopLoss: !!orderData.stopLoss,
      });
      const result = await brokerageService.executeTrade(orderData);
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

/**
 * Lambda handler for manual daily trading trigger
 */
module.exports.handler = async (event, context) => {
  // Initialize services
  logger = new Logger("trigger-daily-trading");
  errorHandler = new ErrorHandler("trigger-daily-trading");

  try {
    // Log function start
    logger.logLambdaStart(event, context);

    // Debug environment variables
    logger.info("🔍 DEBUG: Environment check", {
      EXECUTE_TRADES: process.env.EXECUTE_TRADES,
      EXECUTE_TRADES_type: typeof process.env.EXECUTE_TRADES,
      EXECUTE_TRADES_length: process.env.EXECUTE_TRADES?.length,
      all_env_keys: Object.keys(process.env).filter((key) =>
        key.includes("EXECUTE")
      ),
      NODE_ENV: process.env.NODE_ENV,
    });

    // Validate environment
    validateEnvironment();

    // Check if trading is enabled
    if (process.env.EXECUTE_TRADES === "false") {
      logger.info("Trade execution disabled, running in simulation mode");
    }

    logger.info("Starting manual daily trading session");

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

    logger.info("AI trading decisions generated", {
      decisionCount: tradingDecisions.decisions?.length || 0,
      newDiscoveries: tradingDecisions.newDiscoveries?.length || 0,
      hasResearchSummary: !!tradingDecisions.researchSummary,
    });

    // 4. Execute trades (if enabled)
    logger.info("Step 4: Executing trades using pre-researched data");
    const tradeResults = await executeTrades(
      tradingDecisions.decisions,
      brokerageService,
      logger
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

    // Calculate results
    const successCount = tradeResults.filter((r) => r.success).length;
    const totalCount = tradeResults.length;

    logger.info("Manual daily trading completed successfully", {
      tradesProcessed: totalCount,
      tradesSuccessful: successCount,
      aiProvider: "openai",
      aiModel: "gpt-4",
      portfolioValue: updatedPortfolio.totalValue,
      cashBalance: updatedPortfolio.cash,
      triggeredBy: "manual",
      researchSummary: tradingDecisions.researchSummary,
      newDiscoveries: tradingDecisions.newDiscoveries?.length || 0,
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
      body: JSON.stringify({
        message: "Manual daily trading completed successfully",
        tradesProcessed: totalCount,
        tradesSuccessful: successCount,
        portfolioValue: updatedPortfolio.totalValue,
        cashBalance: updatedPortfolio.cash,
        timestamp: new Date().toISOString(),
        aiProvider: "openai",
        aiModel: "gpt-4",
        triggeredBy: "manual",
        tradingDecisions: tradingDecisions.decisions,
        tradeResults: tradeResults,
        // New research-driven fields
        researchSummary: tradingDecisions.researchSummary,
        newDiscoveries: tradingDecisions.newDiscoveries,
        portfolioStrategy: tradingDecisions.portfolioStrategy,
        riskAssessment: tradingDecisions.riskAssessment,
        nextResearchFocus: tradingDecisions.nextResearchFocus,
      }),
    };
  } catch (error) {
    logger.error("Manual daily trading failed", error);
    await errorHandler.sendErrorAlert(error, {
      function: "trigger-daily-trading",
      triggeredBy: "manual",
    });

    // Log function end with error
    logger.logLambdaEnd(Date.now() - context.getRemainingTimeInMillis(), false);

    return errorHandler.createErrorResponse(error);
  }
};
