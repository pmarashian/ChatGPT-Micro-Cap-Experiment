# ChatGPT Micro-Cap Trading System - Phase 1

## Overview

Phase 1 implements a fully automated Node.js trading system that converts the existing Python-based ChatGPT trading experiment into a serverless AWS architecture. The system operates without manual intervention, using OpenAI GPT-4 for trading decisions and Alpaca for trade execution.

## Architecture

### Core Components

- **AI Service**: OpenAI GPT-4 integration with automated prompt generation
- **Market Data Service**: Yahoo Finance (primary) + Stooq (fallback)
- **Brokerage Service**: Alpaca paper trading API integration
- **Portfolio Service**: DynamoDB-based portfolio management
- **Scheduled Functions**: Automated daily trading cycle
- **REST API**: External access to portfolio data and operations

### AWS Services Used

- **Lambda**: Serverless function execution
- **DynamoDB**: NoSQL database for portfolio/trade data
- **EventBridge**: Scheduled execution triggers
- **API Gateway**: REST API endpoints
- **SES**: Email reporting
- **CloudWatch**: Logging and monitoring

## Quick Start

### Prerequisites

1. **AWS Account** with appropriate permissions
2. **OpenAI API Key** (GPT-4 access)
3. **Alpaca Paper Trading Account** (API credentials)
4. **Node.js 18.x** and npm

### 1. Environment Setup

```bash
# Clone repository (if not already done)
cd /path/to/project

# Install dependencies
npm install

# Copy environment template
cp .env.example .env.production
```

### 2. Configure Environment Variables

Edit `.env.production` with your actual credentials:

```bash
# AI Configuration
AI_PROVIDER=openai
AI_MODEL=gpt-4
AI_API_KEY=sk-your-actual-openai-api-key

# Brokerage (Alpaca paper trading)
ALPACA_KEY_ID=your-alpaca-key-id
ALPACA_SECRET_KEY=your-alpaca-secret-key
ALPACA_BASE_URL=https://paper-api.alpaca.markets

# Email (SES)
SES_REGION=us-east-1
SES_SENDER_EMAIL=your-verified-ses-email@example.com
ADMIN_EMAIL=your-admin-email@example.com

# Execution flags
EXECUTE_TRADES=false  # Set to true for live trading
```

### 3. Deploy to AWS

```bash
# Deploy to production
npm run deploy:production
```

## API Endpoints

Once deployed, the following REST API endpoints are available:

### Portfolio Data

```
GET /api/portfolio
```

Returns current portfolio information including positions, cash balance, and total value.

### Trading History

```
GET /api/trading-history?days=30
```

Returns historical trading activity for the specified number of days.

### System Status

```
GET /api/status
```

Returns system health information including service connectivity and status.

### Update Configuration

```
PUT /api/configuration
Content-Type: application/json

{
  "stopLossPercentage": 0.15,
  "maxPositionSize": 0.25,
  "executeTrades": false
}
```

Updates system configuration parameters.

### Trigger Backtest

```
POST /api/backtest
Content-Type: application/json

{
  "startDate": "2024-01-01",
  "endDate": "2024-01-31",
  "tickers": ["ABEO", "CADL", "CSAI"]
}
```

Triggers a manual backtest (framework placeholder in Phase 1).

## Scheduled Operations

The system runs automated operations on the following schedule (UTC):

- **Daily Trading**: 4:00 PM ET weekdays (`0 16 * * 1-5`)
- **Portfolio Update**: 4:30 PM ET weekdays (`30 16 * * 1-5`)
- **Stop-Loss Monitoring**: Every 15 minutes during market hours (`0,15,30,45 9-16 * * 1-5`)
- **Email Report**: 5:00 PM ET weekdays (`0 17 * * 1-5`)

## Configuration Options

### Risk Management

- `stopLossPercentage`: Default stop-loss percentage (0.15 = 15%)
- `maxPositionSize`: Maximum position size as % of portfolio (0.25 = 25%)
- `executeTrades`: Enable/disable actual trade execution

### AI Configuration

- `aiProvider`: AI service provider (Phase 1: openai only)
- `aiModel`: AI model to use (gpt-4, gpt-4-turbo, gpt-3.5-turbo)

### Email Settings

- `sesSenderEmail`: Verified SES sender email
- `adminEmail`: Email address for reports and alerts

## Development

### Local Testing

```bash
# Install serverless framework globally
npm install -g serverless

# Test locally with serverless offline
serverless offline

# Test individual functions
serverless invoke local -f dailyTrading
```

### Logging

All functions include comprehensive CloudWatch logging. Key log levels:

- **INFO**: Normal operations and important events
- **WARN**: Non-critical issues that should be monitored
- **ERROR**: Critical errors requiring immediate attention

### Error Handling

The system includes:

- Automatic retries with exponential backoff
- Circuit breaker patterns for external APIs
- Email alerts for critical failures
- Graceful degradation when services are unavailable

## Security Considerations

### API Keys

- Store API keys in AWS Systems Manager Parameter Store or Secrets Manager (recommended for production)
- Never commit API keys to version control
- Rotate keys regularly

### AWS Permissions

Required IAM permissions for Lambda execution:

- DynamoDB read/write access
- SES send email permissions
- CloudWatch logging permissions

## Monitoring

### Health Checks

- Use `/api/status` endpoint for system health monitoring
- Monitor CloudWatch logs for errors and performance issues
- Set up CloudWatch alarms for critical metrics

### Performance Metrics

- Function execution time (<5 seconds target)
- API response times
- Error rates and retry counts
- Portfolio value changes

## Troubleshooting

### Common Issues

1. **API Rate Limits**: OpenAI and Alpaca have rate limits

   - Solution: Implement exponential backoff and request throttling

2. **Market Data Unavailable**: Yahoo Finance or Stooq downtime

   - Solution: System automatically falls back to alternative sources

3. **Email Delivery Issues**: SES verification required

   - Solution: Verify sender and recipient email addresses in SES console

4. **DynamoDB Throttling**: High read/write activity
   - Solution: Implement DynamoDB auto-scaling or request higher throughput

### Debug Mode

Set `EXECUTE_TRADES=false` for simulation mode:

- All trading logic runs normally
- No actual trades are placed
- Full logging of intended actions
- Safe for testing and development

## Migration from Python

### Data Migration

The system includes utilities to migrate existing CSV data to DynamoDB:

- Portfolio positions and cash balances
- Historical trading records
- Performance metrics and calculations

### Validation

Compare Python vs Node.js outputs:

- Portfolio calculations
- P&L computations
- Risk metrics (Sharpe, Sortino ratios)
- Trade execution logic

## Phase 1 Limitations

- **Single AI Provider**: OpenAI GPT-4 only (multi-provider in future phases)
- **Paper Trading Only**: Live trading requires additional validation
- **Basic Backtesting**: Framework placeholder (full implementation in later phases)
- **Simple UI**: REST API only (dashboard in Phase 2)

## Support

For issues or questions:

- Check CloudWatch logs for detailed error information
- Use `/api/status` endpoint for system diagnostics
- Review PHASE_1.md for detailed technical specifications

---

**Phase 1 Status**: ✅ Core implementation complete
**Ready for**: Testing and validation
**Next Phase**: Dashboard and advanced analytics
