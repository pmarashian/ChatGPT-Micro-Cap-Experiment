"use client";

import { useSession, signOut } from "next-auth/react";
import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Play,
  Pause,
  RefreshCw,
  LogOut,
  Home,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Zap,
} from "lucide-react";

interface Job {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  cron: string;
  nextRun: string | null;
  lastRun: string;
  status: "idle" | "running" | "completed" | "failed";
}

export function JobsContent() {
  const { data: session } = useSession();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch jobs from Next.js API route (which imports serverless services)
  useEffect(() => {
    const fetchJobs = async () => {
      try {
        const response = await fetch("/api/jobs");
        if (response.ok) {
          const jobsData = await response.json();
          setJobs(jobsData);
        } else {
          console.error("Failed to fetch jobs:", response.statusText);
          // Fallback to empty array if API fails
          setJobs([]);
        }
      } catch (error) {
        console.error("Error fetching jobs:", error);
        // Fallback to empty array if API fails
        setJobs([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchJobs();
  }, []);

  const toggleJob = async (jobId: string, enabled: boolean) => {
    try {
      // Call Next.js API route (which imports serverless service)
      const response = await fetch(`/api/jobs/${jobId}/toggle`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ enabled }),
      });

      if (response.ok) {
        const result = await response.json();
        console.log(
          `Job ${jobId} ${enabled ? "enabled" : "disabled"} successfully`
        );
      } else {
        console.warn(
          `Backend returned ${response.status}: ${response.statusText}`
        );
      }

      // Update local state to reflect the change
      setJobs(
        jobs.map((job) => (job.id === jobId ? { ...job, enabled } : job))
      );
    } catch (error) {
      console.error("Error toggling job:", error);
      // Still update local state for better UX even if backend fails
      setJobs(
        jobs.map((job) => (job.id === jobId ? { ...job, enabled } : job))
      );
      console.log(
        `Job ${jobId} ${enabled ? "enabled" : "disabled"} (local update only)`
      );
    }
  };

  const runJobNow = async (jobId: string) => {
    try {
      // Call Next.js API route (which imports serverless service)
      const response = await fetch(`/api/jobs/${jobId}/run`, {
        method: "POST",
      });

      if (response.ok) {
        const result = await response.json();
        console.log(`Job ${jobId} started successfully`);
      } else {
        console.warn(
          `Backend returned ${response.status}: ${response.statusText}`
        );
      }

      // Update local state to show job is running
      setJobs(
        jobs.map((job) =>
          job.id === jobId
            ? {
                ...job,
                status: "running" as const,
                nextRun: new Date(Date.now() - 1000).toISOString(),
              }
            : job
        )
      );

      // Simulate job completion (in real app, this would be handled by websocket or polling)
      setTimeout(() => {
        setJobs(
          jobs.map((job) =>
            job.id === jobId
              ? {
                  ...job,
                  status: "completed" as const,
                  lastRun: new Date().toISOString(),
                }
              : job
          )
        );
      }, 3000);
    } catch (error) {
      console.error("Error running job:", error);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "running":
        return <RefreshCw className="h-4 w-4 text-blue-500 animate-spin" />;
      case "completed":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "running":
        return "bg-blue-100 text-blue-800";
      case "completed":
        return "bg-green-100 text-green-800";
      case "failed":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const formatDateTime = (dateString: string | null) => {
    if (!dateString) return "Not scheduled";
    return new Date(dateString).toLocaleString();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin text-blue-500 mx-auto mb-4" />
          <p className="text-gray-600">Loading jobs...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Link
                href="/dashboard"
                className="text-blue-600 hover:text-blue-500 mr-4"
              >
                <Home className="h-5 w-5" />
              </Link>
              <h1 className="text-xl font-semibold text-gray-900">
                Job Management
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-700">
                {session?.user?.name || session?.user?.email}
              </span>
              <button
                onClick={() => signOut({ callbackUrl: "/auth/signin" })}
                className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <div className="bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg leading-6 font-medium text-gray-900">
                System Jobs
              </h2>
              <button
                onClick={() => window.location.reload()}
                className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </button>
            </div>

            <div className="space-y-4">
              {jobs.map((job) => (
                <div
                  key={job.id}
                  className="border border-gray-200 rounded-lg p-6"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center mb-2">
                        <h3 className="text-lg font-medium text-gray-900 mr-3">
                          {job.name}
                        </h3>
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(
                            job.status
                          )}`}
                        >
                          <span className="mr-1">
                            {getStatusIcon(job.status)}
                          </span>
                          {job.status}
                        </span>
                        {!job.enabled && (
                          <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                            Disabled
                          </span>
                        )}
                      </div>

                      <p className="text-sm text-gray-600 mb-4">
                        {job.description}
                      </p>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="font-medium text-gray-500">
                            Schedule:
                          </span>
                          <span className="ml-2 text-gray-900">
                            {job.cron || "Manual"}
                          </span>
                        </div>
                        <div>
                          <span className="font-medium text-gray-500">
                            Last Run:
                          </span>
                          <span className="ml-2 text-gray-900">
                            {formatDateTime(job.lastRun)}
                          </span>
                        </div>
                        <div>
                          <span className="font-medium text-gray-500">
                            Next Run:
                          </span>
                          <span className="ml-2 text-gray-900">
                            {formatDateTime(job.nextRun)}
                          </span>
                        </div>
                        <div>
                          <span className="font-medium text-gray-500">
                            Status:
                          </span>
                          <span
                            className={`ml-2 px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(
                              job.status
                            )}`}
                          >
                            {job.status}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col space-y-2 ml-6">
                      <button
                        onClick={() => toggleJob(job.id, !job.enabled)}
                        className={`inline-flex items-center px-3 py-2 border shadow-sm text-sm leading-4 font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                          job.enabled
                            ? "border-red-300 text-red-700 bg-white hover:bg-red-50 focus:ring-red-500"
                            : "border-green-300 text-green-700 bg-white hover:bg-green-50 focus:ring-green-500"
                        }`}
                      >
                        {job.enabled ? (
                          <>
                            <Pause className="h-4 w-4 mr-2" />
                            Disable
                          </>
                        ) : (
                          <>
                            <Play className="h-4 w-4 mr-2" />
                            Enable
                          </>
                        )}
                      </button>

                      <button
                        onClick={() => runJobNow(job.id)}
                        disabled={!job.enabled || job.status === "running"}
                        className="inline-flex items-center px-3 py-2 border border-blue-300 shadow-sm text-sm leading-4 font-medium rounded-md text-blue-700 bg-white hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Zap className="h-4 w-4 mr-2" />
                        Run Now
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
