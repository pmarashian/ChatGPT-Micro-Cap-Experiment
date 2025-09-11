/**
 * Get Ticker History API Handler
 * Retrieves complete history for a specific ticker (research, decisions, market data, trades)
 */

const Logger = require("../../utils/logger");
const ErrorHandler = require("../../utils/error-handler");
const AIMemoryService = require("../../services/ai-memory-service");
const PortfolioService = require("../../services/portfolio-service");

class GetTickerHistoryHandler {
  constructor() {
    this.logger = new Logger("get-ticker-history-handler");
    this.errorHandler = new ErrorHandler("get-ticker-history-handler");
    this.aiMemoryService = new AIMemoryService();
    this.portfolioService = new PortfolioService();
  }

  /**
   * Handle GET request for ticker history
   */
  async handle(event) {
    try {
      this.logger.info("Processing ticker history request", {
        ticker: event.queryStringParameters?.ticker,
        includeTrades: event.queryStringParameters?.includeTrades,
      });

      const { ticker, includeTrades = "true" } =
        event.queryStringParameters || {};

      if (!ticker) {
        return this.errorHandler.createResponse(400, {
          error: "Missing required parameter: ticker",
        });
      }

      // Get complete ticker history
      const history = await this.aiMemoryService.getCompleteTickerHistory(
        ticker
      );

      // Optionally include trading history
      if (includeTrades === "true") {
        try {
          const tradingHistory = await this.portfolioService.getTradingHistory(
            90
          ); // Last 90 days
          history.trades = tradingHistory.filter(
            (trade) => trade.ticker === ticker
          );
          history.summary.totalTrades = history.trades.length;
        } catch (tradeError) {
          this.logger.warn("Failed to fetch trading history", tradeError);
          history.trades = [];
        }
      }

      // Add performance metrics
      history.performanceMetrics = this.calculatePerformanceMetrics(history);

      this.logger.info(`Retrieved history for ${ticker}`, {
        researchItems: history.research.length,
        decisions: history.decisions.length,
        marketDataPoints: history.marketData.length,
        trades: history.trades.length,
      });

      return this.errorHandler.createResponse(200, {
        success: true,
        data: history,
      });
    } catch (error) {
      this.logger.error("Failed to get ticker history", error);
      return this.errorHandler.createResponse(500, {
        error: "Failed to retrieve ticker history",
        message: error.message,
      });
    }
  }

  /**
   * Calculate performance metrics for the ticker
   */
  calculatePerformanceMetrics(history) {
    const metrics = {
      totalResearchItems: history.research.length,
      totalDecisions: history.decisions.length,
      totalMarketDataPoints: history.marketData.length,
      totalTrades: history.trades.length,
      decisionBreakdown: this.getDecisionBreakdown(history.decisions),
      averageConfidence: this.calculateAverageConfidence(history.decisions),
      lastResearchDate: this.getLastResearchDate(history.research),
      lastDecisionDate: this.getLastDecisionDate(history.decisions),
      lastMarketDataDate: this.getLastMarketDataDate(history.marketData),
    };

    // Calculate trade performance if trades exist
    if (history.trades.length > 0) {
      metrics.tradeMetrics = this.calculateTradeMetrics(history.trades);
    }

    return metrics;
  }

  /**
   * Get breakdown of decision actions
   */
  getDecisionBreakdown(decisions) {
    const breakdown = {
      BUY: 0,
      SELL: 0,
      HOLD: 0,
      RESEARCH: 0,
    };

    decisions.forEach((decision) => {
      if (breakdown.hasOwnProperty(decision.action)) {
        breakdown[decision.action]++;
      }
    });

    return breakdown;
  }

  /**
   * Calculate average confidence from decisions
   */
  calculateAverageConfidence(decisions) {
    if (decisions.length === 0) return 0;

    const confidences = decisions
      .map((d) => d.confidence)
      .filter((c) => c !== null && c !== undefined);

    if (confidences.length === 0) return 0;

    return confidences.reduce((sum, c) => sum + c, 0) / confidences.length;
  }

  /**
   * Get last research date
   */
  getLastResearchDate(research) {
    if (research.length === 0) return null;

    const dates = research.map((r) => new Date(r.timestamp || r.createdAt));
    return new Date(Math.max(...dates)).toISOString();
  }

  /**
   * Get last decision date
   */
  getLastDecisionDate(decisions) {
    if (decisions.length === 0) return null;

    const dates = decisions.map((d) => new Date(d.timestamp || d.createdAt));
    return new Date(Math.max(...dates)).toISOString();
  }

  /**
   * Get last market data date
   */
  getLastMarketDataDate(marketData) {
    if (marketData.length === 0) return null;

    const dates = marketData.map((m) => new Date(m.timestamp || m.createdAt));
    return new Date(Math.max(...dates)).toISOString();
  }

  /**
   * Calculate trade performance metrics
   */
  calculateTradeMetrics(trades) {
    if (trades.length === 0) {
      return {
        totalTrades: 0,
        totalPnL: 0,
        winningTrades: 0,
        losingTrades: 0,
        winRate: 0,
      };
    }

    const totalPnL = trades.reduce((sum, trade) => sum + (trade.pnl || 0), 0);
    const winningTrades = trades.filter((trade) => (trade.pnl || 0) > 0).length;
    const losingTrades = trades.filter((trade) => (trade.pnl || 0) < 0).length;
    const winRate =
      trades.length > 0 ? (winningTrades / trades.length) * 100 : 0;

    return {
      totalTrades: trades.length,
      totalPnL,
      winningTrades,
      losingTrades,
      winRate: Math.round(winRate * 100) / 100,
      averagePnL: totalPnL / trades.length,
    };
  }
}

/**
 * Lambda handler for GET /api/ticker-history
 */
module.exports.handler = async (event, context) => {
  const handler = new GetTickerHistoryHandler();

  try {
    // Validate request parameters
    if (!event.queryStringParameters || !event.queryStringParameters.ticker) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
        },
        body: JSON.stringify({
          error: "Missing required parameter: ticker",
          example: "/api/ticker-history?ticker=OCUP&includeTrades=true",
        }),
      };
    }

    // Handle the request
    const response = await handler.handle(event);

    // Add CORS headers
    return {
      ...response,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        ...response.headers,
      },
    };
  } catch (error) {
    console.error("Handler error:", error);

    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
      },
      body: JSON.stringify({
        error: "Internal server error",
        message: error.message,
      }),
    };
  }
};

module.exports = GetTickerHistoryHandler;
