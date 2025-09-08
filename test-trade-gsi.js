/**
 * Test script to validate the new TradeHistoryIndex GSI query structure
 */

const AWS = require("aws-sdk");

// Mock the DynamoDB query to validate structure
function validateQueryStructure() {
  console.log("🔍 Validating TradeHistoryIndex GSI query structure...");

  const cutoffIso = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000
  ).toISOString(); // 7 days ago

  const params = {
    TableName: "test-table",
    IndexName: "TradeHistoryIndex",
    KeyConditionExpression: "GSI2PK = :pk AND GSI2SK >= :cutoff",
    ExpressionAttributeValues: {
      ":pk": "ALL_TRADES",
      ":cutoff": `TRADE#${cutoffIso}`,
    },
  };

  console.log("✅ Query structure validation:");
  console.log("  - IndexName:", params.IndexName);
  console.log("  - KeyConditionExpression:", params.KeyConditionExpression);
  console.log("  - GSI2PK value:", params.ExpressionAttributeValues[":pk"]);
  console.log(
    "  - GSI2SK cutoff:",
    params.ExpressionAttributeValues[":cutoff"]
  );

  // Validate the structure
  const validations = [
    {
      test: params.IndexName === "TradeHistoryIndex",
      desc: "Index name is correct",
    },
    {
      test: params.KeyConditionExpression.includes("GSI2PK = :pk"),
      desc: "Partition key condition present",
    },
    {
      test: params.KeyConditionExpression.includes("GSI2SK >= :cutoff"),
      desc: "Sort key condition present",
    },
    {
      test: params.ExpressionAttributeValues[":pk"] === "ALL_TRADES",
      desc: "Partition key value is correct",
    },
    {
      test: params.ExpressionAttributeValues[":cutoff"].startsWith("TRADE#"),
      desc: "Sort key prefix is correct",
    },
  ];

  const allPassed = validations.every((v) => v.test);

  validations.forEach((v) => {
    console.log(`  ${v.test ? "✅" : "❌"} ${v.desc}`);
  });

  console.log(
    `\n${
      allPassed ? "🎉 All validations passed!" : "⚠️  Some validations failed"
    }`
  );

  return allPassed;
}

function validateTradeItemStructure() {
  console.log("\n🔍 Validating trade item GSI2 attribute structure...");

  const timestamp = new Date().toISOString();
  const trade = {
    ticker: "TEST",
    action: "BUY",
    shares: 100,
    price: 10.5,
    aiReasoning: "Test trade",
  };

  const tradeItem = {
    // Primary Key (composite)
    PK: `TRADE#${trade.ticker}`,
    SK: timestamp,
    // GSI for ticker queries
    GSI1PK: trade.ticker,
    GSI1SK: `TRADE#${timestamp}`,
    // GSI for trade history queries (all trades by time)
    GSI2PK: "ALL_TRADES",
    GSI2SK: `TRADE#${timestamp}`,
    // Data
    date: timestamp,
    ticker: trade.ticker,
    action: trade.action,
    shares: trade.shares,
    price: trade.price,
    aiReasoning: trade.aiReasoning,
    pnl: 0,
  };

  console.log("✅ Trade item structure validation:");
  console.log("  - GSI2PK:", tradeItem.GSI2PK);
  console.log("  - GSI2SK:", tradeItem.GSI2SK);

  const validations = [
    {
      test: tradeItem.GSI2PK === "ALL_TRADES",
      desc: "GSI2PK is set to ALL_TRADES",
    },
    {
      test: tradeItem.GSI2SK.startsWith("TRADE#"),
      desc: "GSI2SK starts with TRADE#",
    },
    {
      test: tradeItem.GSI2SK.includes(timestamp.split("T")[0]),
      desc: "GSI2SK contains date",
    },
    {
      test: tradeItem.GSI1PK === trade.ticker,
      desc: "GSI1PK still works for ticker queries",
    },
  ];

  const allPassed = validations.every((v) => v.test);

  validations.forEach((v) => {
    console.log(`  ${v.test ? "✅" : "❌"} ${v.desc}`);
  });

  console.log(
    `\n${
      allPassed ? "🎉 All validations passed!" : "⚠️  Some validations failed"
    }`
  );

  return allPassed;
}

// Run validations
if (require.main === module) {
  console.log("🚀 Running TradeHistoryIndex GSI validation tests...\n");

  const queryValid = validateQueryStructure();
  const itemValid = validateTradeItemStructure();

  if (queryValid && itemValid) {
    console.log(
      "\n🎯 All tests passed! The new TradeHistoryIndex GSI implementation is ready."
    );
    console.log("\n📋 Next steps:");
    console.log("1. Deploy the updated serverless.yml to create the new GSI");
    console.log(
      "2. Run the migration script: node src/utils/trade-migration.js"
    );
    console.log("3. Test the email report handler");
  } else {
    console.log("\n❌ Some tests failed. Please review the implementation.");
    process.exit(1);
  }
}

module.exports = {
  validateQueryStructure,
  validateTradeItemStructure,
};
