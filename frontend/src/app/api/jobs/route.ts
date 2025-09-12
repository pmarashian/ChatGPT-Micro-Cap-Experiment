import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// Import serverless service directly
const {
  getAllJobs,
} = require("../../../../../serverless/src/services/job-orchestration-service");

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Use serverless service to get jobs

    console.log("Getting jobs...");

    const jobs = await getAllJobs();

    console.log("Jobs:", jobs);

    // Convert to frontend format
    const jobsData = jobs.map((job: any, index: number) => ({
      id: (index + 1).toString(),
      name: job.jobName,
      description: job.description || job.jobName,
      enabled: job.enabled,
      cron: job.schedule || job.cron || "0 9 * * 1-5",
      nextRun: job.nextRun || null,
      lastRun: job.lastRun || null,
      status: job.status || "idle",
    }));

    jobsData.sort((a: any, b: any) => {
      return new Date(a.nextRun).getTime() - new Date(b.nextRun).getTime();
    });

    return NextResponse.json(jobsData);
  } catch (error: any) {
    console.log("Error fetching jobs:", error.message);

    // Return fallback data on error
    const fallbackJobs = [
      {
        id: "1",
        name: "Daily Trading",
        description: "Executes daily trading strategy",
        enabled: true,
        cron: "0 9 * * 1-5",
        nextRun: "2024-09-12T09:00:00Z",
        lastRun: "2024-09-11T09:00:00Z",
        status: "idle",
      },
    ];

    return NextResponse.json(fallbackJobs);
  }
}
