/**
 * Test Email Script
 * Tests the email sending functionality via API endpoint
 */

const axios = require("axios");

// Configuration
const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:3001"; // For local testing
// const API_BASE_URL = 'https://your-api-gateway-url.amazonaws.com/dev'; // For deployed

/**
 * Test the email sending endpoint
 */
async function testEmailEndpoint(recipient = null) {
  try {
    console.log("🚀 Testing Email Endpoint...");

    const url = `${API_BASE_URL}/api/test-email`;
    const params = recipient ? { recipient } : {};

    console.log(
      `📧 Sending test email${
        recipient ? ` to: ${recipient}` : " (using default admin email)"
      }`
    );
    console.log(`🌐 URL: ${url}`);

    const response = await axios.post(
      url,
      {},
      {
        params,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    console.log("✅ Test email sent successfully!");
    console.log("📊 Response:", {
      status: response.status,
      messageId: response.data.details?.messageId,
      recipient: response.data.details?.recipient,
      sender: response.data.details?.sender,
      timestamp: response.data.details?.timestamp,
    });

    return response.data;
  } catch (error) {
    console.error("❌ Failed to send test email:");
    if (error.response) {
      console.error("Response:", error.response.data);
      console.error("Status:", error.response.status);
    } else {
      console.error("Error:", error.message);
    }
    throw error;
  }
}

/**
 * Test with different scenarios
 */
async function runComprehensiveTest() {
  console.log("🧪 Running Comprehensive Email Tests...\n");

  try {
    // Test 1: Default admin email
    console.log("Test 1: Sending to default admin email");
    await testEmailEndpoint();
    console.log("");

    // Test 2: Custom recipient (if provided)
    if (process.argv[2]) {
      console.log("Test 2: Sending to custom recipient");
      await testEmailEndpoint(process.argv[2]);
      console.log("");
    }

    console.log("🎉 All email tests completed successfully!");
  } catch (error) {
    console.error("💥 Email testing failed:", error.message);
    process.exit(1);
  }
}

// Usage examples
if (require.main === module) {
  console.log(`
📧 Email Testing Script
=======================

Usage:
  node test-email.js                    # Test with default admin email
  node test-email.js your@email.com     # Test with custom recipient

Environment:
  API_BASE_URL: ${API_BASE_URL}
  Default recipient: From ADMIN_EMAIL env var

Examples:
  # Local testing
  npm run offline
  node test-email.js

  # Deployed testing
  export API_BASE_URL=https://your-api-id.execute-api.us-east-1.amazonaws.com/dev
  node test-email.js your@email.com
`);

  if (process.argv.length > 2 && process.argv[2] === "--help") {
    return;
  }

  runComprehensiveTest();
}

module.exports = {
  testEmailEndpoint,
  runComprehensiveTest,
};
