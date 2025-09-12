"use client";

import { useSession, signOut } from "next-auth/react";
import { useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  Settings,
  Play,
  Pause,
  LogOut,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Activity,
  Zap,
} from "lucide-react";

interface DashboardContentProps {
  initialPortfolioData: {
    totalValue: number;
    dailyChange: number;
    weeklyChange: number;
    positions: number;
  };
  initialJobsData: any[];
}

export function DashboardContent({
  initialPortfolioData,
  initialJobsData,
}: DashboardContentProps) {
  const { data: session } = useSession();
  const [activeTab, setActiveTab] = useState("overview");
  const [portfolioData, setPortfolioData] = useState(initialPortfolioData);
  const [jobs, setJobs] = useState<any[]>(initialJobsData);

  // Data is already loaded server-side, no client-side fetching needed for initial load
  // We could add real-time updates here if needed

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-semibold text-gray-900">
                Auto Trader Admin
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-700">
                Welcome, {session?.user?.name || session?.user?.email}
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

      {/* Navigation */}
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8">
            <button
              onClick={() => setActiveTab("overview")}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === "overview"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab("portfolio")}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === "portfolio"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              Portfolio
            </button>
            <Link
              href="/jobs"
              className="py-4 px-1 border-b-2 border-transparent font-medium text-sm text-gray-500 hover:text-gray-700 hover:border-gray-300"
            >
              Jobs
            </Link>
            <button
              onClick={() => setActiveTab("settings")}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === "settings"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              Settings
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {activeTab === "overview" && (
          <div className="space-y-6">
            <>
              {/* Portfolio Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-white overflow-hidden shadow rounded-lg">
                  <div className="p-5">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <DollarSign className="h-6 w-6 text-gray-400" />
                      </div>
                      <div className="ml-5 w-0 flex-1">
                        <dl>
                          <dt className="text-sm font-medium text-gray-500 truncate">
                            Total Value
                          </dt>
                          <dd className="text-lg font-medium text-gray-900">
                            ${portfolioData.totalValue.toLocaleString()}
                          </dd>
                        </dl>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white overflow-hidden shadow rounded-lg">
                  <div className="p-5">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <TrendingUp className="h-6 w-6 text-green-400" />
                      </div>
                      <div className="ml-5 w-0 flex-1">
                        <dl>
                          <dt className="text-sm font-medium text-gray-500 truncate">
                            Daily Change
                          </dt>
                          <dd className="text-lg font-medium text-green-600">
                            +{portfolioData.dailyChange}%
                          </dd>
                        </dl>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white overflow-hidden shadow rounded-lg">
                  <div className="p-5">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <BarChart3 className="h-6 w-6 text-blue-400" />
                      </div>
                      <div className="ml-5 w-0 flex-1">
                        <dl>
                          <dt className="text-sm font-medium text-gray-500 truncate">
                            7-Day Change
                          </dt>
                          <dd className="text-lg font-medium text-green-600">
                            +{portfolioData.weeklyChange}%
                          </dd>
                        </dl>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white overflow-hidden shadow rounded-lg">
                  <div className="p-5">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <Activity className="h-6 w-6 text-purple-400" />
                      </div>
                      <div className="ml-5 w-0 flex-1">
                        <dl>
                          <dt className="text-sm font-medium text-gray-500 truncate">
                            Active Positions
                          </dt>
                          <dd className="text-lg font-medium text-gray-900">
                            {portfolioData.positions}
                          </dd>
                        </dl>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Job Status Overview */}
              <div className="bg-white shadow rounded-lg">
                <div className="px-4 py-5 sm:p-6">
                  <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                    System Status
                  </h3>
                  <div className="space-y-4">
                    {jobs.slice(0, 3).map((job) => (
                      <div
                        key={job.id}
                        className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                      >
                        <div className="flex items-center">
                          <div
                            className={`w-3 h-3 rounded-full mr-3 ${
                              job.status === "running"
                                ? "bg-green-400"
                                : job.status === "completed"
                                ? "bg-blue-400"
                                : job.status === "failed"
                                ? "bg-red-400"
                                : "bg-gray-400"
                            }`}
                          />
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              {job.name}
                            </p>
                            <p className="text-sm text-gray-500">
                              Last run:{" "}
                              {job.lastRun
                                ? new Date(job.lastRun).toLocaleDateString()
                                : "Never"}{" "}
                              • Next:{" "}
                              {job.nextRun
                                ? new Date(job.nextRun).toLocaleDateString()
                                : "Not scheduled"}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              job.status === "running"
                                ? "bg-green-100 text-green-800"
                                : job.status === "completed"
                                ? "bg-blue-100 text-blue-800"
                                : job.status === "failed"
                                ? "bg-red-100 text-red-800"
                                : "bg-gray-100 text-gray-800"
                            }`}
                          >
                            {job.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          </div>
        )}

        {activeTab === "portfolio" && (
          <div className="bg-white shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg leading-6 font-medium text-gray-900">
                Portfolio Details
              </h3>
              <p className="mt-2 text-sm text-gray-500">
                Detailed portfolio view coming soon...
              </p>
            </div>
          </div>
        )}

        {activeTab === "settings" && (
          <div className="bg-white shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg leading-6 font-medium text-gray-900">
                Settings
              </h3>
              <p className="mt-2 text-sm text-gray-500">
                System configuration coming soon...
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
