/**
 * Centralized logging utility for consistent logging across the system
 * Uses manual HTTP POST to send logs to configured endpoint
 */

// Log batching setup
let logQueue = [];
let flushTimeout = null;
const BATCH_SIZE = 10;
const FLUSH_INTERVAL = 100; // ms
const MAX_QUEUE_SIZE = 1000; // Prevent memory issues

// Determine logging endpoint based on environment
let loggingEndpoint = process.env.LOGGING_ENDPOINT;
const loggingTimeout = Number(process.env.LOGGING_TIMEOUT_MS || 5000); // Increased default timeout

// Detect offline mode more reliably
const isOffline =
  process.env.IS_OFFLINE === "true" ||
  process.env.SERVERLESS_OFFLINE_HTTP_PORT ||
  !process.env.AWS_LAMBDA_FUNCTION_NAME;

// For offline development, use serverless-offline endpoint
if (isOffline) {
  const port = process.env.SERVERLESS_OFFLINE_HTTP_PORT || 3000; // Updated to match serverless.yml
  const stage = process.env.STAGE || "dev";
  loggingEndpoint = `http://localhost:${port}/${stage}/api/logs`;
}

// For AWS deployment, construct API Gateway URL
if (!loggingEndpoint && !isOffline) {
  const serviceName = process.env.SERVICE_NAME || "chatgpt-trading-phase1";
  const stage = process.env.STAGE || "dev";
  const region = process.env.AWS_REGION || "us-east-1";

  // This will be the API Gateway URL pattern
  loggingEndpoint = `https://${serviceName}-${stage}.execute-api.${region}.amazonaws.com/${stage}/api/logs`;
}

// Flush logs to endpoint
async function flushLogs() {
  if (logQueue.length === 0) return;

  const logsToSend = [...logQueue];
  logQueue = [];

  try {
    if (!loggingEndpoint) {
      // Fallback to console if no endpoint configured
      logsToSend.forEach((log) =>
        console.log(`[${log.level.toUpperCase()}]`, log.message, log)
      );
      return;
    }

    // Apply timeout so we never block request completion on logging
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), loggingTimeout);

    try {
      const response = await fetch(loggingEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logs: logsToSend }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    // Silent fail - log to console as fallback
    console.warn(
      `Logger: Failed to send logs (${error.message}), falling back to console`
    );
    console.warn(`Logging endpoint: ${loggingEndpoint}`);
    logsToSend.forEach((log) =>
      console.log(`[${log.level.toUpperCase()}]`, log.message, log)
    );
  }
}

// Schedule log flushing
function scheduleFlush() {
  if (flushTimeout) return;

  flushTimeout = setTimeout(() => {
    flushTimeout = null;
    flushLogs();
  }, FLUSH_INTERVAL);
}

// Force flush remaining logs
async function forceFlushLogs() {
  if (flushTimeout) {
    clearTimeout(flushTimeout);
    flushTimeout = null;
  }
  await flushLogs();
}

// Create logger factory function
function createLogger(context = "system") {
  return new Proxy(
    {
      // Expose flush method for manual flushing
      async flush() {
        await forceFlushLogs();
      },

      // Lambda-specific logging methods
      logLambdaStart(event, awsContext) {
        this.info("Lambda function started", {
          requestId: awsContext.awsRequestId,
          functionName: awsContext.functionName,
          event: JSON.stringify(event),
        });
      },

      logLambdaEnd(duration, success = true) {
        this.info(`Lambda function ${success ? "completed" : "failed"}`, {
          duration: `${duration}ms`,
          success,
        });
      },

      // Business logic logging methods
      logTradeDecision(decision) {
        this.info("AI trade decision made", {
          ticker: decision.ticker,
          action: decision.action,
          shares: decision.shares,
          reasoning: decision.reasoning,
          confidence: decision.confidence,
        });
      },

      logTradeExecution(orderId, trade, success = true) {
        this.info(`Trade ${success ? "executed" : "failed"}`, {
          orderId,
          ticker: trade.ticker,
          action: trade.action,
          shares: trade.shares,
          price: trade.price,
          success,
        });
      },

      logPortfolioUpdate(portfolio) {
        this.info("Portfolio updated", {
          totalValue: portfolio.totalValue,
          cash: portfolio.cash,
          positionCount: portfolio.positions?.length || 0,
          lastUpdated: portfolio.lastUpdated,
        });
      },

      logApiCall(service, method, success = true, duration = null) {
        this.info(`API call ${success ? "successful" : "failed"}`, {
          service,
          method,
          success,
          duration: duration ? `${duration}ms` : null,
        });
      },
    },
    {
      get(target, prop) {
        // Return existing methods directly
        if (target[prop]) {
          return target[prop];
        }

        // Intercept logging methods (info, warn, error, debug)
        return (...args) => {
          const [message, ...customFields] = args;
          const additionalData =
            customFields.length > 0 ? Object.assign({}, ...customFields) : {};

          // Create log entry
          const logEntry = {
            dt: new Date().toISOString(),
            level: prop,
            message,
            context,
            ...additionalData,
          };

          // Add to queue
          logQueue.push(logEntry);

          // Flush immediately if batch size reached or queue getting too large, otherwise schedule flush
          if (
            logQueue.length >= BATCH_SIZE ||
            logQueue.length >= MAX_QUEUE_SIZE
          ) {
            if (flushTimeout) {
              clearTimeout(flushTimeout);
              flushTimeout = null;
            }
            flushLogs();
          } else {
            scheduleFlush();
          }

          // Always log to console for local development/debugging
          if (process.env.NODE_ENV === "development" || !loggingEndpoint) {
            const consoleMethod =
              prop === "error" ? "error" : prop === "warn" ? "warn" : "log";
            console[consoleMethod](
              `[${prop.toUpperCase()}] [${context}] ${message}`,
              Object.keys(additionalData).length > 0 ? additionalData : ""
            );
          }
        };
      },
    }
  );
}

// Create backward-compatible Logger class/function hybrid
function Logger(context = "system") {
  // Support both new Logger() and Logger() patterns
  if (new.target) {
    return createLogger(context);
  }
  return createLogger(context);
}

// Add static methods for direct access
Logger.info = function (message, data = {}) {
  const logger = createLogger();
  return logger.info(message, data);
};

Logger.warn = function (message, data = {}) {
  const logger = createLogger();
  return logger.warn(message, data);
};

Logger.error = function (message, data = {}) {
  const logger = createLogger();
  return logger.error(message, data);
};

Logger.debug = function (message, data = {}) {
  const logger = createLogger();
  return logger.debug(message, data);
};

// Business logic methods
Logger.logTradeDecision = function (decision) {
  const logger = createLogger();
  return logger.logTradeDecision(decision);
};

Logger.logTradeExecution = function (orderId, trade, success = true) {
  const logger = createLogger();
  return logger.logTradeExecution(orderId, trade, success);
};

Logger.logPortfolioUpdate = function (portfolio) {
  const logger = createLogger();
  return logger.logPortfolioUpdate(portfolio);
};

Logger.logApiCall = function (
  service,
  method,
  success = true,
  duration = null
) {
  const logger = createLogger();
  return logger.logApiCall(service, method, success, duration);
};

Logger.logLambdaStart = function (event, context) {
  const logger = createLogger();
  return logger.logLambdaStart(event, context);
};

Logger.logLambdaEnd = function (duration, success = true) {
  const logger = createLogger();
  return logger.logLambdaEnd(duration, success);
};

Logger.flush = async function () {
  const logger = createLogger();
  return logger.flush();
};

Logger.create = function (context = "system") {
  return createLogger(context);
};

// Graceful shutdown - flush logs before exit
process.on("beforeExit", async () => {
  console.log("Flushing remaining logs before exit...");
  await forceFlushLogs();
});

process.on("SIGINT", async () => {
  console.log("Flushing remaining logs before exit...");
  await forceFlushLogs();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("Flushing remaining logs before exit...");
  await forceFlushLogs();
  process.exit(0);
});

module.exports = Logger;
