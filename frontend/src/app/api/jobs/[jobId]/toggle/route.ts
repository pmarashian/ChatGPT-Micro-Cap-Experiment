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
    const body = await request.json();
    const { enabled } = body;

    if (typeof enabled !== "boolean") {
      return NextResponse.json(
        { error: "Enabled status must be a boolean" },
        { status: 400 }
      );
    }

    // Use serverless service to toggle job
    const jobService = new JobOrchestrationService();
    await jobService.toggleJobEnabled(jobId, enabled);

    return NextResponse.json({
      success: true,
      message: `Job ${jobId} ${enabled ? "enabled" : "disabled"} successfully`,
      jobId,
      enabled,
    });
  } catch (error) {
    console.error("Error toggling job:", error);
    return NextResponse.json(
      { error: "Failed to toggle job", details: error.message },
      { status: 500 }
    );
  }
}
