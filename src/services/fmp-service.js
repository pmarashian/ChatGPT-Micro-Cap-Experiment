/**
 * FMP Service
 * Centralized wrapper for Financial Modeling Prep API calls with rate limiting and retries
 */

const axios = require("axios");
const axiosRetry = require("axios-retry").default;
const pLimit = require("p-limit");
const Logger = require("../utils/logger");
const ErrorHandler = require("../utils/error-handler");

class FMPService {
  constructor() {
    this.constructorStartTime = Date.now();
    this.logger = new Logger("fmp-service");
    this.errorHandler = new ErrorHandler("fmp-service");

    // Config from env
    const envConfig = require("../config/environment").getEnvConfig();
    this.apiKey = envConfig.fmpApiKey;
    this.maxConcurrency = parseInt(process.env.FMP_MAX_CONCURRENCY) || 2;
    this.minIntervalMs = parseInt(process.env.FMP_MIN_INTERVAL_MS) || 250;

    // Axios instance
    this.client = axios.create({
      baseURL: "https://financialmodelingprep.com/api/v3",
      timeout: 30000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    // Inject API key in requests
    this.client.interceptors.request.use((config) => {
      if (!config.params) config.params = {};
      config.params.apikey = this.apiKey;
      // this.logger.debug(
      //   `FMP request: ${config.method?.toUpperCase()} ${config.url}`,
      //   config.params
      // );
      return config;
    });

    // Response logging
    this.client.interceptors.response.use(
      (response) => {
        // this.logger.debug(
        //   `FMP response: ${response.config.url} - ${response.status}`
        // );
        return response;
      },
      (error) => {
        this.logger.warn(
          `FMP error: ${error.config?.url} - ${
            error.response?.status || error.message
          }`
        );
        return Promise.reject(error);
      }
    );

    // Retries for 429/5xx
    axiosRetry(this.client, {
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

    // Rate limiter - handle both direct function and .default
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
          `FMP API calls: ${callsThisPeriod} in last 5s (${callsPerMinute}/min)`,
          {
            totalCalls: this.callCount,
            concurrency: this.maxConcurrency,
            minIntervalMs: this.minIntervalMs,
          }
        );
        this.lastCallCount = this.callCount;
      }
    }, 5000);
  }

  /**
   * Rate-limited request wrapper
   */
  async _rateLimitedRequest(config) {
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
      return this.client.request(config);
    });
  }

  /**
   * Get historical price data
   * @param {string} symbol - Stock symbol
   * @param {object} options - { timeseries: number }
   * @returns {Promise<Array>} Normalized bars [{ date, open, high, low, close, volume }]
   */
  async historicals(symbol, options = {}) {
    try {
      const timeseries = options.timeseries || 30;
      const response = await this._rateLimitedRequest({
        method: "GET",
        url: `/historical-price-full/${symbol}`,
        params: { timeseries },
      });

      if (!response.data || !response.data.historical) {
        throw new Error(`Invalid FMP historical response for ${symbol}`);
      }

      // Normalize to consistent format
      return response.data.historical.map((bar) => ({
        date: bar.date,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
      }));
    } catch (error) {
      // Handle rate limiting with specific guidance
      if (error.response?.status === 429) {
        this.adjustRateLimits(429);
        this.logger.warn(
          `FMP rate limit hit for ${symbol}. Auto-adjusted limits`,
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
      throw new Error(`FMP historicals error for ${symbol}: ${error.message}`);
    }
  }

  /**
   * Get quote data
   * @param {string} symbol - Stock symbol
   * @returns {Promise<object>} Quote data
   */
  async quote(symbol) {
    try {
      const response = await this._rateLimitedRequest({
        method: "GET",
        url: `/quote/${symbol}`,
      });

      if (
        !response.data ||
        !Array.isArray(response.data) ||
        response.data.length === 0
      ) {
        throw new Error(`No quote data for ${symbol}`);
      }

      return response.data[0];
    } catch (error) {
      if (error.response?.status === 429) {
        this.adjustRateLimits(429);
      }
      this.logger.error(
        `Failed to fetch quote for ${symbol}: ${error.message}`
      );
      throw new Error(`FMP quote error for ${symbol}: ${error.message}`);
    }
  }

  /**
   * Get screener data
   * @param {object} params - Screener filters
   * @returns {Promise<Array>} Screener results
   */
  async screener(params = {}) {
    try {
      const response = await this._rateLimitedRequest({
        method: "GET",
        url: "/stock-screener",
        params,
      });

      if (!response.data || !Array.isArray(response.data)) {
        throw new Error("Invalid FMP screener response");
      }

      return response.data;
    } catch (error) {
      this.logger.error(`Failed to fetch FMP screener: ${error.message}`);
      throw new Error(`FMP screener error: ${error.message}`);
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
    };
  }

  /**
   * Adjust rate limits based on API responses
   * @param {number} status - HTTP status code
   */
  adjustRateLimits(status) {
    if (status === 429) {
      // Increase minimum interval on rate limit
      this.minIntervalMs = Math.min(this.minIntervalMs * 1.5, 2000); // Max 2 seconds
      this.logger.info(
        `Adjusted rate limits due to 429: minIntervalMs=${this.minIntervalMs}ms`
      );
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

module.exports = FMPService;
