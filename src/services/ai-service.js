/**
 * AI Service for ChatGPT integration
 * Handles prompt generation and response parsing for trading decisions
 */

const OpenAI = require("openai");
const Logger = require("../utils/logger");
const Validators = require("../utils/validators");
const ErrorHandler = require("../utils/error-handler");
const { getEnvConfig } = require("../config/environment");
const { PORTFOLIO_CONFIG } = require("../config/constants");
const AIMemoryService = require("./ai-memory-service");

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
      const response = await this.callOpenAI(prompt);
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
   * Build the trading prompt using the exact format from Python script
   */
  buildTradingPrompt(portfolioData, marketData, aiContext = "") {
    const today = this.getTradingDate();
    const portfolioSnapshot = this.formatPortfolioSnapshot(portfolioData);
    const priceVolumeTable = this.formatPriceVolumeTable(marketData);
    const performanceMetrics = this.formatPerformanceMetrics(portfolioData);
    const holdingsTable = this.formatHoldingsTable(portfolioData);
    const positionSizing = this.formatPositionSizing(portfolioData, marketData);

    // Replicate the exact prompt format from Python daily_results()
    return `================================================================
Daily Results — ${today}
================================================================

${priceVolumeTable}

${performanceMetrics}

${portfolioSnapshot}

${positionSizing}

${holdingsTable}

${aiContext}

[ Your Instructions - AI Portfolio Manager ]
You are an expert AI portfolio manager specializing in micro-cap biotechnology investments. Your goal is to maximize long-term returns through intelligent portfolio optimization using pre-researched data.

CORE RESPONSIBILITIES:
1. Review recent research findings and market analysis
2. Evaluate current portfolio positioning and performance
3. Make buy/sell/hold decisions based on research insights
4. Optimize portfolio allocation using position sizing guidelines
5. Manage risk through diversification and stop-loss placement

DECISION FRAMEWORK:
1. Review recent research and discoveries from the research pipeline
2. Assess current portfolio composition and performance
3. Identify opportunities based on research findings
4. Determine optimal position sizes and allocations
5. Generate clear buy/sell/hold decisions with reasoning

PORTFOLIO OPTIMIZATION:
- Use pre-researched data to inform trading decisions
- Follow established position sizing guidelines (3-12% per position)
- Target 8-12 high-conviction positions
- Implement stop-loss protection
- Maintain diversification across therapeutic areas

You have access to comprehensive research data and should use it to make informed trading decisions. Focus on execution rather than research at this stage.

*Paste everything above into ChatGPT*

Based on your research and analysis, provide your portfolio management decisions in the following strict JSON format:

{
  "version": "2.0",
  "generatedAt": "${new Date().toISOString()}",
  "researchSummary": "Brief summary of sector analysis and key findings",
  "decisions": [
    {
      "action": "BUY|SELL|HOLD|RESEARCH",
      "ticker": "SYMBOL",
      "shares": 100,
      "orderType": "market|limit",
      "limitPrice": 6.25,
      "timeInForce": "day|gtc",
      "stopLoss": 5.4,
      "research": "Company analysis, pipeline, valuation, catalysts",
      "confidence": 0.85,
      "rationale": "Investment thesis and expected outcome"
    }
  ],
  "newDiscoveries": [
    {
      "ticker": "SYMBOL",
      "companyName": "Company Name",
      "marketCap": 75000000,
      "researchNotes": "Key findings and investment potential",
      "recommendedAction": "BUY|HOLD|MONITOR"
    }
  ],
  "portfolioStrategy": "Overall portfolio positioning and rebalancing plan",
  "riskAssessment": "Risk factors and mitigation strategies",
  "nextResearchFocus": "Areas for further investigation"
}`;
  }

  /**
   * Build research-focused prompt (no trading decisions)
   */
  buildResearchPrompt(portfolioData, marketData, aiContext = "") {
    const today = this.getTradingDate();
    const portfolioSnapshot = this.formatPortfolioSnapshot(portfolioData);
    const priceVolumeTable = this.formatPriceVolumeTable(marketData);
    const performanceMetrics = this.formatPerformanceMetrics(portfolioData);

    // Research-only prompt (no position sizing or trading instructions)
    return `================================================================
Market Research Analysis — ${today}
================================================================

${priceVolumeTable}

${performanceMetrics}

${portfolioSnapshot}

${aiContext}

[ Your Instructions - Research Analyst ]
You are an expert micro-cap biotech research analyst. Your task is to perform comprehensive sector analysis and identify promising investment opportunities.

RESEARCH OBJECTIVES:
1. Analyze the current micro-cap biotech sector landscape
2. Identify emerging trends and therapeutic areas with potential
3. Evaluate individual company fundamentals and growth prospects
4. Assess competitive positioning and market opportunities
5. Identify catalysts and timeline expectations

ANALYSIS FRAMEWORK:
- Focus on companies with market cap $50M-$500M
- Evaluate clinical pipelines and development timelines
- Assess management quality and strategic execution
- Consider cash positions, burn rates, and financing needs
- Look for undervalued opportunities with strong fundamentals

Based on your analysis, provide comprehensive research findings in the following strict JSON format:

{
  "version": "2.0",
  "generatedAt": "${new Date().toISOString()}",
  "researchSummary": "Comprehensive sector analysis summary",
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
      "fundamentalAnalysis": "Detailed analysis of pipeline, management, financials",
      "competitivePosition": "Market position and differentiation",
      "catalysts": ["catalyst1", "catalyst2"],
      "risks": ["risk1", "risk2"],
      "valuation": "undervalued|fair|overvalued",
      "recommendation": "BUY|MONITOR|AVOID",
      "convictionLevel": "high|medium|low",
      "qualityScore": 85,
      "researchNotes": "Key investment highlights and concerns"
    }
  ],
  "newDiscoveries": [
    {
      "ticker": "TICKER",
      "companyName": "Company Name",
      "discoveryReason": "Why this company is interesting",
      "initialAnalysis": "Preliminary assessment"
    }
  ],
  "nextResearchFocus": "Areas requiring further investigation"
}`;
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
  async callOpenAI(prompt) {
    try {
      const response = await this.client.chat.completions.create({
        model: this.envConfig.aiModel,
        messages: [
          {
            role: "system",
            content:
              "You are a professional-grade portfolio strategist managing a micro-cap biotech portfolio. You have complete control over position sizing, risk management, stop-loss placement, and order types. Make clear, actionable trading decisions and respond only with valid JSON.",
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
   * Format portfolio snapshot section
   */
  formatPortfolioSnapshot(portfolioData) {
    return `[ Snapshot ]
Latest ChatGPT Equity: $${portfolioData.totalValue?.toFixed(2) || "0.00"}
Cash Balance: $${portfolioData.cash?.toFixed(2) || "0.00"}`;
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
   * Format performance metrics
   */
  formatPerformanceMetrics(portfolioData) {
    // This would calculate actual performance metrics
    // For now, return placeholder
    return `[ Risk & Return ]
Sharpe Ratio (annualized):                2.145
Sortino Ratio (annualized):               3.234

[ CAPM vs Benchmarks ]
Beta (daily) vs ^GSPC:                    1.234
Alpha (annualized) vs ^GSPC:             15.67%
R² (fit quality):                          0.456`;
  }

  /**
   * Format position sizing guidelines
   */
  formatPositionSizing(portfolioData, marketData) {
    const lines = [];
    lines.push(`[ Portfolio Management Guidelines ]`);
    lines.push(`Available Cash: $${portfolioData.cash?.toFixed(2) || "0.00"}`);
    lines.push(
      `Current Portfolio Value: $${
        portfolioData.totalValue?.toFixed(2) || "0.00"
      }`
    );
    lines.push(``);
    lines.push(`PORTFOLIO CONSTRUCTION RULES:`);
    lines.push(
      `• Target: ${PORTFOLIO_CONFIG.TARGET_POSITIONS.MIN}-${PORTFOLIO_CONFIG.TARGET_POSITIONS.MAX} micro-cap biotech positions`
    );
    lines.push(
      `• Max per position: ${(
        PORTFOLIO_CONFIG.POSITION_SIZING.MAX_PERCENT * 100
      ).toFixed(0)}% of total portfolio ($${
        (
          portfolioData.totalValue *
          PORTFOLIO_CONFIG.POSITION_SIZING.MAX_PERCENT
        )?.toFixed(2) || "0.00"
      })`
    );
    lines.push(
      `• Min per position: ${(
        PORTFOLIO_CONFIG.POSITION_SIZING.MIN_PERCENT * 100
      ).toFixed(0)}% of total portfolio ($${
        (
          portfolioData.totalValue *
          PORTFOLIO_CONFIG.POSITION_SIZING.MIN_PERCENT
        )?.toFixed(2) || "0.00"
      })`
    );
    lines.push(`• Risk management: Stop losses at 20-30% below entry`);
    lines.push(`• Diversification: Spread across different therapeutic areas`);
    lines.push(``);
    lines.push(`POSITION SIZING EXAMPLES:`);

    // Calculate position sizes for promising micro-cap biotech stocks
    const promisingTickers = ["OCUP", "BPTH", "PDSB", "VTVT", "INMB"];

    promisingTickers.forEach((ticker) => {
      const data = marketData[ticker];
      if (data && data.data && data.data.length > 0) {
        const latest = data.data[data.data.length - 1];
        const price = latest.close || latest.price || 0;

        if (price > 0) {
          const maxPositionValue =
            portfolioData.totalValue *
            PORTFOLIO_CONFIG.POSITION_SIZING.MAX_PERCENT;
          const maxShares = Math.floor(maxPositionValue / price);
          const positionValue = (maxShares * price).toFixed(2);
          lines.push(
            `${ticker}: Max ${maxShares} shares ($${positionValue}) at $${price.toFixed(
              2
            )}`
          );
        }
      }
    });

    lines.push(``);
    lines.push(`RESEARCH PRIORITIES:`);
    lines.push(`• Focus on companies with market cap $50M-$500M`);
    lines.push(
      `• Prioritize companies with clinical catalysts in next 12-24 months`
    );
    lines.push(`• Look for undervalued stocks with strong pipelines`);
    lines.push(`• Consider cash position and burn rate`);
    lines.push(``);
    lines.push(
      `💡 IMPORTANT: Build a diversified portfolio through research-driven stock selection`
    );

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
