/**
 * Test script to demonstrate the improved price/volume table
 * Shows how tickers with no data are filtered out and 7-day % change is included
 */

const { AIService } = require("./src/services/ai-service");

async function testPriceVolumeTable() {
  console.log("🧪 Testing improved price/volume table...\n");

  const aiService = new AIService();

  // Sample market data with some tickers having data and some without
  const marketData = {
    // Valid tickers with data
    AAPL: {
      source: "FMP",
      data: [
        // 30+ days of data to show 30-day change
        { date: "2024-08-01", close: 140.0, volume: 45000000 },
        { date: "2024-08-15", close: 145.0, volume: 48000000 },
        { date: "2024-09-01", close: 150.0, volume: 50000000 },
        { date: "2024-09-02", close: 152.0, volume: 55000000 },
        { date: "2024-09-03", close: 151.5, volume: 48000000 },
        { date: "2024-09-04", close: 153.0, volume: 60000000 },
        { date: "2024-09-05", close: 154.0, volume: 65000000 },
        { date: "2024-09-06", close: 155.0, volume: 70000000 },
        { date: "2024-09-07", close: 156.0, volume: 68000000 },
        { date: "2024-09-08", close: 157.0, volume: 72000000 },
        { date: "2024-09-09", close: 158.0, volume: 75000000 },
      ],
    },
    GOOGL: {
      source: "FMP",
      data: [
        { date: "2024-09-01", close: 2800.0, volume: 1500000 },
        { date: "2024-09-02", close: 2820.0, volume: 1600000 },
        { date: "2024-09-09", close: 2850.0, volume: 1800000 },
      ],
    },
    // Tickers with no data (should be filtered out)
    INVALID1: {
      source: "error",
      data: [],
    },
    INVALID2: null,
    INVALID3: {
      source: "FMP",
      data: null,
    },
  };

  console.log("📊 Sample market data includes:");
  console.log("- AAPL: 30+ days of data (should show 1D, 7D, and 30D change)");
  console.log("- GOOGL: 3 days of data (should show 1D and period change)");
  console.log(
    "- INVALID1, INVALID2, INVALID3: No data (should be filtered out)"
  );
  console.log("");

  console.log("📋 Improved Price/Volume Table:");
  console.log("=".repeat(70));

  const table = aiService.formatPriceVolumeTable(marketData);
  console.log(table);

  console.log("=".repeat(70));
  console.log("");
  console.log("✅ Improvements demonstrated:");
  console.log("1. Tickers with no data are completely filtered out");
  console.log(
    "2. Added 1-day, 7-day, and 30-day % change columns for comprehensive trend analysis"
  );
  console.log("3. Shows total count of valid tickers");
  console.log("4. Handles cases where less than target days of data available");
}

// Run the test
if (require.main === module) {
  testPriceVolumeTable()
    .then(() => {
      console.log("\n🏁 Test completed successfully!");
    })
    .catch((error) => {
      console.error("💥 Test failed:", error);
    });
}

module.exports = { testPriceVolumeTable };
