# 🚀 Local Development with Serverless Offline

This guide shows how to run the ChatGPT Trading System locally for development and testing.

## 📋 Prerequisites

- Node.js 20.x or later
- npm or yarn
- AWS CLI configured with your credentials

## 🛠️ Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure AWS Credentials

Make sure your AWS credentials are configured for accessing DynamoDB:

```bash
aws configure
# or set environment variables:
export AWS_ACCESS_KEY_ID=your-key
export AWS_SECRET_ACCESS_KEY=your-secret
export AWS_REGION=us-east-1
```

### 3. Environment Variables

Make sure your `.env.dev.json` file exists with all required variables:

```json
{
  "AI_PROVIDER": "openai",
  "AI_MODEL": "gpt-4",
  "AI_API_KEY": "your-openai-api-key",
  "ALPACA_KEY_ID": "your-alpaca-key-id",
  "ALPACA_SECRET_KEY": "your-alpaca-secret-key",
  "ALPACA_BASE_URL": "https://paper-api.alpaca.markets/v2",
  "SES_REGION": "us-east-1",
  "SES_SENDER_EMAIL": "your-email@example.com",
  "ADMIN_EMAIL": "your-email@example.com",
  "EXECUTE_TRADES": "false",
  "STARTING_CASH": "1000.00"
}
```

## 🚀 Running Locally

### Start the Offline Server

```bash
npm run dev
# or
npm run offline
# or
serverless offline --stage dev
```

This will:

- ✅ Start API Gateway locally on `http://localhost:3001`
- ✅ Start Lambda functions locally on port 3002
- ✅ Connect to real AWS DynamoDB (using your AWS credentials)
- ✅ Load environment variables from `.env.dev.json`

## 🔗 API Endpoints

When running locally, your endpoints will be:

| Endpoint                 | Method   | Local URL                                               |
| ------------------------ | -------- | ------------------------------------------------------- |
| System Status            | GET      | http://localhost:3001/dev/api/status                    |
| Portfolio                | GET      | http://localhost:3001/dev/api/portfolio                 |
| Trading History          | GET      | http://localhost:3001/dev/api/trading-history           |
| Configuration            | PUT      | http://localhost:3001/dev/api/configuration             |
| Backtest                 | POST     | http://localhost:3001/dev/api/backtest                  |
| **Manual Daily Trading** | **POST** | **http://localhost:3001/dev/api/trigger-daily-trading** |

## 🧪 Testing the APIs

### Test System Status

```bash
curl http://localhost:3001/dev/api/status
```

### Test Manual Daily Trading Trigger

```bash
curl -X POST -H "Content-Type: application/json" \
  http://localhost:3001/dev/api/trigger-daily-trading
```

### Test Portfolio

```bash
curl http://localhost:3001/dev/api/portfolio
```

## 🗄️ Local DynamoDB

### View Local Database

```bash
# List tables
aws dynamodb list-tables --endpoint-url http://localhost:8000

# Scan table contents
aws dynamodb scan --table-name chatgpt-trading-phase1-dev \
  --endpoint-url http://localhost:8000
```

### Reset Local Database

```bash
# Stop the server (Ctrl+C)
# Delete the local database
rm -rf .dynamodb/

# Restart the server to recreate tables
npm run dev
```

## 🔧 Development Tips

### 1. Hot Reload

Serverless Offline supports hot reload. Changes to your Lambda functions will be automatically picked up.

### 2. Debugging

Add `console.log` statements to your code - they'll appear in the terminal where you ran `npm run dev`.

### 3. Environment Variables

- Local: Uses `.env.dev.json`
- Production: Uses environment variables from AWS

### 4. Database

- Local: Uses real AWS DynamoDB (same as production)
- Production: Uses AWS DynamoDB

### 5. External APIs

- Alpaca API: Works the same locally and in production
- OpenAI API: Works the same locally and in production

## 🚨 Important Notes

### Simulation Mode

For safe testing, set `EXECUTE_TRADES` to `"false"` in your `.env.dev.json`:

```json
{
  "EXECUTE_TRADES": "false"
}
```

This will:

- ✅ Fetch real market data
- ✅ Get AI trading recommendations
- ✅ Simulate trades (no real money involved)
- ✅ Log what would have been executed

### First Run

On the first run, the system will create an initial portfolio with your starting cash. Subsequent runs will use the existing portfolio data.

### Logs

All logs will be visible in your terminal. Look for:

- API Gateway requests
- Lambda function executions
- Database operations
- AI service calls

## 🛑 Troubleshooting

### Port Conflicts

If ports 3001, 3002, or 8000 are in use:

```bash
# Kill processes using these ports
lsof -ti:3001 | xargs kill -9
lsof -ti:3002 | xargs kill -9
lsof -ti:8000 | xargs kill -9
```

### AWS Connection Issues

If you get AWS connection errors:

```bash
# Check AWS credentials
aws sts get-caller-identity

# Check DynamoDB access
aws dynamodb list-tables --region us-east-1
```

### Environment Variables

If you get environment variable errors:

```bash
# Check if .env.dev.json exists and is valid JSON
cat .env.dev.json | jq .
```

## 🎯 Development Workflow

1. **Start local server**: `npm run dev`
2. **Test endpoints**: Use curl or Postman
3. **Make changes**: Files auto-reload
4. **Check logs**: Monitor terminal output
5. **Debug**: Add console.log statements
6. **Reset data**: Delete `.dynamodb/` folder

Happy developing! 🚀
