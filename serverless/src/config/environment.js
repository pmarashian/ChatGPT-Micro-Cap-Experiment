/**
 * Environment variable configuration
 * Loads and validates required environment variables
 */

const requiredEnvVars = [
  "AI_PROVIDER",
  "AI_MODEL",
  "AI_API_KEY",
  "ALPACA_KEY_ID",
  "ALPACA_SECRET_KEY",
  "ALPACA_BASE_URL",
  "SES_REGION",
  "SES_SENDER_EMAIL",
  "ADMIN_EMAIL",
  "FMP_API_KEY",
];

function validateEnvironment() {
  const missing = requiredEnvVars.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`
    );
  }
}

function getEnvConfig() {
  return {
    // AI Configuration
    aiProvider: process.env.AI_PROVIDER,
    aiModel: process.env.AI_MODEL,
    aiApiKey: process.env.AI_API_KEY,

    // Brokerage Configuration
    alpacaKeyId: process.env.ALPACA_KEY_ID,
    alpacaSecretKey: process.env.ALPACA_SECRET_KEY,
    alpacaBaseUrl: process.env.ALPACA_BASE_URL,

    // Email Configuration
    sesRegion: process.env.SES_REGION,
    sesSenderEmail: process.env.SES_SENDER_EMAIL,
    adminEmail: process.env.ADMIN_EMAIL,

    // FMP Configuration
    fmpApiKey: process.env.FMP_API_KEY,

    // Execution flags
    executeTrades: process.env.EXECUTE_TRADES === "true",

    // Starting capital
    startingCash: parseFloat(process.env.STARTING_CASH) || 100.0,

    // Discovery tunables (with defaults)
    discovery: {
      minPrice: parseFloat(process.env.UNIVERSE_MIN_PRICE) || 1.0,
      minMarketCap: parseFloat(process.env.UNIVERSE_MIN_MARKET_CAP) || 50000000,
      maxMarketCap:
        parseFloat(process.env.UNIVERSE_MAX_MARKET_CAP) || 500000000,
      minAdvUsd: parseFloat(process.env.UNIVERSE_MIN_ADV_USD) || 200000,
      maxTickersPerRun:
        parseInt(process.env.UNIVERSE_MAX_TICKERS_PER_RUN) || 150,
      batchSize: parseInt(process.env.UNIVERSE_BATCH_SIZE) || 25,
      maxConcurrency: parseInt(process.env.DISCOVERY_MAX_CONCURRENCY) || 4,
      newsMaxItemsPerTicker:
        parseInt(process.env.NEWS_MAX_ITEMS_PER_TICKER) || 5,
    },
  };
}

module.exports = {
  validateEnvironment,
  getEnvConfig,
};
