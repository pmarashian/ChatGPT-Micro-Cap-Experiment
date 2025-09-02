/**
 * Daily Trading Lambda Handler
 * Main orchestration function for automated trading cycle
 * Replicates the core logic from Python trading_script.py main() function
 */

const AIService = require('../../services/ai-service');
const BrokerageService = require('../../services/brokerage-service');
const MarketDataService = require('../../services/market-data-service');
const PortfolioService = require('../../services/portfolio-service');
const Logger = require('../../utils/logger');
const ErrorHandler = require('../../utils/error-handler');
const { validateEnvironment } = require('../../config/environment');

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
  logger = new Logger('daily-trading');
  errorHandler = new ErrorHandler('daily-trading');

  try {
    // Log function start
    logger.logLambdaStart(event, context);

    // Validate environment
    validateEnvironment();

    // Check if trading is enabled
    if (process.env.EXECUTE_TRADES === 'false') {
      logger.info('Trade execution disabled, running in simulation mode');
    }

    logger.info('Starting daily trading session');

    // Initialize services
    const portfolioService = new PortfolioService();
    const marketDataService = new MarketDataService();
    const aiService = new AIService();
    const brokerageService = new BrokerageService();

    // 1. Fetch current portfolio
    logger.info('Step 1: Fetching current portfolio');
    const currentPortfolio = await portfolioService.getCurrentPortfolio();

    // 2. Fetch market data for portfolio holdings
    logger.info('Step 2: Fetching market data');
    const marketData = await marketDataService.getPortfolioMarketData(currentPortfolio);

    // 3. Get AI trading decisions
    logger.info('Step 3: Getting AI trading decisions');
    const tradingDecisions = await aiService.getTradingDecision(currentPortfolio, marketData);

    // 4. Execute trades (if enabled)
    logger.info('Step 4: Executing trades');
    const tradeResults = await executeTrades(tradingDecisions.decisions, brokerageService);

    // 5. Update stop losses
    if (tradingDecisions.stopLossUpdates && tradingDecisions.stopLossUpdates.length > 0) {
      logger.info('Step 5: Updating stop losses');
      await portfolioService.updateStopLosses(tradingDecisions.stopLossUpdates);
    }

    // 6. Update portfolio with trade results
    logger.info('Step 6: Updating portfolio');
    const updatedPortfolio = await portfolioService.updatePortfolio(tradeResults);

    // Log completion
    const successCount = tradeResults.filter(r => r.success).length;
    const totalCount = tradeResults.length;

    logger.info('Daily trading completed successfully', {
      tradesProcessed: totalCount,
      tradesSuccessful: successCount,
      aiProvider: 'openai',
      aiModel: 'gpt-4',
      portfolioValue: updatedPortfolio.totalValue,
      cashBalance: updatedPortfolio.cash
    });

    // Log function end
    logger.logLambdaEnd(Date.now() - context.getRemainingTimeInMillis());

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Daily trading completed successfully',
        tradesProcessed: totalCount,
        tradesSuccessful: successCount,
        portfolioValue: updatedPortfolio.totalValue,
        timestamp: new Date().toISOString(),
        aiProvider: 'openai',
        aiModel: 'gpt-4'
      })
    };

  } catch (error) {
    logger.error('Daily trading failed', error);
    await errorHandler.sendErrorAlert(error, { function: 'daily-trading' });

    // Log function end with error
    logger.logLambdaEnd(Date.now() - context.getRemainingTimeInMillis(), false);

    throw error; // Let Lambda handle the error response
  }
};

/**
 * Execute trades based on AI decisions
 * @param {Array} decisions - AI trading decisions
 * @param {BrokerageService} brokerageService - Brokerage service instance
 * @returns {Promise<Array>} Trade execution results
 */
async executeTrades(decisions, brokerageService) {
  const results = [];

  for (const decision of decisions) {
    try {
      // Skip HOLD decisions
      if (decision.action === 'HOLD') {
        logger.debug(`Skipping HOLD decision for ${decision.ticker}`);
        continue;
      }

      // Check if trading is enabled
      if (process.env.EXECUTE_TRADES === 'false') {
        logger.info(`SIMULATION: Would execute ${decision.action} ${decision.shares} ${decision.ticker}`);
        results.push({
          ...decision,
          success: true,
          simulated: true,
          message: 'Trade simulated (execution disabled)'
        });
        continue;
      }

      // Execute real trade
      logger.info(`Executing ${decision.action} order: ${decision.shares} ${decision.ticker}`);
      const result = await brokerageService.executeTrade(decision);
      results.push(result);

    } catch (error) {
      logger.error(`Trade execution failed for ${decision.ticker}`, error);

      results.push({
        ...decision,
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  return results;
}
