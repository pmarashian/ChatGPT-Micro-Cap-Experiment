/**
 * Centralized logging utility for consistent logging across the system
 * Supports CloudWatch integration and structured logging
 */

class Logger {
  constructor(context = "system") {
    this.context = context;
  }

  _formatMessage(level, message, data = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      context: this.context,
      message,
      ...data,
    };

    return JSON.stringify(logEntry);
  }

  info(message, data = {}) {
    console.log(this._formatMessage("INFO", message, data));
  }

  warn(message, data = {}) {
    console.warn(this._formatMessage("WARN", message, data));
  }

  error(message, error = null, data = {}) {
    const errorData = {
      ...data,
      error: error
        ? {
            message: error.message,
            stack: error.stack,
            name: error.name,
          }
        : null,
    };
    console.error(this._formatMessage("ERROR", message, errorData));
  }

  debug(message, data = {}) {
    if (process.env.NODE_ENV === "development") {
      console.log(this._formatMessage("DEBUG", message, data));
    }
  }

  // Lambda-specific logging
  logLambdaStart(event, context) {
    this.info("Lambda function started", {
      requestId: context.awsRequestId,
      functionName: context.functionName,
      event: JSON.stringify(event),
    });
  }

  logLambdaEnd(duration, success = true) {
    this.info(`Lambda function ${success ? "completed" : "failed"}`, {
      duration: `${duration}ms`,
      success,
    });
  }

  // Business logic logging
  logTradeDecision(decision) {
    this.info("AI trade decision made", {
      ticker: decision.ticker,
      action: decision.action,
      shares: decision.shares,
      reasoning: decision.reasoning,
      confidence: decision.confidence,
    });
  }

  logTradeExecution(orderId, trade, success = true) {
    this.info(`Trade ${success ? "executed" : "failed"}`, {
      orderId,
      ticker: trade.ticker,
      action: trade.action,
      shares: trade.shares,
      price: trade.price,
      success,
    });
  }

  logPortfolioUpdate(portfolio) {
    this.info("Portfolio updated", {
      totalValue: portfolio.totalValue,
      cash: portfolio.cash,
      positionCount: portfolio.positions?.length || 0,
      lastUpdated: portfolio.lastUpdated,
    });
  }

  logApiCall(service, method, success = true, duration = null) {
    this.info(`API call ${success ? "successful" : "failed"}`, {
      service,
      method,
      success,
      duration: duration ? `${duration}ms` : null,
    });
  }
}

module.exports = Logger;
