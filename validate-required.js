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
console.log("🔍 Validating OpenAI JSON Schema required arrays...\n");

const requiredIssues = validateRequiredArrays(schema);

if (requiredIssues.length > 0) {
  console.log("❌ Found required array issues:");
  requiredIssues.forEach((issue) => console.log(`   - ${issue}`));
} else {
  console.log("✅ All required arrays are correctly configured");
}

// Check specific nested objects
console.log("\n📋 Required Array Details:");

const companyEvalProps = Object.keys(
  schema.properties.companyEvaluations.items.properties
);
const companyEvalRequired = schema.properties.companyEvaluations.items.required;
console.log(
  `Company Evaluations - Properties: ${companyEvalProps.length}, Required: ${companyEvalRequired.length}`
);
console.log(
  `Company Evaluations - All properties in required: ${companyEvalProps.every(
    (p) => companyEvalRequired.includes(p)
  )}`
);

const citationsProps = Object.keys(
  schema.properties.companyEvaluations.items.properties.citations.items
    .properties
);
const citationsRequired =
  schema.properties.companyEvaluations.items.properties.citations.items
    .required;
console.log(
  `Citations - Properties: ${citationsProps.length}, Required: ${citationsRequired.length}`
);
console.log(
  `Citations - All properties in required: ${citationsProps.every((p) =>
    citationsRequired.includes(p)
  )}`
);

const newDiscProps = Object.keys(
  schema.properties.newDiscoveries.items.properties
);
const newDiscRequired = schema.properties.newDiscoveries.items.required;
console.log(
  `New Discoveries - Properties: ${newDiscProps.length}, Required: ${newDiscRequired.length}`
);
console.log(
  `New Discoveries - All properties in required: ${newDiscProps.every((p) =>
    newDiscRequired.includes(p)
  )}`
);

if (requiredIssues.length === 0) {
  console.log("\n🎉 Schema should be compatible with OpenAI!");
} else {
  console.log("\n❌ Schema validation failed");
}
