# DynamoDB Data Restructuring: Ticker-Based Queries

## Overview

This document describes the restructuring of DynamoDB data to enable efficient querying by ticker symbol. Previously, AI research, decisions, and market data were stored as nested objects within single items. Now, each ticker has its own individual items for better query performance.

## Problem Solved

**Before:** Nested data structure made it difficult to query all actions/decisions/research for a specific ticker

```javascript
// Old structure - single item with nested data
{
  id: "ai_research",
  newDiscoveries: [
    { ticker: "OCUP", companyName: "Ocuphire Pharma", ... },
    { ticker: "BPTH", companyName: "Bio-Path Holdings", ... },
    // ... many more
  ]
}
```

**After:** Individual items per ticker for efficient querying

```javascript
// New structure - individual items per ticker
[
  {
    id: "ai_research#OCUP#2024-01-15T10:30:00Z",
    itemType: "ai_research",
    ticker: "OCUP",
    companyName: "Ocuphire Pharma",
    // ... other research data
  },
  {
    id: "ai_research#BPTH#2024-01-15T10:30:00Z",
    itemType: "ai_research",
    ticker: "BPTH",
    companyName: "Bio-Path Holdings",
    // ... other research data
  },
];
```

## New Data Structure

### Item ID Format

- **AI Research:** `ai_research#{ticker}#{timestamp}`
- **AI Decisions:** `ai_decision#{ticker}#{timestamp}`
- **Market Data:** `market_data#{ticker}#{timestamp}`

### New Query Methods

#### Individual Ticker Queries

```javascript
// Get all research for a specific ticker
const research = await memoryService.getTickerResearch("OCUP", 10);

// Get all decisions for a specific ticker
const decisions = await memoryService.getTickerDecisions("OCUP", 20);

// Get all market data for a specific ticker
const marketData = await memoryService.getTickerMarketData("OCUP", 5);

// Get all trades for a specific ticker
const trades = await memoryService.getTickerTrades("OCUP", 50);
```

#### Complete Ticker History

```javascript
// Get complete history for a ticker (all data types)
const history = await memoryService.getCompleteTickerHistory("OCUP");
console.log(history.summary);
// Output: {
//   totalResearchItems: 5,
//   totalDecisions: 12,
//   totalMarketDataPoints: 8,
//   totalTrades: 3
// }
```

## API Endpoints

### Get Ticker History

**Endpoint:** `GET /api/ticker-history?ticker={TICKER}&includeTrades=true`

**Example:**

```bash
curl "https://your-api.com/api/ticker-history?ticker=OCUP&includeTrades=true"
```

**Response:**

```json
{
  "success": true,
  "data": {
    "ticker": "OCUP",
    "research": [...],
    "decisions": [...],
    "marketData": [...],
    "trades": [...],
    "summary": {
      "totalResearchItems": 5,
      "totalDecisions": 12,
      "totalMarketDataPoints": 8,
      "totalTrades": 3
    },
    "performanceMetrics": {
      "decisionBreakdown": { "BUY": 8, "SELL": 2, "HOLD": 2 },
      "averageConfidence": 0.78,
      "lastResearchDate": "2024-01-15T10:30:00Z",
      "lastDecisionDate": "2024-01-15T14:45:00Z",
      "lastMarketDataDate": "2024-01-15T16:00:00Z"
    }
  }
}
```

## Migration Process

### Running the Migration

```bash
# Run migration to convert existing nested data
node migrate-dynamodb-data.js
```

### What the Migration Does

1. **Scans existing nested items** for AI research, decisions, and market data
2. **Creates individual ticker items** for each discovery/decision/market data point
3. **Preserves original items** with a `migratedAt` timestamp
4. **Maintains backward compatibility** for existing services

### Migration Safety

- ✅ **Non-destructive**: Original data is preserved
- ✅ **Idempotent**: Can be run multiple times safely
- ✅ **Backward compatible**: Existing services continue to work
- ✅ **Performance**: New queries are much faster for ticker-specific data

## Testing

### Run Query Tests

```bash
# Test the new ticker query functionality
node test-ticker-queries.js
```

### Test API Endpoints

```bash
# Test the new API endpoint
curl "http://localhost:3001/api/ticker-history?ticker=OCUP"
```

## Benefits

### Performance Improvements

- **Faster queries**: Direct ticker-based queries instead of scanning nested data
- **Reduced data transfer**: Only fetch data for requested tickers
- **Better indexing**: DynamoDB can optimize for ticker-based access patterns

### Enhanced Functionality

- **Real-time analytics**: Easy to get complete ticker history
- **Performance tracking**: Better insights into individual ticker performance
- **Decision analysis**: Analyze all decisions made for specific tickers

### Scalability

- **Horizontal scaling**: Individual items scale better than large nested objects
- **Query optimization**: Better support for GSI (Global Secondary Index) patterns
- **Caching efficiency**: Smaller, more focused items for caching strategies

## Implementation Details

### Key Changes Made

1. **AIMemoryService Updates:**

   - Modified `saveAIResearch()`, `saveAIDecisions()`, `saveMarketData()`
   - Added `saveTickerResearchItems()`, `saveTickerDecisionItems()`, `saveTickerMarketDataItems()`
   - Added query methods: `getTickerResearch()`, `getTickerDecisions()`, etc.

2. **New API Handler:**

   - Created `get-ticker-history.js` handler
   - Added `/api/ticker-history` endpoint to serverless.yml

3. **Migration Script:**

   - Created `migrate-dynamodb-data.js` for data conversion
   - Handles existing data migration safely

4. **Test Scripts:**
   - Created `test-ticker-queries.js` for functionality testing

### Backward Compatibility

All existing services continue to work without modification:

- `getRecentResearch()` still returns summary items
- `getRecentDecisions()` still returns summary items
- `buildAIContext()` still works with summary data
- `getDiscoveredTickersWithQuality()` still works

### Data Integrity

- All original data is preserved
- TTL (Time To Live) settings maintained
- Quality scores and metadata preserved
- Timestamps and versioning maintained

## Usage Examples

### Get All Research for OCUP

```javascript
const research = await memoryService.getTickerResearch("OCUP");
research.forEach((item) => {
  console.log(`${item.timestamp}: ${item.researchNotes}`);
});
```

### Get Trading Performance for BPTH

```javascript
const history = await memoryService.getCompleteTickerHistory("BPTH");
console.log(`Total trades: ${history.trades.length}`);
console.log(`Win rate: ${history.performanceMetrics?.tradeMetrics?.winRate}%`);
```

### Get Latest Market Data for Multiple Tickers

```javascript
const tickers = ["OCUP", "BPTH", "PDSB"];
for (const ticker of tickers) {
  const marketData = await memoryService.getTickerMarketData(ticker, 1);
  if (marketData.length > 0) {
    console.log(
      `${ticker}: $${marketData[0].data.close} (${marketData[0].data.changePercent}%)`
    );
  }
}
```

## Future Enhancements

### Potential GSI Implementation

```javascript
// Global Secondary Index on ticker for even faster queries
{
  IndexName: "TickerIndex",
  KeySchema: [
    { AttributeName: "ticker", KeyType: "HASH" },
    { AttributeName: "timestamp", KeyType: "RANGE" }
  ]
}
```

### Analytics Dashboard

- Real-time ticker performance tracking
- Decision success rate analysis
- Market data correlation studies

### Advanced Queries

- Query by date ranges: `getTickerDecisions(ticker, { startDate, endDate })`
- Query by action type: `getTickerDecisions(ticker, { action: "BUY" })`
- Query by confidence level: `getTickerDecisions(ticker, { minConfidence: 0.8 })`
