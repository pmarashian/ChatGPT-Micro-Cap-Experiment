/**
 * System constants and configuration values
 */

// DynamoDB table names and keys
const DYNAMODB_TABLES = {
  TRADING_TABLE: process.env.SERVICE_NAME
    ? `${process.env.SERVICE_NAME}-${process.env.STAGE || "dev"}`
    : "chatgpt-trading-phase1-dev",
};

// DynamoDB item types (single-table design)
const ITEM_TYPES = {
  PORTFOLIO: "portfolio",
  TRADE: "trade",
  CONFIG: "config",
};

// Default benchmark tickers (same as Python script)
const DEFAULT_BENCHMARKS = ["IWO", "XBI", "SPY", "IWM"];

// Trading schedule (UTC times)
const SCHEDULES = {
  DAILY_TRADING: "0 16 * * 1-5", // 4 PM ET weekdays
  PORTFOLIO_UPDATE: "30 16 * * 1-5", // 4:30 PM ET weekdays
  STOP_LOSS_SWEEP: "0,15,30,45 9-16 * * 1-5", // Every 15 min 9 AM - 4 PM ET
  EMAIL_REPORT: "0 17 * * 1-5", // 5 PM ET weekdays
};

// Risk management constants
const RISK_PARAMS = {
  DEFAULT_STOP_LOSS_PERCENTAGE: 0.15, // 15%
  DEFAULT_MAX_POSITION_SIZE: 0.25, // 25% of portfolio
  RISK_FREE_RATE_ANNUAL: 0.045, // 4.5%
};

// AI decision schema validation
const AI_DECISION_SCHEMA = {
  version: "1.0",
  requiredFields: ["version", "generatedAt", "decisions"],
  decisionFields: ["action", "ticker", "shares", "orderType", "timeInForce"],
  validActions: ["BUY", "SELL", "HOLD"],
  validOrderTypes: ["market", "limit"],
};

// Error handling constants
const ERROR_TYPES = {
  AI_API_ERROR: "AI_API_ERROR",
  BROKERAGE_API_ERROR: "BROKERAGE_API_ERROR",
  MARKET_DATA_ERROR: "MARKET_DATA_ERROR",
  DYNAMODB_ERROR: "DYNAMODB_ERROR",
  VALIDATION_ERROR: "VALIDATION_ERROR",
};

// Retry configurations
const RETRY_CONFIG = {
  AI_SERVICE: {
    maxRetries: 3,
    retryDelay: 5000, // 5 seconds
    criticalAfter: 1,
  },
  BROKERAGE_SERVICE: {
    maxRetries: 3,
    retryDelay: 2000, // 2 seconds
    criticalAfter: 1,
  },
  MARKET_DATA_SERVICE: {
    maxRetries: 2,
    retryDelay: 1000, // 1 second
    criticalAfter: 3,
  },
};

// Market data sources
const MARKET_DATA_SOURCES = {
  YAHOO: "yahoo",
  STOOQ_PDR: "stooq-pdr",
  STOOQ_CSV: "stooq-csv",
  PROXY: "proxy",
};

module.exports = {
  DYNAMODB_TABLES,
  ITEM_TYPES,
  DEFAULT_BENCHMARKS,
  SCHEDULES,
  RISK_PARAMS,
  AI_DECISION_SCHEMA,
  ERROR_TYPES,
  RETRY_CONFIG,
  MARKET_DATA_SOURCES,
};
