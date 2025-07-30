import yfinance as yf
import pandas as pd
from datetime import datetime
import os
import numpy as np 

# === Process one AI's portfolio ===
def process_portfolio(portfolio, starting_cash):
    results = []
    total_value = 0
    total_pnl = 0
    cash = starting_cash
    for _, stock in portfolio.iterrows():
        ticker = stock["ticker"]
        shares = int(stock["shares"])
        cost = stock["buy_price"]
        stop = stock["stop_loss"]
        data = yf.Ticker(ticker).history(period="1d")

        if data.empty:
            print(f"[ChatGPT] No data for {ticker}")
            row = {
                "Date": today,
                "Ticker": ticker,
                "Shares": shares,
                "Cost Basis": cost,
                "Stop Loss": stop,
                "Current Price": "",
                "Total Value": "",
                "PnL": "",
                "Action": "NO DATA",
                "Cash Balance": "",
                "Total Equity": ""
            }
        else:
            price = round(data["Close"].iloc[-1], 2)
            value = round(price * shares, 2)
            pnl = round((price - cost) * shares, 2)

            if price <= stop:
                action = "SELL - Stop Loss Triggered"
                cash += value
                log_sell( ticker, shares, price, cost, pnl, action)
            else:
                action = "HOLD"
                total_value += value
                total_pnl += pnl

            row = {
                "Date": today,
                "Ticker": ticker,
                "Shares": shares,
                "Cost Basis": cost,
                "Stop Loss": stop,
                "Current Price": price,
                "Total Value": value,
                "PnL": pnl,
                "Action": action,
                "Cash Balance": "",
                "Total Equity": ""
            }

        results.append(row)

    # === Add TOTAL row ===
    total_row = {
        "Date": today,
        "Ticker": "TOTAL",
        "Shares": "",
        "Cost Basis": "",
        "Stop Loss": "",
        "Current Price": "",
        "Total Value": round(total_value, 2),
        "PnL": round(total_pnl, 2),
        "Action": "",
        "Cash Balance": round(cash, 2),
        "Total Equity": round(total_value + cash, 2)
    }
    results.append(total_row)

    # === Save to CSV ===
    file = f"Scripts and CSV Files/chatgpt_portfolio_update.csv"
    df = pd.DataFrame(results)

    if os.path.exists(file):
        existing = pd.read_csv(file)
        existing = existing[existing["Date"] != today]  # Remove today's rows
        df = pd.concat([existing, df], ignore_index=True)

    df.to_csv(file, index=False)
    return chatgpt_portfolio

# === Trade Logger (purely for stoplosses)===
def log_sell( ticker, shares, price, cost, pnl):
    log = {
        "Date": today,
        "Ticker": ticker,
        "Shares Sold": shares,
        "Sell Price": price,
        "Cost Basis": cost,
        "PnL": pnl,
        "Reason": "AUTOMATED SELL - STOPLOSS TRIGGERED"
    }

    file = f"Scripts and CSV Files/chatgpt_trade_log.csv"
    if os.path.exists(file):
        df = pd.read_csv(file)
        df = pd.concat([df, pd.DataFrame([log])], ignore_index=True)
    else:
        df = pd.DataFrame([log])
    df.to_csv(file, index=False)

# === Manual Buy Logger ===

def log_manual_buy(buy_price, shares, ticker, cash, stoploss, chatgpt_portfolio):
    check = input(f"""You are currently trying to buy {ticker}.
                   If this a mistake enter 1.""")
    if check == "1":
        raise SystemExit("Please remove this function call.")

    data = yf.download(ticker, period="1d")
    if data.empty:
        SystemExit(f"error, could not find ticker {ticker}")
    if buy_price * shares > cash:
        SystemExit(f"error, you have {cash} but are trying to spend {buy_price * shares}. Are you sure you can do this?")
    pnl = 0.0

    log = {
            "Date": today,
            "Ticker": ticker,
            "Shares Bought": shares,
            "Buy Price": buy_price,
            "Cost Basis": buy_price * shares,
            "PnL": pnl,
            "Reason": "MANUAL BUY - New position"
            }

    file = "Scripts and CSV Files/chatgpt_trade_log.csv"
    if os.path.exists(file):
        df = pd.read_csv(file)
        df = pd.concat([df, pd.DataFrame([log])], ignore_index=True)
    else:
        df = pd.DataFrame([log])
    df.to_csv(file, index=False)
    new_trade = {"ticker": ticker, "shares": shares, "stop_loss": stoploss,
                "buy_price": buy_price, "cost_basis": buy_price * shares}
    new_trade = pd.DataFrame([new_trade])
    chatgpt_portfolio = pd.concat([chatgpt_portfolio, new_trade], ignore_index=True)
    cash = cash - shares * buy_price
    return cash, chatgpt_portfolio


#work in progress currently

def log_manual_sell(sell_price, shares_sold, ticker, cash, chatgpt_portfolio):
    if isinstance(chatgpt_portfolio, list):
        chatgpt_portfolio = pd.DataFrame(chatgpt_portfolio)
    if ticker not in chatgpt_portfolio["ticker"].values:
        raise KeyError(f"error, could not find {ticker} in portfolio")
    ticker_row = chatgpt_portfolio[chatgpt_portfolio['ticker'] == ticker]

    total_shares = int(ticker_row['shares'].item())
    print(total_shares)
    if shares_sold > total_shares:
        raise ValueError(f"You are trying to sell {shares_sold} but only own {total_shares}.")
    buy_price = float(ticker_row['buy_price'].item())
    
    reason = input("""Why are you selling? 
If this is a mistake, enter 1. """)

    if reason == "1": 
        raise SystemExit("Delete this function call from the program.")
    cost_basis = buy_price * shares_sold
    PnL = sell_price * shares_sold - cost_basis
    # leave buy fields empty
    log = {
        "Date": today,
        "Ticker": ticker,
        "Shares Bought": "",
        "Buy Price": "",
        "Cost Basis": cost_basis,
        "PnL": PnL,
        "Reason": f"MANUAL SELL - {reason}",
        "Shares Sold": shares_sold,
        "Sell Price": sell_price
    }
    file = "Scripts and CSV Files/chatgpt_trade_log.csv"
    if os.path.exists(file):
        df = pd.read_csv(file)
        df = pd.concat([df, pd.DataFrame([log])], ignore_index=True)
    else:
        df = pd.DataFrame([log])
    df.to_csv(file, index=False) #check if ticker shares sold = total shares, if yes delete that row
    if total_shares == shares_sold:
        chatgpt_portfolio = chatgpt_portfolio[chatgpt_portfolio["ticker"] != ticker]
    else:
        ticker_row['shares'] = total_shares - shares_sold
        ticker_row['cost_basis'] = ticker_row['shares'] * ticker_row['buy_price']
        #return updated cash and updated portfolio
    cash = cash + shares_sold * sell_price
    return cash, chatgpt_portfolio

# This is where chatGPT gets daily updates from
# I give it data on its portfolio and also other tickers if requested
# Right now it additionally wants "^RUT", "IWO", and "XBI"

def daily_results(chatgpt_portfolio, cash):
    if isinstance(chatgpt_portfolio, pd.DataFrame):
            chatgpt_portfolio = chatgpt_portfolio.to_dict(orient="records")
    print(f"prices and updates for {today}")
    for stock in chatgpt_portfolio + [{"ticker": "^RUT"}] + [{"ticker": "IWO"}] + [{"ticker": "XBI"}]:
        ticker = stock['ticker']
        try:
            data = yf.download(ticker, period="2d", progress=False)
            price = float(data['Close'].iloc[-1].item())
            last_price = float(data['Close'].iloc[-2].item())
            percent_change = ((price - last_price) / last_price) * 100
            volume = float(data['Volume'].iloc[-1].item())
        except Exception as e:
            raise Exception(f"Download for {ticker} failed. {e} Try checking internet connection.")
        print(f"{ticker} closing price: {price:.2f}")
        print(f"{ticker} volume for today: ${volume:,}")
        print(f"percent change from the day before: {percent_change:.2f}%")
    chatgpt_df = pd.read_csv("Scripts and CSV Files/chatgpt_portfolio_update.csv")

    # Filter TOTAL rows and get latest equity
    chatgpt_totals = chatgpt_df[chatgpt_df['Ticker'] == 'TOTAL'].copy() 
    chatgpt_totals['Date'] = pd.to_datetime(chatgpt_totals['Date'])
    final_date = chatgpt_totals['Date'].max()
    final_value = chatgpt_totals[chatgpt_totals['Date'] == final_date]
    final_equity = float(final_value['Total Equity'].values[0])
    equity_series = chatgpt_totals['Total Equity'].astype(float).reset_index(drop=True)

# Daily returns
    daily_pct = equity_series.pct_change().dropna()

# Total return (decimal)
    total_return = (equity_series.iloc[-1] - equity_series.iloc[0]) / equity_series.iloc[0]

# Number of return observations
    n_days = len(daily_pct)

# Risk-free return over same period
    rf_annual = 0.045
    rf_period = (1 + rf_annual) ** (n_days / 252) - 1

# Standard deviation of daily returns
    std_daily = daily_pct.std()
    negative_pct = daily_pct[daily_pct < 0]
    negative_std = negative_pct.std()
# Period Sharpe Ratio
    sharpe_total = (total_return - rf_period) / (std_daily * np.sqrt(n_days))
# 
    sortino_total = (total_return - rf_period) / (negative_std * np.sqrt(n_days))

# Output
    print(f"Total Sharpe Ratio over {n_days} days: {sharpe_total:.4f}")
    print(f"Total Sortino Ratio over {n_days} days: {sortino_total:.4f}")
    print(f"Latest ChatGPT Equity: ${final_equity:.2f}")
# Get S&P 500 data
    spx = yf.download("^SPX", start="2025-06-27", end=final_date + pd.Timedelta(days=1), progress=False)
    spx = spx.reset_index()


# Normalize to $100
    initial_price = spx["Close"].iloc[0].item()
    price_now = spx["Close"].iloc[-1].item()
    scaling_factor = 100 / initial_price
    spx_value = price_now * scaling_factor
    print(f"$100 Invested in the S&P 500: ${spx_value:.2f}")
    print(f"today's portfolio: {chatgpt_portfolio}")
    print(f"cash balance: {cash}")

    print("""Here are is your update for today. You can make any changes you see fit (if necessary),
but you may not use deep research.
You can however use the Internet and check current prices for potenial buys.""")

# === Run Portfolio ===
today = datetime.today().strftime('%Y-%m-%d')
chatgpt_portfolio = [{'ticker': 'ABEO', 'shares': 6, 'stop_loss': 4.9, 'buy_price': 5.77, 'cost_basis': 34.62},
                    {'ticker': 'IINN', 'shares': 14, 'stop_loss': 1.1, 'buy_price': 1.5, 'cost_basis': 21.0}, 
                    {'ticker': 'ACTU', 'shares': 6, 'stop_loss': 4.89, 'buy_price': 5.75, 'cost_basis': 34.5},
                    ]
chatgpt_portfolio = pd.DataFrame(chatgpt_portfolio)
cash = 22.32
# === DETAILS ===
# always put daily results last for updated df, and process_portfolio goes right before
# Function calls in order:
# 1. buying or selling
# 2. process_portfolio
# 3. daily_results
#Also, it prints your portfolio and cash in the terminal. So be sure to update is either changes
daily_results(chatgpt_portfolio, cash)