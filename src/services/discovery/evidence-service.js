/**
 * Evidence Service
 * Assembles evidence bundles from persisted fundamentals and news data with recency gating
 */

const Logger = require("../../utils/logger");
const ErrorHandler = require("../../utils/error-handler");
const { getEnvConfig } = require("../../config/environment");
const { DYNAMODB_TABLES, DISCOVERY_CONFIG } = require("../../config/constants");

class EvidenceService {
  constructor() {
    this.logger = new Logger("evidence-service");
    this.errorHandler = new ErrorHandler("evidence-service");
    this.envConfig = getEnvConfig();

    // Initialize DynamoDB
    this.dynamodb = new (require("aws-sdk").DynamoDB.DocumentClient)({
      region: process.env.AWS_REGION || "us-east-1",
    });

    this.tableName =
      process.env.TRADING_TABLE_NAME || DYNAMODB_TABLES.TRADING_TABLE;

    // Configuration
    this.config = {
      fundamentalsStaleDays: 7,
      newsStaleHours: 24,
      maxNewsItems:
        parseInt(process.env.NEWS_MAX_ITEMS_PER_TICKER) ||
        DISCOVERY_CONFIG.NEWS_MAX_ITEMS_PER_TICKER,
    };
  }

  /**
   * Build evidence bundle for a single ticker
   * @param {string} ticker - Ticker symbol
   * @returns {Promise<Object>} Evidence bundle or null if insufficient evidence
   */
  async buildEvidenceBundle(ticker) {
    try {
      this.logger.debug(`Building evidence bundle for ${ticker}`);

      // Get latest valid fundamentals (≤7 days)
      const fundamentals = await this.getLatestFundamentals(ticker);

      // Get recent news (≤24 hours)
      const news = await this.getRecentNews(ticker);

      // Check recency requirements
      const hasValidFundamentals = fundamentals && !fundamentals.stale;
      const hasRecentNews =
        news && news.length > 0 && news.some((n) => !n.stale);

      // Apply gating: exclude ticker if fundamentals are stale or no recent news
      if (!hasValidFundamentals) {
        this.logger.debug(
          `Excluding ${ticker} - no valid fundamentals (stale or missing)`
        );
        return null;
      }

      if (!hasRecentNews) {
        this.logger.debug(`Excluding ${ticker} - no recent news`);
        return null;
      }

      // Build the evidence bundle
      const evidenceBundle = {
        ticker: ticker,
        fundamentals: fundamentals
          ? {
              asOfDate: fundamentals.asOfDate,
              marketCap: fundamentals.structured.marketCap,
              sharesOutstanding: fundamentals.structured.sharesOutstanding,
              cash: fundamentals.structured.cashAndCashEquivalents,
              totalDebt: fundamentals.structured.totalDebt,
              operatingCashFlow: fundamentals.structured.operatingCashFlow,
              capitalExpenditure: fundamentals.structured.capitalExpenditure,
              revenue: fundamentals.structured.revenue,
              eps: fundamentals.structured.eps,
              runwayMonths: fundamentals.structured.runwayMonths,
            }
          : null,
        news: news
          .filter((n) => !n.stale)
          .slice(0, this.config.maxNewsItems)
          .map((n) => ({
            headline: n.headline,
            snippet: n.snippet,
            url: n.url,
            source: n.sourceName,
            publishedAt: n.publishedAt,
          })),
      };

      this.logger.debug(`Built evidence bundle for ${ticker}`, {
        hasFundamentals: !!evidenceBundle.fundamentals,
        newsCount: evidenceBundle.news.length,
      });

      return evidenceBundle;
    } catch (error) {
      this.logger.error(`Failed to build evidence bundle for ${ticker}`, error);
      return null;
    }
  }

  /**
   * Build evidence bundles for multiple tickers
   * @param {Array} tickers - Array of ticker symbols
   * @returns {Promise<Object>} Map of ticker to evidence bundle (null if insufficient evidence)
   */
  async buildEvidenceBundles(tickers) {
    try {
      this.logger.info(
        `Building evidence bundles for ${tickers.length} tickers`
      );

      const bundles = {};
      const batchSize = 10; // Process in small batches to avoid overwhelming DynamoDB

      for (let i = 0; i < tickers.length; i += batchSize) {
        const batch = tickers.slice(i, i + batchSize);
        this.logger.debug(
          `Processing evidence batch ${
            Math.floor(i / batchSize) + 1
          }/${Math.ceil(tickers.length / batchSize)}`
        );

        const batchPromises = batch.map((ticker) =>
          this.buildEvidenceBundle(ticker)
        );
        const batchResults = await Promise.allSettled(batchPromises);

        batchResults.forEach((result, index) => {
          const ticker = batch[index];
          if (result.status === "fulfilled") {
            bundles[ticker] = result.value;
          } else {
            this.logger.warn(
              `Failed to build bundle for ${ticker}`,
              result.reason
            );
            bundles[ticker] = null;
          }
        });
      }

      const validBundles = Object.values(bundles).filter(
        (b) => b !== null
      ).length;
      this.logger.info(
        `Completed evidence bundles: ${validBundles}/${tickers.length} tickers have sufficient evidence`
      );

      return bundles;
    } catch (error) {
      this.logger.error("Failed to build evidence bundles", error);
      throw error;
    }
  }

  /**
   * Get latest valid fundamentals for ticker
   * @param {string} ticker - Ticker symbol
   * @returns {Promise<Object>} Latest fundamentals or null
   */
  async getLatestFundamentals(ticker) {
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

      if (!result.Items || result.Items.length === 0) {
        return null;
      }

      const fundamentals = result.Items[0];

      // Check if fundamentals are stale (>7 days)
      const asOfDate = new Date(fundamentals.asOfDate);
      const daysOld = (Date.now() - asOfDate.getTime()) / (24 * 60 * 60 * 1000);

      fundamentals.stale = daysOld > this.config.fundamentalsStaleDays;
      fundamentals.recencyDays = Math.floor(daysOld);

      this.logger.debug(
        `Fundamentals for ${ticker}: ${
          fundamentals.stale ? "STALE" : "VALID"
        } (${fundamentals.recencyDays} days old)`
      );

      return fundamentals.stale ? null : fundamentals;
    } catch (error) {
      this.logger.error(`Failed to get fundamentals for ${ticker}`, error);
      return null;
    }
  }

  /**
   * Get recent news for ticker
   * @param {string} ticker - Ticker symbol
   * @returns {Promise<Array>} Array of recent news items
   */
  async getRecentNews(ticker) {
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
          ":type": "news",
        },
        // Note: ScanIndexForward removed - query returns items in index order
        Limit: 20, // Get more than we need, then filter
      };

      const result = await this.dynamodb.query(params).promise();

      if (!result.Items || result.Items.length === 0) {
        return [];
      }

      // Filter to recent news only and mark staleness
      const cutoffTime =
        Date.now() - this.config.newsStaleHours * 60 * 60 * 1000;

      const recentNews = result.Items.map((news) => {
        const publishedTime = new Date(news.publishedAt).getTime();
        const hoursOld = (Date.now() - publishedTime) / (60 * 60 * 1000);

        return {
          ...news,
          stale: publishedTime < cutoffTime,
          recencyHours: Math.floor(hoursOld),
        };
      })
        .filter((news) => !news.stale) // Only return non-stale news
        .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt)); // Most recent first

      this.logger.debug(
        `Found ${recentNews.length} recent news items for ${ticker}`
      );

      return recentNews;
    } catch (error) {
      this.logger.error(`Failed to get news for ${ticker}`, error);
      return [];
    }
  }

  /**
   * Get evidence summary for ticker (for diagnostics)
   * @param {string} ticker - Ticker symbol
   * @returns {Promise<Object>} Evidence summary
   */
  async getEvidenceSummary(ticker) {
    try {
      const params = {
        TableName: this.tableName,
        IndexName: "TickerIndex",
        KeyConditionExpression: "GSI1PK = :ticker",
        FilterExpression: "begins_with(PK, :prefix)",
        ExpressionAttributeValues: {
          ":ticker": ticker,
          ":prefix": "evidence#",
        },
        // Note: ScanIndexForward removed - query returns items in index order
      };

      const result = await this.dynamodb.query(params).promise();

      if (!result.Items || result.Items.length === 0) {
        return {
          ticker,
          hasEvidence: false,
          fundamentals: { count: 0, latest: null },
          news: { count: 0, latest: null },
        };
      }

      const fundamentals = result.Items.filter(
        (item) => item.type === "fundamentals"
      );
      const news = result.Items.filter((item) => item.type === "news");

      const latestFundamentals =
        fundamentals.length > 0 ? fundamentals[0] : null;
      const latestNews = news.length > 0 ? news[0] : null;

      return {
        ticker,
        hasEvidence: true,
        fundamentals: {
          count: fundamentals.length,
          latest: latestFundamentals
            ? {
                asOfDate: latestFundamentals.asOfDate,
                recencyDays: latestFundamentals.recencyDays,
                stale: latestFundamentals.stale,
              }
            : null,
        },
        news: {
          count: news.length,
          latest: latestNews
            ? {
                publishedAt: latestNews.publishedAt,
                recencyHours: latestNews.recencyHours,
                stale: latestNews.stale,
                headline: latestNews.headline,
              }
            : null,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to get evidence summary for ${ticker}`, error);
      return {
        ticker,
        hasEvidence: false,
        error: error.message,
      };
    }
  }

  /**
   * Get evidence for multiple tickers (for diagnostics)
   * @param {Array} tickers - Array of ticker symbols
   * @param {number} limit - Max items per ticker
   * @returns {Promise<Object>} Evidence data for tickers
   */
  async getEvidenceForTickers(tickers, limit = 10) {
    try {
      const evidence = {};

      for (const ticker of tickers) {
        const summary = await this.getEvidenceSummary(ticker);
        evidence[ticker] = summary;
      }

      return evidence;
    } catch (error) {
      this.logger.error("Failed to get evidence for tickers", error);
      throw error;
    }
  }

  /**
   * Check if ticker has sufficient evidence for research
   * @param {string} ticker - Ticker symbol
   * @returns {Promise<boolean>} True if ticker has sufficient evidence
   */
  async hasSufficientEvidence(ticker) {
    try {
      const bundle = await this.buildEvidenceBundle(ticker);
      return bundle !== null;
    } catch (error) {
      this.logger.error(
        `Failed to check evidence sufficiency for ${ticker}`,
        error
      );
      return false;
    }
  }

  /**
   * Get tickers with sufficient evidence
   * @param {Array} tickers - Array of ticker symbols to check
   * @returns {Promise<Array>} Array of tickers with sufficient evidence
   */
  async getTickersWithSufficientEvidence(tickers) {
    try {
      const checks = await Promise.all(
        tickers.map(async (ticker) => ({
          ticker,
          hasEvidence: await this.hasSufficientEvidence(ticker),
        }))
      );

      const sufficientTickers = checks
        .filter((check) => check.hasEvidence)
        .map((check) => check.ticker);

      this.logger.info(
        `Found ${sufficientTickers.length}/${tickers.length} tickers with sufficient evidence`
      );

      return sufficientTickers;
    } catch (error) {
      this.logger.error("Failed to check evidence sufficiency", error);
      return [];
    }
  }

  /**
   * Get evidence statistics across all tickers
   * @returns {Promise<Object>} Evidence statistics
   */
  async getEvidenceStatistics() {
    try {
      // Get all evidence items (this is a simplified approach - in production you might want pagination)
      const params = {
        TableName: this.tableName,
        FilterExpression: "begins_with(PK, :prefix)",
        ExpressionAttributeValues: {
          ":prefix": "evidence#",
        },
      };

      const result = await this.dynamodb.scan(params).promise();

      if (!result.Items || result.Items.length === 0) {
        return {
          totalItems: 0,
          fundamentalsCount: 0,
          newsCount: 0,
          tickersWithEvidence: 0,
          avgItemsPerTicker: 0,
        };
      }

      const items = result.Items;
      const fundamentals = items.filter((item) => item.type === "fundamentals");
      const news = items.filter((item) => item.type === "news");

      // Get unique tickers
      const uniqueTickers = new Set(items.map((item) => item.ticker));

      return {
        totalItems: items.length,
        fundamentalsCount: fundamentals.length,
        newsCount: news.length,
        tickersWithEvidence: uniqueTickers.size,
        avgItemsPerTicker:
          Math.round((items.length / uniqueTickers.size) * 100) / 100,
        recentItems: items.filter((item) => {
          const itemDate = new Date(item.SK);
          const daysOld =
            (Date.now() - itemDate.getTime()) / (24 * 60 * 60 * 1000);
          return daysOld <= 7;
        }).length,
      };
    } catch (error) {
      this.logger.error("Failed to get evidence statistics", error);
      throw error;
    }
  }
}

module.exports = EvidenceService;
