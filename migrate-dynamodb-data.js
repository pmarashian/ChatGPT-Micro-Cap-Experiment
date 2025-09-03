/**
 * DynamoDB Data Migration Script
 * Migrates existing nested AI research, decisions, and market data to individual ticker-based items
 */

const AWS = require("aws-sdk");
const Logger = require("./src/utils/logger");
const { DYNAMODB_TABLES, ITEM_TYPES } = require("./src/config/constants");
const { getEnvConfig } = require("./src/config/environment");

class DataMigrationService {
  constructor() {
    this.logger = new Logger("data-migration");
    this.envConfig = getEnvConfig();

    // Initialize DynamoDB
    this.dynamodb = new AWS.DynamoDB.DocumentClient({
      region: process.env.AWS_REGION || "us-east-1",
    });

    this.tableName =
      process.env.TRADING_TABLE_NAME || DYNAMODB_TABLES.TRADING_TABLE;
  }

  /**
   * Run the complete migration process
   */
  async runMigration() {
    try {
      this.logger.info("Starting DynamoDB data migration...");

      // Migrate AI research data
      await this.migrateAIResearch();

      // Migrate AI decisions data
      await this.migrateAIDecisions();

      // Migrate market data
      await this.migrateMarketData();

      this.logger.info("Migration completed successfully!");
    } catch (error) {
      this.logger.error("Migration failed", error);
      throw error;
    }
  }

  /**
   * Migrate AI research data from nested to individual items
   */
  async migrateAIResearch() {
    try {
      this.logger.info("Migrating AI research data...");

      // Get all AI research items
      const researchItems = await this.scanItemsByType(ITEM_TYPES.AI_RESEARCH);

      if (researchItems.length === 0) {
        this.logger.info("No AI research items to migrate");
        return;
      }

      let migratedCount = 0;

      for (const researchItem of researchItems) {
        // Skip items that are already migrated (have ticker field)
        if (researchItem.ticker) {
          continue;
        }

        // Extract discoveries and create individual items
        if (
          researchItem.newDiscoveries &&
          Array.isArray(researchItem.newDiscoveries)
        ) {
          for (const discovery of researchItem.newDiscoveries) {
            if (discovery.ticker) {
              const timestamp =
                researchItem.timestamp || researchItem.createdAt;
              const tickerItem = {
                // Primary Key (composite)
                PK: `${ITEM_TYPES.AI_RESEARCH}#${discovery.ticker}`,
                SK: timestamp,
                // GSI for ticker queries
                GSI1PK: discovery.ticker,
                GSI1SK: timestamp,
                // Legacy id for backward compatibility
                id: `${ITEM_TYPES.AI_RESEARCH}#${discovery.ticker}#${timestamp}`,
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
                createdAt: researchItem.createdAt || new Date().toISOString(),
                ttl: researchItem.ttl,
              };

              await this.putItem(tickerItem);
              migratedCount++;
            }
          }
        }

        // Update original item to mark as migrated
        researchItem.migratedAt = new Date().toISOString();
        await this.putItem(researchItem);
      }

      this.logger.info(`Migrated ${migratedCount} AI research ticker items`);
    } catch (error) {
      this.logger.error("Failed to migrate AI research data", error);
      throw error;
    }
  }

  /**
   * Migrate AI decisions data from nested to individual items
   */
  async migrateAIDecisions() {
    try {
      this.logger.info("Migrating AI decisions data...");

      // Get all AI decision items
      const decisionItems = await this.scanItemsByType(ITEM_TYPES.AI_DECISION);

      if (decisionItems.length === 0) {
        this.logger.info("No AI decision items to migrate");
        return;
      }

      let migratedCount = 0;

      for (const decisionItem of decisionItems) {
        // Skip items that are already migrated (have ticker field)
        if (decisionItem.ticker) {
          continue;
        }

        // Extract decisions and create individual items
        if (decisionItem.decisions && Array.isArray(decisionItem.decisions)) {
          for (const decision of decisionItem.decisions) {
            if (decision.ticker) {
              const timestamp =
                decisionItem.timestamp || decisionItem.createdAt;
              const tickerItem = {
                // Primary Key (composite)
                PK: `${ITEM_TYPES.AI_DECISION}#${decision.ticker}`,
                SK: timestamp,
                // GSI for ticker queries
                GSI1PK: decision.ticker,
                GSI1SK: timestamp,
                // Legacy id for backward compatibility
                id: `${ITEM_TYPES.AI_DECISION}#${decision.ticker}#${timestamp}`,
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
                createdAt: decisionItem.createdAt || new Date().toISOString(),
                ttl: decisionItem.ttl,
              };

              await this.putItem(tickerItem);
              migratedCount++;
            }
          }
        }

        // Update original item to mark as migrated
        decisionItem.migratedAt = new Date().toISOString();
        await this.putItem(decisionItem);
      }

      this.logger.info(`Migrated ${migratedCount} AI decision ticker items`);
    } catch (error) {
      this.logger.error("Failed to migrate AI decisions data", error);
      throw error;
    }
  }

  /**
   * Migrate market data from nested to individual items
   */
  async migrateMarketData() {
    try {
      this.logger.info("Migrating market data...");

      // Get all market data items
      const marketDataItems = await this.scanItemsByType(
        ITEM_TYPES.MARKET_DATA
      );

      if (marketDataItems.length === 0) {
        this.logger.info("No market data items to migrate");
        return;
      }

      let migratedCount = 0;

      for (const marketDataItem of marketDataItems) {
        // Skip items that are already migrated (have ticker field)
        if (marketDataItem.ticker) {
          continue;
        }

        // Extract market data and create individual items
        if (marketDataItem.data && typeof marketDataItem.data === "object") {
          for (const [ticker, tickerData] of Object.entries(
            marketDataItem.data
          )) {
            const timestamp =
              marketDataItem.timestamp || marketDataItem.createdAt;
            const tickerItem = {
              // Primary Key (composite)
              PK: `${ITEM_TYPES.MARKET_DATA}#${ticker}`,
              SK: timestamp,
              // GSI for ticker queries
              GSI1PK: ticker,
              GSI1SK: timestamp,
              // Legacy id for backward compatibility
              id: `${ITEM_TYPES.MARKET_DATA}#${ticker}#${timestamp}`,
              // Data
              itemType: ITEM_TYPES.MARKET_DATA,
              ticker: ticker,
              timestamp: timestamp,
              source: tickerData.source,
              data: tickerData.data,
              lastUpdated: tickerData.lastUpdated,
              error: tickerData.error,
              createdAt: marketDataItem.createdAt || new Date().toISOString(),
              ttl: marketDataItem.ttl,
            };

            await this.putItem(tickerItem);
            migratedCount++;
          }
        }

        // Update original item to mark as migrated
        marketDataItem.migratedAt = new Date().toISOString();
        await this.putItem(marketDataItem);
      }

      this.logger.info(`Migrated ${migratedCount} market data ticker items`);
    } catch (error) {
      this.logger.error("Failed to migrate market data", error);
      throw error;
    }
  }

  /**
   * Calculate quality score for a discovery (same as AIMemoryService)
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
   * Scan for items by type
   */
  async scanItemsByType(itemType) {
    try {
      const params = {
        TableName: this.tableName,
        FilterExpression: "begins_with(id, :prefix)",
        ExpressionAttributeValues: {
          ":prefix": itemType,
        },
      };

      const result = await this.dynamodb.scan(params).promise();
      return result.Items || [];
    } catch (error) {
      this.logger.error(`Failed to scan items of type ${itemType}`, error);
      return [];
    }
  }

  /**
   * Put item to DynamoDB
   */
  async putItem(item) {
    try {
      const params = {
        TableName: this.tableName,
        Item: item,
      };

      await this.dynamodb.put(params).promise();
    } catch (error) {
      this.logger.error("Failed to put item", error);
      throw error;
    }
  }

  /**
   * Validate migration by checking a few sample items
   */
  async validateMigration() {
    try {
      this.logger.info("Validating migration...");

      // Check if new ticker-based items exist
      const sampleTickers = ["OCUP", "BPTH", "PDSB"];

      for (const ticker of sampleTickers) {
        const researchItems = await this.scanItemsByType(
          `${ITEM_TYPES.AI_RESEARCH}#${ticker}`
        );
        const decisionItems = await this.scanItemsByType(
          `${ITEM_TYPES.AI_DECISION}#${ticker}`
        );
        const marketDataItems = await this.scanItemsByType(
          `${ITEM_TYPES.MARKET_DATA}#${ticker}`
        );

        this.logger.info(`Validation for ${ticker}:`, {
          researchItems: researchItems.length,
          decisionItems: decisionItems.length,
          marketDataItems: marketDataItems.length,
        });
      }
    } catch (error) {
      this.logger.error("Validation failed", error);
    }
  }
}

// Run migration if called directly
if (require.main === module) {
  const migration = new DataMigrationService();

  migration
    .runMigration()
    .then(() => {
      console.log("Migration completed successfully!");
      return migration.validateMigration();
    })
    .then(() => {
      console.log("Migration validation completed!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Migration failed:", error);
      process.exit(1);
    });
}

module.exports = DataMigrationService;
