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
  // New AI memory and research persistence
  AI_RESEARCH: "ai_research",
  AI_DECISION: "ai_decision",
  MARKET_DATA: "market_data",
  PORTFOLIO_CONFIG: "portfolio_config",
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

// Portfolio configuration (stored in DB for easy modification)
const PORTFOLIO_CONFIG = {
  TARGET_POSITIONS: {
    MIN: 8,
    MAX: 12,
    DEFAULT: 10,
  },
  POSITION_SIZING: {
    MAX_PERCENT: 0.12, // 12% of portfolio per position
    MIN_PERCENT: 0.03, // 3% of portfolio per position
    DEFAULT_MAX_PERCENT: 0.12,
  },
  RISK_MANAGEMENT: {
    STOP_LOSS_MIN: 0.2, // 20% below entry
    STOP_LOSS_MAX: 0.3, // 30% below entry
    DEFAULT_STOP_LOSS: 0.25,
  },
  MARKET_DATA_CACHE: {
    TTL_MINUTES: 60, // Cache market data for 1 hour (research pipeline)
    MAX_AGE_HOURS: 24, // Don't use data older than 24 hours
  },
  // Research pipeline configuration
  RESEARCH: {
    FREQUENCY_HOURS: 12, // Research every 12 hours
    MAX_TIMEOUT_SECONDS: 600, // 10 minutes for deep research
    MIN_TIMEOUT_SECONDS: 180, // 3 minutes for trading decisions
    RETENTION_DAYS: {
      RESEARCH: 30, // Keep research for 30 days
      DECISIONS: 90, // Keep decisions for 90 days
      MARKET_DATA: 1, // Keep market data for 1 day
    },
  },
};

// Risk management constants
const RISK_PARAMS = {
  DEFAULT_STOP_LOSS_PERCENTAGE: 0.15, // 15%
  DEFAULT_MAX_POSITION_SIZE: 0.25, // 25% of portfolio
  RISK_FREE_RATE_ANNUAL: 0.045, // 4.5%
};

// AI decision schema validation
const AI_DECISION_SCHEMA = {
  version: "2.0",
  requiredFields: ["version", "generatedAt", "decisions", "researchSummary"],
  decisionFields: [
    "action",
    "ticker",
    "shares",
    "orderType",
    "timeInForce",
    "research",
    "rationale",
  ],
  validActions: ["BUY", "SELL", "HOLD", "RESEARCH"],
  validOrderTypes: ["market", "limit"],
  optionalFields: [
    "newDiscoveries",
    "portfolioStrategy",
    "riskAssessment",
    "nextResearchFocus",
  ],
};

// Error handling constants
const ERROR_TYPES = {
  AI_API_ERROR: "AI_API_ERROR",
  BROKERAGE_API_ERROR: "BROKERAGE_API_ERROR",
  MARKET_DATA_ERROR: "MARKET_DATA_ERROR",
  DYNAMODB_ERROR: "DYNAMODB_ERROR",
  VALIDATION_ERROR: "VALIDATION_ERROR",
};

// Discovery configuration
const DISCOVERY_CONFIG = {
  // Universe building
  MIN_PRICE: 1.0,
  MIN_MARKET_CAP: 50000000, // $50M
  MAX_MARKET_CAP: 500000000, // $500M
  MIN_ADV_USD: 200000, // $200k notional ADV
  MAX_TICKERS_PER_RUN: 150,
  BATCH_SIZE: 25,
  MAX_CONCURRENCY: 4,

  // Evidence and ingestion
  NEWS_MAX_ITEMS_PER_TICKER: 5,
  FUNDAMENTALS_STALE_DAYS: 7,
  NEWS_STALE_HOURS: 24,
  EVIDENCE_TTL_DAYS: 30,

  // Rate limiting (FMP 300 RPM target 250 RPM)
  TARGET_RPM: 250,
  RATE_LIMIT_RESET_MINUTES: 1,
};

// Ranking and scoring configuration
const RANKING_CONFIG = {
  // Composite score weights (must sum to 1.0)
  WEIGHTS: {
    FUNDAMENTALS: 0.45,
    NEWS: 0.25,
    MOMENTUM: 0.25,
    RISK_PENALTY: 0.05,
  },

  // Freshness requirements (days)
  FRESHNESS: {
    MAX_NEWS_AGE_DAYS: 30,
    MAX_FUNDAMENTALS_AGE_DAYS: 90,
  },

  // Maximum items to consider
  MAX_NEWS_ITEMS: 10,

  // Recency decay parameter
  RECENCY: {
    LAMBDA: 0.1, // Lower = slower decay
  },

  // Event type weights (0-1 scale)
  EVENT_WEIGHTS: {
    FDA_APPROVAL: {
      weight: 1.0,
      keywords: ["fda approval", "fda approves", "approved by fda"],
    },
    CRL_NEGATIVE: {
      weight: -1.0,
      keywords: [
        "complete response letter",
        "crl",
        "clinical hold",
        "fails to meet",
        "misses endpoint",
      ],
    },
    POSITIVE_PHASE_3: {
      weight: 0.9,
      keywords: [
        "phase 3",
        "phase iii",
        "meets primary endpoint",
        "statistically significant",
      ],
    },
    POSITIVE_PHASE_2: {
      weight: 0.7,
      keywords: ["phase 2", "phase ii", "meets endpoint", "topline results"],
    },
    BREAKTHROUGH_DESIGNATION: {
      weight: 0.8,
      keywords: ["breakthrough therapy", "breakthrough designation"],
    },
    PARTNERSHIP: {
      weight: 0.6,
      keywords: [
        "collaboration",
        "partnership",
        "licensing agreement",
        "co-development",
      ],
    },
    FINANCING_NON_DILUTIVE: {
      weight: 0.5,
      keywords: ["grant", "milestone payment", "upfront payment"],
    },
    FINANCING_DILUTIVE: {
      weight: 0.2,
      keywords: [
        "registered direct",
        "atm",
        "shelf",
        "public offering",
        "warrant",
      ],
    },
    ENROLLMENT_COMPLETE: {
      weight: 0.4,
      keywords: ["enrollment complete", "first patient dosed"],
    },
    GUIDANCE_EARNINGS: {
      weight: 0.3,
      keywords: [
        "guidance",
        "earnings",
        "q1 results",
        "q2 results",
        "q3 results",
        "q4 results",
      ],
    },
    GENERIC_PR: {
      weight: 0.1,
      keywords: [
        "conference",
        "webcast",
        "investor conference",
        "presentation",
      ],
    },
  },

  // Source quality weights (0-1 scale)
  SOURCE_WEIGHTS: {
    TIER_1: {
      weight: 1.0,
      domains: ["fda.gov", "sec.gov", "clinicaltrials.gov"],
    },
    TIER_2: {
      weight: 0.8,
      domains: ["reuters.com", "bloomberg.com", "wsj.com", "fool.com"],
    },
    TIER_3: {
      weight: 0.5,
      domains: ["globenewswire.com", "prnewswire.com", "businesswire.com"],
    },
    TIER_4: { weight: 0.3, domains: ["benzinga.com", "fmp.news", "yahoo.com"] },
  },

  // Basic sentiment keywords
  SENTIMENT: {
    POSITIVE: [
      "approval",
      "breakthrough",
      "positive",
      "successful",
      "meets",
      "achieves",
      "complete",
      "granted",
    ],
    NEGATIVE: [
      "delay",
      "clinical hold",
      "fails",
      "misses",
      "concerns",
      "warning",
      "recall",
      "going concern",
    ],
  },
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
  DISCOVERY_SERVICE: {
    maxRetries: 3,
    retryDelay: 2000, // 2 seconds
    criticalAfter: 2,
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
  PORTFOLIO_CONFIG,
  RISK_PARAMS,
  AI_DECISION_SCHEMA,
  ERROR_TYPES,
  RETRY_CONFIG,
  MARKET_DATA_SOURCES,
  DISCOVERY_CONFIG,
  RANKING_CONFIG,
};
