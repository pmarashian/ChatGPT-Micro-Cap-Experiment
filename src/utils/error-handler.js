/**
 * Centralized error handling and retry logic
 * Provides consistent error responses and retry strategies
 */

const { RETRY_CONFIG, ERROR_TYPES } = require("../config/constants");
const Logger = require("./logger");

class ErrorHandler {
  constructor(context = "system") {
    this.logger = new Logger(context);
  }

  /**
   * Retry a function with exponential backoff
   * @param {Function} fn - Function to retry
   * @param {Object} config - Retry configuration
   * @param {string} context - Context for logging
   */
  async withRetry(fn, config, context = "operation") {
    let lastError;

    for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
      try {
        const result = await fn();
        if (attempt > 1) {
          this.logger.info(`${context} succeeded on attempt ${attempt}`);
        }
        return result;
      } catch (error) {
        lastError = error;
        this.logger.warn(
          `${context} failed on attempt ${attempt}/${config.maxRetries}`,
          {
            error: error.message,
            attempt,
          }
        );

        if (attempt < config.maxRetries) {
          await this._delay(config.retryDelay * attempt); // Exponential backoff
        }
      }
    }

    this.logger.error(
      `${context} failed after ${config.maxRetries} attempts`,
      lastError
    );
    throw lastError;
  }

  /**
   * Handle API errors with specific retry strategies
   */
  async handleApiError(error, service, operation) {
    const config = RETRY_CONFIG[service.toUpperCase()];

    if (!config) {
      this.logger.error(`Unknown service for retry: ${service}`, error);
      throw error;
    }

    // Check if error is critical (should trigger immediate failure)
    if (this._isCriticalError(error, config.criticalAfter)) {
      this.logger.error(`Critical ${service} error, not retrying`, error);
      throw error;
    }

    return this.withRetry(
      () => operation(),
      config,
      `${service} ${operation.name || "operation"}`
    );
  }

  /**
   * Create standardized error responses for Lambda functions
   */
  createErrorResponse(error, statusCode = 500) {
    this.logger.error("Creating error response", error);

    return {
      statusCode,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        error: error.message || "Internal server error",
        timestamp: new Date().toISOString(),
        requestId: process.env.AWS_REQUEST_ID || "unknown",
      }),
    };
  }

  /**
   * Handle validation errors
   */
  handleValidationError(field, value, expected) {
    const error = new Error(
      `Validation failed for ${field}: got ${value}, expected ${expected}`
    );
    error.type = ERROR_TYPES.VALIDATION_ERROR;
    this.logger.error("Validation error", error);
    throw error;
  }

  /**
   * Send error alerts (placeholder for future SES integration)
   */
  async sendErrorAlert(error, context = {}) {
    this.logger.error("Error alert triggered", error, context);

    // TODO: Implement SES email alerts
    // For now, just log the alert
    console.log("🚨 ERROR ALERT:", {
      message: error.message,
      context,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Check if error should be considered critical
   */
  _isCriticalError(error, criticalThreshold) {
    // Authentication errors are always critical
    if (error.message?.includes("401") || error.message?.includes("403")) {
      return true;
    }

    // Rate limiting might be critical
    if (error.message?.includes("429")) {
      return true;
    }

    // For now, treat all errors as non-critical to enable retries
    // In production, implement more sophisticated logic
    return false;
  }

  /**
   * Delay helper for retry logic
   */
  _delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

module.exports = ErrorHandler;
