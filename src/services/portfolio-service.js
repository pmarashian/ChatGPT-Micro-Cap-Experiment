/**
 * Portfolio Service
 * Handles portfolio calculations, data persistence, and state management
 * Replicates functionality from Python trading_script.py
 */

const AWS = require("aws-sdk");
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
    this.dynamodb = new AWS.DynamoDB.DocumentClient({
      region: process.env.AWS_REGION || "us-east-1",
    });

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

      const result = await this.dynamodb.get(params).promise();

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
        IndexName: "TickerIndex",
        KeyConditionExpression:
          "begins_with(GSI1SK, :prefix) AND GSI1SK >= :cutoff",
        ExpressionAttributeValues: {
          ":prefix": "TRADE#",
          ":cutoff": `TRADE#${cutoffIso}`,
        },
        // Note: ScanIndexForward removed - query returns items in index order
      };

      const result = await this.dynamodb.query(params).promise();

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

      await this.dynamodb.put(params).promise();
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

      await this.dynamodb.put(params).promise();
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
