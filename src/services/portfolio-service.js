/**
 * Portfolio Service
 * Handles portfolio calculations, data persistence, and state management
 * Replicates functionality from Python trading_script.py
 */

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
} = require("@aws-sdk/lib-dynamodb");
const Logger = require("../utils/logger");
const ErrorHandler = require("../utils/error-handler");
const Validators = require("../utils/validators");
const { DYNAMODB_TABLES, ITEM_TYPES } = require("../config/constants");
const { getEnvConfig } = require("../config/environment");

class PortfolioService {
  constructor() {
    this.logger = new Logger("portfolio-service");
    this.errorHandler = new ErrorHandler("portfolio-service");
    this.validators = new Validators();
    this.envConfig = getEnvConfig();

    // Initialize DynamoDB
    const client = new DynamoDBClient({
      region: process.env.AWS_REGION || "us-east-1",
    });
    this.dynamodb = DynamoDBDocumentClient.from(client);

    this.tableName =
      process.env.TRADING_TABLE_NAME || DYNAMODB_TABLES.TRADING_TABLE;
  }

  /**
   * Get current portfolio state
   * @returns {Promise<Object>} Current portfolio data
   */
  async getCurrentPortfolio() {
    try {
      this.logger.debug("Fetching current portfolio state");

      const params = {
        TableName: this.tableName,
        Key: {
          PK: ITEM_TYPES.PORTFOLIO,
          SK: "CURRENT",
        },
      };

      const result = await this.dynamodb.send(new GetCommand(params));

      if (!result.Item) {
        // Initialize empty portfolio if none exists
        const emptyPortfolio = this.createEmptyPortfolio();
        await this.savePortfolio(emptyPortfolio);
        return emptyPortfolio;
      }

      const portfolio = result.Item;
      this.logger.debug("Portfolio retrieved", {
        totalValue: portfolio.totalValue,
        positionCount: portfolio.positions?.length || 0,
        cash: portfolio.cash,
      });

      return portfolio;
    } catch (error) {
      this.logger.error("Failed to fetch current portfolio", error);
      throw new Error(`Portfolio fetch error: ${error.message}`);
    }
  }

  /**
   * Update portfolio after trade execution
   * @param {Array} tradeResults - Results from executed trades
   * @returns {Promise<Object>} Updated portfolio
   */
  async updatePortfolio(tradeResults) {
    try {
      this.logger.info(
        `Updating portfolio with ${tradeResults.length} trade results`
      );

      let portfolio = await this.getCurrentPortfolio();

      for (const result of tradeResults) {
        if (!result.success) {
          this.logger.warn(`Skipping failed trade for ${result.ticker}`);
          continue;
        }

        portfolio = this.applyTradeToPortfolio(portfolio, result);
      }

      // Recalculate totals
      portfolio = this.recalculatePortfolioTotals(portfolio);

      // Sanitize portfolio data to prevent NaN values
      portfolio = this.sanitizePortfolioData(portfolio);

      portfolio.lastUpdated = new Date().toISOString();

      // Save updated portfolio
      await this.savePortfolio(portfolio);

      this.logger.info("Portfolio updated successfully", {
        totalValue: portfolio.totalValue,
        cash: portfolio.cash,
        positionCount: portfolio.positions.length,
      });

      return portfolio;
    } catch (error) {
      this.logger.error("Failed to update portfolio", error);
      throw new Error(`Portfolio update error: ${error.message}`);
    }
  }

  /**
   * Get trading history
   * @param {number} days - Number of days to look back
   * @returns {Promise<Array>} Trading history
   */
  async getTradingHistory(days = 30) {
    try {
      this.logger.debug(`Fetching trading history for last ${days} days`);

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      const cutoffIso = cutoffDate.toISOString();

      const params = {
        TableName: this.tableName,
        IndexName: "TradeHistoryIndex",
        KeyConditionExpression: "GSI2PK = :pk AND GSI2SK >= :cutoff",
        ExpressionAttributeValues: {
          ":pk": "ALL_TRADES",
          ":cutoff": `TRADE#${cutoffIso}`,
        },
      };

      const result = await this.dynamodb.send(new QueryCommand(params));

      const trades = result.Items.map((item) => ({
        id: item.id,
        date: item.date,
        ticker: item.ticker,
        action: item.action,
        shares: item.shares,
        price: item.price,
        aiReasoning: item.aiReasoning,
        pnl: item.pnl || 0,
      }));

      this.logger.info(`Retrieved ${trades.length} trades`);
      return trades;
    } catch (error) {
      this.logger.error("Failed to fetch trading history", error);
      throw new Error(`Trading history fetch error: ${error.message}`);
    }
  }

  /**
   * Save portfolio to DynamoDB
   * @param {Object} portfolio - Portfolio data to save
   */
  async savePortfolio(portfolio) {
    try {
      this.validators.validatePortfolio(portfolio);

      const params = {
        TableName: this.tableName,
        Item: {
          // Primary Key (composite)
          PK: ITEM_TYPES.PORTFOLIO,
          SK: "CURRENT",
          // Legacy id for backward compatibility
          id: ITEM_TYPES.PORTFOLIO,
          // Data
          ...portfolio,
        },
      };

      await this.dynamodb.send(new PutCommand(params));
      this.logger.debug("Portfolio saved to DynamoDB");
    } catch (error) {
      this.logger.error("Failed to save portfolio", error);
      throw new Error(`Portfolio save error: ${error.message}`);
    }
  }

  /**
   * Save trade to DynamoDB
   * @param {Object} trade - Trade data to save
   */
  async saveTrade(trade) {
    try {
      const timestamp = new Date().toISOString();
      const tradeId = `${Date.now()}`;

      const tradeItem = {
        // Primary Key (composite)
        PK: `TRADE#${trade.ticker}`,
        SK: timestamp,
        // GSI for ticker queries
        GSI1PK: trade.ticker,
        GSI1SK: `TRADE#${timestamp}`,
        // GSI for trade history queries (all trades by time)
        GSI2PK: "ALL_TRADES",
        GSI2SK: `TRADE#${timestamp}`,
        // Legacy id for backward compatibility
        id: `trade#${timestamp.slice(0, 10)}#${tradeId}`,
        // Data
        date: timestamp,
        ticker: trade.ticker,
        action: trade.action,
        shares: trade.shares,
        price: trade.price,
        aiReasoning: trade.aiReasoning || "",
        pnl: trade.pnl || 0,
      };

      const params = {
        TableName: this.tableName,
        Item: tradeItem,
      };

      await this.dynamodb.send(new PutCommand(params));
      this.logger.debug(`Trade saved: ${tradeId}`);

      return tradeId;
    } catch (error) {
      this.logger.error("Failed to save trade", error);
      throw new Error(`Trade save error: ${error.message}`);
    }
  }

  /**
   * Apply trade result to portfolio
   * @param {Object} portfolio - Current portfolio
   * @param {Object} tradeResult - Trade execution result
   * @returns {Object} Updated portfolio
   */
  applyTradeToPortfolio(portfolio, tradeResult) {
    const { ticker, action, shares, filledPrice } = tradeResult;

    // Find existing position
    let position = portfolio.positions.find((p) => p.ticker === ticker);

    if (action === "BUY") {
      const cost = filledPrice * shares;

      if (cost > portfolio.cash) {
        throw new Error(
          `Insufficient cash for ${ticker} purchase: need $${cost.toFixed(
            2
          )}, have $${portfolio.cash.toFixed(2)}`
        );
      }

      if (position) {
        // Add to existing position
        const totalShares = position.shares + shares;
        const totalCost = position.shares * position.buyPrice + cost;
        position.shares = totalShares;
        position.buyPrice = totalCost / totalShares;
        position.costBasis = totalCost;
      } else {
        // Create new position
        position = {
          ticker,
          shares,
          buyPrice: filledPrice,
          costBasis: cost,
          stopLoss: tradeResult.stopLoss || null,
          currentPrice: filledPrice,
          marketValue: cost,
        };
        portfolio.positions.push(position);
      }

      portfolio.cash -= cost;
    } else if (action === "SELL") {
      if (!position) {
        throw new Error(`Cannot sell ${ticker}: position not found`);
      }

      if (shares > position.shares) {
        throw new Error(
          `Cannot sell ${shares} shares of ${ticker}: only ${position.shares} available`
        );
      }

      const revenue = filledPrice * shares;
      // Prevent division by zero
      const costBasisSold =
        position.shares > 0
          ? (shares / position.shares) * (position.costBasis || 0)
          : 0;
      const pnl = revenue - costBasisSold;

      // Update position
      if (shares === position.shares) {
        // Complete sell - remove position
        portfolio.positions = portfolio.positions.filter(
          (p) => p.ticker !== ticker
        );
      } else {
        // Partial sell
        const remainingShares = position.shares - shares;
        // Prevent division by zero
        const remainingCost =
          position.shares > 0
            ? (remainingShares / position.shares) * (position.costBasis || 0)
            : 0;
        position.shares = remainingShares;
        position.costBasis = remainingCost;
        position.marketValue = remainingShares * filledPrice;
      }

      portfolio.cash += revenue;

      // Save trade with P&L
      this.saveTrade({
        ...tradeResult,
        pnl,
      });
    }

    return portfolio;
  }

  /**
   * Recalculate portfolio totals
   * @param {Object} portfolio - Portfolio to recalculate
   * @returns {Object} Portfolio with updated totals
   */
  recalculatePortfolioTotals(portfolio) {
    let totalValue = 0;

    portfolio.positions.forEach((position) => {
      // Update market value based on current price (would be updated by market data service)
      if (position.currentPrice && position.shares) {
        position.marketValue = position.shares * position.currentPrice;
        position.unrealizedPnL =
          position.marketValue - (position.costBasis || 0);
        if (position.costBasis && position.costBasis > 0) {
          position.unrealizedPnLPercent =
            (position.unrealizedPnL / position.costBasis) * 100;
        } else {
          position.unrealizedPnLPercent = 0;
        }
      } else {
        position.marketValue = 0;
        position.unrealizedPnL = 0;
        position.unrealizedPnLPercent = 0;
      }
      totalValue += position.marketValue || 0;
    });

    portfolio.totalValue = totalValue + (portfolio.cash || 0);
    portfolio.equity = totalValue;

    return portfolio;
  }

  /**
   * Sanitize portfolio data to prevent NaN values
   * @param {Object} portfolio - Portfolio to sanitize
   * @returns {Object} Sanitized portfolio
   */
  sanitizePortfolioData(portfolio) {
    // Sanitize main portfolio fields
    portfolio.totalValue = this.sanitizeNumber(portfolio.totalValue, 0);
    portfolio.cash = this.sanitizeNumber(portfolio.cash, 0);
    portfolio.equity = this.sanitizeNumber(portfolio.equity, 0);

    // Sanitize positions
    if (Array.isArray(portfolio.positions)) {
      portfolio.positions = portfolio.positions.map((position) => ({
        ticker: position.ticker || "",
        shares: this.sanitizeNumber(position.shares, 0),
        buyPrice: this.sanitizeNumber(position.buyPrice, 0),
        costBasis: this.sanitizeNumber(position.costBasis, 0),
        stopLoss: this.sanitizeNumber(position.stopLoss, null),
        currentPrice: this.sanitizeNumber(position.currentPrice, null),
        marketValue: this.sanitizeNumber(position.marketValue, 0),
        unrealizedPnL: this.sanitizeNumber(position.unrealizedPnL, 0),
        unrealizedPnLPercent: this.sanitizeNumber(
          position.unrealizedPnLPercent,
          0
        ),
      }));
    } else {
      portfolio.positions = [];
    }

    return portfolio;
  }

  /**
   * Sanitize a number value to prevent NaN
   * @param {any} value - Value to sanitize
   * @param {any} defaultValue - Default value if invalid
   * @returns {any} Sanitized value
   */
  sanitizeNumber(value, defaultValue = 0) {
    if (typeof value === "number" && !isNaN(value) && isFinite(value)) {
      return value;
    }
    return defaultValue;
  }

  /**
   * Create empty portfolio structure
   * @returns {Object} Empty portfolio
   */
  createEmptyPortfolio() {
    const startingCash = this.envConfig.startingCash;
    return {
      totalValue: startingCash, // Starting cash from environment
      cash: startingCash,
      equity: 0.0,
      positions: [],
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Update stop losses for positions
   * @param {Array} stopLossUpdates - Stop loss updates from AI
   * @returns {Promise<Object>} Updated portfolio
   */
  async updateStopLosses(stopLossUpdates) {
    try {
      this.logger.info(
        `Updating stop losses for ${stopLossUpdates.length} positions`
      );

      const portfolio = await this.getCurrentPortfolio();

      stopLossUpdates.forEach((update) => {
        const position = portfolio.positions.find(
          (p) => p.ticker === update.ticker
        );
        if (position) {
          position.stopLoss = update.stopLoss;
          this.logger.debug(
            `Updated stop loss for ${update.ticker}: $${update.stopLoss}`
          );
        }
      });

      await this.savePortfolio(portfolio);
      return portfolio;
    } catch (error) {
      this.logger.error("Failed to update stop losses", error);
      throw new Error(`Stop loss update error: ${error.message}`);
    }
  }

  /**
   * Update portfolio positions with latest market data
   * @param {Object} portfolio - Current portfolio
   * @param {Object} marketData - Latest market data for positions
   * @returns {Promise<Object>} Updated portfolio with new prices
   */
  async updatePortfolioPositions(portfolio, marketData) {
    try {
      this.logger.info("Updating portfolio positions with market data");

      if (!portfolio.positions || portfolio.positions.length === 0) {
        this.logger.info("No positions to update");
        return portfolio;
      }

      let updatedCount = 0;

      // Update each position with latest market data
      portfolio.positions = portfolio.positions.map((position) => {
        const tickerData = marketData[position.ticker];

        if (
          tickerData &&
          tickerData.source !== "error" &&
          tickerData.data &&
          tickerData.data.length > 0
        ) {
          // Get the latest price from the most recent data point
          const latestDataPoint = tickerData.data[tickerData.data.length - 1];
          const latestPrice = latestDataPoint.close || latestDataPoint.adjClose;

          if (latestPrice && !isNaN(latestPrice)) {
            // Update current price and market value
            position.currentPrice = latestPrice;
            position.marketValue = position.shares * latestPrice;

            // Recalculate unrealized P&L
            position.unrealizedPnL =
              position.marketValue - (position.costBasis || 0);
            if (position.costBasis && position.costBasis > 0) {
              position.unrealizedPnLPercent =
                (position.unrealizedPnL / position.costBasis) * 100;
            } else {
              position.unrealizedPnLPercent = 0;
            }

            this.logger.debug(
              `Updated ${position.ticker}: $${latestPrice.toFixed(2)}`
            );
            updatedCount++;
          } else {
            this.logger.warn(`Invalid price data for ${position.ticker}`);
          }
        } else {
          this.logger.warn(`No market data available for ${position.ticker}`, {
            source: tickerData?.source,
            hasData: tickerData?.data?.length > 0,
          });
        }

        return position;
      });

      this.logger.info(
        `Updated ${updatedCount} out of ${portfolio.positions.length} positions`
      );

      // Recalculate portfolio totals
      portfolio = this.recalculatePortfolioTotals(portfolio);

      // Update last updated timestamp
      portfolio.lastUpdated = new Date().toISOString();

      // Save updated portfolio
      await this.savePortfolio(portfolio);

      this.logger.info("Portfolio positions updated successfully", {
        positionsCount: portfolio.positions.length,
        updatedCount,
        totalValue: portfolio.totalValue,
      });

      return portfolio;
    } catch (error) {
      this.logger.error("Failed to update portfolio positions", error);
      throw new Error(`Portfolio positions update error: ${error.message}`);
    }
  }

  /**
   * Calculate performance metrics for portfolio
   * @param {Object} portfolio - Portfolio to analyze
   * @returns {Object} Performance metrics
   */
  calculatePerformanceMetrics(portfolio) {
    try {
      const metrics = {
        totalValue: portfolio.totalValue,
        cash: portfolio.cash,
        equity: portfolio.equity,
        positionsCount: portfolio.positions?.length || 0,
        timestamp: new Date().toISOString(),
      };

      if (portfolio.positions && portfolio.positions.length > 0) {
        // Calculate position metrics
        const positionsWithPnL = portfolio.positions.filter(
          (p) => p.unrealizedPnL !== undefined && p.unrealizedPnL !== null
        );

        if (positionsWithPnL.length > 0) {
          const totalPnL = positionsWithPnL.reduce(
            (sum, pos) => sum + (pos.unrealizedPnL || 0),
            0
          );
          const winningPositions = positionsWithPnL.filter(
            (pos) => pos.unrealizedPnL > 0
          ).length;
          const losingPositions = positionsWithPnL.filter(
            (pos) => pos.unrealizedPnL < 0
          ).length;

          metrics.totalUnrealizedPnL = totalPnL;
          metrics.winningPositions = winningPositions;
          metrics.losingPositions = losingPositions;
          metrics.winRate = (winningPositions / positionsWithPnL.length) * 100;
        }

        // Calculate diversification metrics
        const topPositionValue = Math.max(
          ...portfolio.positions.map((p) => p.marketValue || 0)
        );
        metrics.largestPositionPercent =
          portfolio.totalValue > 0
            ? (topPositionValue / portfolio.totalValue) * 100
            : 0;
      }

      return metrics;
    } catch (error) {
      this.logger.error("Failed to calculate performance metrics", error);
      // Return basic metrics if calculation fails
      return {
        totalValue: portfolio.totalValue || 0,
        cash: portfolio.cash || 0,
        equity: portfolio.equity || 0,
        positionsCount: portfolio.positions?.length || 0,
        timestamp: new Date().toISOString(),
        error: "Failed to calculate detailed metrics",
      };
    }
  }

  /**
   * Sync local portfolio with brokerage data (Alpaca)
   * @param {Object} localPortfolio - Current local portfolio from DynamoDB
   * @param {Array} alpacaPositions - Positions from Alpaca API
   * @param {Object} alpacaAccount - Account info from Alpaca API
   * @returns {Promise<Object>} Merged portfolio with Alpaca data
   */
  async syncWithBrokerageData(localPortfolio, alpacaPositions, alpacaAccount) {
    try {
      this.logger.info("Syncing local portfolio with Alpaca data", {
        localPositions: localPortfolio.positions?.length || 0,
        alpacaPositions: alpacaPositions.length,
      });

      // Start with Alpaca account data as the base
      const syncedPortfolio = {
        totalValue: alpacaAccount.portfolioValue,
        cash: alpacaAccount.cash,
        equity: alpacaAccount.equity,
        positions: [],
        lastUpdated: new Date().toISOString(),
      };

      // Create a map of local positions for quick lookup
      const localPositionsMap = new Map();
      if (localPortfolio.positions) {
        localPortfolio.positions.forEach((pos) => {
          localPositionsMap.set(pos.ticker, pos);
        });
      }

      // Merge Alpaca positions with local data
      syncedPortfolio.positions = alpacaPositions.map((alpacaPos) => {
        const localPos = localPositionsMap.get(alpacaPos.ticker);

        if (localPos) {
          // Merge: keep local cost basis and stop losses, update with Alpaca data
          return {
            ticker: alpacaPos.ticker,
            shares: alpacaPos.shares,
            // Preserve local cost basis information
            buyPrice: localPos.buyPrice || alpacaPos.currentPrice,
            costBasis:
              localPos.costBasis || alpacaPos.shares * alpacaPos.currentPrice,
            // Preserve local stop loss
            stopLoss: localPos.stopLoss,
            // Use Alpaca's current data
            currentPrice: alpacaPos.currentPrice,
            marketValue: alpacaPos.marketValue,
            unrealizedPnL: alpacaPos.unrealizedPnL,
            unrealizedPnLPercent: alpacaPos.unrealizedPnLPercent,
          };
        } else {
          // New position from Alpaca - create with Alpaca data
          this.logger.info(
            `New position detected from Alpaca: ${alpacaPos.ticker}`
          );
          return {
            ticker: alpacaPos.ticker,
            shares: alpacaPos.shares,
            buyPrice: alpacaPos.currentPrice, // Assume bought at current price
            costBasis: alpacaPos.marketValue, // Use current market value as cost basis
            stopLoss: null, // No stop loss set yet
            currentPrice: alpacaPos.currentPrice,
            marketValue: alpacaPos.marketValue,
            unrealizedPnL: alpacaPos.unrealizedPnL,
            unrealizedPnLPercent: alpacaPos.unrealizedPnLPercent,
          };
        }
      });

      // Check for positions that exist locally but not in Alpaca (sold positions)
      if (localPortfolio.positions) {
        const alpacaTickers = new Set(alpacaPositions.map((p) => p.ticker));
        const missingPositions = localPortfolio.positions.filter(
          (pos) => !alpacaTickers.has(pos.ticker)
        );

        if (missingPositions.length > 0) {
          this.logger.warn(
            `Positions found locally but not in Alpaca: ${missingPositions
              .map((p) => p.ticker)
              .join(", ")}`
          );
          // These will be automatically removed since we're syncing with Alpaca as source of truth
        }
      }

      this.logger.info("Portfolio sync completed", {
        syncedPositions: syncedPortfolio.positions.length,
        totalValue: syncedPortfolio.totalValue,
        cash: syncedPortfolio.cash,
      });

      return syncedPortfolio;
    } catch (error) {
      this.logger.error("Failed to sync portfolio with brokerage data", error);
      throw new Error(`Portfolio sync error: ${error.message}`);
    }
  }

  /**
   * Get portfolio summary for AI prompt
   * @returns {Promise<Object>} Portfolio summary
   */
  async getPortfolioSummary() {
    const portfolio = await this.getCurrentPortfolio();

    return {
      totalValue: portfolio.totalValue,
      cash: portfolio.cash,
      positions: portfolio.positions.map((pos) => ({
        ticker: pos.ticker,
        shares: pos.shares,
        buyPrice: pos.buyPrice,
        currentPrice: pos.currentPrice,
        stopLoss: pos.stopLoss,
        unrealizedPnL: pos.unrealizedPnL,
        unrealizedPnLPercent: pos.unrealizedPnLPercent,
      })),
    };
  }
}

module.exports = PortfolioService;
