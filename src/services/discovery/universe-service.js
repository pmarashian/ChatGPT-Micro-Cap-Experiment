/**
 * Universe Service
 * Builds daily micro-cap biotech universe using FMP screener with Yahoo validation and ADV approximation
 */

const axios = require("axios");
const Logger = require("../../utils/logger");
const ErrorHandler = require("../../utils/error-handler");
const { getEnvConfig } = require("../../config/environment");
const { DYNAMODB_TABLES, DISCOVERY_CONFIG } = require("../../config/constants");

class UniverseService {
  constructor() {
    this.logger = new Logger("universe-service");
    this.errorHandler = new ErrorHandler("universe-service");
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

    // Yahoo Finance for validation/ADV
    this.yahooBaseUrl = "https://query1.finance.yahoo.com/v8/finance/chart/";

    // Configuration defaults
    this.config = {
      minPrice:
        parseFloat(process.env.UNIVERSE_MIN_PRICE) ||
        DISCOVERY_CONFIG.MIN_PRICE,
      minMarketCap:
        parseFloat(process.env.UNIVERSE_MIN_MARKET_CAP) ||
        DISCOVERY_CONFIG.MIN_MARKET_CAP,
      maxMarketCap:
        parseFloat(process.env.UNIVERSE_MAX_MARKET_CAP) ||
        DISCOVERY_CONFIG.MAX_MARKET_CAP,
      minAdvUsd:
        parseFloat(process.env.UNIVERSE_MIN_ADV_USD) ||
        DISCOVERY_CONFIG.MIN_ADV_USD,
      maxTickersPerRun:
        parseInt(process.env.UNIVERSE_MAX_TICKERS_PER_RUN) ||
        DISCOVERY_CONFIG.MAX_TICKERS_PER_RUN,
      batchSize:
        parseInt(process.env.UNIVERSE_BATCH_SIZE) ||
        DISCOVERY_CONFIG.BATCH_SIZE,
      maxConcurrency:
        parseInt(process.env.UNIVERSE_MAX_CONCURRENCY) ||
        DISCOVERY_CONFIG.MAX_CONCURRENCY,
    };

    // Sector keywords for biotech/pharma filtering
    this.sectorKeywords = [
      "biotechnology",
      "biotech",
      "biopharma",
      "pharmaceuticals",
      "drug manufacturers",
      "drug manufacturers—specialty & generic",
    ];

    // Valid exchanges
    this.validExchanges = ["NASDAQ", "NYSE", "NYSE American"];
  }

  /**
   * Build the daily universe
   * @returns {Promise<Object>} Universe snapshot with tickers and filters
   */
  async buildUniverse() {
    try {
      this.logger.info("Starting daily universe build", this.config);

      // Step 1: Get screener data from FMP
      const screenerData = await this.fetchFMPScreener();
      this.logger.info(
        `Fetched ${screenerData.length} companies from FMP screener`
      );

      // Step 2: Apply filters (sector, market cap, price, exchange)
      const filteredData = this.applyUniverseFilters(screenerData);
      this.logger.info(
        `Applied filters: ${filteredData.length} companies remaining`
      );

      // Step 3: Validate tickers with Yahoo Finance
      const validatedData = await this.validateTickers(filteredData);
      this.logger.info(
        `Validated tickers: ${validatedData.length} valid companies`
      );

      // Step 4: Calculate ADV approximation using Yahoo data
      const advData = await this.calculateADV(validatedData);
      this.logger.info(`Calculated ADV for ${advData.length} companies`);

      // Step 5: Apply ADV filter
      const finalUniverse = this.applyADVFilter(advData);
      this.logger.info(
        `Applied ADV filter: ${finalUniverse.length} companies in final universe`
      );

      // Step 6: Create universe snapshot
      const universeSnapshot = this.createUniverseSnapshot(finalUniverse);

      // Step 7: Persist to DynamoDB
      await this.persistUniverseSnapshot(universeSnapshot);

      this.logger.info("Universe build completed successfully", {
        totalTickers: finalUniverse.length,
        snapshotId: universeSnapshot.id,
      });

      return universeSnapshot;
    } catch (error) {
      this.logger.error("Universe build failed", error);
      throw new Error(`Universe build error: ${error.message}`);
    }
  }

  /**
   * Fetch screener data from FMP
   */
  async fetchFMPScreener() {
    try {
      // Use stock-screener endpoint now that we have Starter plan access
      const url = `${this.fmpBaseUrl}/stock-screener?apikey=${this.fmpApiKey}&marketCapLowerThan=${this.config.maxMarketCap}&marketCapMoreThan=${this.config.minMarketCap}&priceMoreThan=${this.config.minPrice}&limit=10000`;

      this.logger.info("Fetching stock screener data from FMP (Starter plan)", {
        url: url.replace(this.fmpApiKey, "[REDACTED]"),
        filters: {
          minPrice: this.config.minPrice,
          minMarketCap: this.config.minMarketCap,
          maxMarketCap: this.config.maxMarketCap,
        },
      });

      const response = await axios.get(url, {
        timeout: 30000,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });

      if (!response.data || !Array.isArray(response.data)) {
        throw new Error("Invalid response from FMP screener");
      }

      return response.data;
    } catch (error) {
      this.logger.error("Failed to fetch FMP screener data", error);
      throw new Error(`FMP screener fetch error: ${error.message}`);
    }
  }

  /**
   * Apply universe filters (sector, exchange, etc.)
   */
  applyUniverseFilters(companies) {
    return companies.filter((company) => {
      // Filter by sector/industry keywords
      const industry = (company.industry || "").toLowerCase();
      const sector = (company.sector || "").toLowerCase();
      const companyName = (company.companyName || "").toLowerCase();

      const hasBiotechKeyword = this.sectorKeywords.some(
        (keyword) =>
          industry.includes(keyword) ||
          sector.includes(keyword) ||
          companyName.includes(keyword)
      );

      if (!hasBiotechKeyword) return false;

      // Filter by exchange
      if (!this.validExchanges.includes(company.exchangeShortName)) {
        return false;
      }

      // Additional market cap filter (double-check API filtering)
      if (
        company.marketCap < this.config.minMarketCap ||
        company.marketCap > this.config.maxMarketCap
      ) {
        return false;
      }

      // Additional price filter (double-check API filtering)
      if (company.price < this.config.minPrice) {
        return false;
      }

      return true;
    });
  }

  /**
   * Validate tickers using Yahoo Finance
   */
  async validateTickers(companies) {
    const validatedCompanies = [];
    const batches = this.createBatches(companies, this.config.batchSize);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      this.logger.debug(
        `Processing validation batch ${i + 1}/${batches.length} (${
          batch.length
        } tickers)`
      );

      const batchPromises = batch.map(async (company) => {
        try {
          const isValid = await this.validateTickerWithYahoo(company.symbol);
          if (isValid) {
            validatedCompanies.push(company);
          }
        } catch (error) {
          this.logger.warn(
            `Failed to validate ${company.symbol}: ${error.message}`
          );
          // Skip invalid tickers but continue
        }
      });

      await Promise.allSettled(batchPromises);

      // Small delay between batches to be respectful
      if (i < batches.length - 1) {
        await this.sleep(100);
      }
    }

    // Remove duplicates based on symbol
    const uniqueCompanies = this.removeDuplicates(validatedCompanies, "symbol");

    return uniqueCompanies;
  }

  /**
   * Validate single ticker with Yahoo Finance
   */
  async validateTickerWithYahoo(symbol) {
    try {
      const url = `${this.yahooBaseUrl}${symbol}?range=1d&interval=1d&includePrePost=false`;

      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });

      // Check if we got valid data
      if (
        response.data &&
        response.data.chart &&
        response.data.chart.result &&
        response.data.chart.result[0] &&
        response.data.chart.result[0].meta
      ) {
        return true;
      }

      return false;
    } catch (error) {
      this.logger.debug(
        `Yahoo validation failed for ${symbol}: ${error.message}`
      );
      return false;
    }
  }

  /**
   * Calculate ADV approximation using Yahoo Finance 20-day data
   */
  async calculateADV(companies) {
    const advCompanies = [];
    const batches = this.createBatches(companies, this.config.batchSize);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      this.logger.debug(
        `Processing ADV batch ${i + 1}/${batches.length} (${
          batch.length
        } tickers)`
      );

      const batchPromises = batch.map(async (company) => {
        try {
          const adv = await this.calculateTickerADV(company.symbol);
          return {
            ...company,
            advUsd: adv,
            advCalculated: true,
          };
        } catch (error) {
          this.logger.warn(
            `Failed to calculate ADV for ${company.symbol}: ${error.message}`
          );
          return {
            ...company,
            advUsd: null,
            advCalculated: false,
          };
        }
      });

      const batchResults = await Promise.allSettled(batchPromises);
      batchResults.forEach((result) => {
        if (result.status === "fulfilled") {
          advCompanies.push(result.value);
        }
      });

      // Small delay between batches
      if (i < batches.length - 1) {
        await this.sleep(100);
      }
    }

    return advCompanies;
  }

  /**
   * Calculate ADV for single ticker using Yahoo 20-day data
   */
  async calculateTickerADV(symbol) {
    try {
      const url = `${this.yahooBaseUrl}${symbol}?range=1mo&interval=1d&includePrePost=false`;

      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });

      if (
        !response.data ||
        !response.data.chart ||
        !response.data.chart.result ||
        !response.data.chart.result[0]
      ) {
        throw new Error("Invalid Yahoo response");
      }

      const result = response.data.chart.result[0];
      const quotes = result.indicators.quote[0];

      if (!quotes || !quotes.close || !quotes.volume) {
        throw new Error("No quote data available");
      }

      // Get last 20 trading days
      const closes = quotes.close.slice(-20);
      const volumes = quotes.volume.slice(-20);

      // Calculate average volume
      const validData = closes
        .map((close, i) => ({
          close: close,
          volume: volumes[i],
        }))
        .filter((d) => d.close && d.volume && d.close > 0 && d.volume > 0);

      if (validData.length < 5) {
        // Need at least 5 days of data
        throw new Error("Insufficient trading data");
      }

      const avgVolume =
        validData.reduce((sum, d) => sum + d.volume, 0) / validData.length;
      const avgPrice =
        validData.reduce((sum, d) => sum + d.close, 0) / validData.length;

      // ADV = average volume × average price
      const adv = avgVolume * avgPrice;

      return Math.round(adv * 100) / 100; // Round to 2 decimal places
    } catch (error) {
      this.logger.debug(
        `ADV calculation failed for ${symbol}: ${error.message}`
      );
      return null;
    }
  }

  /**
   * Apply ADV filter to companies
   */
  applyADVFilter(companies) {
    return companies.filter((company) => {
      // If ADV was calculated and meets minimum, include
      if (company.advCalculated && company.advUsd >= this.config.minAdvUsd) {
        return true;
      }

      // If ADV couldn't be calculated, skip ADV filter (include the ticker)
      if (!company.advCalculated) {
        this.logger.debug(
          `Skipping ADV filter for ${company.symbol} (no ADV data available)`
        );
        return true;
      }

      // ADV calculated but below minimum
      return false;
    });
  }

  /**
   * Create universe snapshot object
   */
  createUniverseSnapshot(companies) {
    const snapshotDate = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    const snapshotId = `${snapshotDate}_${Date.now()}`;

    return {
      id: snapshotId,
      date: snapshotDate,
      generatedAt: new Date().toISOString(),
      filters: {
        minPrice: this.config.minPrice,
        minMarketCap: this.config.minMarketCap,
        maxMarketCap: this.config.maxMarketCap,
        minAdvUsd: this.config.minAdvUsd,
        sectorKeywords: this.sectorKeywords,
        validExchanges: this.validExchanges,
      },
      tickers: companies.map((company) => ({
        symbol: company.symbol,
        companyName: company.companyName,
        marketCap: company.marketCap,
        price: company.price,
        advUsd: company.advUsd,
        exchange: company.exchangeShortName,
        industry: company.industry,
        sector: company.sector,
      })),
      stats: {
        totalTickers: companies.length,
        avgMarketCap:
          companies.reduce((sum, c) => sum + c.marketCap, 0) / companies.length,
        avgPrice:
          companies.reduce((sum, c) => sum + c.price, 0) / companies.length,
        exchanges: [...new Set(companies.map((c) => c.exchangeShortName))],
      },
      source: "FMP",
    };
  }

  /**
   * Persist universe snapshot to DynamoDB
   */
  async persistUniverseSnapshot(snapshot) {
    try {
      const item = {
        // Primary Key (composite)
        PK: "universe#candidates",
        SK: snapshot.date,
        // GSI for queries (not needed for universe)
        GSI1PK: "UNIVERSE",
        GSI1SK: snapshot.date,
        // Data
        itemType: "universe",
        ...snapshot,
        // TTL: 14 days
        ttl: Math.floor(Date.now() / 1000) + 14 * 24 * 60 * 60,
      };

      const params = {
        TableName: this.tableName,
        Item: item,
      };

      await this.dynamodb.put(params).promise();

      this.logger.info("Universe snapshot persisted", {
        snapshotId: snapshot.id,
        date: snapshot.date,
        tickers: snapshot.tickers.length,
      });
    } catch (error) {
      this.logger.error("Failed to persist universe snapshot", error);
      throw new Error(`Universe persistence error: ${error.message}`);
    }
  }

  /**
   * Get latest universe snapshot
   */
  async getLatestUniverse() {
    try {
      const params = {
        TableName: this.tableName,
        KeyConditionExpression: "PK = :pk",
        ExpressionAttributeValues: {
          ":pk": "universe#candidates",
        },
        // Note: ScanIndexForward removed - query returns items in index order
        Limit: 1,
      };

      const result = await this.dynamodb.query(params).promise();

      if (result.Items && result.Items.length > 0) {
        return result.Items[0];
      }

      return null;
    } catch (error) {
      this.logger.error("Failed to get latest universe", error);
      return null;
    }
  }

  /**
   * Get universe for specific date
   */
  async getUniverseByDate(date) {
    try {
      const params = {
        TableName: this.tableName,
        Key: {
          PK: "universe#candidates",
          SK: date,
        },
      };

      const result = await this.dynamodb.get(params).promise();
      return result.Item || null;
    } catch (error) {
      this.logger.error("Failed to get universe by date", error);
      return null;
    }
  }

  /**
   * Helper: Create batches from array
   */
  createBatches(array, batchSize) {
    const batches = [];
    for (let i = 0; i < array.length; i += batchSize) {
      batches.push(array.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Helper: Remove duplicates from array by key
   */
  removeDuplicates(array, key) {
    const seen = new Set();
    return array.filter((item) => {
      if (seen.has(item[key])) {
        return false;
      }
      seen.add(item[key]);
      return true;
    });
  }

  /**
   * Helper: Sleep for specified milliseconds
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

module.exports = UniverseService;
