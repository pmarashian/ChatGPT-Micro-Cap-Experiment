/**
 * Sync Broker Portfolio API Handler
 * Reconciles DynamoDB portfolio with Alpaca account and positions
 * Optional body: { dryRun: boolean }
 */

const BrokerageService = require("../../services/brokerage-service");
const PortfolioService = require("../../services/portfolio-service");
const Logger = require("../../utils/logger");
const ErrorHandler = require("../../utils/error-handler");
const { validateEnvironment } = require("../../config/environment");

let logger;
let errorHandler;

module.exports.handler = async (event, context) => {
  // Initialize services
  logger = new Logger("sync-broker-portfolio");
  errorHandler = new ErrorHandler("sync-broker-portfolio");

  try {
    // Log function start
    logger.logLambdaStart(event, context);

    // Validate environment
    validateEnvironment();

    // Parse body
    let dryRun = false;
    try {
      if (event.body) {
        const body = JSON.parse(event.body);
        if (typeof body.dryRun === "boolean") dryRun = body.dryRun;
      }
    } catch (e) {
      // Ignore parse errors; default dryRun=false
    }

    const brokerageService = new BrokerageService();
    const portfolioService = new PortfolioService();

    // Fetch broker account and positions
    logger.info("Fetching broker account info and positions");
    const [accountInfo, brokerPositions] = await Promise.all([
      brokerageService.getAccountInfo(),
      brokerageService.getPortfolio(),
    ]);

    // Load current portfolio from DB
    const current = await portfolioService.getCurrentPortfolio();

    // Build maps for reconciliation
    const currentMap = new Map(
      (current.positions || []).map((p) => [p.ticker, { ...p }])
    );

    // Prepare new positions based on broker
    const reconciledPositions = [];
    let updatedPositions = 0;
    let addedPositions = 0;
    let removedTickers = [];

    const brokerTickers = new Set();

    brokerPositions.forEach((bp) => {
      brokerTickers.add(bp.ticker);

      const existing = currentMap.get(bp.ticker);

      if (existing) {
        // Update shares and market data; preserve buyPrice, costBasis, stopLoss if present
        const updated = {
          ticker: bp.ticker,
          shares: bp.shares,
          buyPrice: existing.buyPrice || null,
          costBasis:
            existing.costBasis ||
            (bp.shares && bp.currentPrice ? bp.shares * bp.currentPrice : 0),
          stopLoss: existing.stopLoss || null,
          currentPrice: bp.currentPrice,
          marketValue: bp.marketValue,
          unrealizedPnL: bp.unrealizedPnL,
          unrealizedPnLPercent: bp.unrealizedPnLPercent,
        };

        reconciledPositions.push(updated);
        updatedPositions++;
      } else {
        // Add new position from broker
        const buyPrice = bp.currentPrice || 0;
        const costBasis = bp.shares * buyPrice;
        reconciledPositions.push({
          ticker: bp.ticker,
          shares: bp.shares,
          buyPrice,
          costBasis,
          stopLoss: null,
          currentPrice: bp.currentPrice || null,
          marketValue: bp.marketValue || costBasis,
          unrealizedPnL: bp.unrealizedPnL,
          unrealizedPnLPercent: bp.unrealizedPnLPercent,
        });
        addedPositions++;
      }
    });

    // Any current positions not in broker feed are removed
    removedTickers = (current.positions || [])
      .filter((p) => !brokerTickers.has(p.ticker))
      .map((p) => p.ticker);

    // Update cash from broker account
    const newCash = Number.isFinite(accountInfo.cash)
      ? accountInfo.cash
      : current.cash;

    // Recompute totals
    const equity = reconciledPositions.reduce(
      (sum, p) => sum + (p.marketValue || 0),
      0
    );
    const totalValue = equity + (newCash || 0);

    const reconciledPortfolio = {
      ...current,
      cash: newCash,
      equity,
      totalValue,
      positions: reconciledPositions,
      lastUpdated: new Date().toISOString(),
    };

    if (!dryRun) {
      await portfolioService.savePortfolio(reconciledPortfolio);
      logger.info("Portfolio reconciled and saved", {
        cash: newCash,
        positions: reconciledPositions.length,
        addedPositions,
        removed: removedTickers.length,
      });
    } else {
      logger.info("Dry run: portfolio reconciliation not persisted");
    }

    // Log function end
    logger.logLambdaEnd(Date.now() - context.getRemainingTimeInMillis());

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        success: true,
        dryRun,
        broker: {
          cash: accountInfo.cash,
          positionCount: brokerPositions.length,
        },
        reconciled: {
          cash: newCash,
          totalValue,
          equity,
          positions: reconciledPositions.length,
          addedPositions,
          removedTickers,
          updatedPositions,
        },
        timestamp: new Date().toISOString(),
      }),
    };
  } catch (error) {
    logger.error("Sync broker portfolio failed", error);
    // Log function end with error
    logger.logLambdaEnd(Date.now() - context.getRemainingTimeInMillis(), false);
    return errorHandler.createErrorResponse(error);
  }
};
