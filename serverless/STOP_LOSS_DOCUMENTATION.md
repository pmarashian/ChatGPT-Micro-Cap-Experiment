# Stop-Loss Logic Documentation

## Overview

The stop-loss system is a critical risk management component that automatically monitors portfolio positions and executes sell orders when price targets are breached. It runs as part of the job orchestration system and operates during market hours only.

## Architecture

### Core Components

1. **Stop-Loss Worker** (`src/handlers/workers/stop-loss-worker.js`)

   - Pure business logic wrapper
   - Uses `withJobOrchestratedHandlerLifecycle` for automatic job status tracking
   - Invoked by the job orchestrator

2. **Stop-Loss Orchestrator** (`src/services/trading/stop-loss-orchestrator.js`)

   - Shared business logic for both manual and scheduled execution
   - Contains the core stop-loss monitoring algorithm
   - Handles market data fetching and position evaluation

3. **Portfolio Service** (`src/services/portfolio-service.js`)

   - Provides current portfolio positions
   - Supplies position details including stop-loss levels

4. **Market Data Service** (`src/services/market-data-service.js`)
   - Fetches real-time market data for position evaluation
   - Implements fallback mechanisms for data retrieval

## Stop-Loss Workflow

### 1. Initialization Phase

```javascript
// Check if market is open
const isMarketOpen = await brokerageService.isMarketOpen();
if (!isMarketOpen) {
  // Skip monitoring and log closure
  return { message: "Market is closed" };
}
```

**Why this matters:** Stop-loss orders should only execute during market hours to ensure proper execution and avoid gap-down scenarios.

### 2. Portfolio Retrieval

```javascript
const portfolio = await portfolioService.getCurrentPortfolio();
if (!portfolio.positions || portfolio.positions.length === 0) {
  return { message: "No positions to monitor" };
}
```

**Key considerations:**

- Retrieves all current positions with their stop-loss levels
- Validates portfolio structure before proceeding
- Logs empty portfolio state appropriately

### 3. Market Data Fetching

```javascript
const marketData = await marketDataService.getPortfolioMarketData(portfolio);
```

This triggers a comprehensive data collection process:

#### Market Data Collection Logic

The `getPortfolioMarketData` method collects data for multiple ticker categories:

1. **Portfolio Positions**: All current holdings
2. **Base Benchmarks**: SPY, IWO, XBI, IWM, and micro-cap biotech stocks
3. **Ranked Universe**: Top 50 tickers from latest ranking (prioritized)
4. **AI Discoveries**: Recent AI-researched tickers (fallback)

#### Data Sources (with Fallback)

1. **Primary**: Yahoo Finance API
2. **Fallback**: Stooq CSV API
3. **Error Handling**: Graceful degradation with logging

### 4. Position Evaluation Loop

For each portfolio position:

```javascript
for (const position of portfolio.positions) {
  const ticker = position.ticker;
  const currentPrice =
    marketData[ticker]?.data?.[marketData[ticker].data.length - 1]?.close;
  const stopLossPrice = position.stopLoss;

  // Skip if missing data
  if (!currentPrice || !stopLossPrice) {
    // Log and continue
    continue;
  }

  const shouldTriggerStopLoss = currentPrice <= stopLossPrice;
}
```

**Evaluation Criteria:**

- **Current Price**: Latest closing price from market data
- **Stop-Loss Price**: Pre-configured stop-loss level per position
- **Trigger Condition**: `currentPrice <= stopLossPrice`

### 5. Stop-Loss Execution

When triggered:

```javascript
if (shouldTriggerStopLoss) {
  logInstance.warn(`🚨 Stop-loss triggered for ${ticker}`, {
    currentPrice,
    stopLossPrice,
    buyPrice: position.buyPrice,
    unrealizedPnL: position.unrealizedPnL,
  });

  // Execute stop-loss order via brokerage
  const stopLossOrder = await brokerageService.executeStopLossOrder(position);
  stopLossTriggered++;
}
```

**Execution Details:**

- Immediate market order execution
- Comprehensive logging with position context
- Order tracking with returned order ID

### 6. Monitoring Results

Positions not triggering stop-loss are logged with monitoring status:

```javascript
stopLossResults.push({
  ticker,
  status: "monitored",
  currentPrice,
  stopLossPrice,
  distanceToStop: (
    ((currentPrice - stopLossPrice) / stopLossPrice) *
    100
  ).toFixed(2),
});
```

**Monitoring Metrics:**

- Distance to stop-loss as percentage
- Current price vs stop-loss level
- Historical position data for context

## Understanding the Log Messages

### The Ranked Universe Log Messages

When the stop-loss system runs, you may see these log messages:

```
[UNDEFINED][DEBUG] [ai-memory-service] No ranked universe snapshot found
[UNDEFINED][DEBUG] [ai-memory-service] No ranked universe available, returning empty array
[UNDEFINED][DEBUG] [market-data-service] No ranked universe available, trying AI discoveries
[UNDEFINED][DEBUG] [ai-memory-service] Retrieved 9 research summary items
[UNDEFINED][DEBUG] [market-data-service] Retrieved 0 discovered tickers from AI memory
```

#### Why These Messages Appear

1. **"No ranked universe snapshot found"**

   - The system is looking for the latest universe ranking snapshot
   - This is stored in DynamoDB with PK: "ranked_universe"
   - If no ranking has been performed recently, this will be null

2. **"No ranked universe available, returning empty array"**

   - The `getTopRankedTickers()` method returns an empty array
   - This happens when `getLatestRankedUniverse()` returns null
   - The ranking process hasn't been run yet or failed

3. **"No ranked universe available, trying AI discoveries"**

   - Market data service falls back to AI-discovered tickers
   - This is the expected fallback behavior when ranking is unavailable

4. **"Retrieved 9 research summary items"**

   - AI memory service successfully retrieved recent research
   - These are summary items from previous AI research sessions

5. **"Retrieved 0 discovered tickers from AI memory"**
   - The research summaries don't contain any new ticker discoveries
   - Or the discoveries don't meet the criteria for extraction

#### Why the Ranked Universe Isn't Found

The ranked universe is created by the **universe ranking worker** (`src/handlers/workers/universe-ranking-worker.js`):

```javascript
// The ranking process saves snapshots like this:
await aiMemoryService.saveRankedUniverseSnapshot({
  id: snapshotId,
  date: new Date().toISOString(),
  universeSnapshotId: universeSnapshotId,
  totalTickers: scores.length,
  scores: scores,
  scoringConfig: rankingConfig,
});
```

**Common Reasons for Missing Ranked Universe:**

1. **Ranking hasn't been run yet**

   - The universe ranking job hasn't executed
   - This is scheduled but may not have completed

2. **Ranking job failed**

   - The universe ranking worker encountered an error
   - Check CloudWatch logs for ranking job failures

3. **Job orchestration not initialized**

   - The job initialization API hasn't been called
   - Required: `POST /api/initialize/job-orchestration`

4. **TTL expiration**

   - Ranked snapshots have a 30-day TTL
   - Old snapshots are automatically deleted

5. **Configuration Mismatch Issue** 🔍 **INVESTIGATING**
   - **Symptom**: Ranking completes successfully, but stop-loss can't find the snapshot (even after 1 minute)
   - **Potential Root Causes**:
     - Different Lambda functions using different `SERVICE_NAME` or `TRADING_TABLE_NAME` env vars
     - Different Lambda functions using different `AWS_REGION` settings
     - Jobs running in different environments with different DynamoDB tables
   - **Debugging Added**: Enhanced logging to show table name, region, PK/SK for both save and retrieval operations
   - **Error Fixed**: Resolved "Cannot read properties of undefined (reading 'region')" error in debugging
   - **Next Steps**: Check the enhanced logs to see if table names or regions differ between jobs

#### Resolution Steps

To resolve the ranked universe issue:

1. **Initialize job orchestration:**

   ```bash
   curl -X POST https://your-api/api/initialize/job-orchestration
   ```

2. **Trigger universe ranking manually:**

   ```bash
   curl -X POST https://your-api/api/trigger-universe-ranking
   ```

3. **Check job orchestrator logs:**

   - Verify the universe ranking job is running
   - Look for errors in the ranking process

4. **Verify data flow:**
   - Ensure universe build has completed
   - Check that discoveries exist in AI memory

## Market Data Service Integration

### AI Memory Service Dependency

The market data service depends on the AI memory service for:

1. **Ranked Universe**: Top-performing tickers from latest ranking
2. **AI Discoveries**: Recently researched tickers with high conviction
3. **Research History**: Context for ticker selection

### Fallback Hierarchy

When ranked universe is unavailable:

1. **Primary**: Ranked universe (top 50 tickers)
2. **Fallback 1**: AI discoveries from research
3. **Fallback 2**: Base benchmark tickers only

### Data Enrichment Benefits

Having the ranked universe available provides:

- **Better market coverage**: More comprehensive price monitoring
- **Quality focus**: Prioritizes high-conviction opportunities
- **Performance tracking**: Links to ranking algorithm results

## Error Handling & Resilience

### Position-Level Error Handling

```javascript
try {
  // Stop-loss evaluation for single position
} catch (positionError) {
  logInstance.error(
    `Error monitoring stop-loss for ${position.ticker}`,
    positionError
  );
  // Continue with other positions
}
```

**Benefits:**

- Individual position failures don't stop the entire process
- Comprehensive error logging per position
- Process continues for healthy positions

### Service-Level Error Handling

```javascript
try {
  // Complete stop-loss monitoring process
} catch (error) {
  // Send error alert via configured handler
  await errorHandlerInstance.sendErrorAlert(error, {
    function: "stop-loss-monitoring",
    operation: "stop_loss_monitoring",
  });
}
```

**Error Recovery:**

- Automatic alert notifications
- Detailed error context logging
- Graceful degradation where possible

## Monitoring & Alerting

### Success Metrics

- **Positions Monitored**: Total positions evaluated
- **Stop-Losses Triggered**: Number of protective sells executed
- **Results Breakdown**: Detailed per-position outcomes

### Log Levels Used

- **INFO**: Major process milestones
- **WARN**: Stop-loss triggers (expected business events)
- **ERROR**: System failures requiring attention
- **DEBUG**: Detailed operational data (can be filtered)

## Configuration & Customization

### Stop-Loss Levels

Stop-loss levels are set per-position and stored in the portfolio:

```javascript
position.stopLoss = calculatedStopLossPrice;
```

**Common Strategies:**

- Fixed percentage below entry price
- Volatility-based (ATR-based stops)
- Support level stops
- Time-based trailing stops

### Market Hours Validation

```javascript
const isMarketOpen = await brokerageService.isMarketOpen();
```

**Market Hours Logic:**

- Validates against Alpaca's market calendar
- Considers holidays and early closures
- Prevents execution during off-hours

## Performance Considerations

### Concurrent Processing

- Market data fetching uses `Promise.allSettled()` for parallel requests
- Individual position failures don't block others
- Efficient batch processing of multiple tickers

### Memory Management

- Large market data sets are processed in chunks
- Individual position data is scoped to evaluation loop
- No persistent state maintained between runs

## Testing & Validation

### Manual Testing

The stop-loss system can be triggered manually:

```bash
curl -X POST https://your-api/api/trigger-stop-loss
```

### Automated Testing

- Scheduled execution via job orchestrator
- Runs during market hours only
- Comprehensive logging for audit trails

## Best Practices

1. **Regular Monitoring**: Review stop-loss execution logs daily
2. **Position Sizing**: Ensure stop-loss levels align with risk tolerance
3. **Market Conditions**: Consider volatility when setting stop levels
4. **Alert Configuration**: Set up notifications for stop-loss executions
5. **Testing**: Regularly test with paper trading before live execution

## Troubleshooting

### Common Issues

1. **No Positions Found**

   - Check portfolio service connectivity
   - Verify portfolio data exists in database

2. **Missing Market Data**

   - Check Yahoo Finance API availability
   - Verify Stooq fallback is working

3. **Stop-Loss Not Triggering**

   - Verify stop-loss levels are set correctly
   - Check market data accuracy
   - Confirm market hours validation

4. **Job Orchestration Issues**
   - Ensure job initialization has been completed
   - Check CloudWatch logs for orchestration errors

### Debug Commands

```bash
# Check recent stop-loss executions
aws logs filter-log-events --log-group-name /aws/lambda/stop-loss-worker

# Verify portfolio data
aws dynamodb scan --table-name trading-table --filter-expression "PK = :pk"
```

## Future Enhancements

### Planned Improvements

1. **Dynamic Stop-Loss**: Adjust stop levels based on volatility
2. **Partial Position Sales**: Sell portions instead of full positions
3. **Time-Based Stops**: Trailing stops with time decay
4. **Risk-Adjusted Levels**: Position size influences stop distance

This documentation provides a comprehensive understanding of the stop-loss system's operation, troubleshooting guidance, and the root cause of the ranked universe log messages.
