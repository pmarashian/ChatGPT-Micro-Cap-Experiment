/**
 * Brokerage Service for Alpaca integration
 * Handles trade execution and portfolio synchronization
 */

const axios = require("axios");
const Logger = require("../utils/logger");
const ErrorHandler = require("../utils/error-handler");
const { getEnvConfig } = require("../config/environment");

class BrokerageService {
  constructor() {
    this.logger = new Logger("brokerage-service");
    this.errorHandler = new ErrorHandler("brokerage-service");
    this.envConfig = getEnvConfig();

    this.baseUrl = this.envConfig.alpacaBaseUrl;
    this.apiKey = this.envConfig.alpacaKeyId;
    this.secretKey = this.envConfig.alpacaSecretKey;

    // Create axios instance with authentication
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        "APCA-API-KEY-ID": this.apiKey,
        "APCA-API-SECRET-KEY": this.secretKey,
        "Content-Type": "application/json",
      },
      timeout: 30000, // 30 second timeout
    });
  }

  /**
   * Execute a trade order
   * @param {Object} tradeOrder - Trade order details
   * @returns {Promise<Object>} Order result
   */
  async executeTrade(tradeOrder) {
    try {
      this.logger.info(
        `Executing ${tradeOrder.action} order for ${tradeOrder.ticker}`,
        {
          shares: tradeOrder.shares,
          orderType: tradeOrder.orderType,
          limitPrice: tradeOrder.limitPrice,
        }
      );

      const orderData = this.buildOrderData(tradeOrder);
      const response = await this.client.post("/orders", orderData);

      const result = {
        orderId: response.data.id,
        status: response.data.status,
        ticker: tradeOrder.ticker,
        action: tradeOrder.action,
        shares: tradeOrder.shares,
        orderType: tradeOrder.orderType,
        submittedAt: response.data.submitted_at,
        filledAt: response.data.filled_at,
        filledPrice: response.data.filled_avg_price,
        success: true,
      };

      this.logger.logTradeExecution(result.orderId, result, true);
      return result;
    } catch (error) {
      this.logger.error(
        `Trade execution failed for ${tradeOrder.ticker}`,
        error
      );

      const errorResult = {
        ticker: tradeOrder.ticker,
        action: tradeOrder.action,
        shares: tradeOrder.shares,
        success: false,
        error: error.response?.data?.message || error.message,
      };

      this.logger.logTradeExecution(null, errorResult, false);
      throw new Error(`Brokerage API error: ${error.message}`);
    }
  }

  /**
   * Get current portfolio positions
   * @returns {Promise<Array>} Portfolio positions
   */
  async getPortfolio() {
    try {
      this.logger.debug("Fetching current portfolio positions");

      const response = await this.client.get("/positions");

      const positions = response.data.map((position) => ({
        ticker: position.symbol,
        shares: parseInt(position.qty),
        marketValue: parseFloat(position.market_value),
        currentPrice: parseFloat(position.current_price),
        unrealizedPnL: parseFloat(position.unrealized_pl),
        unrealizedPnLPercent: parseFloat(position.unrealized_plpc),
      }));

      this.logger.info(
        `Retrieved ${positions.length} positions from brokerage`
      );
      return positions;
    } catch (error) {
      this.logger.error("Failed to fetch portfolio positions", error);
      throw new Error(`Portfolio fetch error: ${error.message}`);
    }
  }

  /**
   * Get account information
   * @returns {Promise<Object>} Account details
   */
  async getAccountInfo() {
    try {
      this.logger.debug("Fetching account information");

      const response = await this.client.get("/account");

      const accountInfo = {
        accountId: response.data.id,
        cash: parseFloat(response.data.cash),
        portfolioValue: parseFloat(response.data.portfolio_value),
        equity: parseFloat(response.data.equity),
        buyingPower: parseFloat(response.data.buying_power),
        dayTradeCount: parseInt(response.data.daytrade_count),
        status: response.data.status,
        currency: response.data.currency,
      };

      this.logger.debug("Account information retrieved", {
        cash: accountInfo.cash,
        portfolioValue: accountInfo.portfolioValue,
        equity: accountInfo.equity,
      });

      return accountInfo;
    } catch (error) {
      this.logger.error("Failed to fetch account information", error);
      throw new Error(`Account info fetch error: ${error.message}`);
    }
  }

  /**
   * Get order status by ID
   * @param {string} orderId - Order ID to check
   * @returns {Promise<Object>} Order status
   */
  async getOrderStatus(orderId) {
    try {
      const response = await this.client.get(`/orders/${orderId}`);

      return {
        orderId: response.data.id,
        status: response.data.status,
        ticker: response.data.symbol,
        action: response.data.side,
        shares: parseInt(response.data.qty),
        filledShares: parseInt(response.data.filled_qty),
        filledPrice: response.data.filled_avg_price,
        submittedAt: response.data.submitted_at,
        filledAt: response.data.filled_at,
      };
    } catch (error) {
      this.logger.error(`Failed to get order status for ${orderId}`, error);
      throw new Error(`Order status error: ${error.message}`);
    }
  }

  /**
   * Cancel an order
   * @param {string} orderId - Order ID to cancel
   * @returns {Promise<Object>} Cancellation result
   */
  async cancelOrder(orderId) {
    try {
      this.logger.info(`Cancelling order ${orderId}`);
      await this.client.delete(`/orders/${orderId}`);

      return {
        orderId,
        cancelled: true,
        cancelledAt: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`Failed to cancel order ${orderId}`, error);
      throw new Error(`Order cancellation error: ${error.message}`);
    }
  }

  /**
   * Build order data for Alpaca API
   */
  buildOrderData(tradeOrder) {
    const orderData = {
      symbol: tradeOrder.ticker,
      qty: tradeOrder.shares.toString(),
      side: tradeOrder.action.toLowerCase(), // 'buy' or 'sell'
      type: tradeOrder.orderType || "market", // 'market' or 'limit'
      time_in_force: tradeOrder.timeInForce || "day", // 'day', 'gtc', etc.
    };

    // Add limit price if order type is limit
    if (tradeOrder.orderType === "limit" && tradeOrder.limitPrice) {
      orderData.limit_price = tradeOrder.limitPrice.toString();
    }

    // Add stop loss if provided
    if (tradeOrder.stopLoss) {
      orderData.stop_loss = {
        stop_price: tradeOrder.stopLoss.toString(),
      };
    }

    return orderData;
  }

  /**
   * Check if market is open
   * @returns {Promise<boolean>} Market open status
   */
  async isMarketOpen() {
    try {
      const response = await this.client.get("/clock");
      return response.data.is_open;
    } catch (error) {
      this.logger.error("Failed to check market status", error);
      // Default to false on error
      return false;
    }
  }

  /**
   * Get recent orders
   * @param {number} limit - Number of orders to retrieve
   * @returns {Promise<Array>} Recent orders
   */
  async getRecentOrders(limit = 50) {
    try {
      const response = await this.client.get("/orders", {
        params: {
          limit,
          status: "all",
        },
      });

      return response.data.map((order) => ({
        orderId: order.id,
        ticker: order.symbol,
        action: order.side,
        shares: parseInt(order.qty),
        status: order.status,
        orderType: order.type,
        submittedAt: order.submitted_at,
        filledAt: order.filled_at,
        filledPrice: order.filled_avg_price,
      }));
    } catch (error) {
      this.logger.error("Failed to fetch recent orders", error);
      throw new Error(`Recent orders fetch error: ${error.message}`);
    }
  }
}

module.exports = BrokerageService;
