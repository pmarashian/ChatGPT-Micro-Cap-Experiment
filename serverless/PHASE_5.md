# Phase 5: Portfolio Manager

## **Phase Goal** 🎯

Implement the **master portfolio manager** that dynamically allocates capital across multiple market segments based on performance, trends, and market conditions, creating a sophisticated AI-driven portfolio optimization system.

## **What We're Building**

### **Master Portfolio Manager**

- **AI-driven asset allocation** across all segments
- **Dynamic rebalancing** based on performance and trends
- **Market regime detection** and adaptation
- **Cross-segment risk management** and optimization
- **Performance attribution** and analysis

### **Advanced Portfolio Management**

- **Multi-segment optimization** algorithms
- **Risk-adjusted allocation** strategies
- **Correlation-based diversification** management
- **Momentum and mean reversion** strategies
- **Portfolio-level risk controls**

### **Intelligent Decision Making**

- **Market regime identification** (defensive, opportunistic, balanced)
- **Segment rotation** based on market conditions
- **Risk parity** and modern portfolio theory
- **Kelly Criterion** for position sizing
- **Dynamic stop-loss** and risk management

## **Success Criteria** ✅

### **Functional Requirements**

- ✅ **Master portfolio manager operational** and making allocation decisions
- ✅ **Dynamic allocation** working across all segments
- ✅ **Market regime detection** accurate and adaptive
- ✅ **Automated rebalancing** executing correctly
- ✅ **Cross-segment risk management** functional
- ✅ **Performance attribution** working accurately

### **Technical Requirements**

- ✅ **Portfolio optimization algorithms** working efficiently
- ✅ **Real-time allocation decisions** being made
- ✅ **Rebalancing execution** automated and reliable
- ✅ **Risk management systems** functioning correctly
- ✅ **Performance tracking** across all segments
- ✅ **Dashboard integration** for portfolio management

### **Performance Requirements**

- ✅ **Allocation decisions** made within time limits
- ✅ **Rebalancing execution** completing successfully
- ✅ **Risk calculations** accurate and timely
- ✅ **System performance** maintained with portfolio manager
- ✅ **Error handling** robust for allocation failures

## **How to Test Completion**

### **Portfolio Management Testing**

1. **Master portfolio manager making** allocation decisions
2. **Dynamic allocation working** across all segments
3. **Market regime detection** identifying conditions correctly
4. **Automated rebalancing** executing without errors
5. **Cross-segment risk management** functioning properly

### **Integration Testing**

1. **Portfolio manager integrating** with existing segments
2. **Allocation decisions affecting** segment portfolios
3. **Risk management working** across all segments
4. **Performance tracking** accurate for allocations
5. **Dashboard displaying** portfolio management data

### **Performance Testing**

1. **Allocation decisions made** within acceptable time
2. **Rebalancing execution** completing successfully
3. **Risk calculations** accurate and timely
4. **System performance maintained** with portfolio manager
5. **Error handling** working for allocation failures

## **What's NOT Included in Phase 5**

### **Advanced Features**

- ❌ Machine learning for allocation optimization
- ❌ Alternative data integration
- ❌ Advanced risk modeling
- ❌ Custom strategy builder
- ❌ Institutional-grade features

### **Additional Market Segments**

- ❌ Fourth market segment
- ❌ Fifth market segment
- ❌ Custom segment creation
- ❌ Segment templates
- ❌ Segment marketplace

### **Complex Analytics**

- ❌ Advanced backtesting capabilities
- ❌ Risk simulation and modeling
- ❌ Custom performance metrics
- ❌ Advanced reporting features
- ❌ Multi-user collaboration

## **Technical Implementation**

### **Project Structure Updates**

```
phase-5/
├── app/                         # Next.js app directory
│   ├── api/                     # API routes
│   │   ├── portfolio-manager/   # Portfolio management
│   │   ├── allocation/          # Asset allocation
│   │   ├── rebalancing/         # Portfolio rebalancing
│   │   └── risk/                # Risk management
│   ├── dashboard/               # Dashboard pages
│   │   ├── portfolio-manager/   # Portfolio manager dashboard
│   │   ├── allocation/          # Allocation views
│   │   └── risk/                # Risk management views
│   ├── components/              # React components
│   │   ├── PortfolioManager/    # Portfolio management
│   │   ├── Allocation/          # Asset allocation
│   │   └── Risk/                # Risk management
│   ├── lib/                     # Business logic services
│   │   ├── portfolio-manager/   # Master portfolio manager
│   │   │   ├── core/            # Core portfolio management
│   │   │   │   ├── allocation-engine.js      # Asset allocation logic
│   │   │   │   ├── regime-detector.js        # Market regime detection
│   │   │   │   ├── risk-manager.js           # Portfolio risk management
│   │   │   │   ├── rebalancer.js             # Portfolio rebalancing
│   │   │   │   └── optimizer.js              # Portfolio optimization
│   │   │   ├── strategies/      # Allocation strategies
│   │   │   │   ├── equal-weight.js           # Equal weight strategy
│   │   │   │   ├── risk-parity.js            # Risk parity strategy
│   │   │   │   ├── momentum.js               # Momentum strategy
│   │   │   │   ├── mean-reversion.js         # Mean reversion strategy
│   │   │   │   └── regime-adaptive.js        # Regime adaptive strategy
│   │   │   ├── models/          # Mathematical models
│   │   │   │   ├── kelly-criterion.js        # Kelly Criterion
│   │   │   │   ├── black-litterman.js        # Black-Litterman model
│   │   │   │   ├── markowitz.js              # Modern Portfolio Theory
│   │   │   │   └── risk-metrics.js           # Risk metrics calculations
│   │   │   └── services/        # Portfolio services
│   │   │       ├── allocation-service.js     # Allocation execution
│   │   │       ├── rebalancing-service.js    # Rebalancing execution
│   │   │       └── monitoring-service.js     # Portfolio monitoring
│   │   ├── segments/            # Existing segments
│   │   ├── core/                # Enhanced core functionality
│   │   └── shared/              # Shared functionality
│   ├── hooks/                   # Custom React hooks
│   ├── utils/                   # Utility functions
│   └── types/                   # TypeScript definitions
├── public/                      # Static assets
├── next.config.js               # Next.js configuration
├── package.json                 # Dependencies
└── vercel.json                  # Vercel configuration
```

### **Master Portfolio Manager Core**

```typescript
// src/portfolio-manager/core/allocation-engine.ts
interface AllocationDecision {
  segmentId: string;
  targetAllocation: number;
  currentAllocation: number;
  recommendedAction: "increase" | "decrease" | "maintain";
  amount: number;
  reasoning: string;
  riskScore: number;
}

class AllocationEngine {
  private strategies: Map<string, AllocationStrategy> = new Map();
  private currentStrategy: string = "regime-adaptive";
  private regimeDetector: RegimeDetector;
  private riskManager: RiskManager;

  constructor(regimeDetector: RegimeDetector, riskManager: RiskManager) {
    this.regimeDetector = regimeDetector;
    this.riskManager = riskManager;
    this.initializeStrategies();
  }

  private initializeStrategies() {
    this.strategies.set("equal-weight", new EqualWeightStrategy());
    this.strategies.set("risk-parity", new RiskParityStrategy());
    this.strategies.set("momentum", new MomentumStrategy());
    this.strategies.set("mean-reversion", new MeanReversionStrategy());
    this.strategies.set("regime-adaptive", new RegimeAdaptiveStrategy());
  }

  async calculateOptimalAllocation(
    portfolio: MultiSegmentPortfolio,
    marketData: MarketData,
    constraints: AllocationConstraints
  ): Promise<AllocationDecision[]> {
    // Detect current market regime
    const regime = await this.regimeDetector.detectRegime(marketData);

    // Select appropriate strategy based on regime
    const strategy = this.selectStrategy(regime);

    // Calculate optimal allocation using selected strategy
    const allocation = await strategy.calculateAllocation(
      portfolio,
      marketData,
      constraints
    );

    // Apply risk management constraints
    const riskAdjustedAllocation = await this.riskManager.applyRiskConstraints(
      allocation,
      portfolio
    );

    // Generate allocation decisions
    return this.generateAllocationDecisions(portfolio, riskAdjustedAllocation);
  }

  private selectStrategy(regime: MarketRegime): AllocationStrategy {
    switch (regime.type) {
      case "defensive":
        return this.strategies.get("risk-parity")!;
      case "opportunistic":
        return this.strategies.get("momentum")!;
      case "balanced":
        return this.strategies.get("regime-adaptive")!;
      default:
        return this.strategies.get("regime-adaptive")!;
    }
  }

  private generateAllocationDecisions(
    portfolio: MultiSegmentPortfolio,
    targetAllocation: Map<string, number>
  ): AllocationDecision[] {
    const decisions: AllocationDecision[] = [];

    for (const [segmentId, targetWeight] of targetAllocation) {
      const currentWeight = this.calculateCurrentWeight(portfolio, segmentId);
      const action = this.determineAction(currentWeight, targetWeight);
      const amount = this.calculateAmount(
        portfolio,
        currentWeight,
        targetWeight
      );

      decisions.push({
        segmentId,
        targetAllocation: targetWeight,
        currentAllocation: currentWeight,
        recommendedAction: action,
        amount: amount,
        reasoning: this.generateReasoning(segmentId, action, amount),
        riskScore: this.calculateRiskScore(segmentId, portfolio),
      });
    }

    return decisions;
  }

  private determineAction(
    current: number,
    target: number
  ): "increase" | "decrease" | "maintain" {
    const threshold = 0.02; // 2% threshold for rebalancing

    if (Math.abs(current - target) < threshold) return "maintain";
    return current < target ? "increase" : "decrease";
  }

  private calculateAmount(
    portfolio: MultiSegmentPortfolio,
    current: number,
    target: number
  ): number {
    const totalValue = portfolio.total.equity + portfolio.total.cash;
    return (target - current) * totalValue;
  }
}
```

### **Market Regime Detection**

```typescript
// src/portfolio-manager/core/regime-detector.ts
interface MarketRegime {
  type: "defensive" | "opportunistic" | "balanced" | "crisis";
  confidence: number;
  indicators: RegimeIndicator[];
  timestamp: Date;
}

interface RegimeIndicator {
  name: string;
  value: number;
  threshold: number;
  weight: number;
}

class RegimeDetector {
  private indicators: RegimeIndicator[] = [
    { name: "volatility", value: 0, threshold: 0.25, weight: 0.3 },
    { name: "correlation", value: 0, threshold: 0.7, weight: 0.25 },
    { name: "momentum", value: 0, threshold: 0.15, weight: 0.2 },
    { name: "drawdown", value: 0, threshold: 0.1, weight: 0.15 },
    { name: "liquidity", value: 0, threshold: 0.5, weight: 0.1 },
  ];

  async detectRegime(marketData: MarketData): Promise<MarketRegime> {
    // Calculate current indicator values
    await this.updateIndicators(marketData);

    // Calculate regime scores
    const scores = this.calculateRegimeScores();

    // Determine regime type
    const regime = this.determineRegimeType(scores);

    // Calculate confidence
    const confidence = this.calculateConfidence(scores);

    return {
      type: regime,
      confidence: confidence,
      indicators: this.indicators,
      timestamp: new Date(),
    };
  }

  private async updateIndicators(marketData: MarketData): Promise<void> {
    // Update volatility indicator
    this.indicators[0].value = await this.calculateVolatility(marketData);

    // Update correlation indicator
    this.indicators[1].value = await this.calculateCorrelation(marketData);

    // Update momentum indicator
    this.indicators[2].value = await this.calculateMomentum(marketData);

    // Update drawdown indicator
    this.indicators[3].value = await this.calculateDrawdown(marketData);

    // Update liquidity indicator
    this.indicators[4].value = await this.calculateLiquidity(marketData);
  }

  private calculateRegimeScores(): Map<string, number> {
    const scores = new Map<string, number>();

    // Calculate defensive score (high volatility, high correlation, negative momentum)
    const defensiveScore = this.calculateDefensiveScore();
    scores.set("defensive", defensiveScore);

    // Calculate opportunistic score (low volatility, low correlation, positive momentum)
    const opportunisticScore = this.calculateOpportunisticScore();
    scores.set("opportunistic", opportunisticScore);

    // Calculate balanced score (moderate indicators)
    const balancedScore = this.calculateBalancedScore();
    scores.set("balanced", balancedScore);

    // Calculate crisis score (extreme negative indicators)
    const crisisScore = this.calculateCrisisScore();
    scores.set("crisis", crisisScore);

    return scores;
  }

  private determineRegimeType(
    scores: Map<string, number>
  ): MarketRegime["type"] {
    let maxScore = 0;
    let regimeType: MarketRegime["type"] = "balanced";

    for (const [type, score] of scores) {
      if (score > maxScore) {
        maxScore = score;
        regimeType = type as MarketRegime["type"];
      }
    }

    return regimeType;
  }

  private calculateConfidence(scores: Map<string, number>): number {
    const maxScore = Math.max(...scores.values());
    const totalScore = Array.from(scores.values()).reduce(
      (sum, score) => sum + score,
      0
    );

    return maxScore / totalScore;
  }
}
```

### **Portfolio Rebalancer**

```typescript
// src/portfolio-manager/core/rebalancer.ts
interface RebalancingPlan {
  segmentId: string;
  currentWeight: number;
  targetWeight: number;
  action: "buy" | "sell" | "hold";
  amount: number;
  priority: "high" | "medium" | "low";
  estimatedCost: number;
}

class PortfolioRebalancer {
  private allocationEngine: AllocationEngine;
  private riskManager: RiskManager;
  private executionService: ExecutionService;

  constructor(
    allocationEngine: AllocationEngine,
    riskManager: RiskManager,
    executionService: ExecutionService
  ) {
    this.allocationEngine = allocationEngine;
    this.riskManager = riskManager;
    this.executionService = executionService;
  }

  async createRebalancingPlan(
    portfolio: MultiSegmentPortfolio,
    marketData: MarketData,
    constraints: RebalancingConstraints
  ): Promise<RebalancingPlan[]> {
    // Get optimal allocation
    const allocationDecisions =
      await this.allocationEngine.calculateOptimalAllocation(
        portfolio,
        marketData,
        constraints
      );

    // Generate rebalancing plan
    const plans = this.generateRebalancingPlans(allocationDecisions, portfolio);

    // Apply risk constraints
    const riskAdjustedPlans =
      await this.riskManager.applyRebalancingConstraints(plans, portfolio);

    // Prioritize rebalancing actions
    const prioritizedPlans = this.prioritizePlans(riskAdjustedPlans);

    return prioritizedPlans;
  }

  async executeRebalancing(
    plans: RebalancingPlan[]
  ): Promise<RebalancingResult[]> {
    const results: RebalancingResult[] = [];

    // Execute high priority plans first
    const highPriorityPlans = plans.filter((p) => p.priority === "high");
    for (const plan of highPriorityPlans) {
      try {
        const result = await this.executePlan(plan);
        results.push(result);
      } catch (error) {
        results.push({
          plan,
          success: false,
          error: error.message,
          timestamp: new Date(),
        });
      }
    }

    // Execute medium priority plans
    const mediumPriorityPlans = plans.filter((p) => p.priority === "medium");
    for (const plan of mediumPriorityPlans) {
      try {
        const result = await this.executePlan(plan);
        results.push(result);
      } catch (error) {
        results.push({
          plan,
          success: false,
          error: error.message,
          timestamp: new Date(),
        });
      }
    }

    // Execute low priority plans
    const lowPriorityPlans = plans.filter((p) => p.priority === "low");
    for (const plan of lowPriorityPlans) {
      try {
        const result = await this.executePlan(plan);
        results.push(result);
      } catch (error) {
        results.push({
          plan,
          success: false,
          error: error.message,
          timestamp: new Date(),
        });
      }
    }

    return results;
  }

  private generateRebalancingPlans(
    decisions: AllocationDecision[],
    portfolio: MultiSegmentPortfolio
  ): RebalancingPlan[] {
    const plans: RebalancingPlan[] = [];

    for (const decision of decisions) {
      if (decision.recommendedAction === "maintain") continue;

      const plan: RebalancingPlan = {
        segmentId: decision.segmentId,
        currentWeight: decision.currentAllocation,
        targetWeight: decision.targetAllocation,
        action: decision.recommendedAction === "increase" ? "buy" : "sell",
        amount: Math.abs(decision.amount),
        priority: this.determinePriority(decision),
        estimatedCost: this.estimateCost(decision.amount, portfolio),
      };

      plans.push(plan);
    }

    return plans;
  }

  private determinePriority(
    decision: AllocationDecision
  ): "high" | "medium" | "low" {
    const weightDifference = Math.abs(
      decision.targetAllocation - decision.currentAllocation
    );

    if (weightDifference > 0.1) return "high"; // >10% difference
    if (weightDifference > 0.05) return "medium"; // >5% difference
    return "low"; // <5% difference
  }

  private async executePlan(plan: RebalancingPlan): Promise<RebalancingResult> {
    if (plan.action === "buy") {
      return await this.executionService.buySegment(
        plan.segmentId,
        plan.amount
      );
    } else {
      return await this.executionService.sellSegment(
        plan.segmentId,
        plan.amount
      );
    }
  }
}
```

### **Risk Manager**

```typescript
// src/portfolio-manager/core/risk-manager.ts
interface RiskConstraints {
  maxPortfolioDrawdown: number;
  maxSegmentConcentration: number;
  maxCorrelation: number;
  minDiversification: number;
  maxLeverage: number;
}

class RiskManager {
  private constraints: RiskConstraints;

  constructor(constraints: RiskConstraints) {
    this.constraints = constraints;
  }

  async applyRiskConstraints(
    allocation: Map<string, number>,
    portfolio: MultiSegmentPortfolio
  ): Promise<Map<string, number>> {
    let adjustedAllocation = new Map(allocation);

    // Check concentration risk
    adjustedAllocation = this.adjustConcentrationRisk(adjustedAllocation);

    // Check correlation risk
    adjustedAllocation = await this.adjustCorrelationRisk(
      adjustedAllocation,
      portfolio
    );

    // Check diversification requirements
    adjustedAllocation = this.adjustDiversificationRisk(adjustedAllocation);

    // Normalize allocation to 100%
    adjustedAllocation = this.normalizeAllocation(adjustedAllocation);

    return adjustedAllocation;
  }

  private adjustConcentrationRisk(
    allocation: Map<string, number>
  ): Map<string, number> {
    const adjusted = new Map(allocation);

    for (const [segmentId, weight] of adjusted) {
      if (weight > this.constraints.maxSegmentConcentration) {
        adjusted.set(segmentId, this.constraints.maxSegmentConcentration);
      }
    }

    return adjusted;
  }

  private async adjustCorrelationRisk(
    allocation: Map<string, number>,
    portfolio: MultiSegmentPortfolio
  ): Promise<Map<string, number>> {
    const adjusted = new Map(allocation);
    const segments = Array.from(allocation.keys());

    // Calculate current correlations
    const correlations = await this.calculateSegmentCorrelations(segments);

    // Find highly correlated segments
    const highCorrelationPairs = correlations.filter(
      (c) => c.correlation > this.constraints.maxCorrelation
    );

    // Reduce allocation to highly correlated segments
    for (const pair of highCorrelationPairs) {
      const segment1Weight = adjusted.get(pair.segment1) || 0;
      const segment2Weight = adjusted.get(pair.segment2) || 0;

      // Reduce the segment with higher weight
      if (segment1Weight > segment2Weight) {
        const reduction = (segment1Weight - segment2Weight) * 0.5;
        adjusted.set(pair.segment1, segment1Weight - reduction);
      } else {
        const reduction = (segment2Weight - segment1Weight) * 0.5;
        adjusted.set(pair.segment2, segment2Weight - reduction);
      }
    }

    return adjusted;
  }

  private adjustDiversificationRisk(
    allocation: Map<string, number>
  ): Map<string, number> {
    const adjusted = new Map(allocation);
    const activeSegments = Array.from(allocation.values()).filter(
      (w) => w > 0.01
    ).length;

    // Ensure minimum number of segments
    if (activeSegments < Math.ceil(1 / this.constraints.minDiversification)) {
      // Redistribute to meet diversification requirements
      const targetWeight =
        1 / Math.ceil(1 / this.constraints.minDiversification);

      for (const [segmentId, weight] of adjusted) {
        if (weight > 0.01) {
          adjusted.set(segmentId, targetWeight);
        }
      }
    }

    return adjusted;
  }

  private normalizeAllocation(
    allocation: Map<string, number>
  ): Map<string, number> {
    const adjusted = new Map(allocation);
    const totalWeight = Array.from(adjusted.values()).reduce(
      (sum, weight) => sum + weight,
      0
    );

    if (totalWeight === 0) return adjusted;

    for (const [segmentId, weight] of adjusted) {
      adjusted.set(segmentId, weight / totalWeight);
    }

    return adjusted;
  }

  async calculatePortfolioRisk(
    portfolio: MultiSegmentPortfolio
  ): Promise<PortfolioRiskMetrics> {
    // Calculate portfolio-level risk metrics
    const volatility = await this.calculatePortfolioVolatility(portfolio);
    const drawdown = await this.calculatePortfolioDrawdown(portfolio);
    const var95 = await this.calculateValueAtRisk(portfolio, 0.95);
    const sharpeRatio = await this.calculatePortfolioSharpeRatio(portfolio);

    return {
      volatility,
      drawdown,
      var95,
      sharpeRatio,
      timestamp: new Date(),
    };
  }
}
```

### **Database Schema Updates**

```sql
-- Portfolio allocation history
CREATE TABLE portfolio_allocation_history (
  id SERIAL PRIMARY KEY,
  date TIMESTAMP NOT NULL,
  segment_id VARCHAR(50) NOT NULL,
  target_allocation DECIMAL(8,4) NOT NULL,
  actual_allocation DECIMAL(8,4) NOT NULL,
  allocation_change DECIMAL(8,4) NOT NULL,
  regime_type VARCHAR(20) NOT NULL,
  strategy_used VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Rebalancing history
CREATE TABLE rebalancing_history (
  id SERIAL PRIMARY KEY,
  date TIMESTAMP NOT NULL,
  segment_id VARCHAR(50) NOT NULL,
  action VARCHAR(10) NOT NULL, -- 'buy' or 'sell'
  amount DECIMAL(12,2) NOT NULL,
  priority VARCHAR(10) NOT NULL, -- 'high', 'medium', 'low'
  success BOOLEAN NOT NULL,
  execution_time_ms INTEGER,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Market regime history
CREATE TABLE market_regime_history (
  id SERIAL PRIMARY KEY,
  date TIMESTAMP NOT NULL,
  regime_type VARCHAR(20) NOT NULL,
  confidence DECIMAL(8,4) NOT NULL,
  volatility_score DECIMAL(8,4),
  correlation_score DECIMAL(8,4),
  momentum_score DECIMAL(8,4),
  drawdown_score DECIMAL(8,4),
  liquidity_score DECIMAL(8,4),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Portfolio risk metrics
CREATE TABLE portfolio_risk_metrics (
  id SERIAL PRIMARY KEY,
  date TIMESTAMP NOT NULL,
  volatility DECIMAL(8,4),
  max_drawdown DECIMAL(8,4),
  var_95 DECIMAL(8,4),
  sharpe_ratio DECIMAL(8,4),
  diversification_score DECIMAL(8,4),
  correlation_score DECIMAL(8,4),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Allocation strategy performance
CREATE TABLE strategy_performance (
  id SERIAL PRIMARY KEY,
  date TIMESTAMP NOT NULL,
  strategy_name VARCHAR(50) NOT NULL,
  regime_type VARCHAR(20) NOT NULL,
  return_contribution DECIMAL(8,4),
  risk_contribution DECIMAL(8,4),
  sharpe_contribution DECIMAL(8,4),
  created_at TIMESTAMP DEFAULT NOW()
);
```

### **Dashboard Integration**

#### **Portfolio Manager Dashboard**

```typescript
// frontend/src/components/PortfolioManager/PortfolioManagerDashboard.tsx
import React, { useState, useEffect } from "react";
import { useQuery } from "react-query";
import AllocationChart from "./AllocationChart";
import RegimeIndicator from "./RegimeIndicator";
import RebalancingHistory from "./RebalancingHistory";
import RiskMetrics from "./RiskMetrics";
import StrategyPerformance from "./StrategyPerformance";

const PortfolioManagerDashboard: React.FC = () => {
  const [selectedView, setSelectedView] = useState<
    "overview" | "allocation" | "rebalancing" | "risk" | "strategy"
  >("overview");

  const { data: portfolioManager, isLoading } = useQuery(
    "portfolio-manager",
    fetchPortfolioManager
  );
  const { data: allocationHistory } = useQuery(
    "allocation-history",
    fetchAllocationHistory
  );
  const { data: rebalancingHistory } = useQuery(
    "rebalancing-history",
    fetchRebalancingHistory
  );
  const { data: riskMetrics } = useQuery("risk-metrics", fetchRiskMetrics);
  const { data: strategyPerformance } = useQuery(
    "strategy-performance",
    fetchStrategyPerformance
  );

  if (isLoading) return <div>Loading portfolio manager...</div>;

  return (
    <div className="portfolio-manager-dashboard">
      <div className="dashboard-header">
        <h2>Portfolio Manager Dashboard</h2>
        <div className="view-controls">
          <button
            className={selectedView === "overview" ? "active" : ""}
            onClick={() => setSelectedView("overview")}
          >
            Overview
          </button>
          <button
            className={selectedView === "allocation" ? "active" : ""}
            onClick={() => setSelectedView("allocation")}
          >
            Allocation
          </button>
          <button
            className={selectedView === "rebalancing" ? "active" : ""}
            onClick={() => setSelectedView("rebalancing")}
          >
            Rebalancing
          </button>
          <button
            className={selectedView === "risk" ? "active" : ""}
            onClick={() => setSelectedView("risk")}
          >
            Risk
          </button>
          <button
            className={selectedView === "strategy" ? "active" : ""}
            onClick={() => setSelectedView("strategy")}
          >
            Strategy
          </button>
        </div>
      </div>

      <div className="dashboard-content">
        {selectedView === "overview" && (
          <div className="overview-view">
            <div className="overview-grid">
              <RegimeIndicator regime={portfolioManager.currentRegime} />
              <AllocationChart
                allocation={portfolioManager.currentAllocation}
              />
              <RiskMetrics metrics={riskMetrics} />
            </div>
          </div>
        )}

        {selectedView === "allocation" && (
          <div className="allocation-view">
            <AllocationChart allocation={portfolioManager.currentAllocation} />
            <div className="allocation-history">
              <h3>Allocation History</h3>
              <AllocationHistory data={allocationHistory} />
            </div>
          </div>
        )}

        {selectedView === "rebalancing" && (
          <div className="rebalancing-view">
            <RebalancingHistory data={rebalancingHistory} />
          </div>
        )}

        {selectedView === "risk" && (
          <div className="risk-view">
            <RiskMetrics metrics={riskMetrics} />
          </div>
        )}

        {selectedView === "strategy" && (
          <div className="strategy-view">
            <StrategyPerformance data={strategyPerformance} />
          </div>
        )}
      </div>
    </div>
  );
};
```

## **Testing Strategy**

### **Portfolio Management Testing**

1. **Master portfolio manager making** allocation decisions correctly
2. **Dynamic allocation working** across all segments
3. **Market regime detection** identifying conditions accurately
4. **Automated rebalancing** executing without errors
5. **Cross-segment risk management** functioning properly

### **Integration Testing**

1. **Portfolio manager integrating** with existing segments
2. **Allocation decisions affecting** segment portfolios correctly
3. **Risk management working** across all segments
4. **Performance tracking** accurate for allocations
5. **Dashboard displaying** portfolio management data correctly

### **Performance Testing**

1. **Allocation decisions made** within acceptable time limits
2. **Rebalancing execution** completing successfully
3. **Risk calculations** accurate and timely
4. **System performance maintained** with portfolio manager
5. **Error handling** working for allocation failures

## **Deployment Steps**

### **1. Database Schema Updates**

```bash
# Run migration scripts
npm run migrate:phase5

# Verify schema updates
npm run verify:schema

# Test with sample data
npm run test:sample-data
```

### **2. Next.js Application Deployment**

```bash
# Deploy to Vercel
vercel

# Deploy to production
vercel --prod

# Verify new endpoints
npm run test:new-endpoints

# Test portfolio manager functionality
npm run test:portfolio-manager
```

### **3. Dashboard Updates**

```bash
# Build and test locally
npm run build
npm run start

# Verify portfolio manager dashboard
npm run test:portfolio-manager-dashboard
```

## **Success Validation**

### **Week 1 Testing**

- [ ] Portfolio manager operational and making decisions
- [ ] Basic allocation logic working correctly
- [ ] Market regime detection functional
- [ ] Database schema supporting portfolio management

### **Week 2 Testing**

- [ ] Dynamic allocation working across segments
- [ ] Automated rebalancing executing correctly
- [ ] Risk management functioning properly
- [ ] Dashboard displaying portfolio management data

### **Week 3-4 Testing**

- [ ] All portfolio management features working
- [ ] Performance meets requirements
- [ ] Error handling robust
- [ ] Ready for Phase 6

## **What to Avoid**

### **Over-Engineering**

- ❌ Complex optimization algorithms
- ❌ Advanced risk modeling
- ❌ Sophisticated regime detection
- ❌ Complex allocation strategies

### **Feature Creep**

- ❌ Adding machine learning features
- ❌ Advanced analytics and reporting
- ❌ Custom strategy builder
- ❌ Multi-user collaboration features

### **Premature Optimization**

- ❌ Performance tuning before functionality
- ❌ Advanced database optimization
- ❌ Complex caching strategies
- ❌ Advanced monitoring systems

## **Next Steps After Phase 5**

1. **Validate portfolio manager** is working reliably
2. **Document lessons learned** from portfolio management implementation
3. **Plan Phase 6** requirements for additional segments
4. **Begin Phase 6** implementation

## **Conclusion**

**Phase 5 is about implementing intelligent portfolio management.** Focus on:

- **Core portfolio management** functionality working
- **Dynamic allocation** across segments
- **Risk management** and optimization
- **Integration** with existing segments

**Remember**: A working portfolio manager is the foundation for advanced portfolio optimization. Focus on reliability and accuracy before adding complexity.

---

**Phase 5 Goal**: Implement master portfolio manager for cross-segment allocation
**Phase 5 Focus**: Portfolio management, dynamic allocation, risk management
**Phase 5 Success**: Portfolio manager operational, dynamic allocation working, ready for expansion
