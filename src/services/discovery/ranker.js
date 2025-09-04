/**
 * Discovery Ranker Service
 * Computes deterministic composite scores for universe tickers based on ingested evidence
 * Ranks candidates with transparent reason codes and evidence links
 */

const UniverseService = require("./universe-service");
const AIMemoryService = require("../ai-memory-service");
const Logger = require("../../utils/logger");
const ErrorHandler = require("../../utils/error-handler");
const { validateEnvironment } = require("../../config/environment");
const { RANKING_CONFIG } = require("../../config/constants");

let logger;
let errorHandler;

/**
 * Ranker Service
 * Computes composite scores from fundamentals, news, momentum, and risk factors
 */
class RankerService {
  constructor() {
    this.logger = new Logger("ranker-service");
    this.errorHandler = new ErrorHandler("ranker-service");

    this.universeService = new UniverseService();
    this.aiMemoryService = new AIMemoryService();
  }

  /**
   * Main ranking workflow
   * @returns {Promise<Object>} Ranked universe snapshot
   */
  async rankUniverse() {
    try {
      this.logger.info("Starting universe ranking process");

      // Get latest universe
      const universe = await this.universeService.getLatestUniverse();
      if (!universe) {
        throw new Error("No universe snapshot available for ranking");
      }

      this.logger.info(`Ranking ${universe.tickers.length} universe tickers`, {
        universeId: universe.id,
        universeDate: universe.date,
      });

      // Compute scores for each ticker
      const tickerScores = [];
      for (const tickerObj of universe.tickers) {
        const tickerSymbol = tickerObj.symbol; // Extract the symbol from the ticker object
        try {
          const score = await this.computeCompositeScore(tickerSymbol);
          tickerScores.push({
            ticker: tickerSymbol,
            ...score,
          });
        } catch (error) {
          this.logger.warn(`Failed to score ${tickerSymbol}: ${error.message}`);
          // Include with neutral score
          tickerScores.push({
            ticker: tickerSymbol,
            compositeScore: 50, // Neutral baseline
            fundamentalsScore: 0,
            newsScore: 0,
            momentumScore: 0,
            riskPenalty: 0,
            reasonCodes: ["SCORING_ERROR"],
            evidenceCount: 0,
            lastEvidenceDate: null,
          });
        }
      }

      // Sort by composite score (descending)
      tickerScores.sort((a, b) => b.compositeScore - a.compositeScore);

      // Create ranked snapshot
      const rankedSnapshot = {
        id: `ranked_${Date.now()}`,
        date: new Date().toISOString(),
        universeSnapshotId: universe.id,
        totalTickers: tickerScores.length,
        scores: tickerScores,
        scoringConfig: {
          fundamentalsWeight: RANKING_CONFIG.WEIGHTS.FUNDAMENTALS,
          newsWeight: RANKING_CONFIG.WEIGHTS.NEWS,
          momentumWeight: RANKING_CONFIG.WEIGHTS.MOMENTUM,
          riskPenaltyWeight: RANKING_CONFIG.WEIGHTS.RISK_PENALTY,
          maxNewsAgeDays: RANKING_CONFIG.FRESHNESS.MAX_NEWS_AGE_DAYS,
          maxFundamentalsAgeDays:
            RANKING_CONFIG.FRESHNESS.MAX_FUNDAMENTALS_AGE_DAYS,
        },
      };

      // Persist ranked snapshot
      await this.aiMemoryService.saveRankedUniverseSnapshot(rankedSnapshot);

      this.logger.info("Universe ranking completed", {
        topScore: tickerScores[0]?.compositeScore || 0,
        averageScore:
          tickerScores.reduce((sum, s) => sum + s.compositeScore, 0) /
          tickerScores.length,
        scoredTickers: tickerScores.filter((s) => s.evidenceCount > 0).length,
      });

      return rankedSnapshot;
    } catch (error) {
      this.logger.error("Universe ranking failed", error);
      throw error;
    }
  }

  /**
   * Compute composite score for a ticker
   * @param {string} ticker - Ticker symbol
   * @returns {Promise<Object>} Score breakdown
   */
  async computeCompositeScore(ticker) {
    // Get evidence bundle
    const evidenceBundle = await this.aiMemoryService.getEvidenceBundle(ticker);

    // Handle case where no evidence exists
    if (!evidenceBundle) {
      return {
        compositeScore: 0, // No evidence = lowest score
        fundamentalsScore: 0,
        newsScore: 0,
        momentumScore: 0,
        riskPenalty: 10, // Penalty for no evidence
        reasonCodes: ["NO_EVIDENCE"],
        evidenceCount: 0,
        lastEvidenceDate: null,
      };
    }

    // Score individual pillars
    const fundamentalsScore = this.scoreFundamentals(
      evidenceBundle.fundamentals
    );
    const newsScore = this.scoreNews(evidenceBundle.news);
    const momentumScore = this.scoreMomentum(evidenceBundle);
    const riskPenalty = this.computeRiskPenalty(
      evidenceBundle,
      fundamentalsScore
    );

    // Compute composite
    const compositeScore = this.computeComposite(
      fundamentalsScore,
      newsScore,
      momentumScore,
      riskPenalty
    );

    // Build reason codes
    const reasonCodes = this.buildReasonCodes(
      fundamentalsScore,
      newsScore,
      momentumScore,
      riskPenalty,
      evidenceBundle
    );

    return {
      compositeScore: Math.max(0, Math.min(100, compositeScore)), // Clamp to 0-100
      fundamentalsScore,
      newsScore,
      momentumScore,
      riskPenalty,
      reasonCodes,
      evidenceCount:
        (evidenceBundle.fundamentals?.length || 0) +
        (evidenceBundle.news?.length || 0),
      lastEvidenceDate: this.getLatestEvidenceDate(evidenceBundle),
    };
  }

  /**
   * Score fundamentals pillar
   * @param {Array} fundamentals - Fundamentals evidence items
   * @returns {number} Score 0-100
   */
  scoreFundamentals(fundamentals) {
    if (!fundamentals || fundamentals.length === 0) {
      return 0;
    }

    // Use most recent fundamentals
    const latest = fundamentals[0];
    if (!latest || !latest.asOfDate) {
      return 0;
    }

    // Check freshness
    const ageDays =
      (Date.now() - new Date(latest.asOfDate).getTime()) /
      (1000 * 60 * 60 * 24);
    if (ageDays > RANKING_CONFIG.FRESHNESS.MAX_FUNDAMENTALS_AGE_DAYS) {
      return 10; // Low score for stale data
    }

    let score = 50; // Base score

    // Cash runway (higher is better)
    if (latest.cash && latest.totalDebt !== undefined) {
      const netCash = latest.cash - latest.totalDebt;
      if (netCash > 100000000) score += 20; // >$100M net cash
      else if (netCash > 50000000) score += 15; // >$50M net cash
      else if (netCash > 0) score += 10; // Positive net cash
      else score -= 15; // Negative net cash
    }

    // Market cap (mid-range preferred for micro-cap strategy)
    if (latest.marketCap) {
      if (latest.marketCap > 200000000) score -= 10; // Too large
      else if (latest.marketCap < 30000000) score -= 5; // Too small
      else score += 5; // Sweet spot
    }

    // Operating cash flow (positive preferred)
    if (latest.operatingCashFlow) {
      if (latest.operatingCashFlow > 0) score += 10;
      else score -= 10;
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Score news pillar
   * @param {Array} news - News evidence items
   * @returns {number} Score 0-100
   */
  scoreNews(news) {
    if (!news || news.length === 0) {
      return 0;
    }

    let totalScore = 0;
    let itemCount = 0;

    for (const item of news.slice(0, RANKING_CONFIG.MAX_NEWS_ITEMS)) {
      // Limit items
      const itemScore = this.scoreNewsItem(item);
      totalScore += itemScore;
      itemCount++;
    }

    // Normalize to 0-100 scale
    if (itemCount === 0) return 0;

    const averageScore = totalScore / itemCount;
    return Math.max(0, Math.min(100, averageScore));
  }

  /**
   * Score individual news item
   * @param {Object} item - News item
   * @returns {number} Item score
   */
  scoreNewsItem(item) {
    if (!item || !item.publishedAt) {
      return 0;
    }

    // Base event weight
    const eventWeight = this.getEventWeight(item);

    // Recency decay
    const ageDays = item.recencyDays || 0;
    const recencyDecay = Math.exp(-RANKING_CONFIG.RECENCY.LAMBDA * ageDays);

    // Source weight
    const sourceWeight = this.getSourceWeight(item);

    // Uniqueness (simple - could be enhanced)
    const uniqueness = 1.0; // Assume unique for now

    // Sentiment proxy (basic keyword matching)
    const sentiment = this.getSentimentScore(item);

    const itemScore =
      eventWeight * recencyDecay * sourceWeight * uniqueness + sentiment;

    return itemScore * 100; // Scale to 0-100
  }

  /**
   * Get event weight based on news content
   * @param {Object} item - News item
   * @returns {number} Event weight 0-1
   */
  getEventWeight(item) {
    const text = (item.headline + " " + (item.snippet || "")).toLowerCase();

    // Check for keywords in priority order
    for (const [category, config] of Object.entries(
      RANKING_CONFIG.EVENT_WEIGHTS
    )) {
      for (const keyword of config.keywords) {
        if (text.includes(keyword.toLowerCase())) {
          return config.weight;
        }
      }
    }

    return RANKING_CONFIG.EVENT_WEIGHTS.GENERIC_PR.weight; // Default
  }

  /**
   * Get source weight
   * @param {Object} item - News item
   * @returns {number} Source weight 0-1
   */
  getSourceWeight(item) {
    const source = (item.sourceName || item.source || "").toLowerCase();

    for (const [tier, config] of Object.entries(
      RANKING_CONFIG.SOURCE_WEIGHTS
    )) {
      for (const domain of config.domains) {
        if (source.includes(domain.toLowerCase())) {
          return config.weight;
        }
      }
    }

    return RANKING_CONFIG.SOURCE_WEIGHTS.TIER_3.weight; // Default
  }

  /**
   * Get basic sentiment score from keywords
   * @param {Object} item - News item
   * @returns {number} Sentiment modifier
   */
  getSentimentScore(item) {
    const text = (item.headline + " " + (item.snippet || "")).toLowerCase();

    let score = 0;

    // Positive keywords
    for (const keyword of RANKING_CONFIG.SENTIMENT.POSITIVE) {
      if (text.includes(keyword.toLowerCase())) {
        score += 5;
      }
    }

    // Negative keywords
    for (const keyword of RANKING_CONFIG.SENTIMENT.NEGATIVE) {
      if (text.includes(keyword.toLowerCase())) {
        score -= 10;
      }
    }

    return Math.max(-20, Math.min(20, score)); // Clamp
  }

  /**
   * Score momentum/liquidity pillar
   * @param {Object} evidenceBundle - Full evidence bundle
   * @returns {number} Score 0-100
   */
  scoreMomentum(evidenceBundle) {
    // This is a simplified version - could be enhanced with actual price/volume data
    // For now, return neutral score
    return 50;
  }

  /**
   * Compute risk penalty
   * @param {Object} evidenceBundle - Evidence bundle
   * @param {number} fundamentalsScore - Fundamentals score
   * @returns {number} Penalty 0-50 (higher = worse)
   */
  computeRiskPenalty(evidenceBundle, fundamentalsScore) {
    let penalty = 0;

    // Low fundamentals score penalty
    if (fundamentalsScore < 30) {
      penalty += 10;
    }

    // No recent news penalty
    const recentNews =
      evidenceBundle.news?.filter((item) => (item.recencyDays || 0) < 30) || [];
    if (recentNews.length === 0) {
      penalty += 5;
    }

    // Stale evidence penalty
    const latestDate = this.getLatestEvidenceDate(evidenceBundle);
    if (latestDate) {
      const ageDays =
        (Date.now() - new Date(latestDate).getTime()) / (1000 * 60 * 60 * 24);
      if (ageDays > 60) {
        penalty += 15;
      }
    }

    return Math.min(50, penalty);
  }

  /**
   * Compute composite score
   * @param {number} fundamentals - Fundamentals score
   * @param {number} news - News score
   * @param {number} momentum - Momentum score
   * @param {number} riskPenalty - Risk penalty
   * @returns {number} Composite score
   */
  computeComposite(fundamentals, news, momentum, riskPenalty) {
    const weights = RANKING_CONFIG.WEIGHTS;

    return (
      fundamentals * weights.FUNDAMENTALS +
      news * weights.NEWS +
      momentum * weights.MOMENTUM -
      riskPenalty * weights.RISK_PENALTY
    );
  }

  /**
   * Build reason codes for transparency
   * @param {number} fundamentals - Fundamentals score
   * @param {number} news - News score
   * @param {number} momentum - Momentum score
   * @param {number} riskPenalty - Risk penalty
   * @param {Object} evidenceBundle - Evidence bundle
   * @returns {Array<string>} Reason codes
   */
  buildReasonCodes(fundamentals, news, momentum, riskPenalty, evidenceBundle) {
    const codes = [];

    // Fundamentals reasons
    if (fundamentals > 70) codes.push("STRONG_FUNDAMENTALS");
    else if (fundamentals > 50) codes.push("SOLID_FUNDAMENTALS");
    else if (fundamentals < 30) codes.push("WEAK_FUNDAMENTALS");

    // News reasons
    if (news > 60) codes.push("POSITIVE_NEWS");
    else if (news < 30) codes.push("NEGATIVE_NEWS");

    // Evidence freshness
    const latestDate = this.getLatestEvidenceDate(evidenceBundle);
    if (latestDate) {
      const ageDays =
        (Date.now() - new Date(latestDate).getTime()) / (1000 * 60 * 60 * 24);
      if (ageDays > 60) codes.push("STALE_EVIDENCE");
      else if (ageDays < 7) codes.push("FRESH_EVIDENCE");
    }

    // Evidence volume
    const evidenceCount =
      (evidenceBundle.fundamentals?.length || 0) +
      (evidenceBundle.news?.length || 0);
    if (evidenceCount === 0) codes.push("NO_EVIDENCE");
    else if (evidenceCount > 10) codes.push("RICH_EVIDENCE");

    return codes.length > 0 ? codes : ["NEUTRAL"];
  }

  /**
   * Get latest evidence date
   * @param {Object} evidenceBundle - Evidence bundle
   * @returns {string|null} Latest date or null
   */
  getLatestEvidenceDate(evidenceBundle) {
    const dates = [];

    // Fundamentals dates
    if (evidenceBundle.fundamentals) {
      evidenceBundle.fundamentals.forEach((item) => {
        if (item.asOfDate) dates.push(new Date(item.asOfDate));
      });
    }

    // News dates
    if (evidenceBundle.news) {
      evidenceBundle.news.forEach((item) => {
        if (item.publishedAt) dates.push(new Date(item.publishedAt));
      });
    }

    if (dates.length === 0) return null;

    return new Date(Math.max(...dates.map((d) => d.getTime()))).toISOString();
  }
}

module.exports = RankerService;
