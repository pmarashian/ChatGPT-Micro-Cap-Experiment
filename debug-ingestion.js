#!/usr/bin/env node

/**
 * Debug script for ingestion service issues
 * Tests fundamentals persistence for problematic tickers
 */

require("dotenv").config({ path: ".env.dev" });

const IngestionService = require("./src/services/discovery/ingestion-service");
const axios = require("axios");

async function testFMPDirect(ticker) {
  try {
    const fmpApiKey = process.env.FMP_API_KEY;
    if (!fmpApiKey) {
      console.log("❌ FMP_API_KEY not found in environment variables");
      return;
    }

    const url = `https://financialmodelingprep.com/api/v3/key-metrics/${ticker}?apikey=${fmpApiKey}&limit=1`;
    console.log(
      `🔗 Direct FMP URL: ${url.replace(fmpApiKey, "***API_KEY***")}`
    );

    const response = await axios.get(url, {
      timeout: 30000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    console.log(`📊 Response status: ${response.status}`);
    console.log(`📊 Response data type: ${typeof response.data}`);

    if (Array.isArray(response.data)) {
      console.log(`📊 Response array length: ${response.data.length}`);
      if (response.data.length > 0) {
        console.log(`📊 First item keys:`, Object.keys(response.data[0]));
        console.log(
          `📊 First item sample:`,
          JSON.stringify(response.data[0]).substring(0, 200) + "..."
        );
      }
    } else {
      console.log(`📊 Response data:`, response.data);
    }

    return response.data;
  } catch (error) {
    console.log(`❌ Direct FMP call failed:`, error.message);
    if (error.response) {
      console.log(`   Status: ${error.response.status}`);
      console.log(`   Status Text: ${error.response.statusText}`);
      console.log(`   Response data:`, error.response.data);
    }
    return null;
  }
}

async function debugIngestion() {
  const ingestionService = new IngestionService();

  // Test with some of the failing tickers from the logs
  const testTickers = ["ETON", "ZYBT", "ERAS", "CGEM", "CRVS"];

  console.log("🧪 Starting ingestion debug test...\n");

  for (const ticker of testTickers) {
    console.log(`\n--- Testing ${ticker} ---`);

    try {
      // First test direct FMP API call
      console.log(`🌐 Testing direct FMP API call for ${ticker}...`);
      const directResponse = await testFMPDirect(ticker);

      if (
        !directResponse ||
        (Array.isArray(directResponse) && directResponse.length === 0)
      ) {
        console.log(
          `⏭️  Skipping service test for ${ticker} - no data from FMP`
        );
        continue;
      }

      // Test FMP fetch through service
      console.log(`📡 Testing service fetch for ${ticker}...`);
      const fundamentalsData = await ingestionService.fetchFundamentalsFromFMP(
        ticker
      );

      if (!fundamentalsData) {
        console.log(`❌ No fundamentals data returned for ${ticker}`);
        console.log(`   This could mean:`);
        console.log(`   - Ticker not found in FMP database`);
        console.log(`   - API rate limit exceeded`);
        console.log(`   - API key issues`);
        console.log(`   - Network/connectivity problems`);
        continue;
      }

      console.log(`✅ Fetched fundamentals data for ${ticker}`);
      console.log(`   Symbol: ${fundamentalsData.symbol}`);
      console.log(`   Date: ${fundamentalsData.date}`);
      console.log(`   Calendar Year: ${fundamentalsData.calendarYear}`);
      console.log(
        `   Data size: ${JSON.stringify(fundamentalsData).length} chars`
      );

      // Test persistence
      console.log(`💾 Testing persistence for ${ticker}...`);
      await ingestionService.persistFundamentals(ticker, fundamentalsData);
      console.log(`✅ Successfully persisted fundamentals for ${ticker}`);
    } catch (error) {
      console.log(`❌ Failed to process ${ticker}:`, error.message);

      // Log additional error details
      if (error.message.includes("persist")) {
        console.log("   This is a persistence error");
      } else if (error.message.includes("fetch")) {
        console.log("   This is a fetch error");
      }
    }
  }

  console.log("\n🎯 Debug test completed.");
}

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});

if (require.main === module) {
  debugIngestion().catch((error) => {
    console.error("Debug script failed:", error);
    process.exit(1);
  });
}

module.exports = { debugIngestion };
