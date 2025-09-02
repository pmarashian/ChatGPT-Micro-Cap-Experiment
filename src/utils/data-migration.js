/**
 * Data Migration Utility
 * Migrates existing CSV data to DynamoDB for Phase 1
 */

const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");
const AWS = require("aws-sdk");
const Logger = require("./logger");

class DataMigration {
  constructor() {
    this.logger = new Logger("data-migration");
    this.dynamodb = new AWS.DynamoDB.DocumentClient({
      region: process.env.AWS_REGION || "us-east-1",
    });
    this.tableName = process.env.TRADING_TABLE_NAME || "TradingTable";
  }

  /**
   * Migrate portfolio data from CSV to DynamoDB
   */
  async migratePortfolioData(csvPath) {
    try {
      this.logger.info("Starting portfolio data migration", { csvPath });

      const portfolioData = await this.parsePortfolioCSV(csvPath);
      const portfolioItem = this.transformPortfolioData(portfolioData);

      await this.saveToDynamoDB(portfolioItem);

      this.logger.info("Portfolio data migration completed", {
        totalValue: portfolioItem.totalValue,
        positionCount: portfolioItem.positions.length,
      });

      return portfolioItem;
    } catch (error) {
      this.logger.error("Portfolio data migration failed", error);
      throw error;
    }
  }

  /**
   * Migrate trade history from CSV to DynamoDB
   */
  async migrateTradeData(csvPath) {
    try {
      this.logger.info("Starting trade data migration", { csvPath });

      const tradeData = await this.parseTradeCSV(csvPath);
      const tradeItems = this.transformTradeData(tradeData);

      let migratedCount = 0;
      for (const tradeItem of tradeItems) {
        await this.saveToDynamoDB(tradeItem);
        migratedCount++;
      }

      this.logger.info("Trade data migration completed", {
        migratedTrades: migratedCount,
      });

      return { migratedCount, totalTrades: tradeItems.length };
    } catch (error) {
      this.logger.error("Trade data migration failed", error);
      throw error;
    }
  }

  /**
   * Parse portfolio CSV file
   */
  async parsePortfolioCSV(csvPath) {
    return new Promise((resolve, reject) => {
      const results = [];
      const filePath = path.resolve(csvPath);

      if (!fs.existsSync(filePath)) {
        reject(new Error(`Portfolio CSV file not found: ${filePath}`));
        return;
      }

      fs.createReadStream(filePath)
        .pipe(csv())
        .on("data", (data) => results.push(data))
        .on("end", () => {
          this.logger.debug(`Parsed ${results.length} portfolio records`);
          resolve(results);
        })
        .on("error", reject);
    });
  }

  /**
   * Parse trade CSV file
   */
  async parseTradeCSV(csvPath) {
    return new Promise((resolve, reject) => {
      const results = [];
      const filePath = path.resolve(csvPath);

      if (!fs.existsSync(filePath)) {
        reject(new Error(`Trade CSV file not found: ${filePath}`));
        return;
      }

      fs.createReadStream(filePath)
        .pipe(csv())
        .on("data", (data) => results.push(data))
        .on("end", () => {
          this.logger.debug(`Parsed ${results.length} trade records`);
          resolve(results);
        })
        .on("error", reject);
    });
  }

  /**
   * Transform portfolio CSV data to DynamoDB format
   */
  transformPortfolioData(csvData) {
    // Find the most recent TOTAL row
    const totalRows = csvData.filter((row) => row.Ticker === "TOTAL");
    const latestTotal = totalRows.sort(
      (a, b) => new Date(b.Date) - new Date(a.Date)
    )[0];

    if (!latestTotal) {
      throw new Error("No TOTAL row found in portfolio CSV");
    }

    // Extract positions (non-TOTAL rows from latest date)
    const latestDate = latestTotal.Date;
    const positionRows = csvData.filter(
      (row) =>
        row.Date === latestDate &&
        row.Ticker !== "TOTAL" &&
        row.Ticker !== "" &&
        parseFloat(row.Shares || 0) > 0
    );

    const positions = positionRows.map((row) => ({
      ticker: row.Ticker,
      shares: parseFloat(row.Shares || 0),
      buyPrice: parseFloat(row["Buy Price"] || 0),
      costBasis: parseFloat(row["Cost Basis"] || 0),
      stopLoss: parseFloat(row["Stop Loss"] || 0) || null,
      currentPrice: parseFloat(row["Current Price"] || 0),
      marketValue: parseFloat(row["Total Value"] || 0),
      unrealizedPnL: parseFloat(row.PnL || 0),
      unrealizedPnLPercent: 0, // Will be calculated
    }));

    // Calculate P&L percentages
    positions.forEach((position) => {
      if (position.costBasis > 0) {
        position.unrealizedPnLPercent =
          (position.unrealizedPnL / position.costBasis) * 100;
      }
    });

    const portfolioItem = {
      id: "portfolio",
      totalValue: parseFloat(latestTotal["Total Equity"] || 0),
      cash: parseFloat(latestTotal["Cash Balance"] || 0),
      equity: parseFloat(latestTotal["Total Value"] || 0),
      positions: positions,
      lastUpdated: new Date().toISOString(),
      migratedFrom: "csv",
      migrationDate: new Date().toISOString(),
    };

    return portfolioItem;
  }

  /**
   * Transform trade CSV data to DynamoDB format
   */
  transformTradeData(csvData) {
    return csvData
      .map((row, index) => {
        const tradeItem = {
          id: `trade#${row.Date || "unknown"}#${index
            .toString()
            .padStart(3, "0")}`,
          date: row.Date || new Date().toISOString().split("T")[0],
          ticker: row.Ticker || "",
          action: this.inferAction(row),
          shares: parseFloat(row["Shares Bought"] || row["Shares Sold"] || 0),
          price: parseFloat(row["Buy Price"] || row["Sell Price"] || 0),
          aiReasoning: row.Reason || "Migrated from CSV",
          pnl: parseFloat(row.PnL || 0),
          migratedFrom: "csv",
          migrationDate: new Date().toISOString(),
        };

        return tradeItem;
      })
      .filter((trade) => trade.ticker && trade.shares > 0);
  }

  /**
   * Infer trade action from CSV data
   */
  inferAction(row) {
    if (row["Shares Bought"] && parseFloat(row["Shares Bought"]) > 0) {
      return "BUY";
    }
    if (row["Shares Sold"] && parseFloat(row["Shares Sold"]) > 0) {
      return "SELL";
    }
    return "UNKNOWN";
  }

  /**
   * Save item to DynamoDB
   */
  async saveToDynamoDB(item) {
    const params = {
      TableName: this.tableName,
      Item: item,
    };

    await this.dynamodb.put(params).promise();
    this.logger.debug(`Saved item to DynamoDB: ${item.id}`);
  }

  /**
   * Validate migration results
   */
  async validateMigration() {
    try {
      this.logger.info("Validating data migration");

      // Check portfolio data
      const portfolioResult = await this.dynamodb
        .get({
          TableName: this.tableName,
          Key: { id: "portfolio" },
        })
        .promise();

      if (!portfolioResult.Item) {
        throw new Error("Portfolio data not found after migration");
      }

      // Count trade records
      const tradeResult = await this.dynamodb
        .scan({
          TableName: this.tableName,
          FilterExpression: "begins_with(id, :prefix)",
          ExpressionAttributeValues: {
            ":prefix": "trade#",
          },
        })
        .promise();

      const validation = {
        portfolioMigrated: !!portfolioResult.Item,
        tradeRecordsMigrated: tradeResult.Items.length,
        portfolioValue: portfolioResult.Item.totalValue,
        positionCount: portfolioResult.Item.positions?.length || 0,
        validationTimestamp: new Date().toISOString(),
      };

      this.logger.info("Migration validation completed", validation);
      return validation;
    } catch (error) {
      this.logger.error("Migration validation failed", error);
      throw error;
    }
  }

  /**
   * Run complete migration process
   */
  async runFullMigration(portfolioCsvPath, tradeCsvPath) {
    try {
      this.logger.info("Starting full data migration process");

      // Migrate portfolio data
      const portfolioResult = await this.migratePortfolioData(portfolioCsvPath);

      // Migrate trade data
      const tradeResult = await this.migrateTradeData(tradeCsvPath);

      // Validate migration
      const validation = await this.validateMigration();

      const summary = {
        status: "completed",
        portfolioMigrated: true,
        tradesMigrated: tradeResult.migratedCount,
        validation,
        timestamp: new Date().toISOString(),
      };

      this.logger.info("Full migration process completed", summary);
      return summary;
    } catch (error) {
      this.logger.error("Full migration process failed", error);
      throw error;
    }
  }
}

module.exports = DataMigration;
