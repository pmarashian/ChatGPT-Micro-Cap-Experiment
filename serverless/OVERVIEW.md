# ChatGPT Micro-Cap Trading Experiment - Project Overview

## What This Project Does

This is a **6-month live trading experiment** where ChatGPT (GPT-4) manages a real-money micro-cap stock portfolio. The core question being tested is:

**"Can powerful large language models like ChatGPT actually generate alpha (or at least make smart trading decisions) using real-time market data?"**

The experiment started with $100 and runs from June 2025 to December 2025, with the goal of outperforming the S&P 500 benchmark.

## How It Works

### Core Concept

- **AI Portfolio Manager**: ChatGPT acts as a professional portfolio strategist
- **Micro-Cap Focus**: Only trades U.S.-listed micro-cap stocks (market cap under $300M)
- **Daily Decision Making**: ChatGPT receives daily portfolio updates and decides on trades
- **Real Money**: Uses actual capital (not paper trading)

### Trading Process Flow

1. **Daily Data Collection**: Script fetches current market data for portfolio holdings
2. **Portfolio Analysis**: Generates comprehensive daily report with prices, P&L, risk metrics
3. **AI Decision**: User copies daily report into ChatGPT for trading decisions
4. **Manual Execution**: User manually executes trades in their brokerage account
5. **Data Logging**: Script logs all trades and updates portfolio state
6. **Performance Tracking**: Continuous monitoring vs. S&P 500 benchmark

## What's Automated vs. Manual

### ✅ **AUTOMATED** (Handled by Scripts)

- **Market Data Fetching**: Yahoo Finance + Stooq fallback for OHLCV data
- **Portfolio Calculations**: Daily P&L, position values, stop-loss monitoring
- **Risk Metrics**: Sharpe ratio, Sortino ratio, max drawdown, CAPM analysis
- **Data Logging**: Trade history, portfolio updates, CSV file management
- **Stop-Loss Execution**: Automatic sell orders when stop-loss levels are hit
- **Performance Reporting**: Daily summaries with formatted output for ChatGPT

### ❌ **MANUAL** (Requires Human Intervention)

- **AI Prompting**: Copying daily reports into ChatGPT
- **Trade Decisions**: ChatGPT's buy/sell recommendations
- **Order Execution**: Actually placing trades in brokerage account
- **Portfolio Management**: Setting stop-losses, position sizing decisions
- **Deep Research**: Weekly portfolio reevaluation sessions

## Testing and Validation Approach

### **System Backtesting (Not Strategy Testing)**

The project includes a backtesting framework that focuses on **testing system infrastructure**, not AI decision quality:

- **Historical Data**: Download 1-2 years of market data for test tickers
- **Date Manipulation**: Simulate trading days by overriding system dates
- **Mock Market Data**: Return historical data instead of real-time API calls
- **Infrastructure Validation**: Test system components without focusing on AI decision quality

**What This Tests:**
- ✅ Daily trading cycle execution
- ✅ AI API integration and response processing
- ✅ Market data handling and portfolio updates
- ✅ Error handling and report generation

**What This Doesn't Test:**
- ❌ AI decision quality or strategy effectiveness
- ❌ Historical performance or returns
- ❌ Market impact or execution costs

## Technical Architecture

### Core Scripts

- **`trading_script.py`** (1,177 lines): Main trading engine and portfolio manager
- **`Generate_Graph.py`**: Performance visualization and charting
- **CSV Files**: Portfolio state and trade logging

### Data Sources

- **Primary**: Yahoo Finance (`yfinance` library)
- **Fallback**: Stooq (via `pandas-datareader` and direct CSV)
- **Benchmarks**: S&P 500 (^GSPC), Russell 2000 (^RUT), Biotech ETF (XBI), Small-Cap ETF (IWO)

### Key Features

- **Robust Data Fetching**: Multi-stage fallback for market data reliability
- **Weekend Handling**: Automatic date adjustment for non-trading days
- **Stop-Loss Automation**: Configurable stop-loss levels with automatic execution
- **Performance Analytics**: Comprehensive risk/return metrics
- **Trade Logging**: Complete transparency with detailed execution logs

## APIs and Dependencies Required

### Python Libraries

```bash
numpy==2.3.2          # Numerical computing
pandas==2.2.2         # Data manipulation
yfinance==0.2.65      # Yahoo Finance API wrapper
matplotlib==3.8.4     # Charting and visualization
```

### External APIs

- **Yahoo Finance**: Free, no API key required (via yfinance)
- **Stooq**: Free, no API key required (fallback data source)
- **No Paid APIs**: All data sources are free and publicly available

### System Requirements

- Python 3.7+
- Internet connection for market data
- ~10MB storage for CSV data files
- No special hardware requirements

## Getting Started Steps

### 1. Environment Setup

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### 2. Initial Portfolio Setup

```bash
# Run trading script (creates initial CSV files)
python trading_script.py --file "Start Your Own/chatgpt_portfolio_update.csv"
```

### 3. Daily Trading Process

```bash
# Run daily update (after market close)
python trading_script.py --file "Start Your Own/chatgpt_portfolio_update.csv"

# Copy output into ChatGPT for trading decisions
# Execute trades manually in your brokerage account
```

### 4. Performance Monitoring

```bash
# Generate performance charts
python "Start Your Own/Generate_Graph.py"
```

## Trading Rules and Constraints

### Investment Universe

- **Market Cap**: Under $300M (micro-cap stocks)
- **Geography**: U.S.-listed securities only
- **Position Types**: Long-only (no shorting, options, or derivatives)
- **Order Types**: Market-on-Open (MOO) and limit orders supported

### Risk Management

- **Stop-Losses**: Configurable per position
- **Position Sizing**: Full shares only (no fractional shares)
- **Cash Management**: No margin or leverage
- **Concentration**: Can concentrate or diversify at will

### Decision Making

- **Daily Updates**: Portfolio review every trading day
- **Deep Research**: Weekly portfolio reevaluation sessions
- **AI Autonomy**: ChatGPT has complete control over decisions
- **Human Oversight**: Manual trade execution only

## Key Strengths and Limitations

### Strengths

- **Data Processing**: Excellent at parsing obscure filings and clinical data
- **Pattern Recognition**: Good at identifying short-term momentum opportunities
- **Research Efficiency**: Can analyze vast amounts of data quickly
- **Risk Management**: Consistent application of stop-loss rules

### Limitations

- **Patience Issues**: Struggles with holding through full catalyst timelines
- **Chat Continuity**: Performance degrades after ~2 weeks, requiring chat resets
- **Market Context**: May miss broader market dynamics
- **Execution Timing**: No real-time market monitoring

## Performance Tracking

### Metrics Calculated

- **Return Metrics**: Total return, daily returns, period returns
- **Risk Metrics**: Volatility, max drawdown, VaR
- **Risk-Adjusted Returns**: Sharpe ratio, Sortino ratio
- **Market Analysis**: Beta, alpha, R² vs. S&P 500
- **Benchmark Comparison**: Performance vs. multiple indices

### Data Output

- **Portfolio CSV**: Daily position updates and P&L
- **Trade Log CSV**: Complete trade history with execution details
- **Performance Charts**: Visual comparison vs. benchmarks
- **Daily Reports**: Formatted output for AI decision making

## Current Status and Results

- **Experiment Period**: June 2025 - December 2025
- **Starting Capital**: $100
- **Current Performance**: Outperforming S&P 500 benchmark
- **Update Frequency**: Daily portfolio updates, weekly deep research
- **Transparency**: All data publicly available in repository

## Future Enhancements

### Planned Improvements

- **API Integration**: Direct ChatGPT API integration for automated prompting
- **Real-Time Execution**: Automated trade execution capabilities
- **Enhanced Analytics**: More sophisticated risk and performance metrics
- **User Interface**: Web-based dashboard for easier management

### Research Extensions

- **Model Comparison**: Testing different LLM providers
- **Strategy Variations**: Different investment universes and timeframes
- **Risk Models**: Advanced portfolio optimization techniques
- **Backtesting**: Historical strategy validation

## Important Notes

### Disclaimer

This is an experimental project, not financial advice. Trading involves risk of loss.

### Manual Nature

Currently requires significant manual intervention for:

- Copying data into ChatGPT
- Executing trades in brokerage account
- Managing portfolio state

### Learning Curve

Requires basic Python knowledge to modify and customize the system.

### Community

The project is open source and welcomes contributions, questions, and feature requests.

---

**For questions or support**: nathanbsmith.business@gmail.com

**Blog updates**: [A.I Controls Stock Account](https://nathanbsmith729.substack.com)

**Repository**: [GitHub](https://github.com/LuckyOne7777/ChatGPT-Micro-Cap-Experiment)
