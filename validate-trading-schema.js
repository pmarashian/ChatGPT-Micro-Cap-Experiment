const fs = require("fs");
const path = require("path");

// Read the ai-service.js file and extract the schema
const aiServicePath = path.join(__dirname, "src", "services", "ai-service.js");
const aiServiceContent = fs.readFileSync(aiServicePath, "utf8");

// Extract the TRADING_RESPONSE_SCHEMA from the file
const schemaMatch = aiServiceContent.match(
  /const TRADING_RESPONSE_SCHEMA = (\{[\s\S]*?\});/
);
if (!schemaMatch) {
  console.error("Could not find TRADING_RESPONSE_SCHEMA in ai-service.js");
  process.exit(1);
}

// Evaluate the schema
const schema = eval("(" + schemaMatch[1] + ")");

// Function to validate required arrays
function validateRequiredArrays(obj, path = "") {
  const issues = [];

  if (typeof obj === "object" && obj !== null) {
    if (obj.additionalProperties === false && obj.properties) {
      const propertyKeys = Object.keys(obj.properties);
      const requiredKeys = obj.required || [];

      const missingFromRequired = propertyKeys.filter(
        (key) => !requiredKeys.includes(key)
      );
      const extraInRequired = requiredKeys.filter(
        (key) => !propertyKeys.includes(key)
      );

      if (missingFromRequired.length > 0) {
        issues.push(
          `Missing from required at ${path}: ${missingFromRequired.join(", ")}`
        );
      }
      if (extraInRequired.length > 0) {
        issues.push(
          `Extra in required at ${path}: ${extraInRequired.join(", ")}`
        );
      }
    }

    // Recursively check nested objects
    for (const [key, value] of Object.entries(obj)) {
      if (key === "properties" && typeof value === "object") {
        for (const [propKey, propValue] of Object.entries(value)) {
          issues.push(
            ...validateRequiredArrays(
              propValue,
              path ? `${path}.${propKey}` : propKey
            )
          );
        }
      } else if (key === "items" && typeof value === "object") {
        issues.push(...validateRequiredArrays(value, `${path}.items`));
      }
    }
  }

  return issues;
}

// Validate the schema
console.log("🔍 Validating Trading Response JSON Schema...\n");

const requiredIssues = validateRequiredArrays(schema);

if (requiredIssues.length > 0) {
  console.log("❌ Found required array issues:");
  requiredIssues.forEach((issue) => console.log(`   - ${issue}`));
} else {
  console.log("✅ All required arrays are correctly configured");
}

// Check specific nested objects
console.log("\n📋 Trading Schema Details:");

const decisionsProps = Object.keys(
  schema.properties.decisions.items.properties
);
const decisionsRequired = schema.properties.decisions.items.required;
console.log(
  `Decisions - Properties: ${decisionsProps.length}, Required: ${decisionsRequired.length}`
);
console.log(
  `Decisions - All properties in required: ${decisionsProps.every((p) =>
    decisionsRequired.includes(p)
  )}`
);

const tradingNewDiscProps = Object.keys(
  schema.properties.newDiscoveries.items.properties
);
const tradingNewDiscRequired = schema.properties.newDiscoveries.items.required;
console.log(
  `Trading New Discoveries - Properties: ${tradingNewDiscProps.length}, Required: ${tradingNewDiscRequired.length}`
);
console.log(
  `Trading New Discoveries - All properties in required: ${tradingNewDiscProps.every(
    (p) => tradingNewDiscRequired.includes(p)
  )}`
);

console.log(`Main schema additionalProperties: ${schema.additionalProperties}`);
console.log(`Required fields count: ${schema.required.length}`);
console.log(`Properties count: ${Object.keys(schema.properties).length}`);

if (requiredIssues.length === 0) {
  console.log("\n🎉 Trading schema should be compatible with OpenAI!");
} else {
  console.log("\n❌ Trading schema validation failed");
}
