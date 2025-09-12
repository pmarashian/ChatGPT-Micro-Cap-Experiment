import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { DashboardContent } from "@/components/dashboard/dashboard-content";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/auth/signin");
  }

  // Call Next.js API routes (which import serverless services)
  const [portfolioResponse, jobsResponse] = await Promise.all([
    fetch(
      `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/api/portfolio`
    ),
    fetch(`${process.env.NEXTAUTH_URL || "http://localhost:3000"}/api/jobs`),
  ]);

  const portfolioData = portfolioResponse.ok
    ? await portfolioResponse.json()
    : {
        totalValue: 0,
        dailyChange: 0,
        weeklyChange: 0,
        positions: 0,
      };

  const jobsData = jobsResponse.ok ? await jobsResponse.json() : [];

  return (
    <DashboardContent
      initialPortfolioData={portfolioData}
      initialJobsData={jobsData}
    />
  );
}
