const fs = require("fs");
const path = require("path");

// Read the ai-service.js file and extract the schema
const aiServicePath = path.join(__dirname, "src", "services", "ai-service.js");
const aiServiceContent = fs.readFileSync(aiServicePath, "utf8");

// Extract the RESEARCH_RESPONSE_SCHEMA from the file
const schemaMatch = aiServiceContent.match(
  /const RESEARCH_RESPONSE_SCHEMA = (\{[\s\S]*?\});/
);
if (!schemaMatch) {
  console.error("Could not find RESEARCH_RESPONSE_SCHEMA in ai-service.js");
  process.exit(1);
}

// Evaluate the schema
const schema = eval("(" + schemaMatch[1] + ")");

// Check for any format constraints that might not be supported by OpenAI
function checkForUnsupportedFormats(obj, path = "") {
  const issues = [];

  if (typeof obj === "object" && obj !== null) {
    if (
      obj.format &&
      !["date", "time", "email", "uuid", "hostname", "ipv4", "ipv6"].includes(
        obj.format
      )
    ) {
      issues.push(`Unsupported format "${obj.format}" at ${path}`);
    }

    for (const [key, value] of Object.entries(obj)) {
      issues.push(
        ...checkForUnsupportedFormats(value, path ? `${path}.${key}` : key)
      );
    }
  }

  return issues;
}

// Validate the schema
console.log("🔍 Validating OpenAI JSON Schema compatibility...\n");

const formatIssues = checkForUnsupportedFormats(schema);

if (formatIssues.length > 0) {
  console.log("❌ Found unsupported formats:");
  formatIssues.forEach((issue) => console.log(`   - ${issue}`));
} else {
  console.log("✅ No unsupported formats found");
}

// Check additionalProperties
const hasAdditionalProperties = schema.additionalProperties === false;
const nestedObjectsValid = [
  schema.properties.sectorAnalysis.additionalProperties,
  schema.properties.companyEvaluations.items.additionalProperties,
  schema.properties.companyEvaluations.items.properties.citations.items
    .additionalProperties,
  schema.properties.newDiscoveries.items.additionalProperties,
].every((prop) => prop === false);

console.log("\n📋 Schema Structure Check:");
console.log(
  `Main schema additionalProperties: ${hasAdditionalProperties ? "✅" : "❌"}`
);
console.log(
  `All nested objects additionalProperties: ${nestedObjectsValid ? "✅" : "❌"}`
);
console.log(`Required fields count: ${schema.required.length}`);
console.log(`Properties count: ${Object.keys(schema.properties).length}`);

if (
  formatIssues.length === 0 &&
  hasAdditionalProperties &&
  nestedObjectsValid
) {
  console.log("\n🎉 Schema should be compatible with OpenAI!");
} else {
  console.log("\n❌ Schema validation failed");
}
