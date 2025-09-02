/**
 * Market Data Service
 * Fetches stock data from Yahoo Finance (primary) and Stooq (fallback)
 * Replicates the functionality from the Python trading_script.py
 */

const yahooFinance = require("yahoo-finance2").default;
const axios = require("axios");
const Logger = require("../utils/logger");
const ErrorHandler = require("../utils/error-handler");

class MarketDataService {
  constructor() {
    this.logger = new Logger("market-data-service");
    this.errorHandler = new ErrorHandler("market-data-service");
    this.stooqBaseUrl = "https://stooq.com/q/d/l/";
  }

  /**
   * Get stock data for a single ticker
   * @param {string} ticker - Stock ticker symbol
   * @param {string} period - Time period (default: '1d')
   * @returns {Promise<Object>} Market data result
   */
  async getStockData(ticker, period = "1d") {
    try {
      this.logger.debug(`Fetching data for ${ticker}`, { period });

      // Try Yahoo Finance first
      const yahooResult = await this.fetchYahooData(ticker, period);
      if (yahooResult && yahooResult.data && yahooResult.data.length > 0) {
        this.logger.debug(`Successfully fetched ${ticker} from Yahoo Finance`);
        return {
          source: "yahoo",
          data: yahooResult.data,
          lastUpdated: new Date().toISOString(),
        };
      }

      // Fallback to Stooq
      this.logger.debug(`Yahoo Finance failed for ${ticker}, trying Stooq`);
      const stooqResult = await this.fetchStooqData(ticker, period);
      if (stooqResult && stooqResult.data && stooqResult.data.length > 0) {
        this.logger.debug(`Successfully fetched ${ticker} from Stooq`);
        return {
          source: "stooq",
          data: stooqResult.data,
          lastUpdated: new Date().toISOString(),
        };
      }

      this.logger.warn(`No data available for ${ticker} from any source`);
      return {
        source: "empty",
        data: [],
        lastUpdated: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`Market data fetch failed for ${ticker}`, error);
      throw new Error(`Market data error for ${ticker}: ${error.message}`);
    }
  }

  /**
   * Get market data for entire portfolio
   * @param {Object} portfolio - Portfolio data with positions
   * @returns {Promise<Object>} Portfolio market data
   */
  async getPortfolioMarketData(portfolio) {
    const marketData = {};
    const tickers = [];

    // Collect all tickers from portfolio
    if (portfolio.positions && portfolio.positions.length > 0) {
      tickers.push(...portfolio.positions.map((pos) => pos.ticker));
    }

    // Add benchmark tickers
    tickers.push(...["SPY", "IWO", "XBI", "IWM"]);

    this.logger.info(`Fetching market data for ${tickers.length} tickers`);

    // Fetch data for all tickers concurrently
    const promises = tickers.map((ticker) => this.getStockData(ticker, "1d"));
    const results = await Promise.allSettled(promises);

    // Process results
    results.forEach((result, index) => {
      const ticker = tickers[index];
      if (result.status === "fulfilled") {
        marketData[ticker] = result.value;
      } else {
        this.logger.warn(`Failed to fetch data for ${ticker}`, result.reason);
        marketData[ticker] = {
          source: "error",
          data: [],
          lastUpdated: new Date().toISOString(),
          error: result.reason.message,
        };
      }
    });

    return marketData;
  }

  /**
   * Fetch data from Yahoo Finance
   */
  async fetchYahooData(ticker, period = "1d") {
    try {
      const queryOptions = this.buildYahooQueryOptions(ticker, period);
      const result = await yahooFinance.chart(ticker, queryOptions);

      if (!result || !result.quotes || result.quotes.length === 0) {
        return null;
      }

      // Transform to consistent format
      const data = result.quotes.map((quote) => ({
        date: new Date(quote.date * 1000).toISOString().split("T")[0],
        timestamp: quote.date * 1000,
        open: quote.open || null,
        high: quote.high || null,
        low: quote.low || null,
        close: quote.close || null,
        adjClose: quote.adjclose || quote.close,
        volume: quote.volume || 0,
      }));

      return { data };
    } catch (error) {
      this.logger.debug(`Yahoo Finance failed for ${ticker}`, error.message);
      return null;
    }
  }

  /**
   * Fetch data from Stooq CSV endpoint
   */
  async fetchStooqData(ticker, period = "1d") {
    try {
      // Build Stooq URL with proper symbol formatting
      const stooqSymbol = this.formatStooqSymbol(ticker);
      const url = `${this.stooqBaseUrl}?s=${stooqSymbol}&i=d`;

      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });

      if (!response.data || response.data.trim() === "") {
        return null;
      }

      // Parse CSV data
      const lines = response.data.trim().split("\n");
      if (lines.length < 2) {
        return null;
      }

      // Parse header and data rows
      const headers = lines[0].split(",");
      const dataRows = lines.slice(1);

      const data = dataRows
        .map((row) => {
          const values = row.split(",");
          const record = {};

          headers.forEach((header, index) => {
            record[header] = values[index];
          });

          // Transform to consistent format
          return {
            date: record.DATE,
            timestamp: new Date(record.DATE).getTime(),
            open: parseFloat(record.OPEN) || null,
            high: parseFloat(record.HIGH) || null,
            low: parseFloat(record.LOW) || null,
            close: parseFloat(record.CLOSE) || null,
            adjClose: parseFloat(record.CLOSE), // Stooq doesn't provide adj close
            volume: parseInt(record.VOL) || 0,
          };
        })
        .filter((record) => record.close !== null);

      return { data };
    } catch (error) {
      this.logger.debug(`Stooq failed for ${ticker}`, error.message);
      return null;
    }
  }

  /**
   * Build Yahoo Finance query options
   */
  buildYahooQueryOptions(ticker, period) {
    const now = new Date();
    let startDate, endDate;

    if (period === "1d") {
      // Last trading day window
      const lastTradingDay = this.getLastTradingDate(now);
      startDate = new Date(lastTradingDay);
      endDate = new Date(lastTradingDay);
      endDate.setDate(endDate.getDate() + 1);
    } else {
      // For longer periods, adjust accordingly
      const days = this.parsePeriodToDays(period);
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - days);
      endDate = new Date(now);
    }

    return {
      period1: Math.floor(startDate.getTime() / 1000),
      period2: Math.floor(endDate.getTime() / 1000),
      interval: "1d",
      includePrePost: false,
    };
  }

  /**
   * Format ticker symbol for Stooq
   */
  formatStooqSymbol(ticker) {
    // Known symbol remaps
    const stooqMap = {
      "^GSPC": "^SPX",
      "^DJI": "^DJI",
      "^IXIC": "^IXIC",
    };

    const mappedTicker = stooqMap[ticker] || ticker;

    // For equities, add .us suffix if not an index
    if (!mappedTicker.startsWith("^")) {
      return mappedTicker.toLowerCase() + ".us";
    }

    return mappedTicker.toLowerCase();
  }

  /**
   * Get last trading date (handles weekends)
   */
  getLastTradingDate(date) {
    const dayOfWeek = date.getUTCDay(); // 0 = Sunday, 6 = Saturday

    if (dayOfWeek === 6) {
      // Saturday
      date = new Date(date);
      date.setUTCDate(date.getUTCDate() - 1); // Friday
    } else if (dayOfWeek === 0) {
      // Sunday
      date = new Date(date);
      date.setUTCDate(date.getUTCDate() - 2); // Friday
    }

    return date;
  }

  /**
   * Parse period string to days
   */
  parsePeriodToDays(period) {
    const match = period.match(/^(\d+)([dwm])$/);
    if (!match) return 5; // Default to 5 days

    const [, num, unit] = match;
    const number = parseInt(num);

    switch (unit) {
      case "d":
        return number;
      case "w":
        return number * 7;
      case "m":
        return number * 30; // Approximate
      default:
        return 5;
    }
  }
}

module.exports = MarketDataService;
