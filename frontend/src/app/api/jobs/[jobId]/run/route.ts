import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// Import serverless service directly
const JobOrchestrationService = require("../../../../../../../serverless/src/services/job-orchestration-service");

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { jobId } = await params;

    // Use serverless service to run job
    const jobService = new JobOrchestrationService();
    const executionId = `manual-${Date.now()}-${jobId}`;
    const result = await jobService.tryMarkJobRunning(jobId, executionId);

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: `Job ${jobId} started successfully`,
        jobId,
        executionId,
      });
    } else {
      return NextResponse.json({
        success: false,
        message: `Job ${jobId} could not be started: ${
          result.reason || "unknown reason"
        }`,
        jobId,
      });
    }
  } catch (error) {
    console.error("Error running job:", error);
    return NextResponse.json(
      { error: "Failed to run job", details: error.message },
      { status: 500 }
    );
  }
}
