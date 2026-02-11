"use client";

import { useState, useMemo, Fragment } from "react";
import { UserFeatureRow, FeatureDefinition } from "@/lib/types";
import { DEFAULT_FEATURES, TARGET_VARIABLES } from "@/lib/ml-engine";
import InfoTooltip from "@/components/InfoTooltip";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  Cell,
  Legend,
} from "recharts";
import {
  Search,
  Table2,
  Grid3X3,
  BarChart3,
  ScatterChart as ScatterIcon,
  Target,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle2,
  Info,
  ShieldAlert,
  Eye,
} from "lucide-react";

interface ExploratoryDataDiscoveryProps {
  featureData: UserFeatureRow[];
  features: FeatureDefinition[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getNumericValues(data: UserFeatureRow[], key: string): number[] {
  return data
    .map((row) => {
      const val = row[key];
      return typeof val === "number" ? val : parseFloat(String(val));
    })
    .filter((v) => !isNaN(v));
}

function computeStats(values: number[]) {
  if (values.length === 0)
    return { count: 0, mean: 0, std: 0, min: 0, q25: 0, median: 0, q75: 0, max: 0, missing: 0, skewness: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  const variance = sorted.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);
  const skewness = std > 0 ? sorted.reduce((a, b) => a + ((b - mean) / std) ** 3, 0) / n : 0;
  const percentile = (p: number) => {
    const idx = (p / 100) * (n - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  };
  return {
    count: n,
    mean: Math.round(mean * 1000) / 1000,
    std: Math.round(std * 1000) / 1000,
    min: sorted[0],
    q25: Math.round(percentile(25) * 1000) / 1000,
    median: Math.round(percentile(50) * 1000) / 1000,
    q75: Math.round(percentile(75) * 1000) / 1000,
    max: sorted[n - 1],
    missing: 0,
    skewness: Math.round(skewness * 1000) / 1000,
  };
}

function computeCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n === 0) return 0;
  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;
  let num = 0,
    denX = 0,
    denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const den = Math.sqrt(denX * denY);
  return den === 0 ? 0 : Math.round((num / den) * 1000) / 1000;
}

function buildHistogram(values: number[], bins: number = 15) {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return [{ binLabel: String(min), count: values.length, range: `${min}` }];
  const binWidth = (max - min) / bins;
  const histogram = Array.from({ length: bins }, (_, i) => ({
    binLabel: (min + binWidth * i + binWidth / 2).toFixed(2),
    count: 0,
    range: `${(min + binWidth * i).toFixed(2)} – ${(min + binWidth * (i + 1)).toFixed(2)}`,
  }));
  for (const v of values) {
    let idx = Math.floor((v - min) / binWidth);
    if (idx >= bins) idx = bins - 1;
    histogram[idx].count++;
  }
  return histogram;
}

// ─── Label conflict detection (k-NN disagreement) ───────────────────────────

interface ConflictResult {
  conflictRate: number;
  totalSamples: number;
  conflictingSamples: number;
  conflictPairs: { idx: number; neighborIdx: number; label: string; neighborLabel: string; distance: number }[];
  boundaryZone: { idx: number; label: string; minDistToOther: number }[];
  severity: "low" | "moderate" | "high";
}

function detectLabelConflicts(
  data: UserFeatureRow[],
  featureIds: string[],
  targetKey: string,
  k: number = 5
): ConflictResult {
  if (data.length < k + 1) {
    return { conflictRate: 0, totalSamples: data.length, conflictingSamples: 0, conflictPairs: [], boundaryZone: [], severity: "low" };
  }

  // Normalize features to [0,1] for distance calculation
  const mins: number[] = [];
  const ranges: number[] = [];
  for (const fId of featureIds) {
    const vals = data.map((r) => (typeof r[fId] === "number" ? (r[fId] as number) : parseFloat(String(r[fId])) || 0));
    const mn = Math.min(...vals);
    const mx = Math.max(...vals);
    mins.push(mn);
    ranges.push(mx - mn || 1);
  }

  const normalized = data.map((row) =>
    featureIds.map((fId, fi) => {
      const v = typeof row[fId] === "number" ? (row[fId] as number) : parseFloat(String(row[fId])) || 0;
      return (v - mins[fi]) / ranges[fi];
    })
  );

  const labels = data.map((row) => String(row[targetKey] || "unknown"));

  // Euclidean distance
  const dist = (a: number[], b: number[]) => {
    let s = 0;
    for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
    return Math.sqrt(s);
  };

  let conflictingSamples = 0;
  const conflictPairs: ConflictResult["conflictPairs"] = [];
  const boundaryZone: ConflictResult["boundaryZone"] = [];

  for (let i = 0; i < data.length; i++) {
    // Find k nearest neighbors
    const distances: { idx: number; d: number }[] = [];
    for (let j = 0; j < data.length; j++) {
      if (i === j) continue;
      distances.push({ idx: j, d: dist(normalized[i], normalized[j]) });
    }
    distances.sort((a, b) => a.d - b.d);
    const neighbors = distances.slice(0, k);

    // Check label disagreement among k neighbors
    const disagreeCount = neighbors.filter((n) => labels[n.idx] !== labels[i]).length;
    const hasConflict = disagreeCount > k / 2; // majority disagrees

    if (hasConflict) {
      conflictingSamples++;
      // Record first disagreeing neighbor as example
      const firstDisagree = neighbors.find((n) => labels[n.idx] !== labels[i]);
      if (firstDisagree && conflictPairs.length < 50) {
        conflictPairs.push({
          idx: i,
          neighborIdx: firstDisagree.idx,
          label: labels[i],
          neighborLabel: labels[firstDisagree.idx],
          distance: Math.round(firstDisagree.d * 10000) / 10000,
        });
      }
    }

    // Check if near decision boundary (has ANY neighbor with different label within very close range)
    const closestOther = neighbors.find((n) => labels[n.idx] !== labels[i]);
    if (closestOther && closestOther.d < 0.15 && boundaryZone.length < 100) {
      boundaryZone.push({ idx: i, label: labels[i], minDistToOther: closestOther.d });
    }
  }

  const conflictRate = Math.round((conflictingSamples / data.length) * 1000) / 10;
  const severity: ConflictResult["severity"] =
    conflictRate > 20 ? "high" : conflictRate > 10 ? "moderate" : "low";

  return { conflictRate, totalSamples: data.length, conflictingSamples, conflictPairs, boundaryZone, severity };
}

// ─── Color scale for correlation ────────────────────────────────────────────

function correlationColor(r: number): string {
  const abs = Math.abs(r);
  if (r > 0) {
    const g = Math.round(130 + (1 - abs) * 125);
    const rb = Math.round(40 + (1 - abs) * 215);
    return `rgb(${rb}, ${g}, ${rb})`;
  } else {
    const rr = Math.round(130 + (1 - abs) * 125);
    const gb = Math.round(40 + (1 - abs) * 215);
    return `rgb(${rr}, ${gb}, ${gb})`;
  }
}

function correlationTextColor(r: number): string {
  return Math.abs(r) > 0.5 ? "#fff" : "#a1a1aa";
}

// ─── Tabs ───────────────────────────────────────────────────────────────────

type EDATab = "overview" | "correlation" | "distributions" | "scatter" | "target";

const EDA_TABS: { id: EDATab; label: string; icon: React.ReactNode }[] = [
  { id: "overview", label: "Summary Statistics", icon: <Table2 size={14} /> },
  { id: "correlation", label: "Correlation Matrix", icon: <Grid3X3 size={14} /> },
  { id: "distributions", label: "Distributions", icon: <BarChart3 size={14} /> },
  { id: "scatter", label: "Scatter Plots", icon: <ScatterIcon size={14} /> },
  { id: "target", label: "Target Analysis", icon: <Target size={14} /> },
];

const SCATTER_COLORS = [
  "#3b82f6", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b",
  "#ef4444", "#ec4899", "#6366f1", "#14b8a6", "#f97316",
];

// ─── Component ──────────────────────────────────────────────────────────────

export default function ExploratoryDataDiscovery({
  featureData,
  features,
}: ExploratoryDataDiscoveryProps) {
  const [activeTab, setActiveTab] = useState<EDATab>("overview");
  const [expandedFeature, setExpandedFeature] = useState<string | null>(null);
  const [scatterX, setScatterX] = useState<string>("session_count");
  const [scatterY, setScatterY] = useState<string>("unique_resources");
  const [scatterColor, setScatterColor] = useState<string>("is_power_user");
  const [selectedTarget, setSelectedTarget] = useState<string>("is_power_user");

  const numericFeatures = useMemo(
    () => features.filter((f) => f.type === "numeric"),
    [features]
  );

  const featureIds = useMemo(
    () => numericFeatures.map((f) => f.id),
    [numericFeatures]
  );

  // ─── Summary stats ────────────────────────────────────────────────────────

  const summaryStats = useMemo(() => {
    return numericFeatures.map((f) => {
      const values = getNumericValues(featureData, f.id);
      return { feature: f, stats: computeStats(values) };
    });
  }, [featureData, numericFeatures]);

  // ─── Correlation matrix ───────────────────────────────────────────────────

  const correlationMatrix = useMemo(() => {
    const valuesMap: Record<string, number[]> = {};
    for (const fId of featureIds) {
      valuesMap[fId] = getNumericValues(featureData, fId);
    }
    const matrix: number[][] = [];
    for (let i = 0; i < featureIds.length; i++) {
      const row: number[] = [];
      for (let j = 0; j < featureIds.length; j++) {
        row.push(computeCorrelation(valuesMap[featureIds[i]], valuesMap[featureIds[j]]));
      }
      matrix.push(row);
    }
    return matrix;
  }, [featureData, featureIds]);

  // ─── Strong correlations ──────────────────────────────────────────────────

  const strongCorrelations = useMemo(() => {
    const pairs: { f1: string; f2: string; r: number }[] = [];
    for (let i = 0; i < featureIds.length; i++) {
      for (let j = i + 1; j < featureIds.length; j++) {
        const r = correlationMatrix[i][j];
        if (Math.abs(r) >= 0.6) {
          pairs.push({ f1: featureIds[i], f2: featureIds[j], r });
        }
      }
    }
    return pairs.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
  }, [correlationMatrix, featureIds]);

  // ─── Histograms ───────────────────────────────────────────────────────────

  const histograms = useMemo(() => {
    const result: Record<string, ReturnType<typeof buildHistogram>> = {};
    for (const f of numericFeatures) {
      result[f.id] = buildHistogram(getNumericValues(featureData, f.id));
    }
    return result;
  }, [featureData, numericFeatures]);

  // ─── Scatter data ─────────────────────────────────────────────────────────

  const scatterData = useMemo(() => {
    return featureData.map((row) => ({
      x: typeof row[scatterX] === "number" ? row[scatterX] : parseFloat(String(row[scatterX])) || 0,
      y: typeof row[scatterY] === "number" ? row[scatterY] : parseFloat(String(row[scatterY])) || 0,
      color: String(row[scatterColor] || "unknown"),
      user_id: row.user_id,
    }));
  }, [featureData, scatterX, scatterY, scatterColor]);

  const scatterColorCategories = useMemo(() => {
    return [...new Set(scatterData.map((d) => d.color))].sort();
  }, [scatterData]);

  // ─── Target distribution ──────────────────────────────────────────────────

  const targetDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const row of featureData) {
      const val = String(row[selectedTarget] || "unknown");
      counts[val] = (counts[val] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([label, count]) => ({
        label,
        count,
        percentage: Math.round((count / featureData.length) * 1000) / 10,
      }))
      .sort((a, b) => b.count - a.count);
  }, [featureData, selectedTarget]);

  // ─── Feature stats by target class ────────────────────────────────────────

  const featureByTarget = useMemo(() => {
    const classes = [...new Set(featureData.map((row) => String(row[selectedTarget])))].sort();
    return numericFeatures.slice(0, 6).map((f) => {
      const byClass: Record<string, { mean: number; std: number }> = {};
      for (const cls of classes) {
        const vals = featureData
          .filter((row) => String(row[selectedTarget]) === cls)
          .map((row) => (typeof row[f.id] === "number" ? (row[f.id] as number) : parseFloat(String(row[f.id])) || 0));
        const mean = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
        const std =
          vals.length > 0
            ? Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length)
            : 0;
        byClass[cls] = { mean: Math.round(mean * 100) / 100, std: Math.round(std * 100) / 100 };
      }
      return { feature: f, byClass, classes };
    });
  }, [featureData, numericFeatures, selectedTarget]);

  // ─── Label conflict detection ──────────────────────────────────────────────

  const labelConflicts = useMemo(() => {
    return detectLabelConflicts(featureData, featureIds, selectedTarget);
  }, [featureData, featureIds, selectedTarget]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-lg flex items-center justify-center">
              <Search size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-zinc-100">Exploratory Data Analysis</h2>
              <p className="text-xs text-zinc-500">
                Understand feature distributions, correlations, and relationships before training —{" "}
                <span className="text-cyan-400">inspired by MLflow Data Explorer</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs text-zinc-500">
            <div className="px-3 py-1.5 bg-zinc-800 rounded-lg border border-zinc-700">
              <span className="text-zinc-400">{featureData.length}</span> samples
            </div>
            <div className="px-3 py-1.5 bg-zinc-800 rounded-lg border border-zinc-700">
              <span className="text-zinc-400">{numericFeatures.length}</span> features
            </div>
            <div className="px-3 py-1.5 bg-zinc-800 rounded-lg border border-zinc-700">
              <span className="text-zinc-400">{TARGET_VARIABLES.length}</span> targets
            </div>
          </div>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 bg-zinc-900 rounded-xl p-1.5 border border-zinc-800">
        {EDA_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all flex-1 justify-center ${
              activeTab === tab.id
                ? "bg-cyan-600/20 border border-cyan-500/40 text-cyan-400"
                : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ═══ OVERVIEW TAB ═══ */}
      {activeTab === "overview" && (
        <div className="space-y-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <Table2 size={16} className="text-cyan-400" />
              <h3 className="text-sm font-semibold text-zinc-200">Dataset Summary Statistics</h3>
              <InfoTooltip
                title="MLflow-Style Dataset Profiling"
                variant="info"
                wide
                content={
                  <>
                    <p>A quick statistical snapshot of every numeric feature in your dataset — similar to <strong>MLflow&apos;s Dataset tab</strong> and pandas <code>df.describe()</code>.</p>
                    <p className="mt-1"><strong>What to look for:</strong></p>
                    <ul className="mt-0.5 space-y-0.5">
                      <li>- <strong>High std relative to mean:</strong> Feature has wide spread, consider normalization</li>
                      <li>- <strong>Min = Max:</strong> Constant feature, useless for ML — drop it</li>
                      <li>- <strong>Large skewness (|s| &gt; 1):</strong> Heavily skewed, consider log-transform</li>
                      <li>- <strong>Q75 ≈ Max:</strong> Most values are low with a few outliers</li>
                    </ul>
                  </>
                }
              />
            </div>
            <p className="text-[11px] text-zinc-600 mb-4">
              Click any row to expand and see the distribution histogram for that feature.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-700">
                    <th className="px-3 py-2 text-left text-zinc-500 font-medium">Feature</th>
                    <th className="px-3 py-2 text-right text-zinc-500 font-medium">Count</th>
                    <th className="px-3 py-2 text-right text-zinc-500 font-medium">Mean</th>
                    <th className="px-3 py-2 text-right text-zinc-500 font-medium">Std</th>
                    <th className="px-3 py-2 text-right text-zinc-500 font-medium">Min</th>
                    <th className="px-3 py-2 text-right text-zinc-500 font-medium">Q25</th>
                    <th className="px-3 py-2 text-right text-zinc-500 font-medium">Median</th>
                    <th className="px-3 py-2 text-right text-zinc-500 font-medium">Q75</th>
                    <th className="px-3 py-2 text-right text-zinc-500 font-medium">Max</th>
                    <th className="px-3 py-2 text-right text-zinc-500 font-medium">Skew</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {summaryStats.map(({ feature, stats }) => {
                    const isExpanded = expandedFeature === feature.id;
                    const isSkewed = Math.abs(stats.skewness) > 1;
                    const isConstant = stats.min === stats.max;
                    return (
                      <Fragment key={feature.id}>
                        <tr
                          className={`hover:bg-zinc-800/30 cursor-pointer transition-colors ${isExpanded ? "bg-zinc-800/20" : ""}`}
                          onClick={() => setExpandedFeature(isExpanded ? null : feature.id)}
                        >
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              {isExpanded ? (
                                <ChevronUp size={12} className="text-zinc-500" />
                              ) : (
                                <ChevronDown size={12} className="text-zinc-500" />
                              )}
                              <div>
                                <span className="text-zinc-200 font-medium">{feature.name}</span>
                                <div className="text-[10px] text-zinc-600">{feature.id}</div>
                              </div>
                              {isConstant && (
                                <span className="px-1.5 py-0.5 bg-red-500/10 border border-red-500/30 rounded text-[9px] text-red-400 font-medium">
                                  CONSTANT
                                </span>
                              )}
                              {isSkewed && !isConstant && (
                                <span className="px-1.5 py-0.5 bg-amber-500/10 border border-amber-500/30 rounded text-[9px] text-amber-400 font-medium">
                                  SKEWED
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-right text-zinc-400 font-mono">{stats.count}</td>
                          <td className="px-3 py-2.5 text-right text-cyan-400 font-mono">{stats.mean}</td>
                          <td className="px-3 py-2.5 text-right text-zinc-400 font-mono">{stats.std}</td>
                          <td className="px-3 py-2.5 text-right text-zinc-500 font-mono">{stats.min}</td>
                          <td className="px-3 py-2.5 text-right text-zinc-400 font-mono">{stats.q25}</td>
                          <td className="px-3 py-2.5 text-right text-blue-400 font-mono">{stats.median}</td>
                          <td className="px-3 py-2.5 text-right text-zinc-400 font-mono">{stats.q75}</td>
                          <td className="px-3 py-2.5 text-right text-zinc-500 font-mono">{stats.max}</td>
                          <td className={`px-3 py-2.5 text-right font-mono ${isSkewed ? "text-amber-400" : "text-zinc-500"}`}>
                            {stats.skewness}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={10} className="px-3 py-3 bg-zinc-800/20">
                              <div className="flex items-start gap-6">
                                <div className="flex-1" style={{ height: 160 }}>
                                  <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={histograms[feature.id]}>
                                      <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                                      <XAxis dataKey="binLabel" tick={{ fill: "#71717a", fontSize: 9 }} axisLine={{ stroke: "#3f3f46" }} interval="preserveStartEnd" />
                                      <YAxis tick={{ fill: "#71717a", fontSize: 9 }} axisLine={{ stroke: "#3f3f46" }} />
                                      <Tooltip
                                        contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: "8px", fontSize: "11px" }}
                                        formatter={(value: any) => [value, "Count"]}
                                        labelFormatter={(label: any) => {
                                          const bin = histograms[feature.id]?.find((b: any) => b.binLabel === label);
                                          return bin ? `Range: ${bin.range}` : String(label);
                                        }}
                                      />
                                      <Bar dataKey="count" fill="#06b6d4" radius={[2, 2, 0, 0]} />
                                    </BarChart>
                                  </ResponsiveContainer>
                                </div>
                                <div className="w-48 text-[11px] space-y-1.5 shrink-0">
                                  <div className="text-zinc-400 font-medium mb-2">{feature.description}</div>
                                  <div className="flex justify-between">
                                    <span className="text-zinc-500">Type:</span>
                                    <span className="text-zinc-300">{feature.source}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-zinc-500">IQR:</span>
                                    <span className="text-zinc-300 font-mono">
                                      {Math.round((stats.q75 - stats.q25) * 1000) / 1000}
                                    </span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-zinc-500">CV:</span>
                                    <span className="text-zinc-300 font-mono">
                                      {stats.mean !== 0 ? Math.round((stats.std / Math.abs(stats.mean)) * 100) / 100 : "∞"}
                                    </span>
                                  </div>
                                  {isSkewed && (
                                    <div className="mt-2 p-2 bg-amber-500/5 border border-amber-500/20 rounded text-amber-400 text-[10px]">
                                      <AlertTriangle size={10} className="inline mr-1" />
                                      High skewness ({stats.skewness}). Consider log-transform before training.
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ═══ CORRELATION TAB ═══ */}
      {activeTab === "correlation" && (
        <div className="space-y-4">
          <div className="grid grid-cols-12 gap-4">
            {/* Correlation Matrix */}
            <div className="col-span-8 bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-4">
                <Grid3X3 size={16} className="text-cyan-400" />
                <h3 className="text-sm font-semibold text-zinc-200">Pearson Correlation Matrix</h3>
                <InfoTooltip
                  title="Correlation Matrix — Finding Redundant Features"
                  variant="info"
                  wide
                  content={
                    <>
                      <p>Shows <strong>linear relationships</strong> between all pairs of numeric features. Values range from -1 (perfect negative) to +1 (perfect positive).</p>
                      <p className="mt-1"><strong>MLflow best practice:</strong></p>
                      <ul className="mt-0.5 space-y-0.5">
                        <li>- <strong>|r| &gt; 0.8:</strong> Highly correlated — consider dropping one to reduce multicollinearity</li>
                        <li>- <strong>|r| &lt; 0.1:</strong> Nearly independent — both may provide unique signal</li>
                        <li>- <strong>Green = positive, Red = negative</strong> correlation</li>
                      </ul>
                    </>
                  }
                />
              </div>
              <div className="overflow-auto">
                <table className="text-[10px]">
                  <thead>
                    <tr>
                      <th className="px-1 py-1 text-zinc-600 font-medium min-w-[90px]"></th>
                      {featureIds.map((fId) => (
                        <th
                          key={fId}
                          className="px-1 py-1 text-zinc-500 font-medium"
                          style={{ writingMode: "vertical-lr", transform: "rotate(180deg)", minWidth: 32, maxWidth: 32 }}
                        >
                          {numericFeatures.find((f) => f.id === fId)?.name || fId}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {featureIds.map((rowId, i) => (
                      <tr key={rowId}>
                        <td className="px-2 py-1 text-zinc-400 font-medium text-right whitespace-nowrap">
                          {numericFeatures.find((f) => f.id === rowId)?.name || rowId}
                        </td>
                        {featureIds.map((_, j) => {
                          const r = correlationMatrix[i][j];
                          return (
                            <td
                              key={j}
                              className="px-0 py-0 text-center font-mono"
                              style={{
                                backgroundColor: i === j ? "#18181b" : correlationColor(r),
                                color: i === j ? "#52525b" : correlationTextColor(r),
                                width: 32,
                                height: 32,
                                fontSize: "9px",
                              }}
                              title={`${numericFeatures[i]?.name} × ${numericFeatures[j]?.name}: ${r}`}
                            >
                              {i === j ? "1" : r.toFixed(2)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Legend */}
              <div className="flex items-center gap-2 mt-3 text-[10px] text-zinc-500">
                <span>-1.0</span>
                <div className="flex h-3 flex-1 rounded overflow-hidden">
                  {Array.from({ length: 20 }, (_, i) => {
                    const r = -1 + (i / 19) * 2;
                    return <div key={i} className="flex-1" style={{ backgroundColor: correlationColor(r) }} />;
                  })}
                </div>
                <span>+1.0</span>
              </div>
            </div>

            {/* Insights Panel */}
            <div className="col-span-4 space-y-4">
              {/* Strong Correlations */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                <h4 className="text-xs font-semibold text-zinc-300 mb-3 flex items-center gap-2">
                  <AlertTriangle size={12} className="text-amber-400" />
                  Notable Correlations
                </h4>
                {strongCorrelations.length === 0 ? (
                  <div className="flex items-center gap-2 text-[11px] text-green-400">
                    <CheckCircle2 size={12} />
                    No highly correlated pairs (|r| &ge; 0.6). Features appear independent.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {strongCorrelations.map((pair, idx) => (
                      <div key={idx} className="p-2 bg-zinc-800/50 rounded-lg">
                        <div className="flex items-center justify-between">
                          <div className="text-[11px]">
                            <span className="text-cyan-400">{pair.f1}</span>
                            <span className="text-zinc-600 mx-1">×</span>
                            <span className="text-cyan-400">{pair.f2}</span>
                          </div>
                          <span
                            className={`text-xs font-mono font-bold ${
                              Math.abs(pair.r) >= 0.8 ? "text-red-400" : "text-amber-400"
                            }`}
                          >
                            {pair.r.toFixed(3)}
                          </span>
                        </div>
                        {Math.abs(pair.r) >= 0.8 && (
                          <div className="text-[10px] text-red-400/80 mt-1">
                            Very high correlation — consider dropping one feature
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Interpretation Guide */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                <h4 className="text-xs font-semibold text-zinc-300 mb-3 flex items-center gap-2">
                  <Info size={12} className="text-blue-400" />
                  How to Read This
                </h4>
                <div className="text-[11px] text-zinc-500 space-y-2">
                  <p>
                    The correlation matrix shows <strong className="text-zinc-300">Pearson correlation coefficients</strong> between
                    all pairs of numeric features.
                  </p>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded" style={{ backgroundColor: correlationColor(0.9) }} />
                      <span><strong className="text-zinc-300">Green:</strong> Positive — features increase together</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded" style={{ backgroundColor: correlationColor(-0.9) }} />
                      <span><strong className="text-zinc-300">Red:</strong> Negative — one increases as the other decreases</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded bg-zinc-700" />
                      <span><strong className="text-zinc-300">Gray:</strong> Near zero — no linear relationship</span>
                    </div>
                  </div>
                  <p className="text-amber-400/80 mt-2">
                    In MLflow, checking correlations before training helps avoid <strong>multicollinearity</strong> issues that can hurt model interpretability.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ DISTRIBUTIONS TAB ═══ */}
      {activeTab === "distributions" && (
        <div className="space-y-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 size={16} className="text-cyan-400" />
              <h3 className="text-sm font-semibold text-zinc-200">Feature Distributions</h3>
              <InfoTooltip
                title="Distribution Analysis"
                variant="info"
                wide
                content={
                  <>
                    <p>Histograms show <strong>how values are spread</strong> across each feature. This is critical for:</p>
                    <ul className="mt-1 space-y-0.5">
                      <li>- <strong>Spotting outliers:</strong> Long tails or isolated bars</li>
                      <li>- <strong>Choosing transforms:</strong> Skewed distributions often benefit from log-transform</li>
                      <li>- <strong>Detecting data issues:</strong> Spikes at 0 or missing-value artifacts</li>
                      <li>- <strong>Feature scaling decisions:</strong> Uniform vs normal vs heavy-tailed</li>
                    </ul>
                  </>
                }
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {numericFeatures.map((feature) => {
              const stats = summaryStats.find((s) => s.feature.id === feature.id)?.stats;
              return (
                <div key={feature.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-semibold text-zinc-300">{feature.name}</h4>
                    {stats && Math.abs(stats.skewness) > 1 && (
                      <span className="text-[9px] px-1.5 py-0.5 bg-amber-500/10 border border-amber-500/30 rounded text-amber-400">
                        skew: {stats.skewness}
                      </span>
                    )}
                  </div>
                  <ResponsiveContainer width="100%" height={140}>
                    <BarChart data={histograms[feature.id]}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                      <XAxis dataKey="binLabel" tick={{ fill: "#71717a", fontSize: 8 }} axisLine={{ stroke: "#3f3f46" }} interval="preserveStartEnd" />
                      <YAxis tick={{ fill: "#71717a", fontSize: 8 }} axisLine={{ stroke: "#3f3f46" }} />
                      <Tooltip
                        contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: "8px", fontSize: "11px" }}
                        formatter={(value: any) => [value, "Count"]}
                      />
                      <Bar dataKey="count" fill="#06b6d4" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                  {stats && (
                    <div className="flex gap-3 mt-2 text-[10px] text-zinc-500">
                      <span>μ={stats.mean}</span>
                      <span>σ={stats.std}</span>
                      <span>med={stats.median}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══ SCATTER TAB ═══ */}
      {activeTab === "scatter" && (
        <div className="space-y-4">
          <div className="grid grid-cols-12 gap-4">
            {/* Controls */}
            <div className="col-span-3 space-y-4">
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                <h4 className="text-xs font-semibold text-zinc-300 mb-3 flex items-center gap-2">
                  <ScatterIcon size={14} className="text-cyan-400" />
                  Scatter Plot Controls
                </h4>
                <InfoTooltip
                  title="Interactive Scatter Plots"
                  variant="tip"
                  content={
                    <>
                      <p>Scatter plots reveal <strong>non-linear relationships</strong> that correlation coefficients miss.</p>
                      <p className="mt-1">Color by a target variable to see if classes are <strong>separable</strong> in feature space — a good sign for ML!</p>
                    </>
                  }
                />
                <div className="space-y-3 mt-3">
                  <div>
                    <label className="text-[11px] text-zinc-500 mb-1 block">X-Axis Feature</label>
                    <select
                      value={scatterX}
                      onChange={(e) => setScatterX(e.target.value)}
                      className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-cyan-500"
                    >
                      {numericFeatures.map((f) => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] text-zinc-500 mb-1 block">Y-Axis Feature</label>
                    <select
                      value={scatterY}
                      onChange={(e) => setScatterY(e.target.value)}
                      className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-cyan-500"
                    >
                      {numericFeatures.map((f) => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] text-zinc-500 mb-1 block">Color By</label>
                    <select
                      value={scatterColor}
                      onChange={(e) => setScatterColor(e.target.value)}
                      className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-cyan-500"
                    >
                      {TARGET_VARIABLES.map((tv) => (
                        <option key={tv.id} value={tv.id}>{tv.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Color legend */}
                <div className="mt-4 pt-3 border-t border-zinc-800">
                  <div className="text-[10px] text-zinc-500 mb-2">Legend</div>
                  <div className="space-y-1">
                    {scatterColorCategories.map((cat, idx) => (
                      <div key={cat} className="flex items-center gap-2 text-[11px]">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: SCATTER_COLORS[idx % SCATTER_COLORS.length] }} />
                        <span className="text-zinc-300">{cat}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Quick correlation */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                <div className="text-[11px] text-zinc-500">
                  Correlation between selected features:
                </div>
                <div className="text-lg font-bold text-cyan-400 font-mono mt-1">
                  r = {computeCorrelation(
                    getNumericValues(featureData, scatterX),
                    getNumericValues(featureData, scatterY)
                  ).toFixed(3)}
                </div>
              </div>
            </div>

            {/* Scatter Chart */}
            <div className="col-span-9 bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <h4 className="text-xs font-semibold text-zinc-300 mb-3">
                {numericFeatures.find((f) => f.id === scatterX)?.name} vs{" "}
                {numericFeatures.find((f) => f.id === scatterY)?.name}
                <span className="text-zinc-600 font-normal ml-2">colored by {scatterColor}</span>
              </h4>
              <ResponsiveContainer width="100%" height={450}>
                <ScatterChart margin={{ top: 10, right: 10, bottom: 20, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis
                    type="number"
                    dataKey="x"
                    name={scatterX}
                    tick={{ fill: "#71717a", fontSize: 10 }}
                    axisLine={{ stroke: "#3f3f46" }}
                    label={{ value: numericFeatures.find((f) => f.id === scatterX)?.name, position: "bottom", fill: "#71717a", fontSize: 11 }}
                  />
                  <YAxis
                    type="number"
                    dataKey="y"
                    name={scatterY}
                    tick={{ fill: "#71717a", fontSize: 10 }}
                    axisLine={{ stroke: "#3f3f46" }}
                    label={{ value: numericFeatures.find((f) => f.id === scatterY)?.name, angle: -90, position: "insideLeft", fill: "#71717a", fontSize: 11 }}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: "8px", fontSize: "11px" }}
                    formatter={(value: any, name: any) => [typeof value === "number" ? value.toFixed(3) : value, name]}
                    labelFormatter={() => ""}
                  />
                  {scatterColorCategories.map((cat, idx) => (
                    <Scatter
                      key={cat}
                      name={cat}
                      data={scatterData.filter((d) => d.color === cat)}
                      fill={SCATTER_COLORS[idx % SCATTER_COLORS.length]}
                      fillOpacity={0.7}
                    >
                      {scatterData
                        .filter((d) => d.color === cat)
                        .map((_, i) => (
                          <Cell key={i} />
                        ))}
                    </Scatter>
                  ))}
                  <Legend wrapperStyle={{ fontSize: "11px", color: "#a1a1aa" }} />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* ═══ TARGET ANALYSIS TAB ═══ */}
      {activeTab === "target" && (
        <div className="space-y-4">
          {/* Target selector */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Target size={16} className="text-amber-400" />
                <h3 className="text-sm font-semibold text-zinc-200">Target Variable Analysis</h3>
                <InfoTooltip
                  title="Why Analyze the Target?"
                  variant="warning"
                  wide
                  content={
                    <>
                      <p>Before training, always check your <strong>target variable distribution</strong>. In MLflow, this is part of the dataset profiling step.</p>
                      <p className="mt-1"><strong>Key checks:</strong></p>
                      <ul className="mt-0.5 space-y-0.5">
                        <li>- <strong>Class imbalance:</strong> If one class dominates (&gt;80%), accuracy is misleading — use F1 instead</li>
                        <li>- <strong>Feature separation:</strong> Do feature means differ between classes? If not, the feature won&apos;t help</li>
                        <li>- <strong>Data leakage:</strong> A feature that perfectly separates classes might be derived from the label</li>
                      </ul>
                    </>
                  }
                />
              </div>
              <select
                value={selectedTarget}
                onChange={(e) => setSelectedTarget(e.target.value)}
                className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-amber-500"
              >
                {TARGET_VARIABLES.map((tv) => (
                  <option key={tv.id} value={tv.id}>{tv.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-12 gap-4">
            {/* Target Distribution */}
            <div className="col-span-5 bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <h4 className="text-xs font-semibold text-zinc-300 mb-3">Class Distribution</h4>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={targetDistribution}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis dataKey="label" tick={{ fill: "#a1a1aa", fontSize: 11 }} axisLine={{ stroke: "#3f3f46" }} />
                  <YAxis tick={{ fill: "#71717a", fontSize: 10 }} axisLine={{ stroke: "#3f3f46" }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: "8px", fontSize: "11px" }}
                    formatter={(value: any, _: any, props: any) => [
                      `${value} (${props.payload.percentage}%)`,
                      "Count",
                    ]}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {targetDistribution.map((_, idx) => (
                      <Cell key={idx} fill={SCATTER_COLORS[idx % SCATTER_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              {/* Imbalance warning */}
              {targetDistribution.length > 0 && targetDistribution[0].percentage > 75 && (
                <div className="mt-3 p-2 bg-amber-500/5 border border-amber-500/20 rounded-lg flex items-start gap-2">
                  <AlertTriangle size={12} className="text-amber-400 mt-0.5 shrink-0" />
                  <div className="text-[10px] text-amber-400/80">
                    <strong>Class imbalance detected:</strong> The majority class ({targetDistribution[0].label}) makes up{" "}
                    {targetDistribution[0].percentage}% of data. Accuracy alone will be misleading — focus on F1, precision, and recall.
                  </div>
                </div>
              )}
              {targetDistribution.length > 0 && targetDistribution[0].percentage <= 75 && (
                <div className="mt-3 p-2 bg-green-500/5 border border-green-500/20 rounded-lg flex items-start gap-2">
                  <CheckCircle2 size={12} className="text-green-400 mt-0.5 shrink-0" />
                  <div className="text-[10px] text-green-400/80">
                    Classes are reasonably balanced. Standard accuracy metric should be reliable.
                  </div>
                </div>
              )}
            </div>

            {/* Feature Means by Target Class */}
            <div className="col-span-7 bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <h4 className="text-xs font-semibold text-zinc-300 mb-3 flex items-center gap-2">
                Feature Means by Class
                <span className="text-[10px] text-zinc-600 font-normal">
                  — Features where means differ across classes are likely predictive
                </span>
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="border-b border-zinc-700">
                      <th className="px-3 py-2 text-left text-zinc-500 font-medium">Feature</th>
                      {featureByTarget[0]?.classes.map((cls) => (
                        <th key={cls} className="px-3 py-2 text-center text-zinc-500 font-medium">
                          <span className="text-amber-400">{cls}</span>
                          <div className="text-[9px] text-zinc-600">mean ± std</div>
                        </th>
                      ))}
                      <th className="px-3 py-2 text-center text-zinc-500 font-medium">Signal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/50">
                    {featureByTarget.map(({ feature, byClass, classes }) => {
                      const means = classes.map((c) => byClass[c].mean);
                      const maxMean = Math.max(...means);
                      const minMean = Math.min(...means);
                      const avgStd = classes.reduce((s, c) => s + byClass[c].std, 0) / classes.length;
                      const separation = avgStd > 0 ? Math.abs(maxMean - minMean) / avgStd : 0;
                      const hasSignal = separation > 0.5;
                      return (
                        <tr key={feature.id} className="hover:bg-zinc-800/20">
                          <td className="px-3 py-2 text-zinc-300 font-medium">{feature.name}</td>
                          {classes.map((cls) => (
                            <td key={cls} className="px-3 py-2 text-center font-mono text-zinc-400">
                              {byClass[cls].mean} <span className="text-zinc-600">± {byClass[cls].std}</span>
                            </td>
                          ))}
                          <td className="px-3 py-2 text-center">
                            {hasSignal ? (
                              <span className="px-2 py-0.5 bg-green-500/10 border border-green-500/30 rounded text-green-400 text-[10px] font-medium">
                                Strong
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 bg-zinc-700/30 border border-zinc-700 rounded text-zinc-500 text-[10px] font-medium">
                                Weak
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 p-2 bg-blue-500/5 border border-blue-500/20 rounded-lg text-[10px] text-blue-400/80">
                <Info size={10} className="inline mr-1" />
                <strong>Signal strength</strong> = difference in means / average std. Features marked &quot;Strong&quot; have clearly
                different distributions across target classes — these are likely useful for prediction.
              </div>
            </div>
          </div>

          {/* ─── Label Quality / Conflict Detection ─── */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <ShieldAlert size={16} className={
                labelConflicts.severity === "high" ? "text-red-400" :
                labelConflicts.severity === "moderate" ? "text-amber-400" : "text-green-400"
              } />
              <h3 className="text-sm font-semibold text-zinc-200">Label Quality &amp; Conflict Detection</h3>
              <InfoTooltip
                title="What Are Label Conflicts?"
                variant="warning"
                wide
                content={
                  <>
                    <p>A <strong>label conflict</strong> occurs when data points with very similar features have <strong>different labels</strong>. This is detected using k-nearest-neighbor (k-NN) analysis.</p>
                    <p className="mt-1"><strong>How it works:</strong></p>
                    <ul className="mt-0.5 space-y-0.5">
                      <li>- For each sample, find its 5 closest neighbors (by normalized Euclidean distance)</li>
                      <li>- If the majority of neighbors have a <strong>different label</strong>, it&apos;s flagged as conflicting</li>
                      <li>- <strong>Boundary zone</strong> samples have a neighbor with a different label very close by (distance &lt; 0.15)</li>
                    </ul>
                    <p className="mt-1"><strong>What to do:</strong></p>
                    <ul className="mt-0.5 space-y-0.5">
                      <li>- <strong>&lt;10% conflict:</strong> Normal — most real-world datasets have some noise</li>
                      <li>- <strong>10-20% conflict:</strong> Investigate your label definition or add more features</li>
                      <li>- <strong>&gt;20% conflict:</strong> Label definition may be too noisy — consider soft labels or buffer zones</li>
                    </ul>
                  </>
                }
              />
            </div>
            <p className="text-[11px] text-zinc-600 mb-4">
              k-NN label disagreement analysis for target <span className="text-amber-400 font-medium">{selectedTarget}</span> (k=5)
            </p>

            <div className="grid grid-cols-12 gap-4">
              {/* Conflict Summary Cards */}
              <div className="col-span-4 space-y-3">
                {/* Conflict Rate Badge */}
                <div className={`p-4 rounded-lg border ${
                  labelConflicts.severity === "high"
                    ? "bg-red-500/5 border-red-500/30"
                    : labelConflicts.severity === "moderate"
                    ? "bg-amber-500/5 border-amber-500/30"
                    : "bg-green-500/5 border-green-500/30"
                }`}>
                  <div className="text-[10px] text-zinc-500 mb-1">Conflict Rate</div>
                  <div className={`text-3xl font-bold font-mono ${
                    labelConflicts.severity === "high" ? "text-red-400" :
                    labelConflicts.severity === "moderate" ? "text-amber-400" : "text-green-400"
                  }`}>
                    {labelConflicts.conflictRate}%
                  </div>
                  <div className="text-[10px] text-zinc-500 mt-1">
                    {labelConflicts.conflictingSamples} of {labelConflicts.totalSamples} samples
                  </div>
                  <div className={`mt-2 text-[10px] font-medium px-2 py-1 rounded inline-block ${
                    labelConflicts.severity === "high"
                      ? "bg-red-500/10 text-red-400"
                      : labelConflicts.severity === "moderate"
                      ? "bg-amber-500/10 text-amber-400"
                      : "bg-green-500/10 text-green-400"
                  }`}>
                    {labelConflicts.severity === "high" ? "⚠ High noise" :
                     labelConflicts.severity === "moderate" ? "⚡ Moderate noise" :
                     "✓ Low noise"}
                  </div>
                </div>

                {/* Boundary Zone */}
                <div className="p-4 bg-zinc-800/30 border border-zinc-700/50 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Eye size={12} className="text-blue-400" />
                    <span className="text-[11px] font-semibold text-zinc-300">Boundary Zone</span>
                  </div>
                  <div className="text-2xl font-bold text-blue-400 font-mono">
                    {labelConflicts.boundaryZone.length}
                  </div>
                  <div className="text-[10px] text-zinc-500 mt-1">
                    samples near the decision boundary
                  </div>
                  <div className="text-[10px] text-zinc-600 mt-2">
                    These are close to a differently-labeled neighbor (dist &lt; 0.15 in normalized space).
                    They are most sensitive to threshold changes.
                  </div>
                </div>

                {/* Recommendations */}
                <div className="p-3 bg-zinc-800/30 border border-zinc-700/50 rounded-lg">
                  <div className="text-[10px] font-semibold text-zinc-400 mb-2">Recommendations</div>
                  <div className="space-y-1.5 text-[10px]">
                    {labelConflicts.severity === "low" && (
                      <div className="flex items-start gap-1.5 text-green-400/80">
                        <CheckCircle2 size={10} className="mt-0.5 shrink-0" />
                        <span>Label quality looks good. Proceed to training with confidence.</span>
                      </div>
                    )}
                    {labelConflicts.severity !== "low" && (
                      <>
                        <div className="flex items-start gap-1.5 text-amber-400/80">
                          <AlertTriangle size={10} className="mt-0.5 shrink-0" />
                          <span>Consider adding a <strong>buffer zone</strong> around the label threshold to remove ambiguous samples.</span>
                        </div>
                        <div className="flex items-start gap-1.5 text-blue-400/80">
                          <Info size={10} className="mt-0.5 shrink-0" />
                          <span>Try <strong>soft labels</strong> (probabilities) instead of hard 0/1 for samples near the boundary.</span>
                        </div>
                        <div className="flex items-start gap-1.5 text-zinc-500">
                          <Info size={10} className="mt-0.5 shrink-0" />
                          <span>Add more distinguishing features to separate conflicting samples.</span>
                        </div>
                      </>
                    )}
                    {labelConflicts.severity === "high" && (
                      <div className="flex items-start gap-1.5 text-red-400/80">
                        <ShieldAlert size={10} className="mt-0.5 shrink-0" />
                        <span>High conflict rate may indicate the label definition is too noisy. Review the target variable logic.</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Conflict Examples Table */}
              <div className="col-span-8">
                <div className="bg-zinc-800/20 border border-zinc-700/50 rounded-lg p-4">
                  <h4 className="text-xs font-semibold text-zinc-300 mb-1 flex items-center gap-2">
                    <AlertTriangle size={12} className="text-amber-400" />
                    Conflicting Sample Pairs
                  </h4>
                  <p className="text-[10px] text-zinc-600 mb-3">
                    Samples whose majority of k-nearest neighbors have a different label. Lower distance = more concerning.
                  </p>
                  {labelConflicts.conflictPairs.length === 0 ? (
                    <div className="flex items-center gap-2 py-6 justify-center text-[11px] text-green-400">
                      <CheckCircle2 size={14} />
                      No label conflicts detected — labels are consistent with feature similarity.
                    </div>
                  ) : (
                    <div className="overflow-y-auto max-h-[320px]">
                      <table className="w-full text-[11px]">
                        <thead className="sticky top-0 bg-zinc-800/90 backdrop-blur-sm">
                          <tr className="border-b border-zinc-700">
                            <th className="px-3 py-2 text-left text-zinc-500 font-medium">Sample #</th>
                            <th className="px-3 py-2 text-center text-zinc-500 font-medium">Label</th>
                            <th className="px-3 py-2 text-center text-zinc-500 font-medium">vs</th>
                            <th className="px-3 py-2 text-left text-zinc-500 font-medium">Nearest Diff. Neighbor</th>
                            <th className="px-3 py-2 text-center text-zinc-500 font-medium">Neighbor Label</th>
                            <th className="px-3 py-2 text-right text-zinc-500 font-medium">Distance</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/50">
                          {labelConflicts.conflictPairs.slice(0, 20).map((pair, idx) => (
                            <tr key={idx} className="hover:bg-zinc-800/20">
                              <td className="px-3 py-2 text-zinc-400 font-mono">#{pair.idx}</td>
                              <td className="px-3 py-2 text-center">
                                <span className="px-2 py-0.5 bg-blue-500/10 border border-blue-500/30 rounded text-blue-400 text-[10px] font-medium">
                                  {pair.label}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-center text-zinc-600">↔</td>
                              <td className="px-3 py-2 text-zinc-400 font-mono">#{pair.neighborIdx}</td>
                              <td className="px-3 py-2 text-center">
                                <span className="px-2 py-0.5 bg-purple-500/10 border border-purple-500/30 rounded text-purple-400 text-[10px] font-medium">
                                  {pair.neighborLabel}
                                </span>
                              </td>
                              <td className={`px-3 py-2 text-right font-mono ${
                                pair.distance < 0.1 ? "text-red-400" : pair.distance < 0.2 ? "text-amber-400" : "text-zinc-400"
                              }`}>
                                {pair.distance.toFixed(4)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {labelConflicts.conflictPairs.length > 20 && (
                        <div className="text-[10px] text-zinc-600 text-center py-2 border-t border-zinc-800">
                          Showing 20 of {labelConflicts.conflictPairs.length} conflicting pairs
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Boundary distribution by class */}
                {labelConflicts.boundaryZone.length > 0 && (
                  <div className="mt-3 bg-zinc-800/20 border border-zinc-700/50 rounded-lg p-4">
                    <h4 className="text-xs font-semibold text-zinc-300 mb-3 flex items-center gap-2">
                      <Eye size={12} className="text-blue-400" />
                      Boundary Zone by Class
                    </h4>
                    <div className="flex gap-3 flex-wrap">
                      {(() => {
                        const classCounts: Record<string, number> = {};
                        for (const b of labelConflicts.boundaryZone) {
                          classCounts[b.label] = (classCounts[b.label] || 0) + 1;
                        }
                        return Object.entries(classCounts)
                          .sort((a, b) => b[1] - a[1])
                          .map(([cls, count]) => (
                            <div key={cls} className="px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-center">
                              <div className="text-lg font-bold text-blue-400 font-mono">{count}</div>
                              <div className="text-[10px] text-zinc-500">
                                <span className="text-zinc-300">{cls}</span> near boundary
                              </div>
                            </div>
                          ));
                      })()}
                    </div>
                    <div className="mt-2 text-[10px] text-zinc-600">
                      Classes with more boundary samples are harder for the model to classify correctly in that region.
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
