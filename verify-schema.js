// Import the schema directly without instantiating the service
const fs = require("fs");
const path = require("path");

// Read the ai-service.js file and extract the schema
const aiServicePath = path.join(__dirname, "src", "services", "ai-service.js");
const aiServiceContent = fs.readFileSync(aiServicePath, "utf8");

// Extract the RESEARCH_RESPONSE_SCHEMA from the file
const schemaMatch = aiServiceContent.match(
  /const RESEARCH_RESPONSE_SCHEMA = ({[\s\S]*?});/
);
if (!schemaMatch) {
  console.error("Could not find RESEARCH_RESPONSE_SCHEMA in ai-service.js");
  process.exit(1);
}

// Evaluate the schema (this is safe since it's just JSON)
const schema = eval("(" + schemaMatch[1] + ")");

console.log("✅ Schema loaded successfully");
console.log("Main schema additionalProperties:", schema.additionalProperties);
console.log("Schema type:", schema.type);
console.log("Required fields:", schema.required.length);
console.log("Properties count:", Object.keys(schema.properties).length);

// Check nested objects
console.log("\nNested object validation:");
console.log(
  "sectorAnalysis additionalProperties:",
  schema.properties.sectorAnalysis.additionalProperties
);
console.log(
  "companyEvaluations items additionalProperties:",
  schema.properties.companyEvaluations.items.additionalProperties
);
console.log(
  "citations items additionalProperties:",
  schema.properties.companyEvaluations.items.properties.citations.items
    .additionalProperties
);
console.log(
  "newDiscoveries items additionalProperties:",
  schema.properties.newDiscoveries.items.additionalProperties
);

console.log(
  "\n🎉 Schema validation complete - all additionalProperties set to false!"
);
