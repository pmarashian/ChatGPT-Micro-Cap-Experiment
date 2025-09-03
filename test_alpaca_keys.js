const axios = require('axios');

// Test Alpaca API keys
async function testAlpacaKeys(apiKey, secretKey, baseUrl) {
  try {
    console.log('🔍 Testing Alpaca API connection...');
    
    const response = await axios.get(`${baseUrl}/account`, {
      headers: {
        'APCA-API-KEY-ID': apiKey,
        'APCA-API-SECRET-KEY': secretKey,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ SUCCESS: Alpaca API keys are valid!');
    console.log('📊 Account Info:', {
      id: response.data.id,
      status: response.data.status,
      cash: response.data.cash,
      equity: response.data.equity
    });
    return true;
    
  } catch (error) {
    console.log('❌ FAILED: Alpaca API authentication error');
    console.log('Error:', error.response?.status, error.response?.statusText);
    console.log('Details:', error.response?.data?.message || error.message);
    return false;
  }
}

// Usage: node test_alpaca_keys.js YOUR_API_KEY YOUR_SECRET_KEY
const [,, apiKey, secretKey] = process.argv;
const baseUrl = 'https://paper-api.alpaca.markets/v2';

if (!apiKey || !secretKey) {
  console.log('Usage: node test_alpaca_keys.js YOUR_API_KEY YOUR_SECRET_KEY');
  process.exit(1);
}

testAlpacaKeys(apiKey, secretKey, baseUrl);
