/**
 * Centralized logging utility for consistent logging across the system
 * Supports Logtail integration with batched HTTP POST requests
 */

const axios = require("axios");

const sourceToken = process.env.LOGTAIL_SOURCE_TOKEN;
const endpoint = process.env.LOGTAIL_ENDPOINT;

// Configuration
const BATCH_SIZE = 10; // Send logs when queue reaches this size
const FLUSH_INTERVAL = 5000; // Send logs every 5 seconds if not empty
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

// Log queue and management
let logQueue = [];
let flushTimeout = null;
let isFlushing = false;

// Send batch of logs to Logtail via HTTP POST
async function sendLogsToLogtail(logs) {
  if (!sourceToken || !endpoint || logs.length === 0) {
    return;
  }

  const url = `${endpoint}/logs/bulk`;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await axios.post(url, logs, {
        headers: {
          Authorization: `Bearer ${sourceToken}`,
          "Content-Type": "application/json",
        },
        timeout: 10000, // 10 second timeout
      });

      if (response.status === 200) {
        return; // Success
      }
    } catch (error) {
      console.error(
        `Logtail send attempt ${attempt + 1} failed:`,
        error.message
      );

      if (attempt < MAX_RETRIES - 1) {
        await new Promise((resolve) =>
          setTimeout(resolve, RETRY_DELAY * (attempt + 1))
        );
      }
    }
  }

  // If all retries failed, log to console as fallback
  console.error("Failed to send logs to Logtail after all retries:", logs);
}

// Flush logs to Logtail
async function flushLogs() {
  if (isFlushing || logQueue.length === 0) {
    return;
  }

  isFlushing = true;
  const logsToSend = [...logQueue];
  logQueue = []; // Clear queue immediately

  try {
    await sendLogsToLogtail(logsToSend);
  } catch (error) {
    console.error("Error flushing logs to Logtail:", error);
    // Re-add failed logs back to queue
    logQueue.unshift(...logsToSend);
  } finally {
    isFlushing = false;
  }
}

// Schedule a flush operation
function scheduleFlush() {
  if (flushTimeout) {
    clearTimeout(flushTimeout);
  }

  flushTimeout = setTimeout(async () => {
    await flushLogs();
  }, FLUSH_INTERVAL);
}

// Create logger factory function that returns a proxy
function createLogger(context = "system") {
  let loggerInstance = null;

  const proxy = new Proxy(
    {
      // Expose flush method for manual flushing
      async flush() {
        if (flushTimeout) {
          clearTimeout(flushTimeout);
          flushTimeout = null;
        }
        await flushLogs();
      },

      // Lambda-specific logging methods
      logLambdaStart(event, context) {
        loggerInstance.info("Lambda function started", {
          requestId: context.awsRequestId,
          functionName: context.functionName,
          event: JSON.stringify(event),
        });
      },

      logLambdaEnd(duration, success = true) {
        loggerInstance.info(
          `Lambda function ${success ? "completed" : "failed"}`,
          {
            duration: `${duration}ms`,
            success,
          }
        );
      },

      // Business logic logging methods
      logTradeDecision(decision) {
        loggerInstance.info("AI trade decision made", {
          ticker: decision.ticker,
          action: decision.action,
          shares: decision.shares,
          reasoning: decision.reasoning,
          confidence: decision.confidence,
        });
      },

      logTradeExecution(orderId, trade, success = true) {
        loggerInstance.info(`Trade ${success ? "executed" : "failed"}`, {
          orderId,
          ticker: trade.ticker,
          action: trade.action,
          shares: trade.shares,
          price: trade.price,
          success,
        });
      },

      logPortfolioUpdate(portfolio) {
        loggerInstance.info("Portfolio updated", {
          totalValue: portfolio.totalValue,
          cash: portfolio.cash,
          positionCount: portfolio.positions?.length || 0,
          lastUpdated: portfolio.lastUpdated,
        });
      },

      logApiCall(service, method, success = true, duration = null) {
        loggerInstance.info(`API call ${success ? "successful" : "failed"}`, {
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

          // Create log entry with preserved timestamp
          const logEntry = {
            dt: new Date().toISOString(),
            level: prop.toUpperCase(),
            message,
            context,
            ...additionalData,
          };

          // Add to queue
          logQueue.push(logEntry);

          // Flush immediately if batch size reached, otherwise schedule flush
          if (logQueue.length >= BATCH_SIZE) {
            if (flushTimeout) {
              clearTimeout(flushTimeout);
              flushTimeout = null;
            }
            flushLogs();
          } else {
            scheduleFlush();
          }

          // Also log to console for local development/debugging
          if (process.env.NODE_ENV === "development" || !sourceToken) {
            const consoleMethod =
              prop === "error" ? "error" : prop === "warn" ? "warn" : "log";
            console[consoleMethod](
              `[${prop.toUpperCase()}] [${context}] ${message}`,
              additionalData
            );
          }
        };
      },
    }
  );

  loggerInstance = proxy;
  return proxy;
}

// Export both the factory function and a default logger instance
const Logger = createLogger();
Logger.create = createLogger;

// Graceful shutdown - flush logs before exit
process.on("beforeExit", async () => {
  if (flushTimeout) {
    clearTimeout(flushTimeout);
  }
  if (logQueue.length > 0) {
    console.log(`Flushing ${logQueue.length} remaining logs before exit...`);
    await flushLogs();
  }
});

process.on("SIGINT", async () => {
  if (flushTimeout) {
    clearTimeout(flushTimeout);
  }
  if (logQueue.length > 0) {
    console.log(`Flushing ${logQueue.length} remaining logs before exit...`);
    await flushLogs();
  }
  process.exit(0);
});

process.on("SIGTERM", async () => {
  if (flushTimeout) {
    clearTimeout(flushTimeout);
  }
  if (logQueue.length > 0) {
    console.log(`Flushing ${logQueue.length} remaining logs before exit...`);
    await flushLogs();
  }
  process.exit(0);
});

module.exports = Logger;
