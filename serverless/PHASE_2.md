# Phase 2: Web Dashboard

## **Phase Goal** 🎯

Create a **web-based dashboard** that replaces all manual configuration and monitoring, providing a professional interface for portfolio management, configuration, and real-time monitoring.

## **What We're Building**

### **Core Dashboard Features**

- **Portfolio monitoring** with real-time updates
- **Configuration management** via UI (no .env editing)
- **Performance analytics** and charts
- **Trade history** and execution status
- **System health** monitoring and alerts
- **User authentication** and security

### **Infrastructure Upgrades**

- **Next.js full-stack application** with TypeScript
- **Next.js API routes** for backend functionality
- **Vercel Postgres** (migrate from DynamoDB)
- **Vercel hosting** with enhanced capabilities
- **Server-Sent Events or WebSockets** for real-time updates
- **Professional email templates** with attachments

## **Success Criteria** ✅

### **Functional Requirements**

- ✅ **All configuration** accessible via web interface
- ✅ **Real-time portfolio updates** without page refresh
- ✅ **Professional email reports** with charts and formatting
- ✅ **User authentication** and secure access
- ✅ **Performance monitoring** and analytics
- ✅ **Trade execution status** visible in real-time

### **Technical Requirements**

- ✅ **Dashboard accessible** via web browser
- ✅ **Configuration changes** persist in database
- ✅ **Real-time updates** via WebSocket
- ✅ **Responsive design** for mobile and desktop
- ✅ **Secure authentication** and authorization
- ✅ **Professional email templates** working

### **User Experience Requirements**

- ✅ **Intuitive interface** for non-technical users
- ✅ **Fast page load times** (<2 seconds)
- ✅ **Real-time data updates** without manual refresh
- ✅ **Professional appearance** suitable for institutional use
- ✅ **Mobile-friendly** responsive design

## **How to Test Completion**

### **Configuration Testing**

1. **Change all settings** via web interface
2. **Verify changes persist** after system restart
3. **Test configuration validation** and error handling
4. **Confirm no .env editing** required
5. **Validate configuration** affects system behavior

### **Real-Time Functionality Testing**

1. **Portfolio updates** reflect immediately
2. **Trade execution status** updates in real-time
3. **System health indicators** update automatically
4. **Performance metrics** refresh without page reload
5. **WebSocket connections** stable and reliable

### **User Experience Testing**

1. **All functions accessible** via intuitive navigation
2. **Page load times** under 2 seconds
3. **Mobile interface** works on various devices
4. **Error messages** clear and actionable
5. **Authentication flow** smooth and secure

## **What's NOT Included in Phase 2**

### **Advanced Features**

- ❌ Multiple market segments
- ❌ Portfolio manager for allocation
- ❌ Advanced risk management
- ❌ Machine learning integration
- ❌ Alternative data sources

### **Complex Analytics**

- ❌ Advanced performance attribution
- ❌ Risk modeling and simulation
- ❌ Backtesting capabilities
- ❌ Custom strategy builder
- ❌ Institutional-grade reporting

### **Multi-User Features**

- ❌ User management and roles
- ❌ Team collaboration features
- ❌ Access control and permissions
- ❌ Audit logging and compliance
- ❌ API access for external users

## **Technical Implementation**

### **Project Structure**

```
phase-2/
├── app/                      # Next.js app directory
│   ├── api/                  # API routes
│   │   ├── configuration/    # Configuration management
│   │   ├── portfolio/        # Portfolio management
│   │   ├── performance/      # Performance analytics
│   │   └── websocket/        # Real-time updates
│   ├── dashboard/            # Dashboard pages
│   │   ├── page.tsx          # Main dashboard
│   │   ├── portfolio/        # Portfolio views
│   │   ├── configuration/    # Settings panels
│   │   └── analytics/        # Performance charts
│   ├── components/           # React components
│   │   ├── Dashboard/        # Main dashboard
│   │   ├── Portfolio/        # Portfolio views
│   │   ├── Configuration/    # Settings panels
│   │   ├── Analytics/        # Performance charts
│   │   └── Common/           # Shared components
│   ├── lib/                  # Business logic services
│   │   ├── ai-service.js     # AI API integration (configurable)
│   │   ├── brokerage-service.js # Brokerage API integration
│   │   ├── portfolio-service.js # Portfolio calculations
│   │   └── email-service.js  # Enhanced email service
│   ├── hooks/                # Custom React hooks
│   ├── utils/                # Utility functions
│   └── types/                # TypeScript definitions
├── public/                   # Static assets
├── next.config.js            # Next.js configuration
├── package.json              # Dependencies
└── vercel.json               # Vercel configuration
```

### **Dependencies**

```json
{
  "dependencies": {
    "next": "^14.0.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "@vercel/postgres": "^0.5.0",
    "axios": "^1.6.0",
    "recharts": "^2.8.0",
    "date-fns": "^2.30.0",
    "react-hook-form": "^7.48.0",
    "@tanstack/react-query": "^5.0.0",
    "socket.io-client": "^4.7.0",
    "nodemailer": "^6.9.0",
    "handlebars": "^4.7.8",
    "jsonwebtoken": "^9.0.2",
    "bcryptjs": "^2.4.3"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "typescript": "^5.0.0",
    "eslint": "^8.55.0",
    "prettier": "^3.0.0"
  }
}
```

## **Database Migration**

### **From DynamoDB to Vercel Postgres**

```sql
-- Portfolio positions table
CREATE TABLE portfolio_positions (
  id SERIAL PRIMARY KEY,
  ticker VARCHAR(10) NOT NULL,
  shares INTEGER NOT NULL,
  buy_price DECIMAL(10,2) NOT NULL,
  stop_loss DECIMAL(10,2),
  cost_basis DECIMAL(10,2) NOT NULL,
  segment VARCHAR(50) DEFAULT 'biotech',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Trade history table
CREATE TABLE trade_history (
  id SERIAL PRIMARY KEY,
  ticker VARCHAR(10) NOT NULL,
  action VARCHAR(10) NOT NULL, -- 'buy' or 'sell'
  shares INTEGER NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  timestamp TIMESTAMP DEFAULT NOW(),
  ai_reasoning TEXT,
  execution_status VARCHAR(20) DEFAULT 'pending',
  segment VARCHAR(50) DEFAULT 'biotech'
);

-- Configuration table
CREATE TABLE system_config (
  id SERIAL PRIMARY KEY,
  key VARCHAR(100) UNIQUE NOT NULL,
  value TEXT NOT NULL,
  description TEXT,
  category VARCHAR(50) DEFAULT 'general',
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Performance metrics table
CREATE TABLE daily_metrics (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL,
  total_equity DECIMAL(12,2) NOT NULL,
  cash_balance DECIMAL(12,2) NOT NULL,
  daily_return DECIMAL(8,4),
  sharpe_ratio DECIMAL(8,4),
  max_drawdown DECIMAL(8,4),
  segment VARCHAR(50) DEFAULT 'biotech',
  created_at TIMESTAMP DEFAULT NOW()
);

-- User authentication table
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) DEFAULT 'user',
  created_at TIMESTAMP DEFAULT NOW(),
  last_login TIMESTAMP
);
```

## **Frontend Components**

### **Main Dashboard**

```typescript
// frontend/src/components/Dashboard/Dashboard.tsx
import React, { useState, useEffect } from "react";
import { useQuery } from "react-query";
import PortfolioOverview from "../Portfolio/PortfolioOverview";
import PerformanceChart from "../Analytics/PerformanceChart";
import ConfigurationPanel from "../Configuration/ConfigurationPanel";
import SystemHealth from "../Common/SystemHealth";
import { useWebSocket } from "../../hooks/useWebSocket";

const Dashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState("portfolio");
  const { data: portfolioData, isLoading } = useQuery(
    "portfolio",
    fetchPortfolio
  );
  const { data: performanceData } = useQuery("performance", fetchPerformance);

  // Real-time updates via WebSocket
  useWebSocket("portfolio-updates", (data) => {
    // Update portfolio data in real-time
  });

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>AI Trading Dashboard</h1>
        <SystemHealth />
      </header>

      <nav className="dashboard-nav">
        <button
          className={activeTab === "portfolio" ? "active" : ""}
          onClick={() => setActiveTab("portfolio")}
        >
          Portfolio
        </button>
        <button
          className={activeTab === "performance" ? "active" : ""}
          onClick={() => setActiveTab("performance")}
        >
          Performance
        </button>
        <button
          className={activeTab === "configuration" ? "active" : ""}
          onClick={() => setActiveTab("configuration")}
        >
          Configuration
        </button>
      </nav>

      <main className="dashboard-content">
        {activeTab === "portfolio" && (
          <PortfolioOverview data={portfolioData} isLoading={isLoading} />
        )}
        {activeTab === "performance" && (
          <PerformanceChart data={performanceData} />
        )}
        {activeTab === "configuration" && <ConfigurationPanel />}
      </main>
    </div>
  );
};

export default Dashboard;
```

### **Configuration Panel**

```typescript
// frontend/src/components/Configuration/ConfigurationPanel.tsx
import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQueryClient } from "react-query";

interface ConfigurationForm {
  maxPositionSize: number;
  maxDrawdown: number;
  stopLossMultiplier: number;
  rebalanceThreshold: number;
  emailNotifications: boolean;
  tradingEnabled: boolean;
}

const ConfigurationPanel: React.FC = () => {
  const [isEditing, setIsEditing] = useState(false);
  const { register, handleSubmit, reset } = useForm<ConfigurationForm>();
  const queryClient = useQueryClient();

  const updateConfigMutation = useMutation(updateConfiguration, {
    onSuccess: () => {
      queryClient.invalidateQueries("configuration");
      setIsEditing(false);
    },
  });

  const onSubmit = (data: ConfigurationForm) => {
    updateConfigMutation.mutate(data);
  };

  return (
    <div className="configuration-panel">
      <div className="panel-header">
        <h2>System Configuration</h2>
        <button
          onClick={() => setIsEditing(!isEditing)}
          className="edit-button"
        >
          {isEditing ? "Cancel" : "Edit"}
        </button>
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="config-section">
          <h3>Risk Management</h3>

          <div className="form-group">
            <label>Max Position Size (%)</label>
            <input
              type="number"
              step="0.1"
              min="0"
              max="100"
              {...register("maxPositionSize", { required: true })}
              disabled={!isEditing}
            />
          </div>

          <div className="form-group">
            <label>Max Drawdown (%)</label>
            <input
              type="number"
              step="0.1"
              min="0"
              max="50"
              {...register("maxDrawdown", { required: true })}
              disabled={!isEditing}
            />
          </div>

          <div className="form-group">
            <label>Stop Loss Multiplier</label>
            <input
              type="number"
              step="0.1"
              min="0.5"
              max="5.0"
              {...register("stopLossMultiplier", { required: true })}
              disabled={!isEditing}
            />
          </div>
        </div>

        <div className="config-section">
          <h3>System Settings</h3>

          <div className="form-group">
            <label>
              <input
                type="checkbox"
                {...register("emailNotifications")}
                disabled={!isEditing}
              />
              Enable Email Notifications
            </label>
          </div>

          <div className="form-group">
            <label>
              <input
                type="checkbox"
                {...register("tradingEnabled")}
                disabled={!isEditing}
              />
              Enable Automated Trading
            </label>
          </div>
        </div>

        {isEditing && (
          <div className="form-actions">
            <button type="submit" className="save-button">
              Save Changes
            </button>
            <button
              type="button"
              onClick={() => reset()}
              className="reset-button"
            >
              Reset
            </button>
          </div>
        )}
      </form>
    </div>
  );
};

export default ConfigurationPanel;
```

## **Next.js API Routes**

### **Configuration Management**

```typescript
// app/api/configuration/route.ts
import { NextRequest, NextResponse } from "next/server";
import { authenticateToken } from "../../lib/middleware/auth";
import { ConfigurationService } from "../../lib/services/configuration-service";

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await authenticateToken(token);
    const configService = new ConfigurationService();
    const configuration = await configService.getConfiguration();

    return NextResponse.json(configuration);
  } catch (error) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await authenticateToken(token);
    const body = await request.json();
    const configService = new ConfigurationService();
    const result = await configService.updateConfiguration(body);

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
```

### **Portfolio Management**

```typescript
// app/api/portfolio/route.ts
import { NextRequest, NextResponse } from "next/server";
import { authenticateToken } from "../../lib/middleware/auth";
import { PortfolioService } from "../../lib/services/portfolio-service";

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await authenticateToken(token);
    const portfolioService = new PortfolioService();
    const portfolio = await portfolioService.getCurrentPortfolio();

    return NextResponse.json(portfolio);
  } catch (error) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await authenticateToken(token);
    const body = await request.json();
    const portfolioService = new PortfolioService();
    const result = await portfolioService.executeManualTrade(body);

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
```

## **Real-Time Updates**

### **Server-Sent Events Implementation**

```typescript
// app/api/updates/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection message
      controller.enqueue(
        `data: ${JSON.stringify({
          type: "connected",
          timestamp: new Date().toISOString(),
        })}\n\n`
      );

      // Keep connection alive and send updates
      const interval = setInterval(() => {
        controller.enqueue(
          `data: ${JSON.stringify({
            type: "heartbeat",
            timestamp: new Date().toISOString(),
          })}\n\n`
        );
      }, 30000); // 30 second heartbeat

      // Cleanup on close
      request.signal.addEventListener("abort", () => {
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
```

### **WebSocket Alternative (if needed)**

```typescript
// app/api/websocket/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  // WebSocket upgrade logic for Next.js
  // Implementation depends on WebSocket library choice
}
```

## **Professional Email Templates**

### **Enhanced Email Service**

```typescript
// backend/src/services/EmailService.ts
import nodemailer from "nodemailer";
import handlebars from "handlebars";
import { readFileSync } from "fs";
import { join } from "path";

export class EmailService {
  private transporter: nodemailer.Transporter;
  private templates: Map<string, handlebars.TemplateDelegate> = new Map();

  constructor() {
    this.transporter = nodemailer.createTransporter({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    this.loadTemplates();
  }

  private loadTemplates() {
    const templateNames = [
      "daily-report",
      "trade-confirmation",
      "system-alert",
    ];

    templateNames.forEach((name) => {
      const templatePath = join(__dirname, `../templates/${name}.hbs`);
      const templateContent = readFileSync(templatePath, "utf-8");
      this.templates.set(name, handlebars.compile(templateContent));
    });
  }

  public async sendDailyReport(portfolioData: any, performanceData: any) {
    const template = this.templates.get("daily-report");
    if (!template) throw new Error("Daily report template not found");

    const html = template({
      portfolio: portfolioData,
      performance: performanceData,
      date: new Date().toLocaleDateString(),
      logo: process.env.FRONTEND_URL + "/logo.png",
    });

    await this.transporter.sendMail({
      from: process.env.FROM_EMAIL,
      to: process.env.ADMIN_EMAIL,
      subject: `AI Trading Portfolio Update - ${new Date().toLocaleDateString()}`,
      html: html,
      attachments: [
        {
          filename: "performance_chart.png",
          path: await this.generatePerformanceChart(performanceData),
        },
      ],
    });
  }

  private async generatePerformanceChart(data: any): Promise<string> {
    // Generate performance chart and return file path
    // Implementation depends on charting library
  }
}
```

## **Testing Strategy**

### **Frontend Testing**

1. **Component testing** with React Testing Library
2. **Integration testing** for API interactions
3. **User flow testing** for configuration changes
4. **Responsive design testing** on various devices
5. **Performance testing** for page load times

### **Backend Testing**

1. **API route testing** with Jest and Next.js testing utilities
2. **Database migration testing** from DynamoDB to Vercel Postgres
3. **Real-time update testing** via Server-Sent Events
4. **Authentication testing** for secure access
5. **Email template testing** for professional appearance

### **Integration Testing**

1. **End-to-end testing** of configuration workflow
2. **Real-time update testing** via Server-Sent Events
3. **Database consistency testing** across operations
4. **Error handling testing** for various failure scenarios
5. **Performance testing** under load

## **Deployment Steps**

### **1. Database Migration**

```bash
# Set up Vercel Postgres
vercel env pull .env.local
vercel postgres create chatgpt_trading

# Run migration scripts
npm run migrate

# Verify data integrity
npm run verify-migration
```

### **2. Next.js Application Deployment**

```bash
# Deploy to Vercel
vercel

# Deploy to production
vercel --prod

# Verify API endpoints
npm run test:api

# Test real-time updates
npm run test:realtime
```

### **3. Dashboard Testing**

```bash
# Build and test locally
npm run build
npm run start

# Verify dashboard accessibility
npm run test:e2e
```

## **Success Validation**

### **Week 1 Testing**

- [ ] Dashboard accessible via web browser
- [ ] Basic portfolio display working
- [ ] Configuration panel functional
- [ ] Database migration successful

### **Week 2 Testing**

- [ ] Real-time updates working via Server-Sent Events
- [ ] Configuration changes persist in database
- [ ] Professional email templates rendering
- [ ] User authentication functional

### **Week 3-4 Testing**

- [ ] All functionality accessible via UI
- [ ] Performance meets requirements
- [ ] Mobile responsiveness working
- [ ] Ready for Phase 3

## **What to Avoid**

### **Over-Engineering**

- ❌ Complex state management patterns
- ❌ Advanced UI animations and effects
- ❌ Sophisticated caching strategies
- ❌ Complex user permission systems

### **Feature Creep**

- ❌ Adding multiple market segments
- ❌ Advanced analytics and reporting
- ❌ Complex configuration workflows
- ❌ Multi-user collaboration features

### **Premature Optimization**

- ❌ Performance tuning before functionality
- ❌ Advanced database indexing
- ❌ Complex caching layers
- ❌ Advanced monitoring systems

## **Next Steps After Phase 2**

1. **Validate dashboard** is working reliably
2. **Document UI/UX lessons learned**
3. **Plan Phase 3** market expansion requirements
4. **Begin Phase 3** implementation

## **Conclusion**

**Phase 2 is about creating a professional, user-friendly interface.** Focus on:

- **User experience** and intuitive design
- **Real-time functionality** via WebSocket
- **Professional appearance** suitable for institutional use
- **Configuration management** without technical knowledge

**Remember**: A good dashboard makes the system accessible to non-technical users. Focus on usability and reliability before adding advanced features.

---

**Phase 2 Goal**: Create web dashboard for configuration and monitoring
**Phase 2 Focus**: User interface, real-time updates, professional appearance
**Phase 2 Success**: All configuration via UI, real-time monitoring, professional emails
