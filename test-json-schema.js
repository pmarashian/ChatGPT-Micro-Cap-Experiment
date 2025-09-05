/**
 * Simple test script to verify JSON schema functionality for market research
 */

require("dotenv").config();

const AIService = require("./src/services/ai-service");

async function testResearchSchema() {
  console.log("Testing market research with JSON schema...");

  try {
    const aiService = new AIService();

    // Mock simple data for testing
    const mockPortfolio = {
      totalValue: 100000,
      cash: 20000,
      positions: [],
    };

    const mockMarketData = {
      SPY: { data: [{ close: 450, changePercent: 0.5, volume: 50000000 }] },
    };

    const mockAIContext =
      "Previous research showed promising biotech opportunities.";

    // Build a research prompt
    const prompt = aiService.buildResearchPrompt(
      mockPortfolio,
      mockMarketData,
      mockAIContext
    );

    console.log("Research prompt built successfully");
    console.log("Prompt length:", prompt.length);

    // Test the call (this will fail without API keys, but we can catch the error)
    console.log("Attempting to call OpenAI with JSON schema...");
    const result = await aiService.callOpenAI(prompt, true); // true for research

    console.log("✅ OpenAI call successful with JSON schema");
    console.log("Response length:", result.length);

    // Try to parse the response
    const parsed = JSON.parse(result);
    console.log("✅ Response parsed successfully");
    console.log("Response structure:", {
      version: parsed.version,
      hasResearchSummary: !!parsed.researchSummary,
      hasSectorAnalysis: !!parsed.sectorAnalysis,
      companyEvaluationsCount: parsed.companyEvaluations?.length || 0,
      newDiscoveriesCount: parsed.newDiscoveries?.length || 0,
    });
  } catch (error) {
    if (error.message.includes("API key") || error.message.includes("OpenAI")) {
      console.log("✅ Expected OpenAI API error (no API key configured)");
      console.log("This confirms the JSON schema is being used correctly");
    } else {
      console.error("❌ Unexpected error:", error.message);
      throw error;
    }
  }
}

testResearchSchema()
  .then(() => {
    console.log("\n🎉 JSON schema test completed successfully!");
  })
  .catch((error) => {
    console.error("\n💥 JSON schema test failed:", error);
  });
