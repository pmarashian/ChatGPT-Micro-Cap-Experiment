/**
 * AI Service for ChatGPT integration
 * Handles prompt generation and response parsing for trading decisions
 */

const OpenAI = require("openai");
const Logger = require("../utils/logger");
const Validators = require("../utils/validators");
const ErrorHandler = require("../utils/error-handler");
const { getEnvConfig } = require("../config/environment");
const AIMemoryService = require("./ai-memory-service");
const {
  SYSTEM_MESSAGE_TRADING,
  SYSTEM_MESSAGE_RESEARCH,
  buildTradingPrompt,
  buildResearchPrompt,
  formatPortfolioSnapshot,
  formatPerformanceMetrics,
  formatPositionSizing,
} = require("../config/prompts");

class AIService {
  constructor() {
    this.logger = new Logger("ai-service");
    this.validators = new Validators();
    this.errorHandler = new ErrorHandler("ai-service");
    this.envConfig = getEnvConfig();
    this.memoryService = new AIMemoryService();

    // Initialize OpenAI client
    this.client = new OpenAI({
      apiKey: this.envConfig.aiApiKey,
    });
  }

  /**
   * Get trading decisions from AI
   * @param {Object} portfolioData - Current portfolio state
   * @param {Object} marketData - Current market data
   * @returns {Promise<Object>} AI trading decisions
   */
  async getTradingDecision(portfolioData, marketData) {
    try {
      this.logger.info("Generating AI trading decision", {
        portfolioValue: portfolioData.totalValue,
        positions: portfolioData.positions?.length || 0,
      });

      // Get AI context from previous research and decisions
      const aiContext = await this.memoryService.buildAIContext();

      const prompt = this.buildTradingPrompt(
        portfolioData,
        marketData,
        aiContext
      );
      this.logger.info("🔍 PROMPT:", prompt);
      const response = await this.callOpenAI(prompt, false); // false for trading decisions
      this.logger.info("🔍 RAW AI RESPONSE:", response);
      this.logger.debug("Raw AI response length", response.length);
      const parsedResponse = this.parseTradingDecision(response);

      // TEMPORARILY DISABLE VALIDATION TO DEBUG
      // this.validators.validateAiDecisionResponse(parsedResponse);
      this.logger.info("🔍 PARSED RESPONSE:", parsedResponse);

      // Save AI research and decisions to memory
      try {
        await this.memoryService.saveAIResearch(parsedResponse);
        await this.memoryService.saveAIDecisions(parsedResponse);
        await this.memoryService.saveMarketData(marketData);
      } catch (memoryError) {
        this.logger.warn("Failed to save AI memory", memoryError);
        // Don't fail the whole operation if memory save fails
      }

      this.logger.info("AI decision generated successfully", {
        decisionCount: parsedResponse.decisions.length,
        newDiscoveries: parsedResponse.newDiscoveries?.length || 0,
        hasResearchSummary: !!parsedResponse.researchSummary,
      });

      return parsedResponse;
    } catch (error) {
      this.logger.error("AI decision generation failed", error);
      throw error;
    }
  }

  /**
   * Get grounded research from AI with evidence citations
   * @param {Object} portfolioData - Current portfolio state
   * @param {Object} marketData - Current market data
   * @param {string} aiContext - Historical AI context
   * @param {Object} evidenceBundle - Evidence bundle with fundamentals and news
   * @returns {Promise<Object>} AI research with citations
   */
  async getGroundedResearch(
    portfolioData,
    marketData,
    aiContext,
    evidenceBundle
  ) {
    try {
      this.logger.info("Generating AI grounded research", {
        portfolioValue: portfolioData.totalValue,
        tickersWithEvidence: Object.keys(evidenceBundle).length,
      });

      const prompt = this.buildGroundedResearchPrompt(
        portfolioData,
        marketData,
        aiContext,
        evidenceBundle
      );

      this.logger.debug("Grounded research prompt built", {
        promptLength: prompt.length,
        evidenceTickers: Object.keys(evidenceBundle).length,
      });

      // Call OpenAI with research system message
      const response = await this.callOpenAI(prompt, true); // true for research
      this.logger.debug("Raw AI research response received", response.length);

      // Parse and validate research response
      const parsedResponse = this.parseResearchResponse(response);

      // Validate citations and retry if necessary
      const validatedResponse = await this.validateAndRetryCitations(
        parsedResponse,
        prompt,
        portfolioData,
        marketData,
        aiContext,
        evidenceBundle
      );

      // Save research to memory
      try {
        await this.memoryService.saveAIResearch(validatedResponse);
        this.logger.debug("Grounded research saved to memory");
      } catch (memoryError) {
        this.logger.warn(
          "Failed to save grounded research to memory",
          memoryError
        );
      }

      this.logger.info("Grounded research generated successfully", {
        companyEvaluations: validatedResponse.companyEvaluations?.length || 0,
        totalCitations: this.countTotalCitations(validatedResponse),
      });

      return validatedResponse;
    } catch (error) {
      this.logger.error("Grounded research generation failed", error);
      throw error;
    }
  }

  /**
   * Build the trading prompt using centralized prompts
   */
  buildTradingPrompt(portfolioData, marketData, aiContext = "") {
    const today = this.getTradingDate();
    const portfolioSnapshot = formatPortfolioSnapshot(portfolioData);
    const priceVolumeTable = this.formatPriceVolumeTable(marketData);
    const performanceMetrics = formatPerformanceMetrics();
    const holdingsTable = this.formatHoldingsTable(portfolioData);
    const positionSizing = formatPositionSizing(portfolioData, marketData);

    return buildTradingPrompt(
      today,
      portfolioSnapshot,
      priceVolumeTable,
      performanceMetrics,
      positionSizing,
      holdingsTable,
      aiContext
    );
  }

  /**
   * Build research-focused prompt using centralized prompts
   */
  buildResearchPrompt(portfolioData, marketData, aiContext = "") {
    const today = this.getTradingDate();
    const portfolioSnapshot = formatPortfolioSnapshot(portfolioData);
    const priceVolumeTable = this.formatPriceVolumeTable(marketData);
    const performanceMetrics = formatPerformanceMetrics();

    return buildResearchPrompt(
      today,
      portfolioSnapshot,
      priceVolumeTable,
      performanceMetrics,
      aiContext
    );
  }

  /**
   * Build grounded research prompt with evidence
   * @param {Object} portfolioData - Current portfolio state
   * @param {Object} marketData - Current market data
   * @param {string} aiContext - Historical AI context
   * @param {Object} evidenceBundle - Evidence bundle with fundamentals and news
   * @returns {string} Complete research prompt
   */
  buildGroundedResearchPrompt(
    portfolioData,
    marketData,
    aiContext,
    evidenceBundle
  ) {
    const today = this.getTradingDate();
    const portfolioSnapshot = formatPortfolioSnapshot(portfolioData);
    const priceVolumeTable = this.formatPriceVolumeTable(marketData);
    const performanceMetrics = formatPerformanceMetrics();
    const evidenceSection = this.formatEvidenceBundle(evidenceBundle);

    return `================================================================
Evidence-Grounded Research Analysis — ${today}
================================================================

${priceVolumeTable}

${performanceMetrics}

${portfolioSnapshot}

${evidenceSection}

${aiContext}

[ Your Instructions - Evidence-Grounded Research Analyst ]
You are an expert micro-cap biotech research analyst. Your task is to perform comprehensive analysis using the provided evidence (fundamentals + news) and generate well-supported research with mandatory citations.

EVIDENCE REQUIREMENTS:
- Use ONLY the provided evidence for your analysis
- Cite specific URLs from news articles and fundamentals sources
- Each material claim must have at least one citation
- Citations must include source, published date, and relevant snippet

CITATION FORMAT:
- Per-company citations required (not per-claim for v1)
- Format: [{ "url": "...", "source": "...", "publishedAt": "...", "snippet": "..." }]

ANALYSIS FRAMEWORK:
1. Review all provided evidence for each company
2. Evaluate fundamentals (cash position, runway, valuation)
3. Analyze recent news and catalysts
4. Assess competitive positioning and market opportunities
5. Generate research with citations for each evaluated company

IMPORTANT: If you cannot find sufficient evidence to evaluate a company, exclude it from your analysis rather than making unsupported claims.

Based on your analysis of the provided evidence, provide comprehensive research findings in the following strict JSON format:

{
  "version": "2.0",
  "generatedAt": "${new Date().toISOString()}",
  "researchSummary": "Comprehensive sector analysis summary based on evidence",
  "sectorAnalysis": {
    "overallSentiment": "bullish|neutral|bearish",
    "keyTrends": ["trend1", "trend2"],
    "riskFactors": ["risk1", "risk2"],
    "opportunityAreas": ["area1", "area2"]
  },
  "companyEvaluations": [
    {
      "ticker": "TICKER",
      "companyName": "Company Name",
      "marketCap": 75000000,
      "sector": "oncology|neurology|cardiology|etc",
      "fundamentalAnalysis": "Analysis based on provided fundamentals data",
      "competitivePosition": "Market position based on evidence",
      "catalysts": ["catalyst1", "catalyst2"],
      "risks": ["risk1", "risk2"],
      "valuation": "undervalued|fair|overvalued",
      "recommendation": "BUY|MONITOR|AVOID",
      "convictionLevel": "high|medium|low",
      "qualityScore": 85,
      "citations": [
        {
          "url": "https://example.com/article",
          "source": "FMP",
          "publishedAt": "2024-01-15T10:00:00Z",
          "snippet": "Relevant text from article or fundamentals..."
        }
      ]
    }
  ],
  "nextResearchFocus": "Areas requiring further investigation"
}`;
  }

  /**
   * Format evidence bundle for prompt inclusion
   * @param {Object} evidenceBundle - Evidence bundle with fundamentals and news
   * @returns {string} Formatted evidence section
   */
  formatEvidenceBundle(evidenceBundle) {
    let evidenceSection = "[ Evidence Bundle ]\n";

    Object.keys(evidenceBundle).forEach((ticker) => {
      const evidence = evidenceBundle[ticker];
      if (!evidence) return;

      evidenceSection += `\n=== ${ticker} ===\n`;

      // Add fundamentals
      if (evidence.fundamentals) {
        evidenceSection += `FUNDAMENTALS (as of ${evidence.fundamentals.asOfDate}):\n`;
        evidenceSection += `- Market Cap: $${evidence.fundamentals.marketCap?.toLocaleString()}\n`;
        evidenceSection += `- Shares Outstanding: ${evidence.fundamentals.sharesOutstanding?.toLocaleString()}\n`;
        evidenceSection += `- Cash: $${evidence.fundamentals.cash?.toLocaleString()}\n`;
        evidenceSection += `- Total Debt: $${evidence.fundamentals.totalDebt?.toLocaleString()}\n`;
        evidenceSection += `- Operating Cash Flow: $${evidence.fundamentals.operatingCashFlow?.toLocaleString()}\n`;
        evidenceSection += `- Revenue: $${evidence.fundamentals.revenue?.toLocaleString()}\n`;
        if (evidence.fundamentals.runwayMonths) {
          evidenceSection += `- Cash Runway: ${evidence.fundamentals.runwayMonths} months\n`;
        }
        evidenceSection += `\n`;
      }

      // Add recent news
      if (evidence.news && evidence.news.length > 0) {
        evidenceSection += `RECENT NEWS (last 24h):\n`;
        evidence.news.forEach((news, index) => {
          evidenceSection += `${index + 1}. ${news.headline}\n`;
          evidenceSection += `   Source: ${news.source} (${news.publishedAt})\n`;
          evidenceSection += `   URL: ${news.url}\n`;
          evidenceSection += `   Summary: ${news.snippet}\n\n`;
        });
      }
    });

    return evidenceSection;
  }

  /**
   * Validate citations and retry if necessary
   * @param {Object} response - Parsed AI response
   * @param {string} originalPrompt - Original prompt
   * @param {Object} portfolioData - Portfolio data
   * @param {Object} marketData - Market data
   * @param {string} aiContext - AI context
   * @param {Object} evidenceBundle - Evidence bundle
   * @returns {Promise<Object>} Validated response with citations
   */
  async validateAndRetryCitations(
    response,
    originalPrompt,
    portfolioData,
    marketData,
    aiContext,
    evidenceBundle
  ) {
    try {
      // Check if response has company evaluations with citations
      if (
        !response.companyEvaluations ||
        !Array.isArray(response.companyEvaluations)
      ) {
        throw new Error("Missing or invalid companyEvaluations array");
      }

      let needsRetry = false;
      const invalidCompanies = [];

      // Validate each company evaluation has citations
      response.companyEvaluations.forEach((evaluation, index) => {
        if (
          !evaluation.citations ||
          !Array.isArray(evaluation.citations) ||
          evaluation.citations.length === 0
        ) {
          needsRetry = true;
          invalidCompanies.push(evaluation.ticker || `Company ${index + 1}`);
        }
      });

      if (!needsRetry) {
        this.logger.debug("All company evaluations have valid citations");
        return response;
      }

      this.logger.warn("Missing citations detected, retrying", {
        invalidCompanies: invalidCompanies.join(", "),
      });

      // Build retry prompt
      const retryPrompt = this.buildCitationRetryPrompt(
        originalPrompt,
        response,
        invalidCompanies
      );

      // Retry once
      const retryResponse = await this.callOpenAI(retryPrompt, true);
      const retryParsedResponse = this.parseResearchResponse(retryResponse);

      // Validate retry response
      if (
        !retryParsedResponse.companyEvaluations ||
        !Array.isArray(retryParsedResponse.companyEvaluations)
      ) {
        throw new Error("Retry response missing companyEvaluations");
      }

      // Check if retry fixed the issues
      const stillInvalid = [];
      retryParsedResponse.companyEvaluations.forEach((evaluation, index) => {
        if (
          !evaluation.citations ||
          !Array.isArray(evaluation.citations) ||
          evaluation.citations.length === 0
        ) {
          stillInvalid.push(evaluation.ticker || `Company ${index + 1}`);
        }
      });

      if (stillInvalid.length > 0) {
        this.logger.error("Citation validation failed after retry", {
          invalidCompanies: stillInvalid.join(", "),
        });

        // Drop companies without citations and continue
        retryParsedResponse.companyEvaluations =
          retryParsedResponse.companyEvaluations.filter(
            (evaluation) =>
              evaluation.citations &&
              Array.isArray(evaluation.citations) &&
              evaluation.citations.length > 0
          );

        this.logger.warn("Dropped companies without citations", {
          droppedCount:
            response.companyEvaluations.length -
            retryParsedResponse.companyEvaluations.length,
          remainingCount: retryParsedResponse.companyEvaluations.length,
        });
      }

      return retryParsedResponse;
    } catch (error) {
      this.logger.error("Citation validation and retry failed", error);
      throw new Error(`Citation validation error: ${error.message}`);
    }
  }

  /**
   * Build citation retry prompt
   * @param {string} originalPrompt - Original prompt
   * @param {Object} originalResponse - Original response
   * @param {Array} invalidCompanies - Companies missing citations
   * @returns {string} Retry prompt
   */
  buildCitationRetryPrompt(originalPrompt, originalResponse, invalidCompanies) {
    return `${originalPrompt}

[ CITATION VALIDATION FAILURE ]
The following companies are missing required citations:
${invalidCompanies.join(", ")}

CRITICAL REQUIREMENT: Every company evaluation MUST include a "citations" array with at least one citation containing url, source, publishedAt, and snippet.

Please revise your analysis to include proper citations for ALL evaluated companies.`;
  }

  /**
   * Count total citations in response
   * @param {Object} response - AI response
   * @returns {number} Total citation count
   */
  countTotalCitations(response) {
    if (
      !response.companyEvaluations ||
      !Array.isArray(response.companyEvaluations)
    ) {
      return 0;
    }

    return response.companyEvaluations.reduce((total, evaluation) => {
      if (evaluation.citations && Array.isArray(evaluation.citations)) {
        return total + evaluation.citations.length;
      }
      return total;
    }, 0);
  }

  /**
   * Parse research-only response (different from trading decisions)
   */
  parseResearchResponse(responseText) {
    try {
      // Clean the response text
      let cleanText = responseText.trim();

      // Remove markdown code blocks if present
      if (cleanText.startsWith("```json")) {
        cleanText = cleanText.replace(/```json\s*/, "").replace(/```\s*$/, "");
      } else if (cleanText.startsWith("```")) {
        cleanText = cleanText.replace(/```\s*/, "").replace(/```\s*$/, "");
      }

      const parsed = JSON.parse(cleanText);

      // Add generatedAt if not present
      if (!parsed.generatedAt) {
        parsed.generatedAt = new Date().toISOString();
      }

      // Add version if not present
      if (!parsed.version) {
        parsed.version = "2.0";
      }

      // Ensure arrays exist
      if (!parsed.newDiscoveries) {
        parsed.newDiscoveries = [];
      }
      if (!parsed.companyEvaluations) {
        parsed.companyEvaluations = [];
      }

      return parsed;
    } catch (error) {
      this.logger.error("Failed to parse research response", error, {
        responseText,
      });
      throw new Error(`Invalid research response format: ${error.message}`);
    }
  }

  /**
   * Call OpenAI API
   */
  async callOpenAI(prompt, isResearch = false) {
    try {
      const systemMessage = isResearch
        ? SYSTEM_MESSAGE_RESEARCH
        : SYSTEM_MESSAGE_TRADING;

      const response = await this.client.chat.completions.create({
        model: this.envConfig.aiModel,
        messages: [
          {
            role: "system",
            content: systemMessage,
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.1,
        max_tokens: 2000,
        response_format: { type: "json_object" },
      });

      return response.choices[0].message.content;
    } catch (error) {
      this.logger.error("OpenAI API call failed", error);
      throw new Error(`OpenAI API error: ${error.message}`);
    }
  }

  /**
   * Parse AI response into structured format
   */
  parseTradingDecision(responseText) {
    try {
      // Clean the response text
      let cleanText = responseText.trim();

      // Remove markdown code blocks if present
      if (cleanText.startsWith("```json")) {
        cleanText = cleanText.replace(/```json\s*/, "").replace(/```\s*$/, "");
      } else if (cleanText.startsWith("```")) {
        cleanText = cleanText.replace(/```\s*/, "").replace(/```\s*$/, "");
      }

      const parsed = JSON.parse(cleanText);

      // Add generatedAt if not present
      if (!parsed.generatedAt) {
        parsed.generatedAt = new Date().toISOString();
      }

      // Add version if not present
      if (!parsed.version) {
        parsed.version = "2.0";
      }

      // Ensure decisions array exists
      if (!parsed.decisions) {
        parsed.decisions = [];
      }

      // Ensure new discoveries array exists (v2.0)
      if (!parsed.newDiscoveries) {
        parsed.newDiscoveries = [];
      }

      // Ensure research summary exists (v2.0)
      if (!parsed.researchSummary) {
        parsed.researchSummary = "AI analysis of micro-cap biotech sector";
      }

      // Ensure stopLossUpdates array exists (legacy support)
      if (!parsed.stopLossUpdates) {
        parsed.stopLossUpdates = [];
      }

      // Ensure optional fields exist
      if (!parsed.portfolioStrategy) {
        parsed.portfolioStrategy = "Maintain current positioning";
      }
      if (!parsed.riskAssessment) {
        parsed.riskAssessment = "Standard biotech sector risks apply";
      }
      if (!parsed.nextResearchFocus) {
        parsed.nextResearchFocus = "Continue monitoring clinical developments";
      }

      return parsed;
    } catch (error) {
      this.logger.error("Failed to parse AI response", error, { responseText });
      throw new Error(`Invalid AI response format: ${error.message}`);
    }
  }

  /**
   * Get current trading date (handles weekends)
   */
  getTradingDate() {
    const now = new Date();
    const dayOfWeek = now.getUTCDay(); // 0 = Sunday, 6 = Saturday

    // If Saturday, use Friday
    if (dayOfWeek === 6) {
      now.setUTCDate(now.getUTCDate() - 1);
    }
    // If Sunday, use Friday
    else if (dayOfWeek === 0) {
      now.setUTCDate(now.getUTCDate() - 2);
    }

    return now.toISOString().split("T")[0]; // YYYY-MM-DD format
  }

  /**
   * Format price and volume table
   */
  formatPriceVolumeTable(marketData) {
    const lines = [];
    lines.push(`[ Price & Volume ]`);
    lines.push(`Ticker            Close     % Chg          Volume`);
    lines.push(`-------------------------------------------------`);

    // Process each ticker's market data
    // Include benchmarks + micro-cap biotech universe
    const tickers = [
      // Benchmarks
      "SPY",
      "IWO",
      "XBI",
      "IWM",
      // Micro-cap biotech stocks (examples - AI can research more)
      "OCUP",
      "BPTH",
      "BXRX",
      "PDSB",
      "VTVT",
      "INMB",
      "CDTX",
      "MBRX",
      "SNGX",
      "BXRX",
      "TNXP",
      "BXRX",
      "BXRX",
      "BXRX",
      "BXRX",
      "BXRX",
    ];

    tickers.forEach((ticker) => {
      const data = marketData[ticker];

      if (data && data.data && data.data.length > 0) {
        const latest = data.data[data.data.length - 1];

        // Get current price
        const close = latest.close || latest.price || 0;
        this.logger.debug(`Using REAL market data for ${ticker}`, {
          source: data.source,
          close,
          date: latest.date,
          volume: latest.volume,
        });

        // Calculate % change (simplified - would need previous day's data for accuracy)
        const changePercent = latest.changePercent || 0;

        // Get volume
        const volume = latest.volume || 0;

        // Format the line
        const tickerStr = ticker.padEnd(16);
        const closeStr = close.toFixed(2).padStart(8);
        const changeStr = `${
          changePercent >= 0 ? "+" : ""
        }${changePercent.toFixed(2)}%`.padStart(8);
        const volumeStr = volume.toLocaleString().padStart(12);

        lines.push(`${tickerStr}${closeStr}${changeStr}${volumeStr}`);
      } else {
        // Fallback for missing data
        const fallbackPrices = {
          SPY: 450.25,
          IWO: 280.45,
          XBI: 85.32,
          IWM: 210.18,
        };

        const close = fallbackPrices[ticker] || 0;
        const changePercent = ticker === "XBI" ? -0.45 : Math.random() * 4 - 2; // Random change
        const volume = Math.floor(Math.random() * 50000000) + 1000000;

        this.logger.warn(`Using PLACEHOLDER data for ${ticker}`, {
          fallbackPrice: close,
          dataSource: data?.source || "no data",
          dataLength: data?.data?.length || 0,
        });

        const tickerStr = ticker.padEnd(16);
        const closeStr = close.toFixed(2).padStart(8);
        const changeStr = `${
          changePercent >= 0 ? "+" : ""
        }${changePercent.toFixed(2)}%`.padStart(8);
        const volumeStr = volume.toLocaleString().padStart(12);

        lines.push(`${tickerStr}${closeStr}${changeStr}${volumeStr}`);
      }
    });

    return lines.join("\n");
  }

  /**
   * Format holdings table
   */
  formatHoldingsTable(portfolioData) {
    if (!portfolioData.positions || portfolioData.positions.length === 0) {
      return "[ Holdings ]\nNo positions currently held.";
    }

    let table = "[ Holdings ]\n";
    table += "ticker  shares  buy_price  cost_basis  stop_loss\n";

    portfolioData.positions.forEach((position) => {
      table += `${position.ticker.padEnd(8)} ${
        position.shares?.toString().padEnd(8) || "0".padEnd(8)
      } ${position.buyPrice?.toFixed(2).padEnd(10) || "0.00".padEnd(10)} ${
        position.costBasis?.toFixed(2).padEnd(11) || "0.00".padEnd(11)
      } ${position.stopLoss?.toFixed(2) || "0.00"}\n`;
    });

    return table;
  }
}

module.exports = AIService;
