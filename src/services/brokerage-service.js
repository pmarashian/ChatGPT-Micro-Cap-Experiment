/**
 * Brokerage Service for Alpaca integration
 * Handles trade execution and portfolio synchronization
 */

const AlpacaService = require("./alpaca-service");
const Logger = require("../utils/logger");
const ErrorHandler = require("../utils/error-handler");
const { getEnvConfig } = require("../config/environment");

class BrokerageService {
  constructor() {
    this.logger = new Logger("brokerage-service");
    this.errorHandler = new ErrorHandler("brokerage-service");
    this.envConfig = getEnvConfig();

    // Initialize Alpaca service with rate limiting
    this.alpacaService = new AlpacaService();
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
      this.logger.debug("Order data being sent to Alpaca", { orderData });

      const response = await this.alpacaService.submitOrder(orderData);

      const result = {
        orderId: response.id,
        status: response.status,
        ticker: tradeOrder.ticker,
        action: tradeOrder.action,
        shares: tradeOrder.shares,
        orderType: tradeOrder.orderType,
        submittedAt: response.submitted_at,
        filledAt: response.filled_at,
        filledPrice: response.filled_avg_price,
        success: true,
      };

      this.logger.logTradeExecution(result.orderId, result, true);
      return result;
    } catch (error) {
      this.logger.error(
        `Trade execution failed for ${tradeOrder.ticker}: ${error.message}`
      );

      const errorResult = {
        ticker: tradeOrder.ticker,
        action: tradeOrder.action,
        shares: tradeOrder.shares,
        success: false,
        error: error.message,
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

      const positions = await this.alpacaService.getPositions();

      const formattedPositions = positions.map((position) => ({
        ticker: position.symbol,
        shares: parseInt(position.qty),
        marketValue: parseFloat(position.market_value),
        currentPrice: parseFloat(position.current_price),
        unrealizedPnL: parseFloat(position.unrealized_pl),
        unrealizedPnLPercent: parseFloat(position.unrealized_plpc),
      }));

      this.logger.info(
        `Retrieved ${formattedPositions.length} positions from brokerage`
      );
      return formattedPositions;
    } catch (error) {
      this.logger.error(
        `Failed to fetch portfolio positions: ${error.message}`
      );
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

      const accountData = await this.alpacaService.getAccount();

      const accountInfo = {
        accountId: accountData.id,
        cash: parseFloat(accountData.cash),
        portfolioValue: parseFloat(accountData.portfolio_value),
        equity: parseFloat(accountData.equity),
        buyingPower: parseFloat(accountData.buying_power),
        dayTradeCount: parseInt(accountData.daytrade_count),
        status: accountData.status,
        currency: accountData.currency,
      };

      this.logger.debug("Account information retrieved", {
        cash: accountInfo.cash,
        portfolioValue: accountInfo.portfolioValue,
        equity: accountInfo.equity,
      });

      return accountInfo;
    } catch (error) {
      this.logger.error(
        `Failed to fetch account information: ${error.message}`
      );
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
      const orderData = await this.alpacaService.getOrder(orderId);

      return {
        orderId: orderData.id,
        status: orderData.status,
        ticker: orderData.symbol,
        action: orderData.side,
        shares: parseInt(orderData.qty),
        filledShares: parseInt(orderData.filled_qty),
        filledPrice: orderData.filled_avg_price,
        submittedAt: orderData.submitted_at,
        filledAt: orderData.filled_at,
      };
    } catch (error) {
      this.logger.error(
        `Failed to get order status for ${orderId}: ${error.message}`
      );
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
      await this.alpacaService.cancelOrder(orderId);

      return {
        orderId,
        cancelled: true,
        cancelledAt: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`Failed to cancel order ${orderId}: ${error.message}`);
      throw new Error(`Order cancellation error: ${error.message}`);
    }
  }

  /**
   * Monitor order execution and handle price volatility
   * @param {Object} orderResult - Result from executeTrade
   * @param {number} referencePrice - Original reference price
   * @returns {Promise<Object>} Monitoring result
   */
  async monitorOrderExecution(orderResult, referencePrice) {
    try {
      const volatilityThreshold = 0.1; // 10% price change threshold
      const orderId = orderResult.orderId;

      // Check current order status
      const orderStatus = await this.alpacaService.getOrder(orderId);

      if (orderStatus.status === "filled") {
        const executionPrice = parseFloat(orderStatus.filled_avg_price);
        const priceChange =
          Math.abs(executionPrice - referencePrice) / referencePrice;

        if (priceChange > volatilityThreshold) {
          this.logger.warn(
            `Significant price change detected for ${orderResult.ticker}`,
            {
              referencePrice,
              executionPrice,
              priceChange: `${(priceChange * 100).toFixed(2)}%`,
              orderId,
            }
          );

          // Could implement logic to:
          // 1. Send alert notifications
          // 2. Adjust position sizing
          // 3. Update risk parameters
          // 4. Log for analysis
        }

        return {
          monitored: true,
          executionPrice,
          priceChangePercent: (priceChange * 100).toFixed(2),
          withinThreshold: priceChange <= volatilityThreshold,
        };
      }

      return { monitored: true, status: orderStatus.status };
    } catch (error) {
      this.logger.error(
        `Failed to monitor order ${orderResult.orderId || "unknown"}: ${
          error.message
        }`
      );
      return { monitored: false, error: error.message };
    }
  }

  /**
   * Get all open orders
   * @returns {Promise<Array>} List of open orders
   */
  async getOpenOrders() {
    try {
      this.logger.debug("Fetching open orders");
      const orders = await this.alpacaService.getOrders({
        status: "open",
      });

      this.logger.debug(`Retrieved ${orders.length} open orders`);
      return orders;
    } catch (error) {
      this.logger.error(`Failed to fetch open orders: ${error.message}`);
      throw new Error(`Open orders fetch error: ${error.message}`);
    }
  }

  /**
   * Build order data for Alpaca API with protective measures
   */
  buildOrderData(tradeOrder) {
    const orderData = {
      symbol: tradeOrder.ticker,
      qty: tradeOrder.shares.toString(),
      side: tradeOrder.action.toLowerCase(), // 'buy' or 'sell'
      type: tradeOrder.orderType || "limit", // Default to limit for protection
      time_in_force: tradeOrder.timeInForce || "day",
    };

    // Add protective pricing for after-hours orders
    if (!tradeOrder.limitPrice && tradeOrder.referencePrice) {
      // Calculate protective limit price based on reference price
      const protectionBuffer = 0.05; // 5% protection buffer
      if (tradeOrder.action.toLowerCase() === "buy") {
        orderData.limit_price = (
          tradeOrder.referencePrice *
          (1 + protectionBuffer)
        ).toFixed(2);
        orderData.type = "limit";
      } else if (tradeOrder.action.toLowerCase() === "sell") {
        orderData.limit_price = (
          tradeOrder.referencePrice *
          (1 - protectionBuffer)
        ).toFixed(2);
        orderData.type = "limit";
      }
      this.logger.info(
        `Added protective limit price for ${tradeOrder.ticker}: $${orderData.limit_price}`
      );
    }

    // Add limit price if order type is limit
    if (tradeOrder.orderType === "limit" && tradeOrder.limitPrice) {
      orderData.limit_price = tradeOrder.limitPrice.toString();
    }

    // Add stop loss if provided using bracket order format
    if (tradeOrder.stopLoss) {
      // For now, let's skip the stop loss to test if the basic order works
      // Alpaca bracket orders are more complex and may require different formatting
      this.logger.warn(
        `Stop loss orders not yet implemented. Skipping stop loss for ${tradeOrder.ticker}`
      );
      // orderData.order_class = "bracket";
      // orderData.stop_loss = {
      //   stop_price: tradeOrder.stopLoss.toString(),
      //   limit_price: (tradeOrder.stopLoss * 0.98).toString() // 2% below stop
      // };
    }

    return orderData;
  }

  /**
   * Get asset information including tradability status
   * @param {string} symbol - Stock ticker symbol
   * @returns {Promise<Object>} Asset information
   */
  async getAssetInfo(symbol) {
    try {
      // this.logger.debug(`Fetching asset info for ${symbol}`);
      const assetData = await this.alpacaService.getAsset(symbol);

      return {
        symbol: assetData.symbol,
        name: assetData.name,
        exchange: assetData.exchange,
        class: assetData.class,
        status: assetData.status,
        tradable: assetData.tradable,
        marginable: assetData.marginable,
        shortable: assetData.shortable,
        easyToBorrow: assetData.easy_to_borrow,
        minOrderSize: assetData.min_order_size,
        maxOrderSize: assetData.max_order_size,
        priceIncrement: assetData.price_increment,
        sizeIncrement: assetData.size_increment,
      };
    } catch (error) {
      this.logger.error(
        `Failed to get asset info for ${symbol}: ${error.message}`
      );
      throw new Error(`Asset info fetch error: ${error.message}`);
    }
  }

  /**
   * Check if an asset is tradable
   * @param {string} symbol - Stock ticker symbol
   * @returns {Promise<boolean>} Whether the asset is tradable
   */
  async isTradable(symbol) {
    try {
      const assetInfo = await this.getAssetInfo(symbol);
      return assetInfo.tradable === true;
    } catch (error) {
      this.logger.warn(
        `Could not verify tradability for ${symbol}, assuming not tradable: ${error.message}`
      );
      return false; // Default to false for safety
    }
  }

  /**
   * Check if market is open
   * @returns {Promise<boolean>} Market open status
   */
  async isMarketOpen() {
    try {
      const clockData = await this.alpacaService.getClock();
      return clockData.is_open;
    } catch (error) {
      this.logger.error(`Failed to check market status: ${error.message}`);
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
      const orders = await this.alpacaService.getOrders({
        limit,
        status: "all",
      });

      return orders.map((order) => ({
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
      this.logger.error(`Failed to fetch recent orders: ${error.message}`);
      throw new Error(`Recent orders fetch error: ${error.message}`);
    }
  }
}

module.exports = BrokerageService;
