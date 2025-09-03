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
