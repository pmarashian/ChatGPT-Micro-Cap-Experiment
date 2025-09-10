/**
 * Centralized logging utility for consistent logging across the system
 * Uses manual HTTP POST to send logs to configured endpoint
 */

const { isOffline } = require("./environment");

// Log batching setup
let logQueue = [];
let flushTimeout = null;
const BATCH_SIZE = 10;
const FLUSH_INTERVAL = 100; // ms
const MAX_QUEUE_SIZE = 1000; // Prevent memory issues

// Determine logging endpoint based on environment
let loggingEndpoint = null; //process.env.LOGGING_ENDPOINT;
const loggingTimeout = Number(process.env.LOGGING_TIMEOUT_MS || 5000); // Increased default timeout

// For offline development, use serverless-offline endpoint
if (isOffline()) {
  const port = process.env.SERVERLESS_OFFLINE_HTTP_PORT || 3000; // Updated to match serverless.yml
  loggingEndpoint = `http://localhost:${port}/api/logs`;
}

// For AWS deployment, use the deployed API Gateway URL
if (!loggingEndpoint && !isOffline()) {
  const apiGatewayUrl = process.env.API_GATEWAY_URL;

  if (apiGatewayUrl) {
    // Use the deployed API Gateway URL from CloudFormation output
    loggingEndpoint = `${apiGatewayUrl}/api/logs`;
  }
}

// Flush logs to endpoint
async function flushLogs(options = {}) {
  if (logQueue.length === 0) return;

  const logsToSend = [...logQueue];
  logQueue = [];

  if (isOffline()) {
    logsToSend.forEach((log) => {
      const uniqueIdStr = log.uniqueId ? `[${log.uniqueId}] ` : "[UNDEFINED]";
      console.log(
        `${uniqueIdStr}[${log.level.toUpperCase()}] [${log.context}] ${
          log.message
        }`
      );
    });
    return;
  }

  try {
    if (!loggingEndpoint) {
      // Fallback to console if no endpoint configured
      logsToSend.forEach((log) => {
        const uniqueIdStr = log.uniqueId ? `[${log.uniqueId}] ` : "";
        console.log(
          `${uniqueIdStr}[${log.level.toUpperCase()}] ${log.message}`
        );
      });
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
async function forceFlushLogs(options = {}) {
  if (flushTimeout) {
    clearTimeout(flushTimeout);
    flushTimeout = null;
  }
  await flushLogs({ ...options });
}

// Create logger factory function
function createLogger(context = "system", options = {}) {
  const loggerOptions = { uniqueId: options?.uniqueId, context };

  return new Proxy(
    {
      // Store options for use in proxy handler
      _options: loggerOptions,

      // Expose flush method for manual flushing
      async flush() {
        await forceFlushLogs(loggerOptions);
      },

      // Lambda-specific logging methods
      logLambdaStart(event, awsContext) {
        this.verbose("Lambda function started", {
          requestId: awsContext.awsRequestId,
          functionName: awsContext.functionName,
          event: JSON.stringify(event),
        });
      },

      logLambdaEnd(duration, success = true) {
        this.verbose(`Lambda function ${success ? "completed" : "failed"}`, {
          duration: `${duration}ms`,
          success,
        });
      },

      // Business logic logging methods
      logTradeDecision(decision) {
        this.debug("AI trade decision made", {
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

          // Create log entry with uniqueId from logger options
          const logEntry = {
            dt: new Date().toISOString(),
            level: prop,
            message,
            context: loggerOptions.context,
            uniqueId: loggerOptions.uniqueId,
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
            flushLogs(loggerOptions);
          } else {
            scheduleFlush();
          }

          // Always log to console for local development/debugging
          if (process.env.NODE_ENV === "development" || !loggingEndpoint) {
            const consoleMethod =
              prop === "error" ? "error" : prop === "warn" ? "warn" : "log";
            const uniqueIdStr = loggerOptions.uniqueId
              ? `[${loggerOptions.uniqueId}] `
              : "";
            console[consoleMethod](
              `${uniqueIdStr}[${prop.toUpperCase()}] ${message}`,
              Object.keys(additionalData).length > 0 ? additionalData : ""
            );
          }
        };
      },
    }
  );
}

// Create backward-compatible Logger class/function hybrid
function Logger(context = "system", options = {}) {
  // Support both new Logger() and Logger() patterns

  if (new.target) {
    return createLogger(context, options);
  }
  return createLogger(context, options);
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
