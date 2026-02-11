"use client";

import { useState, useMemo, useCallback } from "react";
import {
  RawLogEntry,
  CleanedLog,
  PersonaFeatureRow,
  ClusteringResult,
  UserPersonaAssignment,
  PersonaPipelineStep,
} from "@/lib/types";
import {
  cleanLogs,
  aggregateToPersonaFeatures,
  runPersonaClustering,
  inferPersona,
  computeElbowData,
  PERSONA_FEATURE_NAMES,
  PERSONA_FEATURE_META,
  ClusterConfig,
} from "@/lib/ml-engine";
import {
  ArrowRight,
  Play,
  ChevronRight,
  Database,
  Sparkles,
  Layers,
  Brain,
  Users,
  Palette,
  Rocket,
  Shield,
  Activity,
  Compass,
  Sun,
  Shuffle,
  User,
  BarChart3,
} from "lucide-react";
import InfoTooltip from "@/components/InfoTooltip";
import CsvUpload from "@/components/CsvUpload";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Cell,
  LineChart,
  Line,
  ReferenceLine,
} from "recharts";

interface PersonaPipelineProps {
  rawLogs: RawLogEntry[];
  onDataUpload?: (csvText: string) => void;
}

const STEP_META: {
  label: string;
  description: string;
  icon: React.ReactNode;
  pipeline: "training" | "inference";
}[] = [
  { label: "Raw Logs", description: "Click history — no model can learn", icon: <Database size={16} />, pipeline: "training" },
  { label: "Clean & Normalize", description: "Extract fields, standardize", icon: <Sparkles size={16} />, pipeline: "training" },
  { label: "Aggregate Features", description: "Compress events → user-level", icon: <Layers size={16} />, pipeline: "training" },
  { label: "Final ML Features", description: "Normalized behavioral signals", icon: <BarChart3 size={16} />, pipeline: "training" },
  { label: "Pattern Discovery", description: "What the model notices", icon: <Brain size={16} />, pipeline: "training" },
  { label: "Run Clustering", description: "K-Means persona discovery", icon: <Users size={16} />, pipeline: "training" },
  { label: "Interpret Personas", description: "Translate clusters → personas", icon: <Palette size={16} />, pipeline: "training" },
  { label: "Onboarding Inference", description: "User → Persona → Onboarding", icon: <Rocket size={16} />, pipeline: "inference" },
];

export default function PersonaPipeline({ rawLogs, onDataUpload }: PersonaPipelineProps) {
  const [activeStep, setActiveStep] = useState<PersonaPipelineStep>(0);
  const [kValue, setKValue] = useState(3);
  const [clusteringResult, setClusteringResult] = useState<ClusteringResult | null>(null);
  const [selectedInferenceUser, setSelectedInferenceUser] = useState<string>("");
  const [inferenceResult, setInferenceResult] = useState<UserPersonaAssignment | null>(null);

  // Feature selection + transform config
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([...PERSONA_FEATURE_NAMES]);
  const [logTransformFeatures, setLogTransformFeatures] = useState<string[]>(
    PERSONA_FEATURE_META.filter((m) => m.recommendLog).map((m) => m.name)
  );

  const clusterConfig: ClusterConfig = useMemo(() => ({
    selectedFeatures,
    logTransformFeatures: logTransformFeatures.filter((f) => selectedFeatures.includes(f)),
  }), [selectedFeatures, logTransformFeatures]);

  const toggleFeature = useCallback((name: string) => {
    setSelectedFeatures((prev) => {
      if (prev.includes(name)) {
        if (prev.length <= 2) return prev; // need at least 2 features
        return prev.filter((f) => f !== name);
      }
      return [...prev, name];
    });
  }, []);

  const toggleLogTransform = useCallback((name: string) => {
    setLogTransformFeatures((prev) =>
      prev.includes(name) ? prev.filter((f) => f !== name) : [...prev, name]
    );
  }, []);

  // Step 1: Clean logs
  const cleanedLogs = useMemo(() => cleanLogs(rawLogs), [rawLogs]);

  // Step 2-3: Aggregate into persona features
  const personaFeatures = useMemo(
    () => aggregateToPersonaFeatures(cleanedLogs),
    [cleanedLogs]
  );

  const handleRunClustering = useCallback(() => {
    const result = runPersonaClustering(personaFeatures, kValue, clusterConfig);
    setClusteringResult(result);
    setActiveStep(5);
  }, [personaFeatures, kValue, clusterConfig]);

  const handleInfer = useCallback(
    (userId: string) => {
      if (!clusteringResult) return;
      const userFeat = personaFeatures.find((r) => r.user_id === userId);
      if (!userFeat) return;
      const result = inferPersona(userFeat, clusteringResult);
      setInferenceResult(result);
      setSelectedInferenceUser(userId);
    },
    [clusteringResult, personaFeatures]
  );

  const handleRandomInfer = useCallback(() => {
    const idx = Math.floor(Math.random() * personaFeatures.length);
    handleInfer(personaFeatures[idx].user_id);
  }, [personaFeatures, handleInfer]);

  // Radar chart data for persona centroids
  const radarData = useMemo(() => {
    if (!clusteringResult) return [];
    return clusteringResult.featureNames.map((feat, fi) => {
      const entry: Record<string, string | number> = { feature: feat.replace(/_/g, " ") };
      clusteringResult.personas.forEach((p, pi) => {
        entry[p.name] = clusteringResult.centroids[pi]?.[fi] ?? 0;
      });
      return entry;
    });
  }, [clusteringResult]);

  // Elbow chart data (inertia + silhouette for K=2..8)
  const elbowData = useMemo(
    () => computeElbowData(personaFeatures, undefined, clusterConfig),
    [personaFeatures, clusterConfig]
  );

  // Scatter data for cluster visualization
  const scatterData = useMemo(() => {
    if (!clusteringResult) return [];
    return clusteringResult.assignments.map((a) => ({
      x: a.features.total_events_30d,
      y: a.features.realtime_ratio,
      persona: a.persona_name,
      user: a.user_id,
      color: clusteringResult.personas.find((p) => p.id === a.persona_id)?.color || "#666",
    }));
  }, [clusteringResult]);

  const personaIcon = (name: string) => {
    if (name.includes("Casual")) return <Sun size={18} />;
    if (name.includes("LiveOps")) return <Activity size={18} />;
    if (name.includes("Analyst")) return <Compass size={18} />;
    return <User size={18} />;
  };

  return (
    <div className="space-y-4">
      {/* ─── Pipeline Diagrams ─── */}
      <div className="space-y-3">
        {/* Training Pipeline */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <Brain size={16} className="text-blue-400" />
            <span className="text-sm font-bold text-zinc-200">Training Pipeline</span>
            <span className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full ml-2">
              Batch — runs on historical data
            </span>
          </div>
          <div className="flex items-center gap-1 overflow-x-auto pb-1">
            {STEP_META.slice(0, 7).map((step, idx) => {
              const stepIdx = idx as PersonaPipelineStep;
              const isActive = activeStep === stepIdx;
              const isPast = activeStep > stepIdx;
              return (
                <div key={idx} className="flex items-center shrink-0">
                  <button
                    onClick={() => setActiveStep(stepIdx)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-all border ${
                      isActive
                        ? "bg-blue-600/20 border-blue-500/40 text-blue-300"
                        : isPast
                        ? "bg-zinc-800/60 border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                        : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700"
                    }`}
                  >
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                        isActive
                          ? "bg-blue-600 text-white"
                          : isPast
                          ? "bg-green-600 text-white"
                          : "bg-zinc-700 text-zinc-500"
                      }`}
                    >
                      {isPast ? "✓" : idx}
                    </div>
                    <div className="text-left">
                      <div className="font-semibold leading-tight">{step.label}</div>
                    </div>
                  </button>
                  {idx < 6 && (
                    <ChevronRight size={14} className="text-zinc-700 mx-0.5 shrink-0" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Inference Pipeline */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <Rocket size={16} className="text-green-400" />
            <span className="text-sm font-bold text-zinc-200">Inference Pipeline</span>
            <span className="text-[10px] bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full ml-2">
              Real-time — runs on each login
            </span>
            {!clusteringResult && (
              <span className="text-[10px] text-zinc-600 ml-2">
                (train model first)
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => clusteringResult && setActiveStep(7)}
              disabled={!clusteringResult}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-all border ${
                activeStep === 7
                  ? "bg-green-600/20 border-green-500/40 text-green-300"
                  : clusteringResult
                  ? "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700"
                  : "bg-zinc-900 border-zinc-800 text-zinc-700 cursor-not-allowed"
              }`}
            >
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  activeStep === 7 ? "bg-green-600 text-white" : "bg-zinc-700 text-zinc-500"
                }`}
              >
                7
              </div>
              <div className="text-left">
                <div className="font-semibold">User Logs In</div>
              </div>
            </button>
            <ChevronRight size={14} className="text-zinc-700 mx-0.5" />
            <div className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs bg-zinc-800/50 border border-zinc-800 text-zinc-500">
              <Layers size={14} />
              <span>Compute Features</span>
            </div>
            <ChevronRight size={14} className="text-zinc-700 mx-0.5" />
            <div className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs bg-zinc-800/50 border border-zinc-800 text-zinc-500">
              <Brain size={14} />
              <span>K-Means Model</span>
            </div>
            <ChevronRight size={14} className="text-zinc-700 mx-0.5" />
            <div className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs bg-zinc-800/50 border border-zinc-800 text-zinc-500">
              <Users size={14} />
              <span>Persona</span>
            </div>
            <ChevronRight size={14} className="text-zinc-700 mx-0.5" />
            <div className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs bg-zinc-800/50 border border-zinc-800 text-amber-500/60">
              <Rocket size={14} />
              <span>Onboarding Screen</span>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Step Content ─── */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          {STEP_META[activeStep].icon}
          <span className="text-base font-bold text-zinc-100">
            Step {activeStep}: {STEP_META[activeStep].label}
          </span>
          <span className="text-xs text-zinc-500 ml-2">
            {STEP_META[activeStep].description}
          </span>
        </div>

        {/* ─── Step 0: Raw Logs ─── */}
        {activeStep === 0 && (
          <div className="space-y-3">
            {onDataUpload && (
              <CsvUpload onUpload={onDataUpload} currentRowCount={rawLogs.length} />
            )}

            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-xs text-amber-300 flex items-start gap-2">
              <div className="flex-1">
                <strong>Raw click events.</strong> No model can learn from this directly — it is just click history.
                Each row = one event. The same user has many rows.
              </div>
              <InfoTooltip
                title="Step 0: What to Pay Attention To"
                variant="warning"
                wide
                content={
                  <>
                    <p><strong>Data scientist:</strong> Check for data quality — missing user_ids, malformed timestamps, unexpected resource types. Garbage in = garbage out.</p>
                    <p className="mt-1"><strong>Product:</strong> Confirm these events represent meaningful behavior. If analytics tracking is broken for some users, the model will learn the wrong patterns.</p>
                  </>
                }
              />
            </div>
            <div className="border border-zinc-800 rounded-lg overflow-hidden">
              <div className="overflow-x-auto max-h-[360px]">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-zinc-900 z-10">
                    <tr className="border-b border-zinc-800">
                      {["user_id", "resource_type", "resource_name", "timestamp", "metadata"].map((col) => (
                        <th key={col} className="px-3 py-2.5 text-left text-zinc-400 font-semibold">{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/50">
                    {rawLogs.slice(0, 15).map((log, i) => (
                      <tr key={i} className="hover:bg-zinc-800/30">
                        <td className="px-3 py-2 text-cyan-400 font-mono">{log.user_id}</td>
                        <td className="px-3 py-2">
                          <span className="px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-300">{log.resource_type}</span>
                        </td>
                        <td className="px-3 py-2 text-zinc-300">{log.resource_name}</td>
                        <td className="px-3 py-2 text-zinc-500 font-mono">{log.timestamp}</td>
                        <td className="px-3 py-2 text-zinc-600 max-w-[250px] truncate font-mono">{log.metadata}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="flex justify-end">
              <button onClick={() => setActiveStep(1)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-500">
                Next: Clean Data <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* ─── Step 1: Cleaned Logs ─── */}
        {activeStep === 1 && (
          <div className="space-y-3">
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-xs text-blue-300 flex items-start gap-2">
              <div className="flex-1">
                <strong>Metadata parsed into columns.</strong> Resource names cleaned and standardized. Still event-level — not ML-ready yet.
                <span className="text-blue-400"> Transformation: JSON metadata → flat columns; name prefixes stripped; timestamp → hour.</span>
              </div>
              <InfoTooltip
                title="Step 1: Cleaning Decisions Matter"
                variant="info"
                wide
                content={
                  <>
                    <p><strong>Data scientist:</strong> Every cleaning decision is a modeling decision. Stripping name prefixes loses info — is that OK? Extracting hour instead of full timestamp loses day-of-week patterns.</p>
                    <p className="mt-1"><strong>Product:</strong> Validate that device detection is correct. If &quot;unknown&quot; devices dominate, the mobile_ratio feature will be meaningless.</p>
                    <p className="mt-1"><strong>Key rule:</strong> Document every transformation. Future you (or your teammate) needs to reproduce this exactly in the inference pipeline.</p>
                  </>
                }
              />
            </div>
            <div className="border border-zinc-800 rounded-lg overflow-hidden">
              <div className="overflow-x-auto max-h-[360px]">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-zinc-900 z-10">
                    <tr className="border-b border-zinc-800">
                      {["user_id", "resource_type", "resource_name", "hour", "device", "source"].map((col) => (
                        <th key={col} className="px-3 py-2.5 text-left text-zinc-400 font-semibold">{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/50">
                    {cleanedLogs.slice(0, 15).map((log, i) => (
                      <tr key={i} className="hover:bg-zinc-800/30">
                        <td className="px-3 py-2 text-cyan-400 font-mono">{log.user_id}</td>
                        <td className="px-3 py-2">
                          <span className="px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-300">{log.resource_type}</span>
                        </td>
                        <td className="px-3 py-2 text-zinc-300">{log.resource_name}</td>
                        <td className="px-3 py-2 text-zinc-400 font-mono">{log.hour}</td>
                        <td className="px-3 py-2 text-zinc-400">{log.device}</td>
                        <td className="px-3 py-2 text-zinc-500">{log.source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="flex justify-between">
              <button onClick={() => setActiveStep(0)} className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200">Back</button>
              <button onClick={() => setActiveStep(2)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-500">
                Next: Aggregate <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* ─── Step 2: Aggregated Features ─── */}
        {activeStep === 2 && (
          <div className="space-y-3">
            <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-3 text-xs text-purple-300 flex items-start gap-2">
              <div className="flex-1">
                <strong>Events compressed into one row per user.</strong> Raw counts and ratios — this is the behavioral fingerprint.
                <span className="text-purple-400"> Transformation: GROUP BY user_id → count(), count_distinct(), ratio(), avg().</span>
              </div>
              <InfoTooltip
                title="Step 2: Aggregation is Feature Engineering"
                variant="tip"
                wide
                content={
                  <>
                    <p><strong>Data scientist:</strong> This is where domain knowledge matters most. The features you choose to compute determine what the model can learn.</p>
                    <p className="mt-1"><strong>Watch for:</strong></p>
                    <ul className="mt-0.5 space-y-0.5">
                      <li>- <strong>Users with very few events</strong> — their ratios are unstable (1 out of 2 events = 50% realtime!)</li>
                      <li>- <strong>Time window:</strong> 30 days may be too short for infrequent users, too long for churned users</li>
                      <li>- <strong>Missing features:</strong> Should you add session count, time between visits, recency?</li>
                    </ul>
                    <p className="mt-1"><strong>Product:</strong> Do these features align with how you think about user types? If not, add the missing signals.</p>
                  </>
                }
              />
            </div>
            <div className="border border-zinc-800 rounded-lg overflow-hidden">
              <div className="overflow-x-auto max-h-[360px]">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-zinc-900 z-10">
                    <tr className="border-b border-zinc-800">
                      <th className="px-3 py-2.5 text-left text-zinc-400 font-semibold">user_id</th>
                      {PERSONA_FEATURE_NAMES.map((f) => (
                        <th key={f} className="px-3 py-2.5 text-left text-zinc-400 font-semibold">{f}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/50">
                    {personaFeatures.map((row) => (
                      <tr key={row.user_id} className="hover:bg-zinc-800/30">
                        <td className="px-3 py-2 text-cyan-400 font-mono">{row.user_id}</td>
                        <td className="px-3 py-2 text-zinc-300 font-mono">{row.total_events_30d}</td>
                        <td className="px-3 py-2 text-zinc-300 font-mono">{row.realtime_ratio}</td>
                        <td className="px-3 py-2 text-zinc-300 font-mono">{row.dashboards_viewed}</td>
                        <td className="px-3 py-2 text-zinc-300 font-mono">{row.games_touched}</td>
                        <td className="px-3 py-2 text-zinc-300 font-mono">{row.mobile_ratio}</td>
                        <td className="px-3 py-2 text-zinc-300 font-mono">{row.avg_active_hour}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="flex justify-between">
              <button onClick={() => setActiveStep(1)} className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200">Back</button>
              <button onClick={() => setActiveStep(3)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-500">
                Next: Normalize <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* ─── Step 3: Final ML Features ─── */}
        {activeStep === 3 && (
          <div className="space-y-3">
            <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 text-xs text-green-300 flex items-start gap-2">
              <div className="flex-1">
                <strong>This is the exact table the ML model sees.</strong> Ratios instead of raw counts = behavioral signals that work across users with different activity levels.
              </div>
              <InfoTooltip
                title="Step 3: Why Normalization Matters for Clustering"
                variant="warning"
                wide
                content={
                  <>
                    <p><strong>Critical for K-Means:</strong> Clustering uses distance. If total_events ranges 1-500 but realtime_ratio ranges 0-1, the model will ignore ratios entirely because events dominate the distance calculation.</p>
                    <p className="mt-1"><strong>Data scientist:</strong> The ML engine normalizes internally (z-score), but verify that the displayed values make sense. Color-coded cells help spot patterns before the algorithm does.</p>
                    <p className="mt-1"><strong>Product:</strong> Can you eyeball 2-3 user types in this table? If humans can't see patterns, the model probably won't either.</p>
                  </>
                }
              />
            </div>
            <div className="border border-zinc-800 rounded-lg overflow-hidden">
              <div className="overflow-x-auto max-h-[320px]">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-zinc-900 z-10">
                    <tr className="border-b border-zinc-800">
                      <th className="px-3 py-2.5 text-left text-green-400 font-semibold">user_id</th>
                      {PERSONA_FEATURE_NAMES.map((f) => (
                        <th key={f} className="px-3 py-2.5 text-left text-green-400 font-semibold">{f}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/50">
                    {personaFeatures.map((row) => (
                      <tr key={row.user_id} className="hover:bg-zinc-800/30">
                        <td className="px-3 py-2 text-cyan-400 font-mono">{row.user_id}</td>
                        <td className="px-3 py-2 text-zinc-200 font-mono font-bold">{row.total_events_30d}</td>
                        <td className="px-3 py-2 font-mono font-bold" style={{ color: row.realtime_ratio > 0.5 ? "#22c55e" : "#a1a1aa" }}>{row.realtime_ratio}</td>
                        <td className="px-3 py-2 text-zinc-200 font-mono font-bold">{row.dashboards_viewed}</td>
                        <td className="px-3 py-2 text-zinc-200 font-mono font-bold">{row.games_touched}</td>
                        <td className="px-3 py-2 font-mono font-bold" style={{ color: row.mobile_ratio > 0.3 ? "#f59e0b" : "#a1a1aa" }}>{row.mobile_ratio}</td>
                        <td className="px-3 py-2 text-zinc-200 font-mono font-bold">{row.avg_active_hour}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="flex justify-between">
              <button onClick={() => setActiveStep(2)} className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200">Back</button>
              <button onClick={() => setActiveStep(4)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-500">
                Next: Discover Patterns <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* ─── Step 4: Pattern Intuition ─── */}
        {activeStep === 4 && (
          <div className="space-y-4">
            <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-lg p-3 text-xs text-cyan-300 flex items-start gap-2">
              <div className="flex-1">
                <strong>Even without ML, behavioral patterns emerge.</strong> The clustering algorithm will formalize these intuitions into reproducible, data-driven segments.
              </div>
              <InfoTooltip
                title="Step 4: Hypothesis Before Clustering"
                variant="tip"
                wide
                content={
                  <>
                    <p><strong>Data scientist:</strong> Always form hypotheses before running the algorithm. If the clusters don't match any intuition, something may be wrong with the features.</p>
                    <p className="mt-1"><strong>Product:</strong> These archetypes come from domain expertise. The ML will validate or challenge them — both outcomes are valuable.</p>
                    <p className="mt-1"><strong>Key question:</strong> Are these personas <strong>actionable</strong>? If you can't change the product based on a persona, it's not useful even if it's statistically valid.</p>
                  </>
                }
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              {/* Analyst archetype */}
              <div className="bg-zinc-800/50 border border-blue-500/30 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Compass size={18} className="text-blue-400" />
                  <span className="text-sm font-bold text-blue-300">Exploratory Analyst</span>
                </div>
                <ul className="space-y-1.5 text-xs text-zinc-400">
                  <li className="flex items-center gap-1.5"><ChevronRight size={10} className="text-blue-400" />Many dashboards viewed</li>
                  <li className="flex items-center gap-1.5"><ChevronRight size={10} className="text-blue-400" />Multiple games touched</li>
                  <li className="flex items-center gap-1.5"><ChevronRight size={10} className="text-blue-400" />Laptop only, structured usage</li>
                </ul>
                <div className="mt-3 text-[10px] text-zinc-600">Example: tungpnt</div>
              </div>
              {/* LiveOps archetype */}
              <div className="bg-zinc-800/50 border border-green-500/30 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Activity size={18} className="text-green-400" />
                  <span className="text-sm font-bold text-green-300">LiveOps Monitor</span>
                </div>
                <ul className="space-y-1.5 text-xs text-zinc-400">
                  <li className="flex items-center gap-1.5"><ChevronRight size={10} className="text-green-400" />Only realtime dashboards</li>
                  <li className="flex items-center gap-1.5"><ChevronRight size={10} className="text-green-400" />Repeated same dashboard</li>
                  <li className="flex items-center gap-1.5"><ChevronRight size={10} className="text-green-400" />Consistent active hours</li>
                </ul>
                <div className="mt-3 text-[10px] text-zinc-600">Example: vinhvnn</div>
              </div>
              {/* Casual archetype */}
              <div className="bg-zinc-800/50 border border-amber-500/30 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Sun size={18} className="text-amber-400" />
                  <span className="text-sm font-bold text-amber-300">New / Casual User</span>
                </div>
                <ul className="space-y-1.5 text-xs text-zinc-400">
                  <li className="flex items-center gap-1.5"><ChevronRight size={10} className="text-amber-400" />Low total events</li>
                  <li className="flex items-center gap-1.5"><ChevronRight size={10} className="text-amber-400" />Home page heavy</li>
                  <li className="flex items-center gap-1.5"><ChevronRight size={10} className="text-amber-400" />Mobile usage, inconsistent hours</li>
                </ul>
                <div className="mt-3 text-[10px] text-zinc-600">Example: kietlta</div>
              </div>
            </div>
            <div className="flex justify-between">
              <button onClick={() => setActiveStep(3)} className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200">Back</button>
              <button onClick={() => setActiveStep(5)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-500">
                Next: Run Clustering <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* ─── Step 5: Run Clustering ─── */}
        {activeStep === 5 && (
          <div className="space-y-4">
            {/* Feature Selection + Transform Panel */}
            <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-semibold text-zinc-300">Feature Selection &amp; Transforms</h4>
                <span className="text-[10px] text-zinc-500">{selectedFeatures.length} of {PERSONA_FEATURE_META.length} features active · Min 2</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {PERSONA_FEATURE_META.map((meta) => {
                  const isSelected = selectedFeatures.includes(meta.name);
                  const isLogActive = logTransformFeatures.includes(meta.name);
                  return (
                    <div
                      key={meta.name}
                      className={`rounded-lg border p-2.5 transition-all ${isSelected ? "border-blue-500/40 bg-blue-500/5" : "border-zinc-800 bg-zinc-900/50 opacity-50"}`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <button
                          onClick={() => toggleFeature(meta.name)}
                          className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] font-bold transition-colors ${isSelected ? "bg-blue-500 border-blue-500 text-white" : "border-zinc-600 text-transparent"}`}
                        >
                          ✓
                        </button>
                        <span className={`text-xs font-semibold ${isSelected ? "text-zinc-200" : "text-zinc-500"}`}>{meta.label}</span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${meta.type === "count" ? "bg-amber-500/10 text-amber-400" : meta.type === "ratio" ? "bg-green-500/10 text-green-400" : "bg-purple-500/10 text-purple-400"}`}>
                          {meta.type}
                        </span>
                      </div>
                      <p className="text-[10px] text-zinc-500 mb-1.5 ml-6">{meta.description}</p>
                      {isSelected && meta.type === "count" && (
                        <div className="ml-6 flex items-center gap-1.5">
                          <button
                            onClick={() => toggleLogTransform(meta.name)}
                            className={`text-[9px] px-2 py-0.5 rounded-full border transition-colors ${isLogActive ? "bg-amber-500/20 border-amber-500/40 text-amber-300" : "border-zinc-700 text-zinc-500 hover:border-zinc-600"}`}
                          >
                            log(1+x) {isLogActive ? "ON" : "OFF"}
                          </button>
                          {meta.recommendLog && !isLogActive && (
                            <span className="text-[9px] text-amber-500/60">⚠ recommended</span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="bg-zinc-800 rounded-lg px-4 py-3 flex items-center gap-3">
                <label className="text-xs text-zinc-400">K (number of personas):</label>
                <input
                  type="range" min={2} max={5} value={kValue}
                  onChange={(e) => setKValue(parseInt(e.target.value))}
                  className="w-24 accent-blue-500"
                />
                <span className="text-sm font-bold text-blue-400 w-4">{kValue}</span>
                <InfoTooltip
                  title="Choosing K — How Many Personas?"
                  variant="warning"
                  wide
                  content={
                    <>
                      <p><strong>K = number of clusters</strong> the algorithm will create. This is the most important hyperparameter in K-Means.</p>
                      <p className="mt-1"><strong>How to choose:</strong></p>
                      <ul className="mt-0.5 space-y-0.5">
                        <li>- <strong>Too few (K=2):</strong> Oversimplified — merges distinct user types</li>
                        <li>- <strong>Too many (K=5+):</strong> Overfitted — splits real groups into noise</li>
                        <li>- <strong>Elbow method:</strong> Plot inertia vs K, pick where it bends</li>
                        <li>- <strong>Business rule:</strong> Can your product realistically support K different onboarding flows?</li>
                      </ul>
                      <p className="mt-1">Try different values and see if the personas stay interpretable.</p>
                    </>
                  }
                />
              </div>
              <button
                onClick={handleRunClustering}
                className="flex items-center gap-2 px-5 py-3 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-500 active:scale-[0.98]"
              >
                <Play size={16} />
                Run K-Means Clustering
              </button>
              {clusteringResult && (
                <div className="text-xs text-zinc-500">
                  Converged in <span className="text-zinc-300 font-mono">{clusteringResult.iterations}</span> iterations
                  · Inertia: <span className="text-zinc-300 font-mono">{clusteringResult.inertia}</span>
                </div>
              )}
            </div>

            {clusteringResult && (
              <div className="space-y-4">
                {/* Cluster assignments table */}
                <div className="border border-zinc-800 rounded-lg overflow-hidden">
                  <div className="overflow-x-auto max-h-[280px]">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-zinc-900 z-10">
                        <tr className="border-b border-zinc-800">
                          <th className="px-3 py-2.5 text-left text-zinc-400 font-semibold">user_id</th>
                          <th className="px-3 py-2.5 text-left text-zinc-400 font-semibold">persona_id</th>
                          <th className="px-3 py-2.5 text-left text-zinc-400 font-semibold">persona_name</th>
                          <th className="px-3 py-2.5 text-left text-zinc-400 font-semibold">distance</th>
                          <th className="px-3 py-2.5 text-left text-zinc-400 font-semibold">flag</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/50">
                        {clusteringResult.assignments.map((a) => {
                          const color = clusteringResult.personas.find((p) => p.id === a.persona_id)?.color || "#666";
                          return (
                            <tr key={a.user_id} className={`hover:bg-zinc-800/30 ${a.is_edge_case ? "bg-amber-500/5" : ""}`}>
                              <td className="px-3 py-2 text-cyan-400 font-mono">{a.user_id}</td>
                              <td className="px-3 py-2 font-mono" style={{ color }}>{a.persona_id}</td>
                              <td className="px-3 py-2 font-semibold" style={{ color }}>{a.persona_name}</td>
                              <td className="px-3 py-2 text-zinc-500 font-mono">
                                {a.distance_to_centroid < 1 ? "low" : a.distance_to_centroid < 2 ? "medium" : "high"}
                                <span className="text-zinc-600 ml-1">({a.distance_to_centroid})</span>
                              </td>
                              <td className="px-3 py-2">
                                {a.is_edge_case && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">edge case</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Elbow + Silhouette charts */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-zinc-800/50 rounded-lg p-4">
                    <h4 className="text-xs font-semibold text-zinc-300 mb-1">Elbow Chart — Inertia vs K</h4>
                    <p className="text-[10px] text-zinc-500 mb-2">Lower inertia = tighter clusters. Look for the &quot;elbow&quot; where adding more K gives diminishing returns.</p>
                    <ResponsiveContainer width="100%" height={180}>
                      <LineChart data={elbowData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                        <XAxis dataKey="k" tick={{ fill: "#71717a", fontSize: 10 }} axisLine={{ stroke: "#3f3f46" }} label={{ value: "K (clusters)", position: "bottom", fill: "#52525b", fontSize: 10 }} />
                        <YAxis tick={{ fill: "#71717a", fontSize: 10 }} axisLine={{ stroke: "#3f3f46" }} label={{ value: "Inertia", angle: -90, position: "left", fill: "#52525b", fontSize: 10 }} />
                        <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: "8px", fontSize: "11px" }} />
                        <ReferenceLine x={kValue} stroke="#f59e0b" strokeDasharray="5 5" label={{ value: `K=${kValue}`, fill: "#f59e0b", fontSize: 10, position: "top" }} />
                        <Line type="monotone" dataKey="inertia" stroke="#3b82f6" strokeWidth={2} dot={{ fill: "#3b82f6", r: 4 }} activeDot={{ r: 6 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="bg-zinc-800/50 rounded-lg p-4">
                    <h4 className="text-xs font-semibold text-zinc-300 mb-1">Silhouette Score vs K</h4>
                    <p className="text-[10px] text-zinc-500 mb-2">Higher = better separated clusters. Range: -1 to 1. Above 0.5 is good, above 0.7 is strong.</p>
                    <ResponsiveContainer width="100%" height={180}>
                      <LineChart data={elbowData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                        <XAxis dataKey="k" tick={{ fill: "#71717a", fontSize: 10 }} axisLine={{ stroke: "#3f3f46" }} label={{ value: "K (clusters)", position: "bottom", fill: "#52525b", fontSize: 10 }} />
                        <YAxis domain={[-0.2, 1]} tick={{ fill: "#71717a", fontSize: 10 }} axisLine={{ stroke: "#3f3f46" }} label={{ value: "Silhouette", angle: -90, position: "left", fill: "#52525b", fontSize: 10 }} />
                        <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: "8px", fontSize: "11px" }} />
                        <ReferenceLine x={kValue} stroke="#f59e0b" strokeDasharray="5 5" label={{ value: `K=${kValue}`, fill: "#f59e0b", fontSize: 10, position: "top" }} />
                        <ReferenceLine y={0.5} stroke="#22c55e" strokeDasharray="3 3" label={{ value: "Good", fill: "#22c55e", fontSize: 9, position: "right" }} />
                        <Line type="monotone" dataKey="silhouette" stroke="#a855f7" strokeWidth={2} dot={{ fill: "#a855f7", r: 4 }} activeDot={{ r: 6 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Current K summary */}
                {(() => {
                  const currentElbow = elbowData.find((e) => e.k === kValue);
                  const bestSilK = elbowData.reduce((best, e) => e.silhouette > best.silhouette ? e : best, elbowData[0]);
                  return currentElbow ? (
                    <div className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700 flex items-center gap-6 text-xs">
                      <div>
                        <span className="text-zinc-500">Current K:</span>{" "}
                        <span className="text-amber-400 font-bold">{kValue}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500">Inertia:</span>{" "}
                        <span className="text-blue-400 font-mono">{currentElbow.inertia}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500">Silhouette:</span>{" "}
                        <span className={`font-mono ${currentElbow.silhouette >= 0.5 ? "text-green-400" : currentElbow.silhouette >= 0.25 ? "text-amber-400" : "text-red-400"}`}>{currentElbow.silhouette}</span>
                      </div>
                      <div className="ml-auto">
                        {bestSilK.k !== kValue && (
                          <span className="text-zinc-500">
                            Best silhouette at <span className="text-purple-400 font-bold">K={bestSilK.k}</span> ({bestSilK.silhouette})
                          </span>
                        )}
                        {bestSilK.k === kValue && (
                          <span className="text-green-400">Current K has the best silhouette score</span>
                        )}
                      </div>
                    </div>
                  ) : null;
                })()}

                <div className="grid grid-cols-2 gap-4">
                  {/* Scatter plot */}
                  <div className="bg-zinc-800/50 rounded-lg p-4">
                    <h4 className="text-xs font-semibold text-zinc-300 mb-2">Cluster Scatter (events vs realtime_ratio)</h4>
                    <p className="text-[10px] text-zinc-500 mb-2">Points are fixed (same data). Colors show cluster assignment. This is a 2D projection of 6D clustering.</p>
                    <ResponsiveContainer width="100%" height={220}>
                      <ScatterChart>
                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                        <XAxis dataKey="x" name="Total Events" tick={{ fill: "#71717a", fontSize: 10 }} axisLine={{ stroke: "#3f3f46" }} label={{ value: "total_events", position: "bottom", fill: "#52525b", fontSize: 10 }} />
                        <YAxis dataKey="y" name="Realtime Ratio" tick={{ fill: "#71717a", fontSize: 10 }} axisLine={{ stroke: "#3f3f46" }} label={{ value: "realtime_ratio", angle: -90, position: "left", fill: "#52525b", fontSize: 10 }} />
                        <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: "8px", fontSize: "11px" }} formatter={(val: number | undefined) => val ?? 0} labelFormatter={() => ""} />
                        <Scatter data={scatterData}>
                          {scatterData.map((entry, idx) => (
                            <Cell key={idx} fill={entry.color} />
                          ))}
                        </Scatter>
                      </ScatterChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Centroid radar */}
                  <div className="bg-zinc-800/50 rounded-lg p-4">
                    <h4 className="text-xs font-semibold text-zinc-300 mb-2">Persona Centroid Profiles</h4>
                    <ResponsiveContainer width="100%" height={220}>
                      <RadarChart data={radarData}>
                        <PolarGrid stroke="#3f3f46" />
                        <PolarAngleAxis dataKey="feature" tick={{ fill: "#a1a1aa", fontSize: 9 }} />
                        <PolarRadiusAxis tick={{ fill: "#52525b", fontSize: 8 }} />
                        {clusteringResult.personas.map((p) => (
                          <Radar key={p.id} name={p.name} dataKey={p.name} stroke={p.color} fill={p.color} fillOpacity={0.15} strokeWidth={2} />
                        ))}
                        <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: "8px", fontSize: "11px" }} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-between">
              <button onClick={() => setActiveStep(4)} className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200">Back</button>
              <button
                onClick={() => clusteringResult && setActiveStep(6)}
                disabled={!clusteringResult}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-600"
              >
                Next: Interpret Personas <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* ─── Step 6: Persona Interpretation ─── */}
        {activeStep === 6 && clusteringResult && (
          <div className="space-y-4">
            <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-3 text-xs text-purple-300 flex items-start gap-2">
              <div className="flex-1">
                <strong>Clusters translated into actionable personas.</strong> Each maps to a specific onboarding experience. This is where ML meets product decisions.
              </div>
              <InfoTooltip
                title="Step 6: From Clusters to Product Decisions"
                variant="warning"
                wide
                content={
                  <>
                    <p><strong>Data scientist:</strong> Cluster interpretation is subjective. Validate with stakeholders. Run multiple K values and check if the same personas emerge consistently.</p>
                    <p className="mt-1"><strong>Product:</strong> Each persona needs a <strong>different product action</strong>. If two personas get the same onboarding, merge them — the distinction isn't useful.</p>
                    <p className="mt-1"><strong>Monitoring:</strong> Track persona distribution over time. If one persona grows from 20% to 80%, your user base changed — retrain the model.</p>
                  </>
                }
              />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {clusteringResult.personas.map((persona) => {
                const usersInPersona = clusteringResult.assignments.filter(
                  (a) => a.persona_id === persona.id
                );
                return (
                  <div
                    key={persona.id}
                    className="rounded-xl border-2 p-5 space-y-4"
                    style={{ borderColor: persona.color + "40", backgroundColor: persona.color + "08" }}
                  >
                    {/* Persona header */}
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: persona.color + "30", color: persona.color }}
                      >
                        {personaIcon(persona.name)}
                      </div>
                      <div>
                        <div className="text-sm font-bold" style={{ color: persona.color }}>
                          {persona.name}
                        </div>
                        <div className="text-[10px] text-zinc-500">
                          {usersInPersona.length} users ({Math.round((usersInPersona.length / clusteringResult.assignments.length) * 100)}%)
                        </div>
                      </div>
                    </div>

                    {/* Defining signals */}
                    <div>
                      <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Defining Signals</div>
                      <ul className="space-y-1">
                        {persona.definingSignals.map((s, i) => (
                          <li key={i} className="text-xs text-zinc-400 flex items-center gap-1.5">
                            <div className="w-1 h-1 rounded-full" style={{ backgroundColor: persona.color }} />
                            {s}
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Onboarding mapping */}
                    <div className="bg-zinc-900/80 rounded-lg p-3 border border-zinc-800">
                      <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Onboarding Experience</div>
                      <div className="text-xs font-semibold mb-2" style={{ color: persona.color }}>
                        &quot;{persona.onboardingTitle}&quot;
                      </div>
                      <ul className="space-y-1">
                        {persona.onboardingActions.map((a, i) => (
                          <li key={i} className="text-[11px] text-zinc-400 flex items-center gap-1.5">
                            <ChevronRight size={10} style={{ color: persona.color }} />
                            {a}
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Users */}
                    <div className="text-[10px] text-zinc-600">
                      Users: {usersInPersona.map((u) => u.user_id).join(", ")}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Production table */}
            <div className="mt-4">
              <h4 className="text-sm font-semibold text-zinc-300 mb-2 flex items-center gap-2">
                <Shield size={14} className="text-green-400" />
                Production Table: user_onboarding_profile
              </h4>
              <div className="border border-zinc-800 rounded-lg overflow-hidden">
                <div className="overflow-x-auto max-h-[200px]">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-zinc-900 z-10">
                      <tr className="border-b border-zinc-800">
                        {["user_id", "persona_id", "persona_name", "onboarding_type", "last_updated"].map((col) => (
                          <th key={col} className="px-3 py-2.5 text-left text-green-400/80 font-semibold">{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/50">
                      {clusteringResult.assignments.map((a) => (
                        <tr key={a.user_id} className="hover:bg-zinc-800/30">
                          <td className="px-3 py-2 text-cyan-400 font-mono">{a.user_id}</td>
                          <td className="px-3 py-2 text-zinc-300 font-mono">{a.persona_id}</td>
                          <td className="px-3 py-2 font-semibold" style={{ color: clusteringResult.personas[a.persona_id]?.color }}>
                            {a.persona_name}
                          </td>
                          <td className="px-3 py-2 text-zinc-300 font-mono">{a.recommended_onboarding_type}</td>
                          <td className="px-3 py-2 text-zinc-500 font-mono">{new Date().toISOString().split("T")[0]}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="flex justify-between">
              <button onClick={() => setActiveStep(5)} className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200">Back</button>
              <button
                onClick={() => setActiveStep(7)}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-500"
              >
                Try Inference Pipeline <Rocket size={14} />
              </button>
            </div>
          </div>
        )}

        {/* ─── Step 7: Inference Pipeline ─── */}
        {activeStep === 7 && (
          <div className="space-y-4">
            {!clusteringResult ? (
              <div className="flex flex-col items-center justify-center h-64 text-zinc-500 text-sm">
                <Shield size={48} className="text-zinc-700 mb-4" />
                Train the clustering model first (Step 5)
              </div>
            ) : (
              <>
                <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 text-xs text-green-300 flex items-start gap-2">
                  <div className="flex-1">
                    <strong>Real-time inference:</strong> A user just logged in — compute their features → find nearest cluster → serve personalized onboarding.
                    The model doesn&apos;t decide once — it <strong>updates as behavior changes</strong>.
                  </div>
                  <InfoTooltip
                    title="Step 7: Inference Pipeline — Production Concerns"
                    variant="warning"
                    wide
                    content={
                      <>
                        <p><strong>Data scientist:</strong> The inference pipeline must use the <strong>exact same feature computation</strong> as training. Any mismatch = training/serving skew — the #1 cause of ML failures in production.</p>
                        <p className="mt-1"><strong>Product:</strong> Monitor the distribution of persona assignments over time. If it shifts dramatically, either the model is stale or the user base changed.</p>
                        <p className="mt-1"><strong>Edge cases:</strong></p>
                        <ul className="mt-0.5 space-y-0.5">
                          <li>- <strong>New users with 0 events</strong> — need a fallback onboarding</li>
                          <li>- <strong>Users near cluster boundaries</strong> — small changes flip their persona</li>
                          <li>- <strong>Stale models</strong> — retrain monthly or when data distribution shifts</li>
                        </ul>
                      </>
                    }
                  />
                </div>

                {/* Inference Input */}
                <div className="grid grid-cols-12 gap-4">
                  <div className="col-span-4 space-y-3">
                    <div className="bg-zinc-800 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <User size={16} className="text-cyan-400" />
                        <span className="text-sm font-semibold text-zinc-200">Simulate Login</span>
                      </div>
                      <div className="flex gap-2 mb-3">
                        <select
                          value={selectedInferenceUser}
                          onChange={(e) => handleInfer(e.target.value)}
                          className="flex-1 px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-green-500"
                        >
                          <option value="">Select user...</option>
                          {personaFeatures.map((r) => (
                            <option key={r.user_id} value={r.user_id}>{r.user_id}</option>
                          ))}
                        </select>
                        <button
                          onClick={handleRandomInfer}
                          className="px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700"
                          title="Random user"
                        >
                          <Shuffle size={16} />
                        </button>
                      </div>
                    </div>

                    {/* Inference pipeline flow diagram */}
                    {inferenceResult && (
                      <div className="bg-zinc-800 rounded-lg p-4 space-y-2">
                        <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Pipeline Execution</div>
                        {[
                          { label: "1. Fetch last 30d logs", status: "done", detail: `${inferenceResult.features.total_events_30d} events` },
                          { label: "2. Compute features", status: "done", detail: "6 features" },
                          { label: "3. Find nearest centroid", status: "done", detail: `dist = ${inferenceResult.distance_to_centroid}` },
                          { label: "4. Map to persona", status: "done", detail: inferenceResult.persona_name },
                          { label: "5. Select onboarding", status: "done", detail: inferenceResult.recommended_onboarding_type },
                        ].map((step, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs">
                            <div className="w-4 h-4 rounded-full bg-green-600 flex items-center justify-center text-[8px] text-white font-bold">✓</div>
                            <span className="text-zinc-300">{step.label}</span>
                            <span className="text-zinc-600 ml-auto font-mono">{step.detail}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Inference Result */}
                  <div className="col-span-8">
                    {inferenceResult ? (
                      <div className="space-y-4">
                        {/* Persona result card */}
                        <div
                          className="rounded-xl border-2 p-6"
                          style={{
                            borderColor: clusteringResult.personas[inferenceResult.persona_id]?.color + "40",
                            backgroundColor: clusteringResult.personas[inferenceResult.persona_id]?.color + "08",
                          }}
                        >
                          <div className="flex items-center gap-4 mb-4">
                            <div
                              className="w-14 h-14 rounded-full flex items-center justify-center text-2xl"
                              style={{
                                backgroundColor: clusteringResult.personas[inferenceResult.persona_id]?.color + "30",
                                color: clusteringResult.personas[inferenceResult.persona_id]?.color,
                              }}
                            >
                              {personaIcon(inferenceResult.persona_name)}
                            </div>
                            <div>
                              <div className="text-xs text-zinc-500">User <span className="text-cyan-400 font-mono">{inferenceResult.user_id}</span> logged in</div>
                              <div className="text-xl font-bold" style={{ color: clusteringResult.personas[inferenceResult.persona_id]?.color }}>
                                {inferenceResult.persona_name}
                              </div>
                              <div className="text-xs text-zinc-500 mt-0.5">
                                Onboarding: <span className="text-zinc-300 font-mono">{inferenceResult.recommended_onboarding_type}</span>
                              </div>
                            </div>
                          </div>

                          {/* Onboarding preview */}
                          <div className="bg-zinc-900/80 rounded-lg p-4 border border-zinc-800">
                            <div className="text-xs font-semibold text-zinc-400 mb-2">What this user sees:</div>
                            <div className="text-sm font-bold mb-2" style={{ color: clusteringResult.personas[inferenceResult.persona_id]?.color }}>
                              &quot;{clusteringResult.personas[inferenceResult.persona_id]?.onboardingTitle}&quot;
                            </div>
                            <div className="grid grid-cols-2 gap-1.5">
                              {clusteringResult.personas[inferenceResult.persona_id]?.onboardingActions.map((a, i) => (
                                <div key={i} className="flex items-center gap-1.5 text-xs text-zinc-400">
                                  <ChevronRight size={10} style={{ color: clusteringResult.personas[inferenceResult.persona_id]?.color }} />
                                  {a}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Feature values used */}
                        <div className="bg-zinc-800/50 rounded-lg p-4">
                          <div className="text-xs font-semibold text-zinc-400 mb-2">Features used for inference</div>
                          <div className="grid grid-cols-3 gap-2">
                            {PERSONA_FEATURE_NAMES.map((f) => (
                              <div key={f} className="bg-zinc-900 rounded px-3 py-2 text-xs">
                                <div className="text-zinc-500 truncate">{f}</div>
                                <div className="text-zinc-200 font-mono font-bold mt-0.5">
                                  {(inferenceResult.features as unknown as Record<string, number>)[f]}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Key insight */}
                        <div className="bg-zinc-800/50 rounded-lg p-4 border border-zinc-700">
                          <div className="text-xs text-zinc-400 leading-relaxed">
                            <strong className="text-zinc-200">Key insight:</strong> You never asked the user who they are.
                            You observed behavior, compressed it into features, and let patterns emerge.
                            The model updates as behavior changes — the persona is not permanent.
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-64 bg-zinc-800/30 rounded-lg border border-zinc-800">
                        <Play size={48} className="text-zinc-700 mb-4" />
                        <p className="text-zinc-500 text-sm">Select a user to simulate a login and see the inference pipeline in action</p>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
