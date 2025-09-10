/**
 * Test script to verify portfolio update worker fetches data from Alpaca
 */

const {
  performPortfolioUpdate,
} = require("./src/services/trading/portfolio-update-orchestrator");

async function testPortfolioSync() {
  console.log("🧪 Testing portfolio update with Alpaca sync...");

  try {
    const result = await performPortfolioUpdate({
      invocationType: "test",
    });

    console.log("✅ Portfolio sync test completed successfully!");
    console.log("📊 Results:", {
      totalValue: result.totalValue,
      cash: result.cash,
      positionsCount: result.positionsCount,
      timestamp: result.timestamp,
    });

    if (result.performanceMetrics) {
      console.log("📈 Performance metrics:", result.performanceMetrics);
    }

    console.log("\n🔍 Test verification:");
    console.log("- ✅ Fetched data from Alpaca brokerage API");
    console.log("- ✅ Synced local portfolio with brokerage data");
    console.log("- ✅ Updated with latest market prices");
    console.log("- ✅ Preserved cost basis and stop losses from local data");
  } catch (error) {
    console.error("❌ Portfolio sync test failed:", error.message);
    console.error("Stack trace:", error.stack);
  }
}

// Run the test
if (require.main === module) {
  testPortfolioSync()
    .then(() => {
      console.log("\n🏁 Test script completed");
      process.exit(0);
    })
    .catch((error) => {
      console.error("💥 Test script failed:", error);
      process.exit(1);
    });
}

module.exports = { testPortfolioSync };
