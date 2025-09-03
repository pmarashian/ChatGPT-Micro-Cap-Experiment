/**
 * Centralized logging utility for consistent logging across the system
 * Supports Logtail integration and structured logging
 */

const { Logtail } = require("@logtail/node");

class Logger {
  constructor(context = "system") {
    this.context = context;

    // Get Logtail configuration from environment variables
    const sourceToken = process.env.LOGTAIL_SOURCE_TOKEN;
    const endpoint = process.env.LOGTAIL_ENDPOINT;

    if (sourceToken && endpoint) {
      this.logtail = new Logtail(sourceToken, {
        endpoint: endpoint,
      });
    } else {
      // Fallback to console logging if Logtail is not configured
      console.warn(
        "Logtail not configured. Using console logging. Set LOGTAIL_SOURCE_TOKEN and LOGTAIL_ENDPOINT environment variables."
      );
      this.logtail = null;
    }
  }

  info(message, data = {}) {
    if (this.logtail) {
      this.logtail.info(message, {
        context: this.context,
        ...data,
      });
    } else {
      console.log(`[INFO] [${this.context}] ${message}`, data);
    }
  }

  warn(message, data = {}) {
    if (this.logtail) {
      this.logtail.warn(message, {
        context: this.context,
        ...data,
      });
    } else {
      console.warn(`[WARN] [${this.context}] ${message}`, data);
    }
  }

  error(message, error = null, data = {}) {
    const errorData = {
      context: this.context,
      ...data,
    };

    if (error) {
      errorData.error = {
        message: error.message,
        stack: error.stack,
        name: error.name,
      };
    }

    if (this.logtail) {
      this.logtail.error(message, errorData);
    } else {
      console.error(`[ERROR] [${this.context}] ${message}`, errorData);
    }
  }

  debug(message, data = {}) {
    if (process.env.NODE_ENV === "development") {
      if (this.logtail) {
        this.logtail.debug(message, {
          context: this.context,
          ...data,
        });
      } else {
        console.log(`[DEBUG] [${this.context}] ${message}`, data);
      }
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

  // Flush all logs to Logtail
  async flush() {
    if (this.logtail) {
      await this.logtail.flush();
    }
  }
}

module.exports = Logger;
