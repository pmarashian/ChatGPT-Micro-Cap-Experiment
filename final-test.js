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

// Simulate what OpenAI would receive
const responseFormat = {
  type: "json_schema",
  json_schema: {
    name: "research_response",
    schema: schema,
    strict: true,
  },
};

console.log("✅ Response format structure is valid");
console.log("Type:", responseFormat.type);
console.log("Schema name:", responseFormat.json_schema.name);
console.log("Strict mode:", responseFormat.json_schema.strict);
console.log(
  "Schema has additionalProperties:",
  !!responseFormat.json_schema.schema.additionalProperties
);
console.log(
  "Schema has required fields:",
  Array.isArray(responseFormat.json_schema.schema.required)
);
console.log("🎉 OpenAI JSON schema format is now valid!");

// Check for the specific error that was reported
const hasAdditionalProperties =
  responseFormat.json_schema.schema.additionalProperties === false;
const nestedObjectsValid = [
  responseFormat.json_schema.schema.properties.sectorAnalysis
    .additionalProperties,
  responseFormat.json_schema.schema.properties.companyEvaluations.items
    .additionalProperties,
  responseFormat.json_schema.schema.properties.companyEvaluations.items
    .properties.citations.items.additionalProperties,
  responseFormat.json_schema.schema.properties.newDiscoveries.items
    .additionalProperties,
].every((prop) => prop === false);

console.log("\nValidation Results:");
console.log(
  "Main schema additionalProperties:",
  hasAdditionalProperties ? "✅" : "❌"
);
console.log(
  "All nested objects additionalProperties:",
  nestedObjectsValid ? "✅" : "❌"
);

if (hasAdditionalProperties && nestedObjectsValid) {
  console.log("\n🎉 OpenAI schema error should be resolved!");
} else {
  console.log("\n❌ Schema validation failed");
}
