#!/usr/bin/env node

/**
 * Data Migration Script
 * Migrates existing CSV data to DynamoDB for Phase 1
 */

const path = require("path");
const DataMigration = require("./src/utils/data-migration");

// Default paths to CSV files
const DEFAULT_PORTFOLIO_CSV = path.join(
  __dirname,
  "Scripts and CSV Files",
  "chatgpt_portfolio_update.csv"
);
const DEFAULT_TRADE_CSV = path.join(
  __dirname,
  "Scripts and CSV Files",
  "chatgpt_trade_log.csv"
);

async function main() {
  try {
    console.log("🚀 Starting ChatGPT Trading System Data Migration");
    console.log("================================================\n");

    const migration = new DataMigration();

    // Use command line arguments or defaults
    const portfolioCsv = process.argv[2] || DEFAULT_PORTFOLIO_CSV;
    const tradeCsv = process.argv[3] || DEFAULT_TRADE_CSV;

    console.log(`📁 Portfolio CSV: ${portfolioCsv}`);
    console.log(`📁 Trade CSV: ${tradeCsv}\n`);

    // Check if files exist
    const fs = require("fs");
    if (!fs.existsSync(portfolioCsv)) {
      console.error(`❌ Portfolio CSV not found: ${portfolioCsv}`);
      process.exit(1);
    }
    if (!fs.existsSync(tradeCsv)) {
      console.error(`❌ Trade CSV not found: ${tradeCsv}`);
      process.exit(1);
    }

    console.log("🔄 Running full migration...");

    const result = await migration.runFullMigration(portfolioCsv, tradeCsv);

    console.log("\n✅ Migration completed successfully!");
    console.log("=====================================");
    console.log(
      `📊 Portfolio migrated: ${result.portfolioMigrated ? "✅" : "❌"}`
    );
    console.log(`📈 Trades migrated: ${result.tradesMigrated}`);
    console.log(
      `💰 Portfolio value: $${
        result.validation.portfolioValue?.toFixed(2) || "0.00"
      }`
    );
    console.log(`📊 Positions: ${result.validation.positionCount}`);
    console.log(`🕒 Completed at: ${result.timestamp}`);

    console.log("\n🎯 Next Steps:");
    console.log("1. Verify data in DynamoDB console");
    console.log("2. Test API endpoints: GET /api/portfolio");
    console.log("3. Run a test trading cycle");
    console.log("4. Monitor CloudWatch logs for any issues");
  } catch (error) {
    console.error("\n❌ Migration failed!");
    console.error("===================");
    console.error(error.message);
    console.error("\nTroubleshooting:");
    console.error("1. Check AWS credentials and permissions");
    console.error("2. Verify CSV file formats");
    console.error("3. Check DynamoDB table exists and is accessible");
    console.error("4. Review CloudWatch logs for detailed errors");

    process.exit(1);
  }
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("\n⚠️  Migration interrupted by user");
  process.exit(0);
});

process.on("unhandledRejection", (error) => {
  console.error("\n💥 Unhandled error:", error);
  process.exit(1);
});

// Run the migration
if (require.main === module) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}

module.exports = { main };
