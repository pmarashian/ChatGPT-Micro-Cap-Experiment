/**
 * Alpaca Service
 * Centralized wrapper for Alpaca API calls with rate limiting and retries
 * Rate limit: 200 calls per minute
 */

const axios = require("axios");
const axiosRetry = require("axios-retry").default;
const pLimit = require("p-limit");
const Logger = require("../utils/logger");
const ErrorHandler = require("../utils/error-handler");

class AlpacaService {
  constructor() {
    this.constructorStartTime = Date.now();
    this.logger = new Logger("alpaca-service");
    this.errorHandler = new ErrorHandler("alpaca-service");

    // Config from env
    const envConfig = require("../config/environment").getEnvConfig();
    this.apiKey = envConfig.alpacaKeyId;
    this.apiSecret = envConfig.alpacaSecretKey;
    this.isPaper = envConfig.alpacaBaseUrl.includes("paper");

    // Rate limiting: 200 calls per minute = ~3.33 calls/second
    // Use 700ms min interval for safety (240 calls/minute max)
    this.maxConcurrency = parseInt(process.env.ALPACA_MAX_CONCURRENCY) || 2;
    this.minIntervalMs = parseInt(process.env.ALPACA_MIN_INTERVAL_MS) || 1000;

    // Base URLs
    this.marketDataBaseUrl = "https://data.alpaca.markets/v2";
    this.tradingBaseUrl = envConfig.alpacaBaseUrl;

    // Market Data Client
    this.marketDataClient = axios.create({
      baseURL: this.marketDataBaseUrl,
      timeout: 30000,
      headers: {
        "APCA-API-KEY-ID": this.apiKey,
        "APCA-API-SECRET-KEY": this.apiSecret,
      },
    });

    // Trading Client
    this.tradingClient = axios.create({
      baseURL: this.tradingBaseUrl,
      timeout: 30000,
      headers: {
        "APCA-API-KEY-ID": this.apiKey,
        "APCA-API-SECRET-KEY": this.apiSecret,
      },
    });

    // Request logging interceptor
    const addRequestLogging = (client, clientName) => {
      client.interceptors.request.use((config) => {
        // this.logger.debug(
        //   `${clientName} request: ${config.method?.toUpperCase()} ${config.url}`,
        //   config.params
        // );
        return config;
      });

      client.interceptors.response.use(
        (response) => {
          // this.logger.debug(
          //   `${clientName} response: ${response.config.url} - ${response.status}`
          // );
          return response;
        },
        (error) => {
          this.logger.warn(
            `${clientName} error: ${error.config?.url} - ${
              error.response?.status || error.message
            }: ${error.message}`
          );
          return Promise.reject(error);
        }
      );
    };

    addRequestLogging(this.marketDataClient, "Alpaca Market Data");
    addRequestLogging(this.tradingClient, "Alpaca Trading");

    // Retries for 429/5xx
    [this.marketDataClient, this.tradingClient].forEach((client) => {
      axiosRetry(client, {
        retries: 3,
        retryDelay: axiosRetry.exponentialDelay,
        retryCondition: (error) => {
          return (
            axiosRetry.isNetworkOrIdempotentRequestError(error) ||
            error.response?.status >= 500 ||
            error.response?.status === 429
          );
        },
      });
    });

    // Rate limiter
    const limitFn = typeof pLimit === "function" ? pLimit : pLimit.default;
    this.limiter = limitFn(this.maxConcurrency);
    this.lastRequestTime = 0;

    // API call tracking for monitoring
    this.callCount = 0;
    this.lastCallCount = 0;
    this.monitoringInterval = setInterval(() => {
      const callsThisPeriod = this.callCount - this.lastCallCount;
      if (callsThisPeriod > 0) {
        const callsPerMinute = callsThisPeriod * 12; // 5 seconds * 12 = 1 minute
        this.logger.debug(
          `Alpaca API calls: ${callsThisPeriod} in last 5s (${callsPerMinute}/min)`,
          {
            totalCalls: this.callCount,
            concurrency: this.maxConcurrency,
            minIntervalMs: this.minIntervalMs,
            isPaper: this.isPaper,
          }
        );
        this.lastCallCount = this.callCount;
      }
    }, 5000);
  }

  /**
   * Rate-limited request wrapper
   */
  async _rateLimitedRequest(client, config) {
    return this.limiter(async () => {
      const now = Date.now();
      const timeSinceLast = now - this.lastRequestTime;
      if (timeSinceLast < this.minIntervalMs) {
        await new Promise((resolve) =>
          setTimeout(resolve, this.minIntervalMs - timeSinceLast)
        );
      }
      this.lastRequestTime = Date.now();
      this.callCount++;
      return client.request(config);
    });
  }

  /**
   * Get historical bars
   * @param {string} symbol - Stock symbol
   * @param {object} options - { timeframe, start, end, limit, adjustment }
   * @returns {Promise<Array>} Normalized bars [{ timestamp, open, high, low, close, volume }]
   */
  async historicals(symbol, options = {}) {
    try {
      const {
        timeframe = "1Day",
        start,
        end,
        limit = 100,
        adjustment = "raw",
      } = options;

      const params = {
        timeframe,
        limit,
        adjustment,
      };

      if (start) params.start = start;
      if (end) params.end = end;

      const response = await this._rateLimitedRequest(this.marketDataClient, {
        method: "GET",
        url: `/stocks/${symbol}/bars`,
        params,
      });

      if (!response.data || !response.data.bars) {
        throw new Error(`Invalid Alpaca bars response for ${symbol}`);
      }

      // Normalize to consistent format
      return response.data.bars.map((bar) => ({
        timestamp: bar.t,
        date: new Date(bar.t * 1000).toISOString().split("T")[0],
        open: bar.o,
        high: bar.h,
        low: bar.l,
        close: bar.c,
        volume: bar.v,
      }));
    } catch (error) {
      if (error.response?.status === 429) {
        this.adjustRateLimits(429);
        this.logger.warn(
          `Alpaca rate limit hit for ${symbol}. Auto-adjusted limits`,
          {
            currentConcurrency: this.maxConcurrency,
            newMinInterval: this.minIntervalMs,
            callsPerMinute: Math.round(
              (this.callCount /
                ((Date.now() - this.constructorStartTime) / 1000)) *
                60
            ),
          }
        );
      }
      this.logger.error(
        `Failed to fetch historicals for ${symbol}: ${error.message}`
      );
      throw new Error(
        `Alpaca historicals error for ${symbol}: ${error.message}`
      );
    }
  }

  /**
   * Get latest quote
   * @param {string} symbol - Stock symbol
   * @returns {Promise<object>} Quote data
   */
  async quote(symbol) {
    try {
      const response = await this._rateLimitedRequest(this.marketDataClient, {
        method: "GET",
        url: `/stocks/${symbol}/quotes/latest`,
      });

      if (!response.data || !response.data.quote) {
        throw new Error(`No quote data for ${symbol}`);
      }

      return response.data.quote;
    } catch (error) {
      if (error.response?.status === 429) {
        this.adjustRateLimits(429);
      }
      this.logger.error(
        `Failed to fetch quote for ${symbol}: ${error.message}`
      );
      throw new Error(`Alpaca quote error for ${symbol}: ${error.message}`);
    }
  }

  /**
   * Get latest trade
   * @param {string} symbol - Stock symbol
   * @returns {Promise<object>} Trade data
   */
  async trade(symbol) {
    try {
      const response = await this._rateLimitedRequest(this.marketDataClient, {
        method: "GET",
        url: `/stocks/${symbol}/trades/latest`,
      });

      if (!response.data || !response.data.trade) {
        throw new Error(`No trade data for ${symbol}`);
      }

      return response.data.trade;
    } catch (error) {
      this.logger.error(
        `Failed to fetch trade for ${symbol}: ${error.message}`
      );
      throw new Error(`Alpaca trade error for ${symbol}: ${error.message}`);
    }
  }

  /**
   * Get account information
   * @returns {Promise<object>} Account data
   */
  async getAccount() {
    try {
      const response = await this._rateLimitedRequest(this.tradingClient, {
        method: "GET",
        url: "/account",
      });

      return response.data;
    } catch (error) {
      this.logger.error(`Failed to fetch account: ${error.message}`);
      throw new Error(`Alpaca account error: ${error.message}`);
    }
  }

  /**
   * Get positions
   * @returns {Promise<Array>} Positions array
   */
  async getPositions() {
    try {
      const response = await this._rateLimitedRequest(this.tradingClient, {
        method: "GET",
        url: "/positions",
      });

      return response.data || [];
    } catch (error) {
      this.logger.error(`Failed to fetch positions: ${error.message}`);
      throw new Error(`Alpaca positions error: ${error.message}`);
    }
  }

  /**
   * Submit order
   * @param {object} orderData - Order parameters
   * @returns {Promise<object>} Order response
   */
  async submitOrder(orderData) {
    try {
      const response = await this._rateLimitedRequest(this.tradingClient, {
        method: "POST",
        url: "/orders",
        data: orderData,
      });

      return response.data;
    } catch (error) {
      this.logger.error(`Failed to submit order: ${error.message}`);
      throw new Error(`Alpaca order submission error: ${error.message}`);
    }
  }

  /**
   * Get orders
   * @param {object} params - Query parameters
   * @returns {Promise<Array>} Orders array
   */
  async getOrders(params = {}) {
    try {
      const response = await this._rateLimitedRequest(this.tradingClient, {
        method: "GET",
        url: "/orders",
        params,
      });

      return response.data || [];
    } catch (error) {
      this.logger.error(`Failed to fetch orders: ${error.message}`);
      throw new Error(`Alpaca orders error: ${error.message}`);
    }
  }

  /**
   * Get order by ID
   * @param {string} orderId - Order ID
   * @returns {Promise<object>} Order data
   */
  async getOrder(orderId) {
    try {
      const response = await this._rateLimitedRequest(this.tradingClient, {
        method: "GET",
        url: `/orders/${orderId}`,
      });

      return response.data;
    } catch (error) {
      this.logger.error(`Failed to fetch order ${orderId}: ${error.message}`);
      throw new Error(`Alpaca get order error: ${error.message}`);
    }
  }

  /**
   * Cancel order
   * @param {string} orderId - Order ID
   * @returns {Promise<void>}
   */
  async cancelOrder(orderId) {
    try {
      await this._rateLimitedRequest(this.tradingClient, {
        method: "DELETE",
        url: `/orders/${orderId}`,
      });
    } catch (error) {
      this.logger.error(`Failed to cancel order ${orderId}: ${error.message}`);
      throw new Error(`Alpaca cancel order error: ${error.message}`);
    }
  }

  /**
   * Check if symbol exists (cheap validation)
   * @param {string} symbol - Stock symbol
   * @returns {Promise<boolean>} True if data exists
   */
  async exists(symbol) {
    try {
      await this.quote(symbol);
      return true;
    } catch (error) {
      this.logger.debug(`Symbol ${symbol} does not exist or has no data`);
      return false;
    }
  }

  /**
   * Get current API call statistics
   * @returns {object} Call statistics
   */
  getCallStats() {
    return {
      totalCalls: this.callCount,
      concurrency: this.maxConcurrency,
      minIntervalMs: this.minIntervalMs,
      callsPerMinute:
        this.callCount > 0
          ? Math.round(
              (this.callCount /
                ((Date.now() - (this.constructorStartTime || Date.now())) /
                  1000)) *
                60
            )
          : 0,
      isPaper: this.isPaper,
    };
  }

  /**
   * Adjust rate limits based on API responses
   * @param {number} status - HTTP status code
   */
  adjustRateLimits(status) {
    if (status === 429) {
      // Increase minimum interval on rate limit
      this.minIntervalMs = Math.min(this.minIntervalMs * 1.5, 1000); // Max 1 second
      this.logger.info(
        `Adjusted rate limits due to 429: minIntervalMs=${this.minIntervalMs}ms`
      );
    }
  }

  /**
   * Get market clock status
   * @returns {Promise<object>} Market clock information
   */
  async getClock() {
    try {
      const response = await this._rateLimitedRequest(this.tradingClient, {
        method: "GET",
        url: "/clock",
      });

      return response.data;
    } catch (error) {
      this.logger.error(`Failed to fetch market clock: ${error.message}`);
      throw new Error(`Alpaca clock error: ${error.message}`);
    }
  }

  /**
   * Get asset information
   * @param {string} symbol - Asset symbol
   * @returns {Promise<object>} Asset information
   */
  async getAsset(symbol) {
    try {
      const response = await this._rateLimitedRequest(this.tradingClient, {
        method: "GET",
        url: `/assets/${symbol}`,
      });

      return response.data;
    } catch (error) {
      this.logger.error(`Failed to fetch asset ${symbol}: ${error.message}`);
      throw new Error(`Alpaca asset error: ${error.message}`);
    }
  }

  /**
   * Clean up monitoring interval
   */
  destroy() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }
}

module.exports = AlpacaService;
