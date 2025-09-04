/**
 * Ingestion Service
 * Handles ingestion of fundamentals and news data from FMP with batching, rate limiting, and backoff
 */

const axios = require("axios");
const Logger = require("../../utils/logger");
const ErrorHandler = require("../../utils/error-handler");
const { getEnvConfig } = require("../../config/environment");
const { DYNAMODB_TABLES, DISCOVERY_CONFIG } = require("../../config/constants");

class IngestionService {
  constructor() {
    this.logger = new Logger("ingestion-service");
    this.errorHandler = new ErrorHandler("ingestion-service");
    this.envConfig = getEnvConfig();

    // Initialize DynamoDB
    this.dynamodb = new (require("aws-sdk").DynamoDB.DocumentClient)({
      region: process.env.AWS_REGION || "us-east-1",
    });

    this.tableName =
      process.env.TRADING_TABLE_NAME || DYNAMODB_TABLES.TRADING_TABLE;

    // FMP API configuration
    this.fmpBaseUrl = "https://financialmodelingprep.com/api/v3";
    this.fmpApiKey = this.envConfig.fmpApiKey;

    // Configuration
    this.config = {
      maxTickersPerRun:
        parseInt(process.env.UNIVERSE_MAX_TICKERS_PER_RUN) ||
        DISCOVERY_CONFIG.MAX_TICKERS_PER_RUN,
      batchSize:
        parseInt(process.env.UNIVERSE_BATCH_SIZE) ||
        DISCOVERY_CONFIG.BATCH_SIZE,
      maxConcurrency:
        parseInt(process.env.DISCOVERY_MAX_CONCURRENCY) ||
        DISCOVERY_CONFIG.MAX_CONCURRENCY,
      newsMaxItemsPerTicker:
        parseInt(process.env.NEWS_MAX_ITEMS_PER_TICKER) ||
        DISCOVERY_CONFIG.NEWS_MAX_ITEMS_PER_TICKER,
      fundamentalsStaleDays: 7,
      newsStaleHours: 24,
    };

    // Rate limiting state
    this.requestCount = 0;
    this.rateLimitReset = Date.now() + 60000; // Reset every minute
    this.targetRPM = 250; // Stay under FMP's 300 RPM limit
  }

  /**
   * Run full ingestion process (fundamentals + news)
   * @param {Array} tickers - Array of ticker symbols to process
   * @returns {Promise<Object>} Ingestion results
   */
  async runIngestion(tickers = null) {
    try {
      this.logger.info("Starting ingestion process", {
        tickersProvided: !!tickers,
      });

      // If no tickers provided, get from latest universe
      if (!tickers) {
        tickers = await this.getUniverseTickers();
        this.logger.info(`Loaded ${tickers.length} tickers from universe`);
      }

      if (!tickers || tickers.length === 0) {
        throw new Error("No tickers available for ingestion");
      }

      // Prioritize tickers by staleness (oldest first)
      const prioritizedTickers = await this.prioritizeTickersByStaleness(
        tickers
      );
      const tickersToProcess = prioritizedTickers.slice(
        0,
        this.config.maxTickersPerRun
      );

      this.logger.info(
        `Processing ${tickersToProcess.length} prioritized tickers`,
        {
          totalAvailable: tickers.length,
          maxPerRun: this.config.maxTickersPerRun,
        }
      );

      // Run fundamentals and news ingestion in parallel
      const [fundamentalsResult, newsResult] = await Promise.allSettled([
        this.ingestFundamentals(tickersToProcess),
        this.ingestNews(tickersToProcess),
      ]);

      const results = {
        timestamp: new Date().toISOString(),
        tickersProcessed: tickersToProcess.length,
        fundamentals:
          fundamentalsResult.status === "fulfilled"
            ? fundamentalsResult.value
            : { error: fundamentalsResult.reason.message },
        news:
          newsResult.status === "fulfilled"
            ? newsResult.value
            : { error: newsResult.reason.message },
      };

      this.logger.info("Ingestion process completed", {
        fundamentalsProcessed: results.fundamentals.processed || 0,
        newsProcessed: results.news.processed || 0,
        errors:
          (results.fundamentals.error ? 1 : 0) + (results.news.error ? 1 : 0),
      });

      return results;
    } catch (error) {
      this.logger.error("Ingestion process failed", error);
      throw new Error(`Ingestion error: ${error.message}`);
    }
  }

  /**
   * Ingest fundamentals data for tickers
   * @param {Array} tickers - Array of ticker symbols
   * @returns {Promise<Object>} Fundamentals ingestion results
   */
  async ingestFundamentals(tickers) {
    try {
      this.logger.info(
        `Starting fundamentals ingestion for ${tickers.length} tickers`
      );

      const results = {
        processed: 0,
        skipped: 0,
        errors: 0,
        details: [],
      };

      const batches = this.createBatches(tickers, this.config.batchSize);

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        this.logger.debug(
          `Processing fundamentals batch ${i + 1}/${batches.length} (${
            batch.length
          } tickers)`
        );

        const batchPromises = batch.map(async (ticker) => {
          try {
            await this.ingestTickerFundamentals(ticker);
            return { ticker, status: "success" };
          } catch (error) {
            this.logger.warn(
              `Failed to ingest fundamentals for ${ticker}: ${error.message}`
            );
            return { ticker, status: "error", error: error.message };
          }
        });

        const batchResults = await this.processBatchWithRateLimit(
          batchPromises
        );

        batchResults.forEach((result) => {
          if (result.status === "success") {
            results.processed++;
          } else {
            results.errors++;
          }
          results.details.push(result);
        });
      }

      this.logger.info("Fundamentals ingestion completed", {
        processed: results.processed,
        errors: results.errors,
        total: tickers.length,
      });

      return results;
    } catch (error) {
      this.logger.error("Fundamentals ingestion failed", error);
      throw error;
    }
  }

  /**
   * Ingest news data for tickers
   * @param {Array} tickers - Array of ticker symbols
   * @returns {Promise<Object>} News ingestion results
   */
  async ingestNews(tickers) {
    try {
      this.logger.info(`Starting news ingestion for ${tickers.length} tickers`);

      const results = {
        processed: 0,
        skipped: 0,
        errors: 0,
        details: [],
      };

      const batches = this.createBatches(tickers, this.config.batchSize);

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        this.logger.debug(
          `Processing news batch ${i + 1}/${batches.length} (${
            batch.length
          } tickers)`
        );

        const batchPromises = batch.map(async (ticker) => {
          try {
            await this.ingestTickerNews(ticker);
            return { ticker, status: "success" };
          } catch (error) {
            this.logger.warn(
              `Failed to ingest news for ${ticker}: ${error.message}`
            );
            return { ticker, status: "error", error: error.message };
          }
        });

        const batchResults = await this.processBatchWithRateLimit(
          batchPromises
        );

        batchResults.forEach((result) => {
          if (result.status === "success") {
            results.processed++;
          } else {
            results.errors++;
          }
          results.details.push(result);
        });
      }

      this.logger.info("News ingestion completed", {
        processed: results.processed,
        errors: results.errors,
        total: tickers.length,
      });

      return results;
    } catch (error) {
      this.logger.error("News ingestion failed", error);
      throw error;
    }
  }

  /**
   * Ingest fundamentals for a single ticker
   * @param {string} ticker - Ticker symbol
   */
  async ingestTickerFundamentals(ticker) {
    try {
      // Check if we already have recent fundamentals
      const hasRecentFundamentals = await this.hasRecentFundamentals(ticker);
      if (hasRecentFundamentals) {
        this.logger.debug(`Skipping ${ticker} - has recent fundamentals`);
        return { skipped: true };
      }

      // Fetch fundamentals from FMP
      const fundamentalsData = await this.fetchFundamentalsFromFMP(ticker);

      if (!fundamentalsData) {
        throw new Error("No fundamentals data available");
      }

      // Process and persist fundamentals
      await this.persistFundamentals(ticker, fundamentalsData);

      this.logger.debug(`Successfully ingested fundamentals for ${ticker}`);
      return { processed: true };
    } catch (error) {
      throw new Error(
        `Fundamentals ingestion failed for ${ticker}: ${error.message}`
      );
    }
  }

  /**
   * Ingest news for a single ticker
   * @param {string} ticker - Ticker symbol
   */
  async ingestTickerNews(ticker) {
    try {
      // Fetch recent news from FMP
      const newsData = await this.fetchNewsFromFMP(ticker);

      if (!newsData || newsData.length === 0) {
        this.logger.debug(`No recent news for ${ticker}`);
        return { processed: true, newsCount: 0 };
      }

      // Filter to recent news only (last 24 hours)
      const recentNews = this.filterRecentNews(newsData);
      const newsToProcess = recentNews.slice(
        0,
        this.config.newsMaxItemsPerTicker
      );

      // Persist news items
      for (const newsItem of newsToProcess) {
        await this.persistNews(ticker, newsItem);
      }

      this.logger.debug(
        `Successfully ingested ${newsToProcess.length} news items for ${ticker}`
      );
      return { processed: true, newsCount: newsToProcess.length };
    } catch (error) {
      throw new Error(`News ingestion failed for ${ticker}: ${error.message}`);
    }
  }

  /**
   * Fetch fundamentals data from FMP
   * @param {string} ticker - Ticker symbol
   */
  async fetchFundamentalsFromFMP(ticker) {
    try {
      const url = `${this.fmpBaseUrl}/key-metrics/${ticker}?apikey=${this.fmpApiKey}&limit=1`;

      const response = await axios.get(url, {
        timeout: 30000,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });

      if (
        !response.data ||
        !Array.isArray(response.data) ||
        response.data.length === 0
      ) {
        return null;
      }

      return response.data[0]; // Return most recent
    } catch (error) {
      this.logger.debug(
        `FMP fundamentals fetch failed for ${ticker}: ${error.message}`
      );
      return null;
    }
  }

  /**
   * Fetch news data from FMP
   * @param {string} ticker - Ticker symbol
   */
  async fetchNewsFromFMP(ticker) {
    try {
      // Get news from last 24 hours
      const from = new Date(Date.now() - 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];
      const to = new Date().toISOString().split("T")[0];

      const url = `${this.fmpBaseUrl}/stock_news?tickers=${ticker}&from=${from}&to=${to}&apikey=${this.fmpApiKey}&limit=50`;

      const response = await axios.get(url, {
        timeout: 30000,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });

      if (!response.data || !Array.isArray(response.data)) {
        return [];
      }

      return response.data;
    } catch (error) {
      this.logger.debug(
        `FMP news fetch failed for ${ticker}: ${error.message}`
      );
      return [];
    }
  }

  /**
   * Filter news to only recent items (last 24 hours)
   * @param {Array} newsData - Raw news data from FMP
   */
  filterRecentNews(newsData) {
    const cutoffTime = Date.now() - this.config.newsStaleHours * 60 * 60 * 1000;

    return newsData
      .filter((news) => {
        const publishedTime = new Date(news.publishedDate).getTime();
        return publishedTime > cutoffTime;
      })
      .sort((a, b) => new Date(b.publishedDate) - new Date(a.publishedDate)); // Most recent first
  }

  /**
   * Persist fundamentals data
   * @param {string} ticker - Ticker symbol
   * @param {Object} fundamentalsData - Fundamentals data from FMP
   */
  async persistFundamentals(ticker, fundamentalsData) {
    try {
      const timestamp = new Date().toISOString();

      // Calculate derived metrics
      const structured = this.calculateFundamentalsMetrics(fundamentalsData);

      const item = {
        // Primary Key (composite)
        PK: `evidence#${ticker}`,
        SK: timestamp,
        // GSI for ticker queries
        GSI1PK: ticker,
        GSI1SK: timestamp,
        // Data
        itemType: "evidence",
        type: "fundamentals",
        ticker: ticker,
        source: "FMP",
        asOfDate: fundamentalsData.date || fundamentalsData.calendarYear,
        publishedAt: timestamp,
        raw: this.trimRawData(fundamentalsData), // Trimmed to stay under 400KB
        structured: structured,
        recencyDays: 0, // Just ingested
        stale: false,
        // TTL: 30 days
        ttl: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
      };

      const params = {
        TableName: this.tableName,
        Item: item,
      };

      await this.dynamodb.put(params).promise();

      this.logger.debug(`Persisted fundamentals for ${ticker}`, {
        asOfDate: item.asOfDate,
        timestamp: timestamp,
      });
    } catch (error) {
      this.logger.error(`Failed to persist fundamentals for ${ticker}`, error);
      throw error;
    }
  }

  /**
   * Persist news data
   * @param {string} ticker - Ticker symbol
   * @param {Object} newsItem - News item from FMP
   */
  async persistNews(ticker, newsItem) {
    try {
      const timestamp = new Date().toISOString();
      const publishedAt = newsItem.publishedDate;

      // Check for duplicates
      const isDuplicate = await this.isDuplicateNews(
        ticker,
        newsItem.url,
        publishedAt
      );
      if (isDuplicate) {
        this.logger.debug(
          `Skipping duplicate news for ${ticker}: ${newsItem.title}`
        );
        return;
      }

      const item = {
        // Primary Key (composite)
        PK: `evidence#${ticker}`,
        SK: timestamp,
        // GSI for ticker queries
        GSI1PK: ticker,
        GSI1SK: timestamp,
        // Data
        itemType: "evidence",
        type: "news",
        ticker: ticker,
        source: "FMP",
        sourceName: newsItem.site || "FMP",
        publishedAt: publishedAt,
        url: newsItem.url,
        headline: newsItem.title,
        snippet: newsItem.text || newsItem.title,
        raw: this.trimRawData(newsItem), // Trimmed to stay under 400KB
        recencyDays: this.calculateRecencyDays(publishedAt),
        stale: false,
        // TTL: 30 days
        ttl: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
      };

      const params = {
        TableName: this.tableName,
        Item: item,
      };

      await this.dynamodb.put(params).promise();

      this.logger.debug(`Persisted news for ${ticker}`, {
        headline: item.headline.substring(0, 50) + "...",
        publishedAt: publishedAt,
      });
    } catch (error) {
      this.logger.error(`Failed to persist news for ${ticker}`, error);
      throw error;
    }
  }

  /**
   * Calculate derived fundamentals metrics
   * @param {Object} data - Raw fundamentals data
   */
  calculateFundamentalsMetrics(data) {
    try {
      const operatingCashFlow = data.operatingCashFlowPerShare || 0;
      const capitalExpenditure = data.capExPerShare || 0;
      const cash = data.cashAndCashEquivalents || 0;
      const revenue = data.revenuePerShare || 0;

      // Monthly burn = (operating cash flow - capex) / 12
      let monthlyBurn = 0;
      if (operatingCashFlow && capitalExpenditure) {
        monthlyBurn = Math.max(
          0,
          -(operatingCashFlow - capitalExpenditure) / 12
        );
      } else if (revenue) {
        // Fallback: estimate burn as 15% of revenue / 12
        monthlyBurn = (revenue * 0.15) / 12;
      }

      // Runway months = cash / monthly burn (if burn > 0)
      let runwayMonths = null;
      if (monthlyBurn > 0 && cash > 0) {
        runwayMonths = cash / monthlyBurn;
      }

      // Valuation flags
      const undervalued =
        runwayMonths &&
        runwayMonths >= 12 &&
        data.marketCap &&
        revenue &&
        data.marketCap < revenue;

      return {
        marketCap: data.marketCap,
        sharesOutstanding: data.weightedAverageShsOut,
        float: data.floatShares,
        cashAndCashEquivalents: cash,
        totalDebt: data.totalDebt,
        operatingCashFlow: operatingCashFlow,
        capitalExpenditure: capitalExpenditure,
        revenue: revenue,
        eps: data.netIncomePerShare,
        runwayMonths: runwayMonths
          ? Math.round(runwayMonths * 100) / 100
          : null,
        monthlyBurn: monthlyBurn ? Math.round(monthlyBurn * 100) / 100 : null,
        valuationFlags: {
          undervalued: undervalued || false,
        },
      };
    } catch (error) {
      this.logger.warn("Failed to calculate fundamentals metrics", error);
      return {};
    }
  }

  /**
   * Trim raw data to stay under DynamoDB item size limits
   * @param {Object} data - Raw data object
   */
  trimRawData(data) {
    // Keep essential fields only, remove large arrays or unnecessary data
    const trimmed = { ...data };

    // Remove large arrays that aren't needed
    const fieldsToRemove = ["symbol", "cik", "compositeFigi", "shareClassFigi"];
    fieldsToRemove.forEach((field) => {
      if (trimmed[field]) delete trimmed[field];
    });

    // Limit text fields to reasonable lengths
    if (trimmed.text && trimmed.text.length > 1000) {
      trimmed.text = trimmed.text.substring(0, 1000) + "...";
    }

    return trimmed;
  }

  /**
   * Check if news item is duplicate
   * @param {string} ticker - Ticker symbol
   * @param {string} url - News URL
   * @param {string} publishedAt - Publication date
   */
  async isDuplicateNews(ticker, url, publishedAt) {
    try {
      const params = {
        TableName: this.tableName,
        IndexName: "TickerIndex",
        KeyConditionExpression: "GSI1PK = :ticker",
        FilterExpression:
          "#type = :type AND #url = :url AND publishedAt = :publishedAt",
        ExpressionAttributeNames: {
          "#type": "type",
          "#url": "url",
        },
        ExpressionAttributeValues: {
          ":ticker": ticker,
          ":type": "news",
          ":url": url,
          ":publishedAt": publishedAt,
        },
        Limit: 1,
      };

      const result = await this.dynamodb.query(params).promise();
      return result.Items && result.Items.length > 0;
    } catch (error) {
      this.logger.warn("Failed to check for duplicate news", error);
      return false; // Assume not duplicate if check fails
    }
  }

  /**
   * Check if ticker has recent fundamentals
   * @param {string} ticker - Ticker symbol
   */
  async hasRecentFundamentals(ticker) {
    try {
      const cutoffDate = new Date(
        Date.now() - this.config.fundamentalsStaleDays * 24 * 60 * 60 * 1000
      );

      const params = {
        TableName: this.tableName,
        IndexName: "TickerIndex",
        KeyConditionExpression: "GSI1PK = :ticker",
        FilterExpression: "#type = :type AND asOfDate >= :cutoff",
        ExpressionAttributeNames: {
          "#type": "type",
        },
        ExpressionAttributeValues: {
          ":ticker": ticker,
          ":type": "fundamentals",
          ":cutoff": cutoffDate.toISOString().split("T")[0],
        },
        Limit: 1,
      };

      const result = await this.dynamodb.query(params).promise();
      return result.Items && result.Items.length > 0;
    } catch (error) {
      this.logger.warn(
        `Failed to check recent fundamentals for ${ticker}`,
        error
      );
      return false;
    }
  }

  /**
   * Get tickers from latest universe
   */
  async getUniverseTickers() {
    try {
      const UniverseService = require("./universe-service");
      const universeService = new UniverseService();

      const latestUniverse = await universeService.getLatestUniverse();

      if (!latestUniverse || !latestUniverse.tickers) {
        return [];
      }

      return latestUniverse.tickers.map((t) => t.symbol);
    } catch (error) {
      this.logger.error("Failed to get universe tickers", error);
      return [];
    }
  }

  /**
   * Prioritize tickers by staleness (oldest fundamentals first)
   * @param {Array} tickers - Array of ticker symbols
   */
  async prioritizeTickersByStaleness(tickers) {
    try {
      const tickerStats = await Promise.all(
        tickers.map(async (ticker) => {
          const lastUpdate = await this.getLastFundamentalsUpdate(ticker);
          return {
            ticker,
            lastUpdate: lastUpdate || new Date(0), // Never updated = highest priority
          };
        })
      );

      // Sort by oldest first
      return tickerStats
        .sort((a, b) => a.lastUpdate - b.lastUpdate)
        .map((stat) => stat.ticker);
    } catch (error) {
      this.logger.warn("Failed to prioritize tickers by staleness", error);
      return tickers; // Return original order if prioritization fails
    }
  }

  /**
   * Get last fundamentals update for ticker
   * @param {string} ticker - Ticker symbol
   */
  async getLastFundamentalsUpdate(ticker) {
    try {
      const params = {
        TableName: this.tableName,
        IndexName: "TickerIndex",
        KeyConditionExpression: "GSI1PK = :ticker",
        FilterExpression: "#type = :type",
        ExpressionAttributeNames: {
          "#type": "type",
        },
        ExpressionAttributeValues: {
          ":ticker": ticker,
          ":type": "fundamentals",
        },
        // Note: ScanIndexForward removed - query returns items in index order
        Limit: 1,
      };

      const result = await this.dynamodb.query(params).promise();

      if (result.Items && result.Items.length > 0) {
        return new Date(result.Items[0].SK);
      }

      return null;
    } catch (error) {
      this.logger.debug(
        `Failed to get last update for ${ticker}`,
        error.message
      );
      return null;
    }
  }

  /**
   * Process batch with rate limiting
   * @param {Array} promises - Array of promises to process
   */
  async processBatchWithRateLimit(promises) {
    try {
      // Check rate limit
      await this.enforceRateLimit();

      // Process with concurrency limit
      const results = [];
      for (let i = 0; i < promises.length; i += this.config.maxConcurrency) {
        const batch = promises.slice(i, i + this.config.maxConcurrency);
        const batchResults = await Promise.allSettled(batch);
        results.push(...batchResults);
      }

      return results.map((result) =>
        result.status === "fulfilled" ? result.value : result.reason
      );
    } catch (error) {
      this.logger.error("Batch processing failed", error);
      throw error;
    }
  }

  /**
   * Enforce rate limiting (target 250 RPM)
   */
  async enforceRateLimit() {
    const now = Date.now();

    // Reset counter if minute has passed
    if (now > this.rateLimitReset) {
      this.requestCount = 0;
      this.rateLimitReset = now + 60000;
    }

    // Check if we're approaching the limit
    if (this.requestCount >= this.targetRPM) {
      const waitTime = this.rateLimitReset - now + 1000; // Add 1 second buffer
      this.logger.debug(`Rate limit reached, waiting ${waitTime}ms`);
      await this.sleep(waitTime);

      // Reset for next minute
      this.requestCount = 0;
      this.rateLimitReset = Date.now() + 60000;
    }

    this.requestCount++;
  }

  /**
   * Calculate recency in days from published date
   * @param {string} publishedAt - Publication date string
   */
  calculateRecencyDays(publishedAt) {
    const published = new Date(publishedAt).getTime();
    const now = Date.now();
    return Math.floor((now - published) / (24 * 60 * 60 * 1000));
  }

  /**
   * Create batches from array
   * @param {Array} array - Array to batch
   * @param {number} batchSize - Size of each batch
   */
  createBatches(array, batchSize) {
    const batches = [];
    for (let i = 0; i < array.length; i += batchSize) {
      batches.push(array.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Sleep for specified milliseconds
   * @param {number} ms - Milliseconds to sleep
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

module.exports = IngestionService;
