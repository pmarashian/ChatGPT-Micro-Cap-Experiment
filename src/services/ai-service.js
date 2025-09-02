/**
 * AI Service for ChatGPT integration
 * Handles prompt generation and response parsing for trading decisions
 */

const OpenAI = require("openai");
const Logger = require("../utils/logger");
const Validators = require("../utils/validators");
const ErrorHandler = require("../utils/error-handler");
const { getEnvConfig } = require("../config/environment");

class AIService {
  constructor() {
    this.logger = new Logger("ai-service");
    this.validators = new Validators();
    this.errorHandler = new ErrorHandler("ai-service");
    this.envConfig = getEnvConfig();

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

      const prompt = this.buildTradingPrompt(portfolioData, marketData);
      const response = await this.callOpenAI(prompt);
      const parsedResponse = this.parseTradingDecision(response);

      // Validate response schema
      this.validators.validateAiDecisionResponse(parsedResponse);

      this.logger.info("AI decision generated successfully", {
        decisionCount: parsedResponse.decisions.length,
        stopLossUpdates: parsedResponse.stopLossUpdates?.length || 0,
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
  buildTradingPrompt(portfolioData, marketData) {
    const today = this.getTradingDate();
    const portfolioSnapshot = this.formatPortfolioSnapshot(portfolioData);
    const priceVolumeTable = this.formatPriceVolumeTable(marketData);
    const performanceMetrics = this.formatPerformanceMetrics(portfolioData);
    const holdingsTable = this.formatHoldingsTable(portfolioData);

    // Replicate the exact prompt format from Python daily_results()
    return `================================================================
Daily Results — ${today}
================================================================

${priceVolumeTable}

${performanceMetrics}

${portfolioSnapshot}

${holdingsTable}

[ Your Instructions ]
Use this info to make decisions regarding your portfolio. You have complete control over every decision. Make any changes you believe are beneficial—no approval required.
Deep research is not permitted. Act at your discretion to achieve the best outcome.
If you do not make a clear indication to change positions IMMEDIATELY after this message, the portfolio remains unchanged for tomorrow.
You are encouraged to use the internet to check current prices (and related up-to-date info) for potential buys.

*Paste everything above into ChatGPT*

Based on the above portfolio information, provide your trading decisions in the following strict JSON format:

{
  "version": "1.0",
  "generatedAt": "${new Date().toISOString()}",
  "decisions": [
    {
      "action": "BUY|SELL|HOLD",
      "ticker": "SYMBOL",
      "shares": 10,
      "orderType": "market|limit",
      "limitPrice": 6.25,
      "timeInForce": "day|gtc",
      "stopLoss": 5.4,
      "reasoning": "Concise one-liner",
      "confidence": 0.85
    }
  ],
  "stopLossUpdates": [
    {
      "ticker": "SYMBOL",
      "stopLoss": 6.0
    }
  ],
  "riskAssessment": "Concise summary",
  "notes": "Optional additional notes"
}`;
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
        parsed.version = "1.0";
      }

      // Ensure decisions array exists
      if (!parsed.decisions) {
        parsed.decisions = [];
      }

      // Ensure stopLossUpdates array exists
      if (!parsed.stopLossUpdates) {
        parsed.stopLossUpdates = [];
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
    // This would be populated with actual market data
    // For now, return a placeholder structure
    return `[ Price & Volume ]
Ticker            Close     % Chg          Volume
-------------------------------------------------
SPY               450.25    +1.23%       45,678,901
IWO              280.45    +2.15%        1,234,567
XBI               85.32    -0.45%        8,765,432
IWM              210.18    +1.87%        2,345,678`;
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
