/**
 * Simple test script to validate tradability functionality
 */

// Load environment variables
require("dotenv").config({ path: ".env.dev" });

const BrokerageService = require("./src/services/brokerage-service");

async function testTradability() {
  console.log("Testing tradability functionality...");

  const brokerageService = new BrokerageService();

  // Test tickers including BPTH
  const testTickers = ["BPTH", "AAPL", "SPY"];

  for (const ticker of testTickers) {
    try {
      console.log(`\nTesting ${ticker}...`);
      const isTradable = await brokerageService.isTradable(ticker);
      console.log(`${ticker} tradable: ${isTradable}`);

      if (ticker === "BPTH" && !isTradable) {
        console.log(
          `✅ ${ticker} correctly identified as non-tradable (expected)`
        );
      } else if ((ticker === "AAPL" || ticker === "SPY") && isTradable) {
        console.log(`✅ ${ticker} correctly identified as tradable (expected)`);
      } else {
        console.log(
          `⚠️  ${ticker} tradability status: ${isTradable} (unexpected)`
        );
      }
    } catch (error) {
      console.log(`❌ Error testing ${ticker}: ${error.message}`);
    }
  }

  console.log("\nTradability test completed!");
}

// Run the test
testTradability().catch(console.error);
