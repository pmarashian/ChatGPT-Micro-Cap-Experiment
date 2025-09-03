/**
 * Get Discovery Quality Handler
 * Returns quality scores and performance metrics for AI-discovered tickers
 */

const AIMemoryService = require("../../services/ai-memory-service");
const Logger = require("../../utils/logger");
const ErrorHandler = require("../../utils/error-handler");
const { validateEnvironment } = require("../../config/environment");

let logger;
let errorHandler;

/**
 * Lambda handler for GET /api/discovery-quality
 */
module.exports.handler = async (event, context) => {
  // Initialize services
  logger = new Logger("get-discovery-quality");
  errorHandler = new ErrorHandler("get-discovery-quality");

  try {
    // Log function start
    logger.logLambdaStart(event, context);

    // Validate environment
    validateEnvironment();

    logger.info(
      "📊 Retrieving discovery quality scores and performance metrics"
    );

    const memoryService = new AIMemoryService();

    // Get all discoveries with quality scores
    const discoveries = await memoryService.getDiscoveredTickersWithQuality();

    // Calculate comprehensive quality metrics
    const qualityMetrics = {
      totalDiscoveries: discoveries.length,
      averageQualityScore:
        discoveries.length > 0
          ? discoveries.reduce((sum, d) => sum + d.qualityScore, 0) /
            discoveries.length
          : 0,
      qualityDistribution: {
        excellent: discoveries.filter((d) => d.qualityScore >= 80).length,
        good: discoveries.filter(
          (d) => d.qualityScore >= 60 && d.qualityScore < 80
        ).length,
        average: discoveries.filter(
          (d) => d.qualityScore >= 40 && d.qualityScore < 60
        ).length,
        poor: discoveries.filter((d) => d.qualityScore < 40).length,
      },
      recommendationBreakdown: discoveries.reduce((acc, d) => {
        acc[d.recommendation] = (acc[d.recommendation] || 0) + 1;
        return acc;
      }, {}),
      sectorDistribution: discoveries.reduce((acc, d) => {
        const sector = d.sector || "unknown";
        acc[sector] = (acc[sector] || 0) + 1;
        return acc;
      }, {}),
      convictionDistribution: discoveries.reduce((acc, d) => {
        const conviction = d.convictionLevel || "unknown";
        acc[conviction] = (acc[conviction] || 0) + 1;
        return acc;
      }, {}),
    };

    // Performance metrics
    const investedDiscoveries = discoveries.filter((d) => d.invested);
    const performanceMetrics = {
      totalInvested: investedDiscoveries.length,
      successfulInvestments: discoveries.filter((d) => d.outcome === "success")
        .length,
      failedInvestments: discoveries.filter((d) => d.outcome === "failure")
        .length,
      holdingInvestments: discoveries.filter((d) => d.outcome === "holding")
        .length,
      successRate:
        investedDiscoveries.length > 0
          ? (discoveries.filter((d) => d.outcome === "success").length /
              investedDiscoveries.length) *
            100
          : 0,
      averagePerformance:
        discoveries.length > 0
          ? discoveries.reduce((sum, d) => sum + (d.performance || 0), 0) /
            discoveries.length
          : 0,
    };

    // Top discoveries by quality
    const topQualityDiscoveries = discoveries
      .sort((a, b) => b.qualityScore - a.qualityScore)
      .slice(0, 10)
      .map((d) => ({
        ticker: d.ticker,
        companyName: d.companyName,
        qualityScore: d.qualityScore,
        recommendation: d.recommendation,
        convictionLevel: d.convictionLevel,
        sector: d.sector,
        marketCap: d.marketCap,
        catalysts: d.catalysts?.length || 0,
      }));

    // Top performers
    const topPerformers = discoveries
      .filter((d) => d.performance > 0)
      .sort((a, b) => b.performance - a.performance)
      .slice(0, 5)
      .map((d) => ({
        ticker: d.ticker,
        performance: d.performance,
        outcome: d.outcome,
        qualityScore: d.qualityScore,
      }));

    // Recent discoveries (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentDiscoveries = discoveries
      .filter((d) => new Date(d.discoveryDate) > sevenDaysAgo)
      .sort((a, b) => new Date(b.discoveryDate) - new Date(a.discoveryDate))
      .slice(0, 5)
      .map((d) => ({
        ticker: d.ticker,
        discoveryDate: d.discoveryDate,
        qualityScore: d.qualityScore,
        recommendation: d.recommendation,
      }));

    const response = {
      success: true,
      timestamp: new Date().toISOString(),
      qualityMetrics,
      performanceMetrics,
      topQualityDiscoveries,
      topPerformers,
      recentDiscoveries,
      summary: {
        totalDiscoveries: discoveries.length,
        investedCount: investedDiscoveries.length,
        successRate: `${performanceMetrics.successRate.toFixed(1)}%`,
        averageQuality: qualityMetrics.averageQualityScore.toFixed(1),
        bestPerformer: topPerformers[0]?.ticker || "None yet",
        newestDiscovery: recentDiscoveries[0]?.ticker || "None recent",
      },
    };

    logger.info("✅ Discovery quality metrics retrieved successfully", {
      totalDiscoveries: discoveries.length,
      averageQuality: qualityMetrics.averageQualityScore.toFixed(1),
      successRate: `${performanceMetrics.successRate.toFixed(1)}%`,
    });

    // Log function end
    logger.logLambdaEnd(Date.now() - context.getRemainingTimeInMillis());

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
      },
      body: JSON.stringify(response, null, 2),
    };
  } catch (error) {
    logger.error("Discovery quality retrieval failed", error);

    // Log function end with error
    logger.logLambdaEnd(Date.now() - context.getRemainingTimeInMillis(), false);

    return errorHandler.createErrorResponse(error);
  }
};
