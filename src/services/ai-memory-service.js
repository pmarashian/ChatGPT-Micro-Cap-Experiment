/**
 * AI Memory Service
 * Handles persistence and retrieval of AI research, decisions, and market data
 * Provides memory/context for AI to learn from previous decisions
 */

const AWS = require("aws-sdk");
const Logger = require("../utils/logger");
const ErrorHandler = require("../utils/error-handler");
const {
  ITEM_TYPES,
  DYNAMODB_TABLES,
  PORTFOLIO_CONFIG,
} = require("../config/constants");
const { getEnvConfig } = require("../config/environment");

class AIMemoryService {
  constructor() {
    this.logger = new Logger("ai-memory-service");
    this.errorHandler = new ErrorHandler("ai-memory-service");
    this.envConfig = getEnvConfig();

    // Initialize DynamoDB
    this.dynamodb = new AWS.DynamoDB.DocumentClient({
      region: process.env.AWS_REGION || "us-east-1",
    });

    this.tableName =
      process.env.TRADING_TABLE_NAME || DYNAMODB_TABLES.TRADING_TABLE;
  }

  /**
   * Save AI research and analysis
   * @param {Object} researchData - AI research findings
   */
  async saveAIResearch(researchData) {
    try {
      const timestamp = researchData.generatedAt || new Date().toISOString();

      // Save overall research summary
      const researchItem = {
        // Primary Key (composite)
        PK: `${ITEM_TYPES.AI_RESEARCH}#SUMMARY`,
        SK: timestamp,
        // GSI for queries (not used for summary items)
        GSI1PK: "SUMMARY",
        GSI1SK: timestamp,
        // Data
        itemType: ITEM_TYPES.AI_RESEARCH,
        timestamp: timestamp,
        version: researchData.version || "2.0",
        researchSummary: researchData.researchSummary,
        portfolioStrategy: researchData.portfolioStrategy,
        riskAssessment: researchData.riskAssessment,
        nextResearchFocus: researchData.nextResearchFocus,
        // Add metadata
        createdAt: new Date().toISOString(),
        ttl:
          Math.floor(Date.now() / 1000) +
          PORTFOLIO_CONFIG.RESEARCH.RETENTION_DAYS.RESEARCH * 24 * 60 * 60,
      };

      const params = {
        TableName: this.tableName,
        Item: researchItem,
      };

      await this.dynamodb.put(params).promise();

      // Save individual ticker research items for queryability
      if (
        researchData.newDiscoveries &&
        researchData.newDiscoveries.length > 0
      ) {
        await this.saveTickerResearchItems(
          researchData.newDiscoveries,
          researchData.generatedAt
        );
      }

      this.logger.info("AI research saved to database", {
        discoveries: researchData.newDiscoveries?.length || 0,
        timestamp: researchItem.timestamp,
      });

      return researchItem;
    } catch (error) {
      this.logger.error("Failed to save AI research", error);
      throw error;
    }
  }

  /**
   * Save AI trading decisions
   * @param {Object} decisionData - AI trading decisions
   */
  async saveAIDecisions(decisionData) {
    try {
      const timestamp = decisionData.generatedAt || new Date().toISOString();

      // Save overall decision summary
      const decisionItem = {
        // Primary Key (composite)
        PK: `${ITEM_TYPES.AI_DECISION}#SUMMARY`,
        SK: timestamp,
        // GSI for queries (not used for summary items)
        GSI1PK: "SUMMARY",
        GSI1SK: timestamp,
        // Data
        itemType: ITEM_TYPES.AI_DECISION,
        timestamp: timestamp,
        version: decisionData.version || "2.0",
        decisions: decisionData.decisions || [],
        researchSummary: decisionData.researchSummary,
        // Add metadata
        createdAt: new Date().toISOString(),
        ttl:
          Math.floor(Date.now() / 1000) +
          PORTFOLIO_CONFIG.RESEARCH.RETENTION_DAYS.DECISIONS * 24 * 60 * 60,
      };

      const params = {
        TableName: this.tableName,
        Item: decisionItem,
      };

      await this.dynamodb.put(params).promise();

      // Save individual ticker decision items for queryability
      if (decisionData.decisions && decisionData.decisions.length > 0) {
        await this.saveTickerDecisionItems(
          decisionData.decisions,
          decisionData.generatedAt
        );
      }

      this.logger.info("AI decisions saved to database", {
        decisionCount: decisionData.decisions?.length || 0,
        timestamp: decisionItem.timestamp,
      });

      return decisionItem;
    } catch (error) {
      this.logger.error("Failed to save AI decisions", error);
      throw error;
    }
  }

  /**
   * Save market data cache
   * @param {Object} marketData - Market data to cache
   */
  async saveMarketData(marketData) {
    try {
      const timestamp = new Date().toISOString();

      // Save overall market data cache
      const marketDataItem = {
        // Primary Key (composite)
        PK: `${ITEM_TYPES.MARKET_DATA}#SUMMARY`,
        SK: timestamp,
        // GSI for queries (not used for summary items)
        GSI1PK: "SUMMARY",
        GSI1SK: timestamp,
        // Data
        itemType: ITEM_TYPES.MARKET_DATA,
        timestamp: timestamp,
        data: marketData,
        // Cache based on configuration
        ttl:
          Math.floor(Date.now() / 1000) +
          PORTFOLIO_CONFIG.MARKET_DATA_CACHE.TTL_MINUTES * 60,
      };

      const params = {
        TableName: this.tableName,
        Item: marketDataItem,
      };

      await this.dynamodb.put(params).promise();

      // Save individual ticker market data items for queryability
      await this.saveTickerMarketDataItems(marketData);

      this.logger.debug("Market data cached", {
        tickerCount: Object.keys(marketData).length,
        cacheExpiry: PORTFOLIO_CONFIG.MARKET_DATA_CACHE.TTL_MINUTES,
      });

      return marketDataItem;
    } catch (error) {
      this.logger.error("Failed to save market data", error);
      throw error;
    }
  }

  /**
   * Save individual ticker research items for queryability
   * @param {Array} discoveries - Array of discovery objects
   * @param {string} timestamp - Research timestamp
   */
  async saveTickerResearchItems(discoveries, timestamp) {
    try {
      const promises = discoveries.map((discovery) => {
        const researchItem = {
          // Primary Key (composite)
          PK: `${ITEM_TYPES.AI_RESEARCH}#${discovery.ticker}`,
          SK: timestamp,
          // GSI for ticker queries
          GSI1PK: discovery.ticker,
          GSI1SK: timestamp,
          // Data
          itemType: ITEM_TYPES.AI_RESEARCH,
          ticker: discovery.ticker,
          timestamp: timestamp,
          companyName: discovery.companyName,
          marketCap: discovery.marketCap,
          researchNotes:
            discovery.researchNotes || discovery.fundamentalAnalysis,
          recommendedAction: discovery.recommendedAction,
          convictionLevel: discovery.convictionLevel,
          qualityScore: this.calculateQualityScore(discovery),
          sector: discovery.sector,
          catalysts: discovery.catalysts || [],
          risks: discovery.risks || [],
          valuation: discovery.valuation,
          // Add metadata
          createdAt: new Date().toISOString(),
          ttl:
            Math.floor(Date.now() / 1000) +
            PORTFOLIO_CONFIG.RESEARCH.RETENTION_DAYS.RESEARCH * 24 * 60 * 60,
        };

        const params = {
          TableName: this.tableName,
          Item: researchItem,
        };

        return this.dynamodb.put(params).promise();
      });

      await Promise.all(promises);
      this.logger.debug(`Saved ${discoveries.length} ticker research items`);
    } catch (error) {
      this.logger.error("Failed to save ticker research items", error);
      throw error;
    }
  }

  /**
   * Save individual ticker decision items for queryability
   * @param {Array} decisions - Array of decision objects
   * @param {string} timestamp - Decision timestamp
   */
  async saveTickerDecisionItems(decisions, timestamp) {
    try {
      const promises = decisions.map((decision) => {
        const decisionItem = {
          // Primary Key (composite)
          PK: `${ITEM_TYPES.AI_DECISION}#${decision.ticker}`,
          SK: timestamp,
          // GSI for ticker queries
          GSI1PK: decision.ticker,
          GSI1SK: timestamp,
          // Data
          itemType: ITEM_TYPES.AI_DECISION,
          ticker: decision.ticker,
          timestamp: timestamp,
          action: decision.action,
          shares: decision.shares,
          orderType: decision.orderType,
          limitPrice: decision.limitPrice,
          timeInForce: decision.timeInForce,
          stopLoss: decision.stopLoss,
          research: decision.research,
          confidence: decision.confidence,
          rationale: decision.rationale,
          // Add metadata
          createdAt: new Date().toISOString(),
          ttl:
            Math.floor(Date.now() / 1000) +
            PORTFOLIO_CONFIG.RESEARCH.RETENTION_DAYS.DECISIONS * 24 * 60 * 60,
        };

        const params = {
          TableName: this.tableName,
          Item: decisionItem,
        };

        return this.dynamodb.put(params).promise();
      });

      await Promise.all(promises);
      this.logger.debug(`Saved ${decisions.length} ticker decision items`);
    } catch (error) {
      this.logger.error("Failed to save ticker decision items", error);
      throw error;
    }
  }

  /**
   * Save individual ticker market data items for queryability
   * @param {Object} marketData - Market data object with tickers as keys
   */
  async saveTickerMarketDataItems(marketData) {
    try {
      const timestamp = new Date().toISOString();
      const promises = Object.keys(marketData).map((ticker) => {
        const tickerData = marketData[ticker];
        const marketDataItem = {
          // Primary Key (composite)
          PK: `${ITEM_TYPES.MARKET_DATA}#${ticker}`,
          SK: timestamp,
          // GSI for ticker queries
          GSI1PK: ticker,
          GSI1SK: timestamp,
          // Data
          itemType: ITEM_TYPES.MARKET_DATA,
          ticker: ticker,
          timestamp: timestamp,
          source: tickerData.source,
          data: tickerData.data,
          lastUpdated: tickerData.lastUpdated,
          error: tickerData.error,
          // Cache based on configuration
          ttl:
            Math.floor(Date.now() / 1000) +
            PORTFOLIO_CONFIG.MARKET_DATA_CACHE.TTL_MINUTES * 60,
        };

        const params = {
          TableName: this.tableName,
          Item: marketDataItem,
        };

        return this.dynamodb.put(params).promise();
      });

      await Promise.all(promises);
      this.logger.debug(
        `Saved ${Object.keys(marketData).length} ticker market data items`
      );
    } catch (error) {
      this.logger.error("Failed to save ticker market data items", error);
      throw error;
    }
  }

  /**
   * Get recent AI research history
   * @param {number} limit - Number of research items to retrieve
   */
  async getRecentResearch(limit = 5) {
    try {
      const params = {
        TableName: this.tableName,
        KeyConditionExpression: "id = :id",
        ExpressionAttributeValues: {
          ":id": ITEM_TYPES.AI_RESEARCH,
        },
        ScanIndexForward: false, // Most recent first
        Limit: limit,
      };

      const result = await this.dynamodb.query(params).promise();

      this.logger.debug(`Retrieved ${result.Items.length} research items`);
      return result.Items;
    } catch (error) {
      this.logger.error("Failed to get recent research", error);
      return [];
    }
  }

  /**
   * Get recent AI decision history
   * @param {number} limit - Number of decision items to retrieve
   */
  async getRecentDecisions(limit = 10) {
    try {
      const params = {
        TableName: this.tableName,
        KeyConditionExpression: "id = :id",
        ExpressionAttributeValues: {
          ":id": ITEM_TYPES.AI_DECISION,
        },
        ScanIndexForward: false, // Most recent first
        Limit: limit,
      };

      const result = await this.dynamodb.query(params).promise();

      this.logger.debug(`Retrieved ${result.Items.length} decision items`);
      return result.Items;
    } catch (error) {
      this.logger.error("Failed to get recent decisions", error);
      return [];
    }
  }

  /**
   * Get cached market data (if still valid)
   */
  async getCachedMarketData() {
    try {
      const params = {
        TableName: this.tableName,
        Key: {
          id: ITEM_TYPES.MARKET_DATA,
        },
      };

      const result = await this.dynamodb.get(params).promise();

      if (result.Item) {
        const cacheAge = Date.now() - result.Item.timestamp * 1000;
        const maxAge =
          PORTFOLIO_CONFIG.MARKET_DATA_CACHE.MAX_AGE_HOURS * 60 * 60 * 1000;

        if (cacheAge < maxAge) {
          this.logger.debug("Using cached market data", {
            ageMinutes: Math.floor(cacheAge / (1000 * 60)),
            tickerCount: Object.keys(result.Item.data || {}).length,
          });
          return result.Item.data;
        } else {
          this.logger.debug("Cached market data too old, will fetch fresh");
        }
      }

      return null;
    } catch (error) {
      this.logger.error("Failed to get cached market data", error);
      return null;
    }
  }

  /**
   * Get portfolio configuration (or create default)
   */
  async getPortfolioConfig() {
    try {
      const params = {
        TableName: this.tableName,
        Key: {
          PK: ITEM_TYPES.PORTFOLIO_CONFIG,
          SK: "CURRENT",
        },
      };

      const result = await this.dynamodb.get(params).promise();

      if (result.Item) {
        this.logger.debug("Retrieved portfolio configuration from database");
        return result.Item.config;
      } else {
        // Create default configuration
        const defaultConfig = PORTFOLIO_CONFIG;
        await this.savePortfolioConfig(defaultConfig);
        this.logger.info("Created default portfolio configuration");
        return defaultConfig;
      }
    } catch (error) {
      this.logger.error("Failed to get portfolio configuration", error);
      return PORTFOLIO_CONFIG; // Return defaults
    }
  }

  /**
   * Save portfolio configuration
   * @param {Object} config - Portfolio configuration
   */
  async savePortfolioConfig(config) {
    try {
      const configItem = {
        // Primary Key (composite)
        PK: ITEM_TYPES.PORTFOLIO_CONFIG,
        SK: "CURRENT",
        // Legacy id for backward compatibility
        id: ITEM_TYPES.PORTFOLIO_CONFIG,
        // Data
        config: config,
        updatedAt: new Date().toISOString(),
      };

      const params = {
        TableName: this.tableName,
        Item: configItem,
      };

      await this.dynamodb.put(params).promise();
      this.logger.info("Portfolio configuration saved");

      return configItem;
    } catch (error) {
      this.logger.error("Failed to save portfolio configuration", error);
      throw error;
    }
  }

  /**
   * Save discovered tickers with quality scoring
   * @param {Array} discoveries - Array of discovery objects with quality metrics
   */
  async saveDiscoveredTickersWithQuality(discoveries) {
    try {
      if (!discoveries || discoveries.length === 0) {
        return;
      }

      // Get existing discovered tickers with their quality scores
      const existingDiscoveries = await this.getDiscoveredTickersWithQuality();

      // Create quality scores for new discoveries
      const scoredDiscoveries = discoveries.map((discovery) => ({
        ticker: discovery.ticker,
        companyName: discovery.companyName,
        qualityScore: this.calculateQualityScore(discovery),
        discoveryDate: new Date().toISOString(),
        researchNotes: discovery.researchNotes || discovery.fundamentalAnalysis,
        recommendation: discovery.recommendation,
        convictionLevel: discovery.convictionLevel,
        marketCap: discovery.marketCap,
        sector: discovery.sector,
        catalysts: discovery.catalysts || [],
        risks: discovery.risks || [],
        // Performance tracking fields
        invested: false,
        investmentDate: null,
        exitDate: null,
        initialInvestment: 0,
        finalValue: 0,
        performance: 0,
        outcome: null, // 'success', 'failure', 'holding'
      }));

      // Merge with existing discoveries
      const mergedDiscoveries = this.mergeDiscoveryLists(
        existingDiscoveries,
        scoredDiscoveries
      );

      const discoveryItem = {
        // Primary Key (composite)
        PK: `${ITEM_TYPES.AI_RESEARCH}_DISCOVERIES`,
        SK: "CURRENT",
        // Legacy id for backward compatibility
        id: `${ITEM_TYPES.AI_RESEARCH}_DISCOVERED_TICKERS`,
        // Data
        discoveredTickers: mergedDiscoveries,
        lastUpdated: new Date().toISOString(),
        totalDiscoveries: mergedDiscoveries.length,
        recentAdditions: scoredDiscoveries.length,
        averageQualityScore:
          this.calculateAverageQualityScore(mergedDiscoveries),
        topPerformers: this.getTopPerformers(mergedDiscoveries),
      };

      const params = {
        TableName: this.tableName,
        Item: discoveryItem,
      };

      await this.dynamodb.put(params).promise();
      this.logger.info(
        `Saved ${scoredDiscoveries.length} new discoveries with quality scores`,
        {
          newDiscoveries: scoredDiscoveries.length,
          averageQualityScore: discoveryItem.averageQualityScore,
          totalDiscoveries: mergedDiscoveries.length,
        }
      );

      return discoveryItem;
    } catch (error) {
      this.logger.error(
        "Failed to save discovered tickers with quality",
        error
      );
      throw error;
    }
  }

  /**
   * Calculate quality score for a discovery (0-100)
   */
  calculateQualityScore(discovery) {
    let score = 50; // Base score

    // Market cap scoring (prefer micro-cap)
    if (discovery.marketCap) {
      if (discovery.marketCap < 50000000) score += 20; // Under $50M
      else if (discovery.marketCap < 200000000) score += 10; // $50M-$200M
      else if (discovery.marketCap > 500000000) score -= 10; // Over $500M (too big)
    }

    // Conviction level scoring
    const convictionLevels = { high: 20, medium: 10, low: 0 };
    score += convictionLevels[discovery.convictionLevel] || 0;

    // Recommendation scoring
    const recommendationScores = { BUY: 15, MONITOR: 5, AVOID: -10 };
    score += recommendationScores[discovery.recommendation] || 0;

    // Catalysts scoring
    if (discovery.catalysts && discovery.catalysts.length > 0) {
      score += Math.min(discovery.catalysts.length * 5, 15);
    }

    // Sector focus bonus (micro-cap biotech)
    if (
      discovery.sector &&
      discovery.sector.toLowerCase().includes("biotech")
    ) {
      score += 10;
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Merge discovery lists, preserving existing data
   */
  mergeDiscoveryLists(existing, newDiscoveries) {
    const merged = [...existing];
    const existingTickers = new Set(existing.map((d) => d.ticker));

    newDiscoveries.forEach((newDiscovery) => {
      if (!existingTickers.has(newDiscovery.ticker)) {
        merged.push(newDiscovery);
      } else {
        // Update existing discovery if new data is better
        const existingIndex = merged.findIndex(
          (d) => d.ticker === newDiscovery.ticker
        );
        if (newDiscovery.qualityScore > merged[existingIndex].qualityScore) {
          merged[existingIndex] = { ...merged[existingIndex], ...newDiscovery };
        }
      }
    });

    return merged.sort((a, b) => b.qualityScore - a.qualityScore);
  }

  /**
   * Calculate average quality score
   */
  calculateAverageQualityScore(discoveries) {
    if (discoveries.length === 0) return 0;
    const sum = discoveries.reduce((acc, d) => acc + d.qualityScore, 0);
    return Math.round(sum / discoveries.length);
  }

  /**
   * Get top performing discoveries
   */
  getTopPerformers(discoveries, limit = 5) {
    return discoveries
      .filter((d) => d.performance > 0)
      .sort((a, b) => b.performance - a.performance)
      .slice(0, limit)
      .map((d) => ({ ticker: d.ticker, performance: d.performance }));
  }

  /**
   * Update investment performance for a ticker
   * @param {string} ticker - Ticker symbol
   * @param {Object} performanceData - Performance metrics
   */
  async updateInvestmentPerformance(ticker, performanceData) {
    try {
      const discoveries = await this.getDiscoveredTickersWithQuality();
      const discoveryIndex = discoveries.findIndex((d) => d.ticker === ticker);

      if (discoveryIndex >= 0) {
        discoveries[discoveryIndex] = {
          ...discoveries[discoveryIndex],
          ...performanceData,
          lastPerformanceUpdate: new Date().toISOString(),
        };

        // Recalculate performance metrics
        const successfulInvestments = discoveries.filter(
          (d) => d.outcome === "success"
        ).length;
        const failedInvestments = discoveries.filter(
          (d) => d.outcome === "failure"
        ).length;
        const successRate =
          discoveries.length > 0
            ? Math.round(
                (successfulInvestments /
                  (successfulInvestments + failedInvestments)) *
                  100
              )
            : 0;

        const discoveryItem = {
          id: `${ITEM_TYPES.AI_RESEARCH}_DISCOVERED_TICKERS`,
          discoveredTickers: discoveries,
          lastUpdated: new Date().toISOString(),
          totalDiscoveries: discoveries.length,
          averageQualityScore: this.calculateAverageQualityScore(discoveries),
          topPerformers: this.getTopPerformers(discoveries),
          successRate: successRate,
          performanceMetrics: {
            totalInvested: discoveries.filter((d) => d.invested).length,
            successfulInvestments,
            failedInvestments,
            averagePerformance: this.calculateAveragePerformance(discoveries),
          },
        };

        const params = {
          TableName: this.tableName,
          Item: discoveryItem,
        };

        await this.dynamodb.put(params).promise();
        this.logger.info(`Updated performance for ${ticker}`, {
          ticker,
          performance: performanceData.performance,
          outcome: performanceData.outcome,
          successRate: `${successRate}%`,
        });

        return discoveryItem;
      }
    } catch (error) {
      this.logger.error(
        `Failed to update investment performance for ${ticker}`,
        error
      );
      throw error;
    }
  }

  /**
   * Calculate average performance across all investments
   */
  calculateAveragePerformance(discoveries) {
    const investedDiscoveries = discoveries.filter(
      (d) => d.invested && d.performance !== 0
    );
    if (investedDiscoveries.length === 0) return 0;

    const sum = investedDiscoveries.reduce((acc, d) => acc + d.performance, 0);
    return Math.round(sum / investedDiscoveries.length);
  }

  /**
   * Get all discovered tickers with quality scores
   * @returns {Promise<Array>} Array of discovery objects with quality metrics
   */
  async getDiscoveredTickersWithQuality() {
    try {
      const params = {
        TableName: this.tableName,
        Key: {
          PK: `${ITEM_TYPES.AI_RESEARCH}_DISCOVERIES`,
          SK: "CURRENT",
        },
      };

      const result = await this.dynamodb.get(params).promise();

      if (result.Item && result.Item.discoveredTickers) {
        this.logger.debug(
          `Retrieved ${result.Item.discoveredTickers.length} discoveries with quality scores`
        );
        return result.Item.discoveredTickers;
      }

      // Return empty array if no discoveries exist yet
      return [];
    } catch (error) {
      this.logger.warn(
        "Failed to retrieve discovered tickers with quality",
        error.message
      );
      return [];
    }
  }

  /**
   * Get all discovered tickers (simple list for backward compatibility)
   * @returns {Promise<Array>} Array of all discovered ticker symbols
   */
  async getDiscoveredTickers() {
    try {
      const discoveries = await this.getDiscoveredTickersWithQuality();
      const tickers = discoveries.map((d) => d.ticker);
      this.logger.debug(`Retrieved ${tickers.length} discovered tickers`);
      return tickers;
    } catch (error) {
      this.logger.warn("Failed to retrieve discovered tickers", error.message);
      return [];
    }
  }

  /**
   * Get all AI research for a specific ticker
   * @param {string} ticker - Ticker symbol to query
   * @param {number} limit - Number of items to retrieve
   * @returns {Promise<Array>} Array of research items for the ticker
   */
  async getTickerResearch(ticker, limit = 10) {
    try {
      const params = {
        TableName: this.tableName,
        IndexName: "TickerIndex",
        KeyConditionExpression: "GSI1PK = :ticker",
        ExpressionAttributeValues: {
          ":ticker": ticker,
        },
        ScanIndexForward: false, // Most recent first
        Limit: limit,
      };

      const result = await this.dynamodb.query(params).promise();

      this.logger.debug(
        `Retrieved ${result.Items.length} research items for ${ticker}`
      );
      return result.Items;
    } catch (error) {
      this.logger.error(`Failed to get research for ${ticker}`, error);
      return [];
    }
  }

  /**
   * Get all AI decisions for a specific ticker
   * @param {string} ticker - Ticker symbol to query
   * @param {number} limit - Number of items to retrieve
   * @returns {Promise<Array>} Array of decision items for the ticker
   */
  async getTickerDecisions(ticker, limit = 20) {
    try {
      const params = {
        TableName: this.tableName,
        IndexName: "TickerIndex",
        KeyConditionExpression: "GSI1PK = :ticker",
        ExpressionAttributeValues: {
          ":ticker": ticker,
        },
        ScanIndexForward: false, // Most recent first
        Limit: limit,
      };

      const result = await this.dynamodb.query(params).promise();

      this.logger.debug(
        `Retrieved ${result.Items.length} decision items for ${ticker}`
      );
      return result.Items;
    } catch (error) {
      this.logger.error(`Failed to get decisions for ${ticker}`, error);
      return [];
    }
  }

  /**
   * Get all market data for a specific ticker
   * @param {string} ticker - Ticker symbol to query
   * @param {number} limit - Number of items to retrieve
   * @returns {Promise<Array>} Array of market data items for the ticker
   */
  async getTickerMarketData(ticker, limit = 5) {
    try {
      const params = {
        TableName: this.tableName,
        IndexName: "TickerIndex",
        KeyConditionExpression: "GSI1PK = :ticker",
        ExpressionAttributeValues: {
          ":ticker": ticker,
        },
        ScanIndexForward: false, // Most recent first
        Limit: limit,
      };

      const result = await this.dynamodb.query(params).promise();

      this.logger.debug(
        `Retrieved ${result.Items.length} market data items for ${ticker}`
      );
      return result.Items;
    } catch (error) {
      this.logger.error(`Failed to get market data for ${ticker}`, error);
      return [];
    }
  }

  /**
   * Get all trading history for a specific ticker
   * @param {string} ticker - Ticker symbol to query
   * @param {number} limit - Number of items to retrieve
   * @returns {Promise<Array>} Array of trade items for the ticker
   */
  async getTickerTrades(ticker, limit = 50) {
    try {
      const params = {
        TableName: this.tableName,
        IndexName: "TickerIndex",
        KeyConditionExpression:
          "GSI1PK = :ticker AND begins_with(GSI1SK, :prefix)",
        ExpressionAttributeValues: {
          ":ticker": ticker,
          ":prefix": "TRADE#",
        },
        ScanIndexForward: false, // Most recent first
        Limit: limit,
      };

      const result = await this.dynamodb.query(params).promise();

      this.logger.debug(
        `Retrieved ${result.Items.length} trade items for ${ticker}`
      );
      return result.Items;
    } catch (error) {
      this.logger.error(`Failed to get trades for ${ticker}`, error);
      return [];
    }
  }

  /**
   * Get complete ticker history (research, decisions, market data, trades)
   * @param {string} ticker - Ticker symbol to query
   * @returns {Promise<Object>} Complete history object for the ticker
   */
  async getCompleteTickerHistory(ticker) {
    try {
      const [research, decisions, marketData, trades] = await Promise.all([
        this.getTickerResearch(ticker),
        this.getTickerDecisions(ticker),
        this.getTickerMarketData(ticker),
        this.getTickerTrades(ticker),
      ]);

      const history = {
        ticker,
        research: research || [],
        decisions: decisions || [],
        marketData: marketData || [],
        trades: trades || [],
        summary: {
          totalResearchItems: research?.length || 0,
          totalDecisions: decisions?.length || 0,
          totalMarketDataPoints: marketData?.length || 0,
          totalTrades: trades?.length || 0,
        },
      };

      this.logger.info(
        `Retrieved complete history for ${ticker}`,
        history.summary
      );
      return history;
    } catch (error) {
      this.logger.error(`Failed to get complete history for ${ticker}`, error);
      return {
        ticker,
        research: [],
        decisions: [],
        marketData: [],
        trades: [],
        summary: {
          totalResearchItems: 0,
          totalDecisions: 0,
          totalMarketDataPoints: 0,
          totalTrades: 0,
        },
      };
    }
  }

  /**
   * Build AI context from historical research and decisions
   * @returns {string} Context string for AI prompt
   */
  async buildAIContext() {
    try {
      const recentResearch = await this.getRecentResearch(3);
      const recentDecisions = await this.getRecentDecisions(5);

      let context = "";

      if (recentResearch.length > 0) {
        context += "\n[PREVIOUS RESEARCH CONTEXT]\n";
        recentResearch.forEach((research, index) => {
          context += `Research ${index + 1} (${
            research.timestamp.split("T")[0]
          }):\n`;
          context += `${research.researchSummary}\n`;
          if (research.newDiscoveries && research.newDiscoveries.length > 0) {
            const discoveries = research.newDiscoveries
              .map(
                (d) =>
                  `${d.ticker}(${
                    d.recommendation || d.convictionLevel || "unknown"
                  })`
              )
              .join(", ");
            context += `New discoveries: ${discoveries}\n`;
          }
          context += "\n";
        });
      }

      if (recentDecisions.length > 0) {
        context += "\n[PREVIOUS DECISION CONTEXT]\n";
        recentDecisions.forEach((decision, index) => {
          context += `Decision ${index + 1} (${
            decision.timestamp.split("T")[0]
          }):\n`;
          decision.decisions.forEach((d, i) => {
            if (d.action !== "HOLD") {
              const rationale = d.rationale
                ? ` (${d.rationale.substring(0, 50)}...)`
                : "";
              context += `- ${d.action} ${d.shares || 0} shares of ${
                d.ticker
              }${rationale}\n`;
            }
          });
          context += "\n";
        });
      }

      // Add quality and performance summary if we have discoveries
      try {
        const allDiscoveries = await this.getDiscoveredTickersWithQuality();
        if (allDiscoveries.length > 0) {
          const investedDiscoveries = allDiscoveries.filter((d) => d.invested);
          const successfulInvestments = allDiscoveries.filter(
            (d) => d.outcome === "success"
          ).length;
          const successRate =
            investedDiscoveries.length > 0
              ? (successfulInvestments / investedDiscoveries.length) * 100
              : 0;
          const avgQualityScore =
            allDiscoveries.reduce((sum, d) => sum + d.qualityScore, 0) /
            allDiscoveries.length;

          const topPerformer = allDiscoveries
            .filter((d) => d.performance > 0)
            .sort((a, b) => b.performance - a.performance)[0];

          context += "\n[PERFORMANCE SUMMARY]\n";
          context += `Total discoveries: ${allDiscoveries.length}\n`;
          context += `Invested in: ${investedDiscoveries.length}\n`;
          context += `Success rate: ${successRate.toFixed(1)}%\n`;
          context += `Average quality score: ${avgQualityScore.toFixed(1)}\n`;
          context += `Top performer: ${topPerformer?.ticker || "None yet"}\n\n`;
        }
      } catch (error) {
        this.logger.warn(
          "Could not add performance summary to context",
          error.message
        );
      }

      if (context.length > 0) {
        this.logger.debug("Built AI context with quality metrics", {
          researchItems: recentResearch.length,
          decisionItems: recentDecisions.length,
          contextLength: context.length,
        });
      }

      return context;
    } catch (error) {
      this.logger.error("Failed to build AI context", error);
      return "";
    }
  }
}

module.exports = AIMemoryService;
