/**
 * Data validation utilities
 * Provides validation for AI decisions, trades, and system data
 */

const { AI_DECISION_SCHEMA } = require("../config/constants");
const ErrorHandler = require("./error-handler");

class Validators {
  constructor() {
    this.errorHandler = new ErrorHandler("validators");
  }

  /**
   * Validate AI decision response schema
   * @param {Object} response - AI response to validate
   */
  validateAiDecisionResponse(response) {
    try {
      // Check required top-level fields
      if (!response || typeof response !== "object") {
        throw new Error("AI response must be a valid object");
      }

      // Validate version
      if (response.version !== AI_DECISION_SCHEMA.version) {
        throw new Error(
          `Invalid version: expected ${AI_DECISION_SCHEMA.version}, got ${response.version}`
        );
      }

      // Validate generatedAt
      if (!response.generatedAt) {
        throw new Error("generatedAt field is required");
      }

      // Validate decisions array
      if (!Array.isArray(response.decisions)) {
        throw new Error("decisions must be an array");
      }

      // Validate each decision
      response.decisions.forEach((decision, index) => {
        this.validateDecision(decision, index);
      });

      // Validate optional fields
      if (response.stopLossUpdates) {
        this.validateStopLossUpdates(response.stopLossUpdates);
      }

      return true;
    } catch (error) {
      this.errorHandler.handleValidationError(
        "aiDecisionResponse",
        response,
        "valid schema"
      );
      throw error;
    }
  }

  /**
   * Validate individual trading decision
   */
  validateDecision(decision, index) {
    if (!decision || typeof decision !== "object") {
      throw new Error(`Decision ${index} must be a valid object`);
    }

    // Required fields
    const required = ["action", "ticker", "shares"];
    required.forEach((field) => {
      if (!decision[field]) {
        throw new Error(`Decision ${index}: ${field} is required`);
      }
    });

    // Validate action
    if (!AI_DECISION_SCHEMA.validActions.includes(decision.action)) {
      throw new Error(
        `Decision ${index}: invalid action "${
          decision.action
        }". Must be one of: ${AI_DECISION_SCHEMA.validActions.join(", ")}`
      );
    }

    // Validate ticker (uppercase letters, numbers, hyphens)
    if (!/^[A-Z0-9-]+$/.test(decision.ticker)) {
      throw new Error(
        `Decision ${index}: invalid ticker "${decision.ticker}". Must be uppercase letters, numbers, and hyphens only`
      );
    }

    // Validate shares (integer >= 0)
    if (!Number.isInteger(decision.shares) || decision.shares < 0) {
      throw new Error(
        `Decision ${index}: shares must be a non-negative integer, got ${decision.shares}`
      );
    }

    // Validate orderType if provided
    if (
      decision.orderType &&
      !AI_DECISION_SCHEMA.validOrderTypes.includes(decision.orderType)
    ) {
      throw new Error(
        `Decision ${index}: invalid orderType "${
          decision.orderType
        }". Must be one of: ${AI_DECISION_SCHEMA.validOrderTypes.join(", ")}`
      );
    }

    // Validate limitPrice if orderType is limit
    if (
      decision.orderType === "limit" &&
      (decision.limitPrice === undefined || decision.limitPrice <= 0)
    ) {
      throw new Error(
        `Decision ${index}: limitPrice is required and must be positive when orderType is "limit"`
      );
    }

    // Validate stopLoss for BUY orders
    if (
      decision.action === "BUY" &&
      (decision.stopLoss === undefined || decision.stopLoss <= 0)
    ) {
      throw new Error(
        `Decision ${index}: stopLoss is required and must be positive for BUY orders`
      );
    }

    // Validate timeInForce
    if (
      decision.timeInForce &&
      !["day", "gtc"].includes(decision.timeInForce)
    ) {
      throw new Error(
        `Decision ${index}: invalid timeInForce "${decision.timeInForce}". Must be "day" or "gtc"`
      );
    }

    // Validate confidence if provided
    if (
      decision.confidence !== undefined &&
      (decision.confidence < 0 || decision.confidence > 1)
    ) {
      throw new Error(
        `Decision ${index}: confidence must be between 0 and 1, got ${decision.confidence}`
      );
    }
  }

  /**
   * Validate stop-loss updates
   */
  validateStopLossUpdates(updates) {
    if (!Array.isArray(updates)) {
      throw new Error("stopLossUpdates must be an array");
    }

    updates.forEach((update, index) => {
      if (!update.ticker || !update.stopLoss) {
        throw new Error(
          `Stop-loss update ${index}: ticker and stopLoss are required`
        );
      }

      if (!/^[A-Z0-9-]+$/.test(update.ticker)) {
        throw new Error(
          `Stop-loss update ${index}: invalid ticker "${update.ticker}"`
        );
      }

      if (update.stopLoss <= 0) {
        throw new Error(
          `Stop-loss update ${index}: stopLoss must be positive, got ${update.stopLoss}`
        );
      }
    });
  }

  /**
   * Validate trade order data
   */
  validateTradeOrder(order) {
    const required = ["ticker", "action", "shares", "orderType"];

    required.forEach((field) => {
      if (!order[field]) {
        throw new Error(`Trade order: ${field} is required`);
      }
    });

    // Additional validations similar to decision validation
    if (!["BUY", "SELL"].includes(order.action)) {
      throw new Error(
        `Trade order: invalid action "${order.action}". Must be BUY or SELL`
      );
    }

    if (!Number.isInteger(order.shares) || order.shares <= 0) {
      throw new Error(
        `Trade order: shares must be a positive integer, got ${order.shares}`
      );
    }

    return true;
  }

  /**
   * Validate portfolio data
   */
  validatePortfolio(portfolio) {
    if (!portfolio || typeof portfolio !== "object") {
      throw new Error("Portfolio must be a valid object");
    }

    const required = ["totalValue", "cash", "positions"];

    required.forEach((field) => {
      if (portfolio[field] === undefined) {
        throw new Error(`Portfolio: ${field} is required`);
      }
    });

    if (typeof portfolio.totalValue !== "number" || portfolio.totalValue < 0) {
      throw new Error(`Portfolio: totalValue must be a non-negative number`);
    }

    if (typeof portfolio.cash !== "number" || portfolio.cash < 0) {
      throw new Error(`Portfolio: cash must be a non-negative number`);
    }

    if (!Array.isArray(portfolio.positions)) {
      throw new Error("Portfolio: positions must be an array");
    }

    return true;
  }

  /**
   * Validate market data
   */
  validateMarketData(data) {
    if (!data || typeof data !== "object") {
      throw new Error("Market data must be a valid object");
    }

    if (!data.ticker || !data.price || !data.timestamp) {
      throw new Error("Market data: ticker, price, and timestamp are required");
    }

    if (typeof data.price !== "number" || data.price <= 0) {
      throw new Error(
        `Market data: price must be a positive number, got ${data.price}`
      );
    }

    return true;
  }

  /**
   * Validate email address format
   */
  validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new Error(`Invalid email format: ${email}`);
    }
    return true;
  }

  /**
   * Validate AI research response schema with citations
   * @param {Object} response - AI research response to validate
   */
  validateAiResearchResponse(response) {
    try {
      // Check required top-level fields
      if (!response || typeof response !== "object") {
        throw new Error("Research response must be a valid object");
      }

      // Validate version
      if (response.version !== "2.0") {
        throw new Error(
          `Invalid version: expected 2.0, got ${response.version}`
        );
      }

      // Validate generatedAt
      if (!response.generatedAt) {
        throw new Error("generatedAt field is required");
      }

      // Validate researchSummary
      if (
        !response.researchSummary ||
        typeof response.researchSummary !== "string"
      ) {
        throw new Error("researchSummary is required and must be a string");
      }

      // Validate sectorAnalysis (optional but should exist)
      if (response.sectorAnalysis) {
        this.validateSectorAnalysis(response.sectorAnalysis);
      }

      // Validate companyEvaluations array
      if (
        !response.companyEvaluations ||
        !Array.isArray(response.companyEvaluations)
      ) {
        throw new Error("companyEvaluations must be an array");
      }

      // Validate each company evaluation
      response.companyEvaluations.forEach((evaluation, index) => {
        this.validateCompanyEvaluation(evaluation, index);
      });

      // Validate newDiscoveries (optional)
      if (response.newDiscoveries && !Array.isArray(response.newDiscoveries)) {
        throw new Error("newDiscoveries must be an array");
      }

      return true;
    } catch (error) {
      this.errorHandler.handleValidationError(
        "aiResearchResponse",
        response,
        "valid research schema with citations"
      );
      throw error;
    }
  }

  /**
   * Validate sector analysis object
   * @param {Object} sectorAnalysis - Sector analysis to validate
   */
  validateSectorAnalysis(sectorAnalysis) {
    const validSentiments = ["bullish", "neutral", "bearish"];

    if (
      sectorAnalysis.overallSentiment &&
      !validSentiments.includes(sectorAnalysis.overallSentiment)
    ) {
      throw new Error(
        `Invalid overallSentiment: must be one of ${validSentiments.join(", ")}`
      );
    }

    // Validate arrays
    ["keyTrends", "riskFactors", "opportunityAreas"].forEach((field) => {
      if (sectorAnalysis[field] && !Array.isArray(sectorAnalysis[field])) {
        throw new Error(`${field} must be an array`);
      }
    });
  }

  /**
   * Validate individual company evaluation
   * @param {Object} evaluation - Company evaluation to validate
   * @param {number} index - Index in array for error messages
   */
  validateCompanyEvaluation(evaluation, index) {
    if (!evaluation || typeof evaluation !== "object") {
      throw new Error(`Company evaluation ${index} must be a valid object`);
    }

    // Required fields
    const requiredFields = ["ticker", "companyName", "recommendation"];
    requiredFields.forEach((field) => {
      if (!evaluation[field]) {
        throw new Error(`Company evaluation ${index}: ${field} is required`);
      }
    });

    // Validate ticker format
    if (!/^[A-Z0-9-]+$/.test(evaluation.ticker)) {
      throw new Error(
        `Company evaluation ${index}: invalid ticker "${evaluation.ticker}". Must be uppercase letters, numbers, and hyphens only`
      );
    }

    // Validate recommendation
    const validRecommendations = ["BUY", "MONITOR", "AVOID"];
    if (!validRecommendations.includes(evaluation.recommendation)) {
      throw new Error(
        `Company evaluation ${index}: invalid recommendation "${
          evaluation.recommendation
        }". Must be one of: ${validRecommendations.join(", ")}`
      );
    }

    // Validate conviction level
    const validConvictionLevels = ["high", "medium", "low"];
    if (
      evaluation.convictionLevel &&
      !validConvictionLevels.includes(evaluation.convictionLevel)
    ) {
      throw new Error(
        `Company evaluation ${index}: invalid convictionLevel "${
          evaluation.convictionLevel
        }". Must be one of: ${validConvictionLevels.join(", ")}`
      );
    }

    // Validate valuation
    const validValuations = ["undervalued", "fair", "overvalued"];
    if (
      evaluation.valuation &&
      !validValuations.includes(evaluation.valuation)
    ) {
      throw new Error(
        `Company evaluation ${index}: invalid valuation "${
          evaluation.valuation
        }". Must be one of: ${validValuations.join(", ")}`
      );
    }

    // CRITICAL: Validate citations array
    this.validateCitations(evaluation.citations, index);

    // Validate optional arrays
    ["catalysts", "risks"].forEach((field) => {
      if (evaluation[field] && !Array.isArray(evaluation[field])) {
        throw new Error(
          `Company evaluation ${index}: ${field} must be an array`
        );
      }
    });

    // Validate numeric fields
    if (
      evaluation.marketCap !== undefined &&
      (typeof evaluation.marketCap !== "number" || evaluation.marketCap < 0)
    ) {
      throw new Error(
        `Company evaluation ${index}: marketCap must be a positive number`
      );
    }

    if (
      evaluation.qualityScore !== undefined &&
      (typeof evaluation.qualityScore !== "number" ||
        evaluation.qualityScore < 0 ||
        evaluation.qualityScore > 100)
    ) {
      throw new Error(
        `Company evaluation ${index}: qualityScore must be a number between 0 and 100`
      );
    }
  }

  /**
   * Validate citations array - CRITICAL for evidence-grounded research
   * @param {Array} citations - Citations array to validate
   * @param {number} evaluationIndex - Index of the company evaluation
   */
  validateCitations(citations, evaluationIndex) {
    if (!citations || !Array.isArray(citations) || citations.length === 0) {
      throw new Error(
        `Company evaluation ${evaluationIndex}: citations array is required and must contain at least one citation`
      );
    }

    citations.forEach((citation, citationIndex) => {
      if (!citation || typeof citation !== "object") {
        throw new Error(
          `Company evaluation ${evaluationIndex}, citation ${citationIndex}: must be a valid object`
        );
      }

      // Required citation fields
      const requiredCitationFields = [
        "url",
        "source",
        "publishedAt",
        "snippet",
      ];
      requiredCitationFields.forEach((field) => {
        if (!citation[field]) {
          throw new Error(
            `Company evaluation ${evaluationIndex}, citation ${citationIndex}: ${field} is required`
          );
        }
      });

      // Validate URL format
      try {
        new URL(citation.url);
      } catch (error) {
        throw new Error(
          `Company evaluation ${evaluationIndex}, citation ${citationIndex}: invalid URL format "${citation.url}"`
        );
      }

      // Validate publishedAt is a valid date string
      if (isNaN(Date.parse(citation.publishedAt))) {
        throw new Error(
          `Company evaluation ${evaluationIndex}, citation ${citationIndex}: invalid publishedAt date "${citation.publishedAt}"`
        );
      }

      // Validate snippet has meaningful content
      if (
        typeof citation.snippet !== "string" ||
        citation.snippet.trim().length < 10
      ) {
        throw new Error(
          `Company evaluation ${evaluationIndex}, citation ${citationIndex}: snippet must be a string with at least 10 characters`
        );
      }
    });
  }
}

module.exports = Validators;
