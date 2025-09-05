/**
 * Get Universe Screening Inputs for a Ticker
 * Fetches FMP profile for a given ticker and returns fields used by buildUniverse
 */

const axios = require("axios");
const Logger = require("../../utils/logger");
const ErrorHandler = require("../../utils/error-handler");
const {
  validateEnvironment,
  getEnvConfig,
} = require("../../config/environment");
const { DISCOVERY_CONFIG } = require("../../config/constants");

class GetUniverseScreeningHandler {
  constructor() {
    this.logger = new Logger("get-universe-screening");
    this.errorHandler = new ErrorHandler("get-universe-screening");

    const env = getEnvConfig();
    this.fmpApiKey = env.fmpApiKey;
    this.fmpBaseUrl = "https://financialmodelingprep.com/api/v3";

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
      sectorKeywords: [
        "biotechnology",
        "biotech",
        "biopharma",
        "pharmaceuticals",
        "drug manufacturers",
        "drug manufacturers—specialty & generic",
      ],
      validExchanges: ["NASDAQ", "NYSE", "NYSE American"],
    };
  }

  async fetchFmpProfile(ticker) {
    const url = `${this.fmpBaseUrl}/profile/${encodeURIComponent(
      ticker
    )}?apikey=${this.fmpApiKey}`;
    const response = await axios.get(url, { timeout: 10000 });
    if (
      !response.data ||
      !Array.isArray(response.data) ||
      response.data.length === 0
    ) {
      throw new Error("No profile data returned from FMP");
    }
    return response.data[0];
  }

  mapScreeningFields(profile) {
    // FMP profile fields commonly used:
    // symbol, companyName, price, mktCap, sector, industry, exchangeShortName
    return {
      symbol: profile.symbol,
      companyName:
        profile.companyName || profile.companyName || profile.companyName,
      price:
        typeof profile.price === "number"
          ? profile.price
          : Number(profile.price) || null,
      marketCap: profile.mktCap || profile.marketCap || null,
      sector: profile.sector || null,
      industry: profile.industry || null,
      exchange: profile.exchangeShortName || profile.exchange || null,
      website: profile.website || null,
      description: profile.description || null,
      beta: profile.beta || null,
      volAvg: profile.volAvg || null,
      range: profile.range || null,
      changes: profile.changes || null,
    };
  }

  evaluateAgainstFilters(mapped) {
    const industry = (mapped.industry || "").toLowerCase();
    const sector = (mapped.sector || "").toLowerCase();
    const name = (mapped.companyName || "").toLowerCase();

    const hasBiotechKeyword = this.config.sectorKeywords.some(
      (kw) => industry.includes(kw) || sector.includes(kw) || name.includes(kw)
    );
    const exchangeOk = this.config.validExchanges.includes(mapped.exchange);
    const marketCapOk =
      typeof mapped.marketCap === "number" &&
      mapped.marketCap >= this.config.minMarketCap &&
      mapped.marketCap <= this.config.maxMarketCap;
    const priceOk =
      typeof mapped.price === "number" && mapped.price >= this.config.minPrice;

    return {
      sectorKeywordMatch: hasBiotechKeyword,
      validExchange: exchangeOk,
      marketCapInRange: marketCapOk,
      priceAboveMin: priceOk,
      passesUniverseFilters:
        hasBiotechKeyword && exchangeOk && marketCapOk && priceOk,
    };
  }

  async handle(event) {
    try {
      validateEnvironment();

      const ticker = event.queryStringParameters?.ticker;
      if (!ticker) {
        return this.errorHandler.createErrorResponse(
          new Error("Missing required parameter: ticker"),
          400
        );
      }

      this.logger.info("Fetching FMP profile for screening", { ticker });
      const profile = await this.fetchFmpProfile(ticker);
      const mapped = this.mapScreeningFields(profile);
      const evaluation = this.evaluateAgainstFilters(mapped);

      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
        },
        body: JSON.stringify({
          success: true,
          ticker: mapped.symbol,
          screeningInputs: {
            symbol: mapped.symbol,
            companyName: mapped.companyName,
            marketCap: mapped.marketCap,
            price: mapped.price,
            exchange: mapped.exchange,
            industry: mapped.industry,
            sector: mapped.sector,
          },
          evaluation,
          raw: profile,
        }),
      };
    } catch (error) {
      this.logger.error("Failed to get universe screening inputs", error);
      return this.errorHandler.createErrorResponse(error, 500);
    }
  }
}

module.exports.handler = async (event, context) => {
  const handler = new GetUniverseScreeningHandler();
  return handler.handle(event);
};
