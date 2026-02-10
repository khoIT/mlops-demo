"use client";

import { useState, useMemo } from "react";
import {
  RawLogEntry,
  UserFeatureRow,
  FeatureDefinition,
} from "@/lib/types";
import { DEFAULT_FEATURES, TARGET_VARIABLES, getFeatureStats } from "@/lib/ml-engine";
import {
  Table,
  Eye,
  BarChart3,
  ArrowUpDown,
  Search,
  ChevronRight,
  Layers,
  Tag,
} from "lucide-react";

interface DataExplorerProps {
  rawLogs: RawLogEntry[];
  featureData: UserFeatureRow[];
  features: FeatureDefinition[];
  onFeaturesChange: (features: FeatureDefinition[]) => void;
}

type SubTab = "raw_data" | "feature_store" | "data_profile";

export default function DataExplorer({
  rawLogs,
  featureData,
  features,
}: DataExplorerProps) {
  const [subTab, setSubTab] = useState<SubTab>("raw_data");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortCol, setSortCol] = useState<string>("timestamp");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);
  const pageSize = 20;

  // Filter & sort raw logs
  const filteredLogs = useMemo(() => {
    let logs = [...rawLogs];
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      logs = logs.filter(
        (l) =>
          l.user_id.toLowerCase().includes(term) ||
          l.resource_type.toLowerCase().includes(term) ||
          l.resource_name.toLowerCase().includes(term) ||
          (l.folder || "").toLowerCase().includes(term)
      );
    }
    logs.sort((a, b) => {
      const va = String((a as unknown as Record<string, unknown>)[sortCol] || "");
      const vb = String((b as unknown as Record<string, unknown>)[sortCol] || "");
      return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
    });
    return logs;
  }, [rawLogs, searchTerm, sortCol, sortDir]);

  const paginatedLogs = filteredLogs.slice(
    page * pageSize,
    (page + 1) * pageSize
  );
  const totalPages = Math.ceil(filteredLogs.length / pageSize);

  // Data profiling stats
  const profileStats = useMemo(() => {
    const resourceTypeCounts = new Map<string, number>();
    const deviceCounts = new Map<string, number>();
    const userCounts = new Map<string, number>();
    for (const log of rawLogs) {
      resourceTypeCounts.set(
        log.resource_type,
        (resourceTypeCounts.get(log.resource_type) || 0) + 1
      );
      const dt = log.device_type || "unknown";
      deviceCounts.set(dt, (deviceCounts.get(dt) || 0) + 1);
      userCounts.set(log.user_id, (userCounts.get(log.user_id) || 0) + 1);
    }
    return { resourceTypeCounts, deviceCounts, userCounts };
  }, [rawLogs]);

  const handleSort = (col: string) => {
    if (sortCol === col) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortCol(col);
      setSortDir("asc");
    }
  };

  const SUB_TABS: { id: SubTab; label: string; icon: React.ReactNode }[] = [
    { id: "raw_data", label: "Raw Data", icon: <Table size={16} /> },
    { id: "feature_store", label: "Feature Store", icon: <Layers size={16} /> },
    { id: "data_profile", label: "Data Profile", icon: <BarChart3 size={16} /> },
  ];

  return (
    <div className="space-y-4">
      {/* Sub-tab navigation */}
      <div className="flex gap-1 bg-zinc-900 rounded-lg p-1 border border-zinc-800">
        {SUB_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSubTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              subTab === tab.id
                ? "bg-zinc-700 text-white"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ─── Raw Data Table ─── */}
      {subTab === "raw_data" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Eye size={16} className="text-blue-400" />
              <span className="text-sm text-zinc-400">
                {rawLogs.length} events from {profileStats.userCounts.size} users
              </span>
            </div>
            <div className="relative">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
              />
              <input
                type="text"
                placeholder="Filter by user, resource, folder..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setPage(0);
                }}
                className="pl-9 pr-4 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-blue-500 w-72"
              />
            </div>
          </div>

          <div className="border border-zinc-800 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-zinc-900/80 border-b border-zinc-800">
                    {[
                      "resource_type",
                      "resource_name",
                      "user_id",
                      "timestamp",
                      "device_type",
                      "source_item",
                      "folder",
                    ].map((col) => (
                      <th
                        key={col}
                        onClick={() => handleSort(col)}
                        className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider cursor-pointer hover:text-zinc-200 select-none"
                      >
                        <div className="flex items-center gap-1">
                          {col.replace("_", " ")}
                          <ArrowUpDown size={12} className="text-zinc-600" />
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {paginatedLogs.map((log, i) => (
                    <tr
                      key={i}
                      className="hover:bg-zinc-800/30 transition-colors"
                    >
                      <td className="px-4 py-2.5">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            log.resource_type === "home"
                              ? "bg-blue-500/20 text-blue-400"
                              : log.resource_type === "realtime"
                              ? "bg-green-500/20 text-green-400"
                              : log.resource_type === "tableau"
                              ? "bg-purple-500/20 text-purple-400"
                              : log.resource_type === "export"
                              ? "bg-amber-500/20 text-amber-400"
                              : log.resource_type === "game"
                              ? "bg-red-500/20 text-red-400"
                              : "bg-zinc-500/20 text-zinc-400"
                          }`}
                        >
                          {log.resource_type}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-zinc-300">
                        {log.resource_name}
                      </td>
                      <td className="px-4 py-2.5 text-cyan-400 font-mono text-xs">
                        {log.user_id}
                      </td>
                      <td className="px-4 py-2.5 text-zinc-400 font-mono text-xs">
                        {log.timestamp}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`text-xs ${
                            log.device_type === "mobile"
                              ? "text-orange-400"
                              : "text-zinc-400"
                          }`}
                        >
                          {log.device_type || "-"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-zinc-500 text-xs">
                        {log.source_item || "-"}
                      </td>
                      <td className="px-4 py-2.5 text-zinc-500 text-xs max-w-[200px] truncate">
                        {log.folder || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Pagination */}
            <div className="flex items-center justify-between px-4 py-3 bg-zinc-900/50 border-t border-zinc-800">
              <span className="text-xs text-zinc-500">
                Showing {page * pageSize + 1}-
                {Math.min((page + 1) * pageSize, filteredLogs.length)} of{" "}
                {filteredLogs.length}
              </span>
              <div className="flex gap-1">
                <button
                  disabled={page === 0}
                  onClick={() => setPage(page - 1)}
                  className="px-3 py-1 text-xs bg-zinc-800 rounded hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed text-zinc-300"
                >
                  Prev
                </button>
                <button
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage(page + 1)}
                  className="px-3 py-1 text-xs bg-zinc-800 rounded hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed text-zinc-300"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Feature Store ─── */}
      {subTab === "feature_store" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Layers size={16} className="text-purple-400" />
            <span className="text-sm text-zinc-300 font-semibold">
              Feature Store
            </span>
            <span className="text-xs text-zinc-500">
              &mdash; Computed features from {featureData.length} users
            </span>
          </div>

          {/* Feature definitions */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {features.map((feat) => {
              const stats = getFeatureStats(featureData, feat.id);
              return (
                <div
                  key={feat.id}
                  className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 hover:border-zinc-700 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <Tag size={14} className="text-purple-400" />
                        <span className="text-sm font-semibold text-zinc-200">
                          {feat.name}
                        </span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                            feat.type === "numeric"
                              ? "bg-blue-500/20 text-blue-400"
                              : "bg-green-500/20 text-green-400"
                          }`}
                        >
                          {feat.type}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-500 mt-1">
                        {feat.description}
                      </p>
                    </div>
                    <span className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full">
                      {feat.source}
                    </span>
                  </div>
                  {feat.type === "numeric" && (
                    <div className="flex gap-4 mt-3 text-xs">
                      <div>
                        <span className="text-zinc-500">min </span>
                        <span className="text-zinc-300 font-mono">
                          {stats.min}
                        </span>
                      </div>
                      <div>
                        <span className="text-zinc-500">max </span>
                        <span className="text-zinc-300 font-mono">
                          {stats.max}
                        </span>
                      </div>
                      <div>
                        <span className="text-zinc-500">mean </span>
                        <span className="text-zinc-300 font-mono">
                          {stats.mean}
                        </span>
                      </div>
                      <div>
                        <span className="text-zinc-500">std </span>
                        <span className="text-zinc-300 font-mono">
                          {stats.std}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Target variables */}
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-zinc-300 mb-3 flex items-center gap-2">
              <ChevronRight size={14} className="text-amber-400" />
              Available Target Variables
            </h3>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              {TARGET_VARIABLES.map((tv) => (
                <div
                  key={tv.id}
                  className="bg-zinc-900 border border-amber-800/30 rounded-lg p-4"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-2 h-2 rounded-full bg-amber-400" />
                    <span className="text-sm font-semibold text-amber-300">
                      {tv.name}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500">{tv.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Feature table preview */}
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-zinc-300 mb-3">
              Feature Table Preview
            </h3>
            <div className="border border-zinc-800 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-zinc-900/80 border-b border-zinc-800">
                      <th className="px-3 py-2.5 text-left text-zinc-400 font-semibold">
                        user_id
                      </th>
                      {features.map((f) => (
                        <th
                          key={f.id}
                          className="px-3 py-2.5 text-left text-zinc-400 font-semibold"
                        >
                          {f.id}
                        </th>
                      ))}
                      {TARGET_VARIABLES.map((t) => (
                        <th
                          key={t.id}
                          className="px-3 py-2.5 text-left text-amber-400/80 font-semibold"
                        >
                          {t.id}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/50">
                    {featureData.slice(0, 10).map((row) => (
                      <tr
                        key={String(row.user_id)}
                        className="hover:bg-zinc-800/30"
                      >
                        <td className="px-3 py-2 text-cyan-400 font-mono">
                          {String(row.user_id)}
                        </td>
                        {features.map((f) => (
                          <td
                            key={f.id}
                            className="px-3 py-2 text-zinc-300 font-mono"
                          >
                            {String(row[f.id] ?? "-")}
                          </td>
                        ))}
                        {TARGET_VARIABLES.map((t) => (
                          <td
                            key={t.id}
                            className="px-3 py-2 text-amber-300 font-mono"
                          >
                            {String(row[t.id] ?? "-")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Data Profile ─── */}
      {subTab === "data_profile" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Resource Type Distribution */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
              <h3 className="text-sm font-semibold text-zinc-300 mb-3">
                Resource Type Distribution
              </h3>
              <div className="space-y-2">
                {[...profileStats.resourceTypeCounts.entries()]
                  .sort((a, b) => b[1] - a[1])
                  .map(([type, count]) => (
                    <div key={type} className="flex items-center gap-2">
                      <span className="text-xs text-zinc-400 w-20 truncate">
                        {type}
                      </span>
                      <div className="flex-1 h-5 bg-zinc-800 rounded overflow-hidden">
                        <div
                          className={`h-full rounded ${
                            type === "home"
                              ? "bg-blue-500"
                              : type === "realtime"
                              ? "bg-green-500"
                              : type === "tableau"
                              ? "bg-purple-500"
                              : type === "export"
                              ? "bg-amber-500"
                              : type === "game"
                              ? "bg-red-500"
                              : "bg-zinc-500"
                          }`}
                          style={{
                            width: `${
                              (count / rawLogs.length) * 100
                            }%`,
                          }}
                        />
                      </div>
                      <span className="text-xs text-zinc-400 font-mono w-8 text-right">
                        {count}
                      </span>
                    </div>
                  ))}
              </div>
            </div>

            {/* Device Distribution */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
              <h3 className="text-sm font-semibold text-zinc-300 mb-3">
                Device Distribution
              </h3>
              <div className="space-y-2">
                {[...profileStats.deviceCounts.entries()]
                  .sort((a, b) => b[1] - a[1])
                  .map(([device, count]) => (
                    <div key={device} className="flex items-center gap-2">
                      <span className="text-xs text-zinc-400 w-20">
                        {device}
                      </span>
                      <div className="flex-1 h-5 bg-zinc-800 rounded overflow-hidden">
                        <div
                          className="h-full bg-cyan-500 rounded"
                          style={{
                            width: `${
                              (count / rawLogs.length) * 100
                            }%`,
                          }}
                        />
                      </div>
                      <span className="text-xs text-zinc-400 font-mono w-8 text-right">
                        {count}
                      </span>
                    </div>
                  ))}
              </div>
            </div>

            {/* Top Users */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
              <h3 className="text-sm font-semibold text-zinc-300 mb-3">
                Top Users by Activity
              </h3>
              <div className="space-y-2">
                {[...profileStats.userCounts.entries()]
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 8)
                  .map(([userId, count]) => (
                    <div key={userId} className="flex items-center gap-2">
                      <span className="text-xs text-cyan-400 font-mono w-24 truncate">
                        {userId}
                      </span>
                      <div className="flex-1 h-5 bg-zinc-800 rounded overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded"
                          style={{
                            width: `${
                              (count /
                                Math.max(
                                  ...profileStats.userCounts.values()
                                )) *
                              100
                            }%`,
                          }}
                        />
                      </div>
                      <span className="text-xs text-zinc-400 font-mono w-8 text-right">
                        {count}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          </div>

          {/* Summary Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Total Events", value: rawLogs.length, color: "blue" },
              {
                label: "Unique Users",
                value: profileStats.userCounts.size,
                color: "cyan",
              },
              {
                label: "Resource Types",
                value: profileStats.resourceTypeCounts.size,
                color: "purple",
              },
              {
                label: "Avg Events/User",
                value: Math.round(
                  rawLogs.length / profileStats.userCounts.size
                ),
                color: "green",
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-center"
              >
                <div
                  className={`text-2xl font-bold ${
                    stat.color === "blue"
                      ? "text-blue-400"
                      : stat.color === "cyan"
                      ? "text-cyan-400"
                      : stat.color === "purple"
                      ? "text-purple-400"
                      : "text-green-400"
                  }`}
                >
                  {stat.value}
                </div>
                <div className="text-xs text-zinc-500 mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
