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
];

const optionalEnvVars = ["EXECUTE_TRADES", "STARTING_CASH"];

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

    // Execution flags
    executeTrades: process.env.EXECUTE_TRADES === "true",

    // Starting capital
    startingCash: parseFloat(process.env.STARTING_CASH) || 100.0,
  };
}

module.exports = {
  validateEnvironment,
  getEnvConfig,
};
