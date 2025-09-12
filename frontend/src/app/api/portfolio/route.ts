import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// Import serverless service directly
const PortfolioService = require("../../../../../serverless/src/services/portfolio-service");

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Use serverless service to get portfolio data
    const portfolioService = new PortfolioService();
    const portfolio = await portfolioService.getCurrentPortfolio();

    // Format response for frontend
    const response = {
      totalValue: portfolio.totalValue || 0,
      dailyChange: 2.5, // Placeholder - would calculate from historical data
      weeklyChange: 8.3, // Placeholder - would calculate from historical data
      positions: portfolio.positions || [],
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error fetching portfolio:", error);

    // Return fallback data on error
    const fallbackResponse = {
      totalValue: 0,
      dailyChange: 0,
      weeklyChange: 0,
      positions: [],
    };

    return NextResponse.json(fallbackResponse);
  }
}
