"use client";

import { useState, useMemo, useCallback } from "react";
import {
  RawLogEntry,
  ClusteringResult,
  UserPersonaAssignment,
} from "@/lib/types";
import {
  cleanLogs,
  aggregateToPersonaFeatures,
  runPersonaClustering,
  inferPersona,
  computeElbowData,
  diagnoseModel,
  PERSONA_FEATURE_NAMES,
  PERSONA_FEATURE_META,
  ClusterConfig,
  ExperimentRun,
  ModelDiagnosis,
} from "@/lib/ml-engine";
import {
  ArrowRight,
  ArrowLeft,
  Play,
  ChevronRight,
  Database,
  Sparkles,
  Layers,
  Brain,
  Users,
  Rocket,
  Shield,
  Activity,
  Compass,
  Sun,
  Shuffle,
  User,
  BarChart3,
  Lightbulb,
  AlertTriangle,
  HelpCircle,
  CheckCircle2,
  Target,
  Save,
  History,
  GitBranch,
  Search,
  Sliders,
  Eye,
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

type PersonaScreen = 0 | 1 | 2 | 3 | 4 | 5;

interface ModelVersion {
  id: number;
  name: string;
  k: number;
  features: string[];
  logTransforms: string[];
  silhouette: number;
  inertia: number;
  iterations: number;
  clusterSizes: number[];
  clusteringResult: ClusteringResult;
  timestamp: number;
}

const STEP_META: {
  label: string;
  shortLabel: string;
  icon: React.ReactNode;
}[] = [
  { label: "Data Prep", shortLabel: "Prep", icon: <Database size={14} /> },
  { label: "Feature Selection", shortLabel: "Features", icon: <Sliders size={14} /> },
  { label: "Train Model", shortLabel: "Train", icon: <Play size={14} /> },
  { label: "Evaluate & Diagnose", shortLabel: "Evaluate", icon: <Search size={14} /> },
  { label: "Interpret Clusters", shortLabel: "Interpret", icon: <Eye size={14} /> },
  { label: "Personas & Inference", shortLabel: "Deploy", icon: <Rocket size={14} /> },
];

export default function PersonaPipeline({ rawLogs, onDataUpload }: PersonaPipelineProps) {
  const [activeScreen, setActiveScreen] = useState<PersonaScreen>(0);
  const [kValue, setKValue] = useState(3);
  const [clusteringResult, setClusteringResult] = useState<ClusteringResult | null>(null);
  const [selectedInferenceUser, setSelectedInferenceUser] = useState<string>("");
  const [inferenceResult, setInferenceResult] = useState<UserPersonaAssignment | null>(null);

  // Feature selection + transform config
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([...PERSONA_FEATURE_NAMES]);
  const [logTransformFeatures, setLogTransformFeatures] = useState<string[]>(
    PERSONA_FEATURE_META.filter((m) => m.recommendLog).map((m) => m.name)
  );

  // Experiment history & diagnosis
  const [experimentHistory, setExperimentHistory] = useState<ExperimentRun[]>([]);
  const [diagnosis, setDiagnosis] = useState<ModelDiagnosis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Model versioning
  const [modelVersions, setModelVersions] = useState<ModelVersion[]>([]);
  const [activeModelId, setActiveModelId] = useState<number | null>(null);

  const activeModel = modelVersions.find((m) => m.id === activeModelId) ?? null;
  const displayResult = activeModel?.clusteringResult ?? clusteringResult;

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

  // Elbow chart data (inertia + silhouette for K=2..8) — must be before callbacks that reference it
  const elbowData = useMemo(
    () => computeElbowData(personaFeatures, undefined, clusterConfig),
    [personaFeatures, clusterConfig]
  );

  const handleRunClustering = useCallback(() => {
    const result = runPersonaClustering(personaFeatures, kValue, clusterConfig);
    setClusteringResult(result);
    setDiagnosis(null); // clear old diagnosis

    // Record experiment
    const clusterSizes = Array.from({ length: kValue }, (_, c) =>
      result.assignments.filter((a) => a.persona_id === c).length
    );
    setExperimentHistory((prev) => [
      ...prev,
      {
        id: prev.length + 1,
        k: kValue,
        features: [...selectedFeatures],
        logTransforms: [...logTransformFeatures.filter((f) => selectedFeatures.includes(f))],
        silhouette: elbowData.find((e) => e.k === kValue)?.silhouette ?? 0,
        inertia: result.inertia,
        iterations: result.iterations,
        clusterSizes,
        timestamp: Date.now(),
      },
    ]);
  }, [personaFeatures, kValue, clusterConfig, selectedFeatures, logTransformFeatures, elbowData]);

  const handleRunDiagnosis = useCallback(() => {
    if (!clusteringResult) return;
    setIsAnalyzing(true);
    // Use setTimeout to allow UI to show loading state
    setTimeout(() => {
      const result = diagnoseModel(
        personaFeatures, clusteringResult, elbowData,
        selectedFeatures, logTransformFeatures.filter((f) => selectedFeatures.includes(f))
      );
      setDiagnosis(result);
      setIsAnalyzing(false);
    }, 50);
  }, [clusteringResult, personaFeatures, elbowData, selectedFeatures, logTransformFeatures]);

  const applyFeatureSuggestion = useCallback((features: string[], logTransforms: string[]) => {
    setSelectedFeatures(features);
    setLogTransformFeatures(logTransforms);
    setDiagnosis(null);
    // Re-run clustering immediately with new features
    const newConfig: ClusterConfig = { selectedFeatures: features, logTransformFeatures: logTransforms.filter((f) => features.includes(f)) };
    const result = runPersonaClustering(personaFeatures, kValue, newConfig);
    setClusteringResult(result);
    const clusterSizes = Array.from({ length: kValue }, (_, c) =>
      result.assignments.filter((a) => a.persona_id === c).length
    );
    const newElbow = computeElbowData(personaFeatures, undefined, newConfig);
    setExperimentHistory((prev) => [
      ...prev,
      {
        id: prev.length + 1, k: kValue, features: [...features],
        logTransforms: [...logTransforms.filter((f) => features.includes(f))],
        silhouette: newElbow.find((e) => e.k === kValue)?.silhouette ?? 0,
        inertia: result.inertia, iterations: result.iterations, clusterSizes, timestamp: Date.now(),
      },
    ]);
  }, [personaFeatures, kValue]);

  const applyKSuggestion = useCallback((k: number) => {
    setKValue(k);
    setDiagnosis(null);
    // Re-run clustering immediately with new K
    const result = runPersonaClustering(personaFeatures, k, clusterConfig);
    setClusteringResult(result);
    const clusterSizes = Array.from({ length: k }, (_, c) =>
      result.assignments.filter((a) => a.persona_id === c).length
    );
    setExperimentHistory((prev) => [
      ...prev,
      {
        id: prev.length + 1, k, features: [...selectedFeatures],
        logTransforms: [...logTransformFeatures.filter((f) => selectedFeatures.includes(f))],
        silhouette: elbowData.find((e) => e.k === k)?.silhouette ?? 0,
        inertia: result.inertia, iterations: result.iterations, clusterSizes, timestamp: Date.now(),
      },
    ]);
  }, [personaFeatures, clusterConfig, selectedFeatures, logTransformFeatures, elbowData]);

  const handleSaveModelVersion = useCallback(() => {
    if (!clusteringResult) return;
    const currentElbow = elbowData.find((e) => e.k === kValue);
    const clusterSizes = Array.from({ length: kValue }, (_, c) =>
      clusteringResult.assignments.filter((a) => a.persona_id === c).length
    );
    const version: ModelVersion = {
      id: modelVersions.length + 1,
      name: `v${modelVersions.length + 1} — K=${kValue}, ${selectedFeatures.length}F`,
      k: kValue,
      features: [...selectedFeatures],
      logTransforms: [...logTransformFeatures.filter((f) => selectedFeatures.includes(f))],
      silhouette: currentElbow?.silhouette ?? 0,
      inertia: clusteringResult.inertia,
      iterations: clusteringResult.iterations,
      clusterSizes,
      clusteringResult,
      timestamp: Date.now(),
    };
    setModelVersions((prev) => [...prev, version]);
    setActiveModelId(version.id);
  }, [clusteringResult, kValue, selectedFeatures, logTransformFeatures, elbowData, modelVersions.length]);

  const loadModelVersion = useCallback((version: ModelVersion) => {
    setActiveModelId(version.id);
    setKValue(version.k);
    setSelectedFeatures(version.features);
    setLogTransformFeatures(version.logTransforms);
    setClusteringResult(version.clusteringResult);
    setDiagnosis(null);
  }, []);

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
      {/* ─── Step Navigator ─── */}
      <div className="bg-zinc-900 rounded-xl p-2 border border-zinc-800">
        <div className="flex items-center gap-1">
          {STEP_META.map((step, idx) => {
            const stepIdx = idx as PersonaScreen;
            const isActive = activeScreen === stepIdx;
            const isPast = activeScreen > stepIdx;
            const needsModel = idx >= 3 && !clusteringResult;
            return (
              <div key={idx} className="flex items-center flex-1">
                <button
                  onClick={() => !needsModel && setActiveScreen(stepIdx)}
                  disabled={needsModel}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all w-full text-left ${
                    isActive
                      ? "bg-purple-600/20 border border-purple-500/40 text-purple-400"
                      : isPast
                      ? "bg-zinc-800/60 text-zinc-300 hover:bg-zinc-800"
                      : needsModel
                      ? "text-zinc-700 cursor-not-allowed"
                      : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
                  }`}
                >
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                    isActive ? "bg-purple-600 text-white" : isPast ? "bg-green-600 text-white" : needsModel ? "bg-zinc-800 text-zinc-700" : "bg-zinc-700 text-zinc-500"
                  }`}>
                    {isPast ? "✓" : step.icon}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold truncate">{step.label}</div>
                  </div>
                </button>
                {idx < STEP_META.length - 1 && (
                  <div className="w-4 h-px mx-0.5 bg-zinc-700 shrink-0" />
                )}
              </div>
            );
          })}
        </div>
        {modelVersions.length > 0 && (
          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-zinc-800 px-2">
            <GitBranch size={12} className="text-green-400 shrink-0" />
            <span className="text-[10px] text-zinc-500">{modelVersions.length} saved model{modelVersions.length > 1 ? "s" : ""}</span>
            {activeModel && <span className="text-[10px] text-green-400 font-mono">Active: {activeModel.name}</span>}
          </div>
        )}
      </div>

      {/* ═══ Step 0: Data Prep ═══ */}
      {activeScreen === 0 && (
        <div className="space-y-4">
          {/* Tutorial intro */}
          <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-4 text-xs text-purple-300">
            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-full bg-purple-600/30 flex items-center justify-center shrink-0 mt-0.5">
                <Lightbulb size={14} className="text-purple-400" />
              </div>
              <div>
                <div className="text-sm font-bold text-purple-200 mb-1">Tutorial: Feature Engineering for Clustering</div>
                <p className="text-purple-300/80 leading-relaxed">
                  Before any ML model can learn, raw event data must be transformed into <strong className="text-purple-200">user-level numerical features</strong>.
                  This screen walks through the 3-stage pipeline: <strong className="text-purple-200">Raw Logs → Clean & Parse → Aggregate per User</strong>.
                  Each stage is a data science decision that affects what patterns the model can discover.
                </p>
              </div>
            </div>
          </div>

          {onDataUpload && (
            <CsvUpload onUpload={onDataUpload} currentRowCount={rawLogs.length} />
          )}

          {/* Pipeline flow visualization */}
          <div className="flex items-center gap-2 justify-center py-2">
            {[
              { label: `${rawLogs.length} raw events`, icon: <Database size={14} />, color: "amber" },
              { label: `${cleanedLogs.length} cleaned`, icon: <Sparkles size={14} />, color: "blue" },
              { label: `${personaFeatures.length} users × ${PERSONA_FEATURE_NAMES.length} features`, icon: <Layers size={14} />, color: "purple" },
            ].map((step, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs border ${
                  step.color === "amber" ? "bg-amber-500/5 border-amber-500/20 text-amber-300" :
                  step.color === "blue" ? "bg-blue-500/5 border-blue-500/20 text-blue-300" :
                  "bg-purple-500/5 border-purple-500/20 text-purple-300"
                }`}>
                  {step.icon}
                  {step.label}
                </div>
                {i < 2 && <ChevronRight size={14} className="text-zinc-600" />}
              </div>
            ))}
          </div>

          {/* ─── Stage A: Raw Logs ─── */}
          <div className="bg-zinc-900 border border-amber-500/20 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center text-[10px] font-bold text-amber-400">A</div>
              <h4 className="text-sm font-bold text-amber-300">Raw Event Logs</h4>
              <span className="text-[10px] bg-amber-500/10 text-amber-400/80 px-2 py-0.5 rounded-full">one row = one click</span>
            </div>
            <div className="bg-amber-500/5 border border-amber-500/10 rounded-lg p-3 text-xs text-amber-200/70 flex items-start gap-2">
              <HelpCircle size={14} className="text-amber-400 mt-0.5 shrink-0" />
              <div>
                <strong className="text-amber-300">What a data scientist checks here:</strong> Are there missing user_ids? Malformed timestamps? Unexpected resource types?
                Look for data quality issues — <strong className="text-amber-200">garbage in = garbage out</strong>. If 20% of events have no user_id, your features will under-count activity for many users.
              </div>
            </div>
            <div className="overflow-x-auto max-h-[180px] border border-zinc-800 rounded-lg">
              <table className="w-full text-[10px]">
                <thead className="sticky top-0 bg-zinc-900">
                  <tr className="border-b border-zinc-800">
                    <th className="px-2.5 py-1.5 text-left text-zinc-500">user_id</th>
                    <th className="px-2.5 py-1.5 text-left text-zinc-500">resource_type</th>
                    <th className="px-2.5 py-1.5 text-left text-zinc-500">resource_name</th>
                    <th className="px-2.5 py-1.5 text-left text-zinc-500">timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {rawLogs.slice(0, 8).map((log, i) => (
                    <tr key={i} className="hover:bg-zinc-800/30">
                      <td className="px-2.5 py-1 text-cyan-400 font-mono">{log.user_id}</td>
                      <td className="px-2.5 py-1"><span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">{log.resource_type}</span></td>
                      <td className="px-2.5 py-1 text-zinc-400 truncate max-w-[150px]">{log.resource_name}</td>
                      <td className="px-2.5 py-1 text-zinc-600 font-mono">{log.timestamp}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="text-[10px] text-zinc-600">Showing 8 of {rawLogs.length} raw events. Each user may have dozens or hundreds of rows.</div>
          </div>

          {/* ─── Stage B: Cleaned Logs ─── */}
          <div className="bg-zinc-900 border border-blue-500/20 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center text-[10px] font-bold text-blue-400">B</div>
              <h4 className="text-sm font-bold text-blue-300">Cleaned & Parsed</h4>
              <span className="text-[10px] bg-blue-500/10 text-blue-400/80 px-2 py-0.5 rounded-full">metadata extracted, fields standardized</span>
            </div>
            <div className="bg-blue-500/5 border border-blue-500/10 rounded-lg p-3 text-xs text-blue-200/70 flex items-start gap-2">
              <HelpCircle size={14} className="text-blue-400 mt-0.5 shrink-0" />
              <div>
                <strong className="text-blue-300">What changed:</strong> JSON metadata is parsed into flat columns (device, source). Timestamps are extracted to hour-of-day.
                Resource name prefixes are stripped. <strong className="text-blue-200">Every cleaning decision is a modeling decision</strong> — extracting hour but not day-of-week means the model cannot learn weekly patterns.
              </div>
            </div>
            <div className="overflow-x-auto max-h-[180px] border border-zinc-800 rounded-lg">
              <table className="w-full text-[10px]">
                <thead className="sticky top-0 bg-zinc-900">
                  <tr className="border-b border-zinc-800">
                    <th className="px-2.5 py-1.5 text-left text-zinc-500">user_id</th>
                    <th className="px-2.5 py-1.5 text-left text-zinc-500">resource_type</th>
                    <th className="px-2.5 py-1.5 text-left text-zinc-500">resource_name</th>
                    <th className="px-2.5 py-1.5 text-left text-zinc-500">device</th>
                    <th className="px-2.5 py-1.5 text-left text-zinc-500">hour</th>
                    <th className="px-2.5 py-1.5 text-left text-zinc-500">source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {cleanedLogs.slice(0, 8).map((log, i) => (
                    <tr key={i} className="hover:bg-zinc-800/30">
                      <td className="px-2.5 py-1 text-cyan-400 font-mono">{log.user_id}</td>
                      <td className="px-2.5 py-1"><span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">{log.resource_type}</span></td>
                      <td className="px-2.5 py-1 text-zinc-400">{log.resource_name}</td>
                      <td className="px-2.5 py-1 text-zinc-400">{log.device}</td>
                      <td className="px-2.5 py-1 text-zinc-500 font-mono">{log.hour}</td>
                      <td className="px-2.5 py-1 text-zinc-500">{log.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="text-[10px] text-zinc-600">Still event-level — one row per click. Not ML-ready yet.</div>
          </div>

          {/* ─── Stage C: Aggregated Features ─── */}
          <div className="bg-zinc-900 border border-purple-500/20 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center text-[10px] font-bold text-purple-400">C</div>
              <h4 className="text-sm font-bold text-purple-300">User-Level Feature Matrix</h4>
              <span className="text-[10px] bg-purple-500/10 text-purple-400/80 px-2 py-0.5 rounded-full">one row = one user = ML input</span>
            </div>
            <div className="bg-purple-500/5 border border-purple-500/10 rounded-lg p-3 text-xs text-purple-200/70 flex items-start gap-2">
              <HelpCircle size={14} className="text-purple-400 mt-0.5 shrink-0" />
              <div>
                <strong className="text-purple-300">The key transformation:</strong> Events are compressed via <code className="bg-zinc-800 px-1 rounded">GROUP BY user_id</code> with aggregations:
                count(), count_distinct(), ratio(), avg(). <strong className="text-purple-200">This is where domain knowledge matters most</strong> — the features you compute determine what patterns the model can discover.
              </div>
            </div>

            {/* Feature explanations */}
            <div className="grid grid-cols-4 gap-2">
              {PERSONA_FEATURE_META.map((meta) => {
                const typeColor = meta.type === "count" ? "bg-amber-500/10 text-amber-400"
                  : meta.type === "ratio" ? "bg-green-500/10 text-green-400"
                  : meta.type === "entropy" ? "bg-cyan-500/10 text-cyan-400"
                  : "bg-purple-500/10 text-purple-400";
                return (
                  <div key={meta.name} className="bg-zinc-800/50 rounded-lg p-2.5 border border-zinc-800">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-[10px] font-bold text-zinc-200">{meta.label}</span>
                      <span className={`text-[8px] px-1 py-0.5 rounded-full ${typeColor}`}>{meta.type}</span>
                    </div>
                    <p className="text-[9px] text-zinc-500 mb-1">{meta.description}</p>
                    <details>
                      <summary className="text-[8px] text-blue-400/70 cursor-pointer hover:text-blue-400">SQL</summary>
                      <pre className="mt-1 text-[7px] text-zinc-500 bg-zinc-900/80 rounded p-1.5 border border-zinc-800 overflow-x-auto whitespace-pre leading-relaxed">{meta.sql}</pre>
                    </details>
                  </div>
                );
              })}
            </div>

            <div className="border border-zinc-800 rounded-lg overflow-hidden">
              <div className="overflow-x-auto max-h-[220px]">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-zinc-900 z-10">
                    <tr className="border-b border-zinc-800">
                      <th className="px-3 py-2 text-left text-green-400 font-semibold">user_id</th>
                      {PERSONA_FEATURE_NAMES.map((f) => (
                        <th key={f} className="px-3 py-2 text-left text-green-400 font-semibold">{f}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/50">
                    {personaFeatures.map((row) => (
                      <tr key={row.user_id} className="hover:bg-zinc-800/30">
                        <td className="px-3 py-1.5 text-cyan-400 font-mono">{row.user_id}</td>
                        {PERSONA_FEATURE_NAMES.map((f) => (
                          <td key={f} className="px-3 py-1.5 text-zinc-200 font-mono font-bold">
                            {(row as unknown as Record<string, number>)[f]}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* DS checklist */}
          <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 size={14} className="text-green-400" />
              <span className="text-xs font-bold text-green-300">Data Scientist Checklist — Before Moving On</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              {[
                { check: "Feature matrix has one row per user with no nulls", tip: "If any user has NaN, the distance calculation in K-Means will break" },
                { check: "Count features have realistic ranges (no extreme outliers)", tip: "One user with 10,000 events will dominate all distance calculations" },
                { check: "Ratio features are between 0-1 and make semantic sense", tip: "A realtime_ratio of 0.99 means almost all activity is realtime dashboards" },
                { check: "Features capture different behavioral dimensions", tip: "If two features are 95% correlated, one is redundant — it just doubles its weight" },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-2 bg-zinc-900/80 rounded-lg p-2.5 border border-zinc-800">
                  <CheckCircle2 size={11} className="text-green-500/50 mt-0.5 shrink-0" />
                  <div>
                    <div className="text-zinc-300">{item.check}</div>
                    <div className="text-zinc-600 text-[10px] mt-0.5">{item.tip}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3 text-xs text-amber-300 flex items-start gap-2">
            <AlertTriangle size={14} className="text-amber-400 mt-0.5 shrink-0" />
            <span><strong>Normalization note:</strong> K-Means uses Euclidean distance. If total_events ranges 1-500 but realtime_ratio ranges 0-1, events dominate — ratios are ignored. <strong className="text-amber-200">Z-score normalization</strong> is applied internally so all features contribute equally.</span>
          </div>

          <div className="flex justify-end">
            <button onClick={() => setActiveScreen(1)} className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm font-semibold rounded-lg hover:bg-purple-500">
              Next: Feature Selection <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ═══ Step 1: Feature Selection ═══ */}
      {activeScreen === 1 && (
        <div className="space-y-4">
          {/* ─── Feature Specification ─── */}
          <div className="bg-zinc-900 border border-blue-500/20 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center text-[10px] font-bold text-blue-400">1</div>
              <h4 className="text-sm font-bold text-blue-300">Feature Specification</h4>
              <span className="text-[10px] text-zinc-500 ml-auto">{selectedFeatures.length} of {PERSONA_FEATURE_META.length} features active · Min 2</span>
              <InfoTooltip
                title="Why Feature Selection Matters"
                variant="tip"
                wide
                content={
                  <>
                    <p><strong>K-Means only sees numbers.</strong> It cannot read &quot;this user is a casual player.&quot; You must convert behavioral hypotheses into numerical columns that the algorithm can measure distances on.</p>
                    <p className="mt-1"><strong>Your job:</strong> Decide which user behaviors are likely to differentiate personas. Each feature becomes a dimension in the clustering space.</p>
                    <p className="mt-1"><strong>Tradeoff:</strong> More features = more nuanced personas, but also more noise and the &quot;curse of dimensionality.&quot; Start with features that have clear business meaning.</p>
                    <p className="mt-1"><strong>Reality check:</strong> If your features don&apos;t capture the behavioral differences between user types, K-Means cannot discover them. Garbage in = garbage out.</p>
                  </>
                }
              />
            </div>

            <div className="bg-blue-500/5 border border-blue-500/10 rounded-lg p-3 text-xs text-blue-200/70 flex items-start gap-2">
              <HelpCircle size={14} className="text-blue-400 mt-0.5 shrink-0" />
              <div>
                <strong className="text-blue-300">DS Deliverable #1 — Feature definitions.</strong> You must convert persona hypotheses into quantifiable features.
                Below is the feature table derived from behavioral signals in this analytics platform. Each feature was chosen because it captures a dimension
                that <strong className="text-blue-200">might</strong> differentiate user types — but K-Means will tell us if they actually do.
              </div>
            </div>

            {/* Persona hypothesis → feature mapping */}
            <div className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700 text-[10px]">
              <div className="text-[9px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Behavioral Hypothesis → Feature Mapping</div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                <div className="flex items-center gap-2"><span className="text-zinc-500 w-[160px]">Low total events</span><span className="text-zinc-600">→</span><code className="text-blue-400">total_events_30d</code></div>
                <div className="flex items-center gap-2"><span className="text-zinc-500 w-[160px]">Dashboard diversity</span><span className="text-zinc-600">→</span><code className="text-blue-400">unique_dashboards_viewed</code></div>
                <div className="flex items-center gap-2"><span className="text-zinc-500 w-[160px]">Mobile heavy</span><span className="text-zinc-600">→</span><code className="text-blue-400">mobile_ratio</code></div>
                <div className="flex items-center gap-2"><span className="text-zinc-500 w-[160px]">Realtime heavy</span><span className="text-zinc-600">→</span><code className="text-blue-400">realtime_ratio</code></div>
                <div className="flex items-center gap-2"><span className="text-zinc-500 w-[160px]">Repeated dashboard</span><span className="text-zinc-600">→</span><code className="text-blue-400">repeat_view_ratio</code></div>
                <div className="flex items-center gap-2"><span className="text-zinc-500 w-[160px]">Multi-game</span><span className="text-zinc-600">→</span><code className="text-blue-400">games_touched</code></div>
                <div className="flex items-center gap-2"><span className="text-zinc-500 w-[160px]">Structured navigation</span><span className="text-zinc-600">→</span><code className="text-blue-400">navigation_entropy</code></div>
                <div className="flex items-center gap-2"><span className="text-zinc-500 w-[160px]">Active hour consistency</span><span className="text-zinc-600">→</span><code className="text-blue-400">active_hour_std</code></div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {PERSONA_FEATURE_META.map((meta) => {
                const isSelected = selectedFeatures.includes(meta.name);
                const isLogActive = logTransformFeatures.includes(meta.name);
                const typeColor = meta.type === "count" ? "bg-amber-500/10 text-amber-400"
                  : meta.type === "ratio" ? "bg-green-500/10 text-green-400"
                  : meta.type === "entropy" ? "bg-cyan-500/10 text-cyan-400"
                  : "bg-purple-500/10 text-purple-400";
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
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${typeColor}`}>
                        {meta.type}
                      </span>
                    </div>
                    <p className="text-[10px] text-zinc-500 mb-1 ml-6">{meta.description}</p>
                    <details className="ml-6 mb-1">
                      <summary className="text-[9px] text-blue-400/70 cursor-pointer hover:text-blue-400">Show SQL</summary>
                      <pre className="mt-1 text-[8px] text-zinc-500 bg-zinc-900/80 rounded p-2 border border-zinc-800 overflow-x-auto whitespace-pre leading-relaxed">{meta.sql}</pre>
                    </details>
                    {isSelected && meta.type === "count" && (
                      <div className="ml-6 flex items-center gap-1.5">
                        <button
                          onClick={() => toggleLogTransform(meta.name)}
                          className={`text-[9px] px-2 py-0.5 rounded-full border transition-colors ${isLogActive ? "bg-amber-500/20 border-amber-500/40 text-amber-300" : "border-zinc-700 text-zinc-500 hover:border-zinc-600"}`}
                        >
                          log(1+x) {isLogActive ? "ON" : "OFF"}
                        </button>
                        {meta.recommendLog && !isLogActive && (
                          <span className="text-[9px] text-amber-500/60">recommended</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="text-[10px] text-zinc-500 bg-amber-500/5 rounded-lg p-2.5 border border-amber-500/10 flex items-start gap-2">
              <AlertTriangle size={12} className="text-amber-400 mt-0.5 shrink-0" />
              <span>
                <strong className="text-amber-300">This table is what the model receives.</strong> The model sees only these numbers — it has no concept of &quot;persona,&quot; &quot;dashboard,&quot; or &quot;game.&quot;
                If you disable a feature, the model literally cannot see that dimension. If an important behavioral difference exists only in a disabled feature, it will be invisible to clustering.
              </span>
            </div>
          </div>

          {/* ─── Step 2: Data Preparation ─── */}
          <div className="bg-zinc-900 border border-cyan-500/20 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-cyan-500/20 flex items-center justify-center text-[10px] font-bold text-cyan-400">2</div>
              <h4 className="text-sm font-bold text-cyan-300">Data Preparation</h4>
              <InfoTooltip
                title="Why Data Prep Is Critical for K-Means"
                variant="warning"
                wide
                content={
                  <>
                    <p><strong>K-Means uses Euclidean distance.</strong> Scale matters enormously — if total_events ranges 1–10,000 but mobile_ratio ranges 0–1, total_events will dominate all distance calculations and other features become irrelevant.</p>
                    <p className="mt-1"><strong>Normalization is mandatory.</strong> This pipeline applies z-score normalization (StandardScaler): each feature is centered to mean=0, std=1 so all features contribute equally.</p>
                    <p className="mt-1"><strong>Log transforms:</strong> For heavy-tailed count features (total_events, unique_dashboards_viewed, games_touched), applying log(1+x) before scaling compresses the range and prevents power users from pulling centroids.</p>
                  </>
                }
              />
            </div>

            <div className="bg-cyan-500/5 border border-cyan-500/10 rounded-lg p-3 text-xs text-cyan-200/70 flex items-start gap-2">
              <HelpCircle size={14} className="text-cyan-400 mt-0.5 shrink-0" />
              <div>
                <strong className="text-cyan-300">DS Deliverable #2 — Data preparation logic.</strong> You must specify:
                aggregation time window, aggregation formulas, scaling method, and missing value handling. These are all modeling decisions.
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 text-[10px]">
              <div className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700 space-y-1.5">
                <div className="text-[9px] font-semibold text-cyan-400 uppercase tracking-wider">Time Window</div>
                <div className="text-zinc-300 font-mono">Last 30 days</div>
                <div className="text-zinc-500">All features aggregated from the most recent 30-day activity window per user.</div>
              </div>
              <div className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700 space-y-1.5">
                <div className="text-[9px] font-semibold text-cyan-400 uppercase tracking-wider">Normalization</div>
                <div className="text-zinc-300 font-mono">Z-Score (StandardScaler)</div>
                <div className="text-zinc-500">Each feature: <code className="bg-zinc-900 px-1 rounded">(x - mean) / std</code>. Critical — without this, high-magnitude features dominate distance.</div>
              </div>
              <div className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700 space-y-1.5">
                <div className="text-[9px] font-semibold text-cyan-400 uppercase tracking-wider">Aggregation Examples</div>
                <div className="text-zinc-500 space-y-0.5">
                  <div><code className="text-zinc-400">mobile_ratio</code> = mobile_events / total_events</div>
                  <div><code className="text-zinc-400">realtime_ratio</code> = realtime_dashboard_views / total_views</div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-between">
            <button onClick={() => setActiveScreen(0)} className="flex items-center gap-2 px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200">
              <ArrowLeft size={14} /> Data Prep
            </button>
            <button onClick={() => setActiveScreen(2)} className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm font-semibold rounded-lg hover:bg-purple-500">
              Next: Train Model <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ═══ Step 2: Train Model ═══ */}
      {activeScreen === 2 && (
        <div className="space-y-4">
          {/* ─── Clustering Configuration ─── */}
          <div className="bg-zinc-900 border border-purple-500/20 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center text-[10px] font-bold text-purple-400">3</div>
              <h4 className="text-sm font-bold text-purple-300">Clustering Configuration</h4>
              <InfoTooltip
                title="K-Means Configuration Decisions"
                variant="tip"
                wide
                content={
                  <>
                    <p><strong>K (number of clusters):</strong> This is both a statistical and business decision. Statistically, use elbow/silhouette to find natural groupings. Business-wise, can your product actually deliver K different onboarding experiences?</p>
                    <p className="mt-1"><strong>Initialization:</strong> k-means++ (default) spreads initial centroids apart for faster convergence and better results than random init.</p>
                    <p className="mt-1"><strong>Distance metric:</strong> Standard K-Means uses Euclidean distance. This works well with z-score normalized features. For sparse or high-dimensional data, cosine similarity may work better (requires a different algorithm).</p>
                    <p className="mt-1 text-purple-300"><strong>Advanced — Persona-Guided Initialization:</strong> You can seed initial centroids with approximate persona profiles (e.g., low-activity seed for casual users). This biases clustering toward your hypothesized personas while still letting the algorithm refine boundaries from data.</p>
                  </>
                }
              />
            </div>

            <div className="bg-purple-500/5 border border-purple-500/10 rounded-lg p-3 text-xs text-purple-200/70 flex items-start gap-2">
              <HelpCircle size={14} className="text-purple-400 mt-0.5 shrink-0" />
              <div>
                <strong className="text-purple-300">DS Deliverable #3 — Clustering configuration.</strong> Specify K, distance metric, initialization strategy.
                K is the most impactful choice — validate it with elbow/silhouette after running (Step 5). The model receives <strong className="text-purple-200">only features + K</strong>, nothing else.
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {/* K selector */}
              <div className="col-span-1 space-y-2">
                <div className="text-[9px] font-semibold text-purple-400 uppercase tracking-wider">Number of Clusters (K)</div>
                <div className="bg-zinc-800 rounded-lg px-3 py-2.5 flex items-center gap-3">
                  <input
                    type="range" min={2} max={5} value={kValue}
                    onChange={(e) => setKValue(parseInt(e.target.value))}
                    className="flex-1 accent-purple-500"
                  />
                  <span className="text-lg font-bold text-purple-400 w-6 text-center">{kValue}</span>
                </div>
                <div className="grid grid-cols-4 gap-1 text-[10px]">
                  {[2, 3, 4, 5].map((k) => (
                    <button
                      key={k}
                      onClick={() => setKValue(k)}
                      className={`px-2 py-1 rounded-lg border transition-all font-bold ${kValue === k ? "bg-purple-600/20 border-purple-500/40 text-purple-300" : "border-zinc-700 text-zinc-500 hover:text-zinc-300"}`}
                    >
                      K={k}
                    </button>
                  ))}
                </div>
              </div>

              {/* Init strategy */}
              <div className="col-span-1 space-y-2">
                <div className="text-[9px] font-semibold text-purple-400 uppercase tracking-wider">Init Strategy</div>
                <div className="bg-zinc-800 rounded-lg p-2.5 text-[10px] space-y-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-purple-500 flex items-center justify-center text-[7px] text-white font-bold">✓</div>
                    <span className="text-zinc-200 font-semibold">k-means++</span>
                    <span className="text-zinc-500">(active)</span>
                  </div>
                  <div className="text-zinc-500 leading-relaxed">Spreads initial centroids apart for better convergence. Industry standard.</div>
                </div>
              </div>

              {/* Distance metric */}
              <div className="col-span-1 space-y-2">
                <div className="text-[9px] font-semibold text-purple-400 uppercase tracking-wider">Distance Metric</div>
                <div className="bg-zinc-800 rounded-lg p-2.5 text-[10px] space-y-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-purple-500 flex items-center justify-center text-[7px] text-white font-bold">✓</div>
                    <span className="text-zinc-200 font-semibold">Euclidean</span>
                    <span className="text-zinc-500">(active)</span>
                  </div>
                  <div className="text-zinc-500 leading-relaxed">Standard for z-score normalized features. Scale is equalized so all features contribute equally.</div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <div className={`rounded-lg p-2.5 border ${kValue === 2 ? "border-amber-500/30 bg-amber-500/5" : "border-zinc-800 bg-zinc-800/30"}`}>
                <span className="font-bold text-amber-400">K=2:</span> <span className="text-zinc-400">Very broad — likely &quot;power users&quot; vs &quot;inactive.&quot; Simple but loses behavioral nuance.</span>
              </div>
              <div className={`rounded-lg p-2.5 border ${kValue === 3 ? "border-green-500/30 bg-green-500/5" : "border-zinc-800 bg-zinc-800/30"}`}>
                <span className="font-bold text-green-400">K=3:</span> <span className="text-zinc-400">Common starting point. May reveal analyst / monitor / casual — but this is NOT guaranteed.</span>
              </div>
              <div className={`rounded-lg p-2.5 border ${kValue === 4 ? "border-blue-500/30 bg-blue-500/5" : "border-zinc-800 bg-zinc-800/30"}`}>
                <span className="font-bold text-blue-400">K=4:</span> <span className="text-zinc-400">More specialized groups. Verify each cluster is truly distinct in silhouette analysis.</span>
              </div>
              <div className={`rounded-lg p-2.5 border ${kValue === 5 ? "border-red-500/30 bg-red-500/5" : "border-zinc-800 bg-zinc-800/30"}`}>
                <span className="font-bold text-red-400">K=5:</span> <span className="text-zinc-400">Risk of over-splitting. Some clusters may have very few users or overlap heavily.</span>
              </div>
            </div>

            <div className="text-[10px] text-zinc-500 bg-amber-500/5 rounded-lg p-2.5 border border-amber-500/10 flex items-start gap-2">
              <AlertTriangle size={12} className="text-amber-400 mt-0.5 shrink-0" />
              <span>
                <strong className="text-amber-300">K-Means does NOT guarantee personas will appear.</strong> It finds whatever natural groupings exist in your feature space.
                Sometimes it finds &quot;power users vs inactive&quot; instead of &quot;LiveOps Monitor vs Analyst.&quot;
                If the clusters don&apos;t align with your business personas, you need to change features, not force labels onto bad clusters.
              </span>
            </div>
          </div>

          {/* ─── Step 4: Run ─── */}
          <div className="bg-zinc-900 border border-green-500/20 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center text-[10px] font-bold text-green-400">4</div>
              <h4 className="text-sm font-bold text-green-300">Run K-Means</h4>
            </div>
            <div className="bg-green-500/5 border border-green-500/10 rounded-lg p-3 text-xs text-green-200/70 flex items-start gap-2">
              <HelpCircle size={14} className="text-green-400 mt-0.5 shrink-0" />
              <div>
                <strong className="text-green-300">What happens when you click Run:</strong> (1) Selected features are extracted from the user-feature matrix.
                (2) Z-score normalization is applied. (3) K centroids are initialized via k-means++.
                (4) Users are assigned to nearest centroid, centroids are recomputed, repeat until convergence.
                <strong className="text-green-200"> The model sees ONLY the feature matrix + K. No persona names, no labels, no hints.</strong>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={handleRunClustering}
                className="flex items-center gap-2 px-5 py-3 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-500 active:scale-[0.98]"
              >
                <Play size={16} />
                Run K-Means (K={kValue}, {selectedFeatures.length} features)
              </button>
              {clusteringResult && (
                <div className="text-xs text-zinc-500">
                  Converged in <span className="text-zinc-300 font-mono">{clusteringResult.iterations}</span> iterations
                  · Inertia: <span className="text-zinc-300 font-mono">{clusteringResult.inertia}</span>
                </div>
              )}
            </div>
            <div className="bg-zinc-800/50 rounded-lg p-2.5 text-[10px] text-zinc-500 border border-zinc-700 font-mono">
              MODEL SPEC: input={personaFeatures.length} users × {selectedFeatures.length} features | scaling=StandardScaler | algorithm=KMeans | k={kValue} | init=k-means++ | distance=euclidean
            </div>
          </div>

          {/* ─── Save Model Version ─── */}
          {clusteringResult && (
            <div className="bg-zinc-900 border border-green-500/20 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Save size={16} className="text-green-400" />
                <h4 className="text-sm font-bold text-green-300">Save Model Version</h4>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1 grid grid-cols-4 gap-3 text-[10px]">
                  <div className="bg-zinc-800/50 rounded-lg px-3 py-2 border border-zinc-700">
                    <span className="text-zinc-500">K:</span> <span className="text-zinc-200 font-mono font-bold">{kValue}</span>
                  </div>
                  <div className="bg-zinc-800/50 rounded-lg px-3 py-2 border border-zinc-700">
                    <span className="text-zinc-500">Features:</span> <span className="text-zinc-200 font-mono font-bold">{selectedFeatures.length}</span>
                  </div>
                  <div className="bg-zinc-800/50 rounded-lg px-3 py-2 border border-zinc-700">
                    <span className="text-zinc-500">Silhouette:</span>{" "}
                    <span className={`font-mono font-bold ${(elbowData.find((e) => e.k === kValue)?.silhouette ?? 0) >= 0.5 ? "text-green-400" : "text-amber-400"}`}>
                      {elbowData.find((e) => e.k === kValue)?.silhouette ?? "—"}
                    </span>
                  </div>
                  <div className="bg-zinc-800/50 rounded-lg px-3 py-2 border border-zinc-700">
                    <span className="text-zinc-500">Inertia:</span> <span className="text-zinc-200 font-mono font-bold">{clusteringResult.inertia}</span>
                  </div>
                </div>
                <button
                  onClick={handleSaveModelVersion}
                  className="flex items-center gap-1.5 px-4 py-2.5 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-500 shrink-0"
                >
                  <Save size={14} /> Save as v{modelVersions.length + 1}
                </button>
              </div>
              {modelVersions.length > 0 && (
                <div className="text-[10px] text-green-400/70 flex items-center gap-1.5">
                  <CheckCircle2 size={11} /> Saved {modelVersions.length} version{modelVersions.length > 1 ? "s" : ""}
                  {activeModel && <span className="text-green-300 font-mono ml-1">· Active: {activeModel.name}</span>}
                </div>
              )}
            </div>
          )}

          {/* ─── Model Registry ─── */}
          {modelVersions.length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <History size={16} className="text-zinc-400" />
                <h4 className="text-sm font-bold text-zinc-300">Model Registry</h4>
                <span className="text-[10px] text-zinc-500 ml-auto">{modelVersions.length} version{modelVersions.length > 1 ? "s" : ""}</span>
              </div>
              <div className="border border-zinc-700 rounded-lg overflow-hidden">
                <table className="w-full text-[10px]">
                  <thead className="bg-zinc-800">
                    <tr className="border-b border-zinc-700">
                      <th className="px-3 py-1.5 text-left text-zinc-400 font-semibold">Version</th>
                      <th className="px-3 py-1.5 text-left text-zinc-400 font-semibold">K</th>
                      <th className="px-3 py-1.5 text-left text-zinc-400 font-semibold">Features</th>
                      <th className="px-3 py-1.5 text-left text-zinc-400 font-semibold">Silhouette</th>
                      <th className="px-3 py-1.5 text-left text-zinc-400 font-semibold">Inertia</th>
                      <th className="px-3 py-1.5 text-left text-zinc-400 font-semibold">Clusters</th>
                      <th className="px-3 py-1.5 text-left text-zinc-400 font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/50">
                    {modelVersions.map((v) => {
                      const isActive = v.id === activeModelId;
                      return (
                        <tr key={v.id} className={`hover:bg-zinc-800/30 ${isActive ? "bg-green-500/5" : ""}`}>
                          <td className="px-3 py-1.5 font-mono font-bold text-zinc-200">
                            {v.name}
                            {isActive && <span className="text-[8px] text-green-400 ml-1">(active)</span>}
                          </td>
                          <td className="px-3 py-1.5 font-mono text-zinc-300">K={v.k}</td>
                          <td className="px-3 py-1.5 text-zinc-400">{v.features.length}F{v.logTransforms.length > 0 ? ` +${v.logTransforms.length}log` : ""}</td>
                          <td className="px-3 py-1.5">
                            <span className={`font-mono font-bold ${v.silhouette >= 0.5 ? "text-green-400" : v.silhouette >= 0.25 ? "text-amber-400" : "text-red-400"}`}>{v.silhouette}</span>
                          </td>
                          <td className="px-3 py-1.5 text-zinc-400 font-mono">{v.inertia}</td>
                          <td className="px-3 py-1.5 text-zinc-500">[{v.clusterSizes.join(", ")}]</td>
                          <td className="px-3 py-1.5">
                            {!isActive && (
                              <button onClick={() => loadModelVersion(v)} className="text-[9px] px-2 py-0.5 rounded bg-zinc-700 text-zinc-300 hover:bg-zinc-600">
                                Load
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex justify-between">
            <button onClick={() => setActiveScreen(1)} className="flex items-center gap-2 px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200">
              <ArrowLeft size={14} /> Feature Selection
            </button>
            <button
              onClick={() => clusteringResult && setActiveScreen(3)}
              disabled={!clusteringResult}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm font-semibold rounded-lg hover:bg-purple-500 disabled:bg-zinc-800 disabled:text-zinc-600"
            >
              Next: Evaluate &amp; Diagnose <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ═══ Step 3: Evaluate & Diagnose ═══ */}
      {activeScreen === 3 && clusteringResult && (
        <div className="space-y-4">
          {/* ─── Evaluation Charts ─── */}
          <div className="bg-zinc-900 border border-amber-500/20 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center text-[10px] font-bold text-amber-400"><Search size={12} /></div>
              <h4 className="text-sm font-bold text-amber-300">Evaluate Clustering Quality</h4>
            </div>
            <div className="bg-amber-500/5 border border-amber-500/10 rounded-lg p-3 text-xs text-amber-200/70 flex items-start gap-2">
              <Target size={14} className="text-amber-400 mt-0.5 shrink-0" />
              <div>
                <strong className="text-amber-300">Your goal:</strong> Find the K where clusters are tight (low inertia), well-separated (high silhouette),
                and <strong className="text-amber-200">interpretable as real user types</strong>. A statistically perfect K that produces meaningless personas is useless.
              </div>
            </div>
          </div>

              {/* Elbow + Silhouette with DS guidance */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold text-zinc-300">Elbow Chart — Inertia vs K</h4>
                    <InfoTooltip
                      title="How to Read the Elbow Chart"
                      variant="tip"
                      wide
                      content={
                        <>
                          <p><strong>What is inertia?</strong> The sum of squared distances from each point to its assigned centroid. Lower = tighter clusters.</p>
                          <p className="mt-1"><strong>What to look for:</strong> The line always decreases as K increases (more clusters = shorter distances). Look for the &quot;elbow&quot; — the point where the curve bends and additional K gives diminishing improvement.</p>
                          <p className="mt-1"><strong>Action:</strong> If the elbow is at K=3, adding a 4th persona barely improves cluster tightness — the extra complexity isn&apos;t worth it.</p>
                          <p className="mt-1"><strong>Pitfall:</strong> If the curve is nearly straight (no clear elbow), the data may not have strong natural clusters. Consider changing features.</p>
                        </>
                      }
                    />
                  </div>
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
                  <div className="text-[10px] text-zinc-600 bg-zinc-800/30 rounded-lg p-2">
                    <strong className="text-zinc-400">Read:</strong> Inertia drops steeply at first, then flattens. Your current K={kValue} is marked with the yellow line.
                  </div>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold text-zinc-300">Silhouette Score vs K</h4>
                    <InfoTooltip
                      title="How to Read the Silhouette Chart"
                      variant="tip"
                      wide
                      content={
                        <>
                          <p><strong>What is silhouette?</strong> Measures how similar each user is to their own cluster vs the nearest other cluster. Range: -1 to 1.</p>
                          <p className="mt-1"><strong>Interpretation:</strong></p>
                          <ul className="mt-0.5 space-y-0.5">
                            <li>- <strong>&gt; 0.7:</strong> Strong structure — clusters are very distinct</li>
                            <li>- <strong>0.5 – 0.7:</strong> Reasonable structure — personas are meaningful</li>
                            <li>- <strong>0.25 – 0.5:</strong> Weak structure — clusters overlap significantly</li>
                            <li>- <strong>&lt; 0.25:</strong> No meaningful structure — K-Means may not be appropriate</li>
                          </ul>
                          <p className="mt-1"><strong>Action:</strong> Pick the K with the <strong>highest silhouette score</strong>. If the best score is below 0.25, try different features or a different algorithm.</p>
                        </>
                      }
                    />
                  </div>
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
                  <div className="text-[10px] text-zinc-600 bg-zinc-800/30 rounded-lg p-2">
                    <strong className="text-zinc-400">Read:</strong> Higher is better. The green &quot;Good&quot; line marks 0.5. Your K={kValue} is marked with the yellow line.
                  </div>
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
                      <span className="text-zinc-600 ml-1">
                        ({currentElbow.silhouette >= 0.5 ? "good" : currentElbow.silhouette >= 0.25 ? "weak" : "poor"})
                      </span>
                    </div>
                    <div className="ml-auto">
                      {bestSilK.k !== kValue && (
                        <span className="text-zinc-500">
                          Best silhouette at <span className="text-purple-400 font-bold">K={bestSilK.k}</span> ({bestSilK.silhouette}) — try it?
                        </span>
                      )}
                      {bestSilK.k === kValue && (
                        <span className="text-green-400 flex items-center gap-1"><CheckCircle2 size={12} /> Current K has the best silhouette</span>
                      )}
                    </div>
                  </div>
                ) : null;
              })()}

              {/* ─── Step 5b: Model Validation & Diagnosis ─── */}
              <div className="bg-zinc-900 border border-purple-500/20 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center text-[10px] font-bold text-purple-400">5b</div>
                  <h4 className="text-sm font-bold text-purple-300">Model Validation &amp; Diagnosis</h4>
                  <div className="ml-auto">
                    <button
                      onClick={handleRunDiagnosis}
                      disabled={isAnalyzing}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white text-[11px] font-semibold rounded-lg hover:bg-purple-500 disabled:bg-zinc-700 disabled:text-zinc-500"
                    >
                      {isAnalyzing ? (
                        <><Shuffle size={12} className="animate-spin" /> Analyzing...</>
                      ) : (
                        <><BarChart3 size={12} /> Run Auto-Diagnosis</>
                      )}
                    </button>
                  </div>
                </div>
                <div className="bg-purple-500/5 border border-purple-500/10 rounded-lg p-3 text-xs text-purple-200/70 flex items-start gap-2">
                  <Target size={14} className="text-purple-400 mt-0.5 shrink-0" />
                  <div>
                    <strong className="text-purple-300">Auto-Diagnosis</strong> runs leave-one-out feature importance analysis, tests alternative feature combos,
                    auto-interprets cluster profiles, and generates prioritized recommendations.
                    Click <strong className="text-purple-200">Run Auto-Diagnosis</strong> to analyze your current model.
                  </div>
                </div>

                {!diagnosis && !isAnalyzing && (
                  <div className="text-center py-6 text-zinc-600 text-xs">
                    Click &quot;Run Auto-Diagnosis&quot; to analyze clustering quality and get actionable recommendations.
                  </div>
                )}

                {diagnosis && (
                  <div className="space-y-4">
                    {/* ── Overall Verdict ── */}
                    <div className={`rounded-lg p-3 border flex items-start gap-3 ${
                      diagnosis.overallQuality === "good" ? "bg-green-500/5 border-green-500/20" :
                      diagnosis.overallQuality === "weak" ? "bg-amber-500/5 border-amber-500/20" :
                      "bg-red-500/5 border-red-500/20"
                    }`}>
                      {diagnosis.overallQuality === "good" ? (
                        <CheckCircle2 size={18} className="text-green-400 mt-0.5 shrink-0" />
                      ) : (
                        <AlertTriangle size={18} className={diagnosis.overallQuality === "weak" ? "text-amber-400 mt-0.5 shrink-0" : "text-red-400 mt-0.5 shrink-0"} />
                      )}
                      <div>
                        <div className={`text-sm font-bold ${
                          diagnosis.overallQuality === "good" ? "text-green-300" :
                          diagnosis.overallQuality === "weak" ? "text-amber-300" : "text-red-300"
                        }`}>
                          {diagnosis.overallQuality === "good" ? "Clusters Are Well-Separated" :
                           diagnosis.overallQuality === "weak" ? "Clusters Are Weak — Action Needed" :
                           "Clusters Are Poor — Significant Changes Needed"}
                        </div>
                        <div className="text-xs text-zinc-400 mt-0.5">
                          Silhouette = <span className="font-mono font-bold">{diagnosis.silhouette}</span>
                          {!diagnosis.isKOptimal && <span> · Best K = <span className="text-purple-400 font-bold">{diagnosis.bestK}</span> (silhouette {diagnosis.bestKSilhouette})</span>}
                          {diagnosis.allKWeak && <span className="text-red-400"> · No K produces strong clusters with current features</span>}
                        </div>
                      </div>
                    </div>

                    {/* ── Prioritized Recommendations ── */}
                    <div className="space-y-2">
                      <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Recommendations (Prioritized)</div>
                      <div className="space-y-1.5">
                        {diagnosis.recommendations.map((rec, i) => {
                          const colors = rec.priority === "high" ? "border-amber-500/30 bg-amber-500/5 text-amber-200" :
                            rec.priority === "medium" ? "border-blue-500/30 bg-blue-500/5 text-blue-200" :
                            "border-zinc-700 bg-zinc-800/30 text-zinc-300";
                          const icon = rec.type === "k" ? "K" : rec.type === "feature" ? "F" : rec.type === "algo" ? "A" : "✓";
                          const iconColor = rec.type === "k" ? "bg-purple-500/20 text-purple-400" :
                            rec.type === "feature" ? "bg-blue-500/20 text-blue-400" :
                            rec.type === "algo" ? "bg-amber-500/20 text-amber-400" :
                            "bg-green-500/20 text-green-400";
                          return (
                            <div key={i} className={`rounded-lg px-3 py-2 border flex items-center gap-2.5 text-[11px] ${colors}`}>
                              <span className={`w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold shrink-0 ${iconColor}`}>{icon}</span>
                              <span className="flex-1">{rec.action}</span>
                              <span className={`text-[8px] px-1.5 py-0.5 rounded-full border ${
                                rec.priority === "high" ? "border-amber-500/40 text-amber-400" :
                                rec.priority === "medium" ? "border-blue-500/40 text-blue-400" :
                                "border-zinc-600 text-zinc-500"
                              }`}>{rec.priority}</span>
                              {rec.type === "k" && (
                                <button onClick={() => applyKSuggestion(diagnosis.bestK)} className="text-[9px] px-2 py-0.5 rounded bg-purple-600 text-white hover:bg-purple-500 shrink-0">
                                  Apply K={diagnosis.bestK}
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* ── Feature Importance Analysis ── */}
                    {diagnosis.featureImportance.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Feature Importance (Leave-One-Out Analysis)</div>
                        <div className="text-[10px] text-zinc-500 mb-1">
                          Each feature was tested by removing it (or adding it) and measuring the silhouette change. <strong className="text-zinc-300">Positive delta = feature helps clustering</strong>.
                        </div>
                        <div className="border border-zinc-700 rounded-lg overflow-hidden">
                          <table className="w-full text-[10px]">
                            <thead className="bg-zinc-800">
                              <tr className="border-b border-zinc-700">
                                <th className="px-3 py-1.5 text-left text-zinc-400 font-semibold">Feature</th>
                                <th className="px-3 py-1.5 text-left text-zinc-400 font-semibold">Status</th>
                                <th className="px-3 py-1.5 text-left text-zinc-400 font-semibold">Silhouette Impact</th>
                                <th className="px-3 py-1.5 text-left text-zinc-400 font-semibold">Verdict</th>
                                <th className="px-3 py-1.5 text-left text-zinc-400 font-semibold">Action</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-800/50">
                              {diagnosis.featureImportance.map((fi) => {
                                const isActive = selectedFeatures.includes(fi.feature);
                                const verdictColor = fi.verdict === "critical" ? "bg-green-500/20 text-green-400 border-green-500/30" :
                                  fi.verdict === "helpful" ? "bg-blue-500/20 text-blue-400 border-blue-500/30" :
                                  fi.verdict === "neutral" ? "bg-zinc-700 text-zinc-400 border-zinc-600" :
                                  "bg-red-500/20 text-red-400 border-red-500/30";
                                return (
                                  <tr key={fi.feature} className={`hover:bg-zinc-800/30 ${fi.verdict === "harmful" ? "bg-red-500/5" : ""}`}>
                                    <td className="px-3 py-1.5 font-semibold text-zinc-200">{fi.label}</td>
                                    <td className="px-3 py-1.5">
                                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${isActive ? "bg-blue-500/20 text-blue-400 border border-blue-500/30" : "bg-zinc-800 text-zinc-500 border border-zinc-700"}`}>
                                        {isActive ? "active" : "not selected"}
                                      </span>
                                    </td>
                                    <td className="px-3 py-1.5">
                                      <span className={`font-mono font-bold ${fi.delta > 0 ? "text-green-400" : fi.delta < -0.01 ? "text-red-400" : "text-zinc-400"}`}>
                                        {fi.delta > 0 ? "+" : ""}{fi.delta.toFixed(3)}
                                      </span>
                                    </td>
                                    <td className="px-3 py-1.5">
                                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${verdictColor}`}>{fi.verdict}</span>
                                    </td>
                                    <td className="px-3 py-1.5">
                                      {isActive && fi.verdict === "harmful" && (
                                        <button
                                          onClick={() => { toggleFeature(fi.feature); setClusteringResult(null); setDiagnosis(null); }}
                                          className="text-[9px] px-2 py-0.5 rounded bg-red-600 text-white hover:bg-red-500"
                                        >
                                          Drop Feature
                                        </button>
                                      )}
                                      {!isActive && (fi.verdict === "critical" || fi.verdict === "helpful") && (
                                        <button
                                          onClick={() => { toggleFeature(fi.feature); setClusteringResult(null); setDiagnosis(null); }}
                                          className="text-[9px] px-2 py-0.5 rounded bg-blue-600 text-white hover:bg-blue-500"
                                        >
                                          Add Feature
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* ── Feature Combo Suggestions ── */}
                    {diagnosis.suggestedCombos.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Alternative Feature Combos</div>
                        <div className="grid grid-cols-2 gap-2">
                          {diagnosis.suggestedCombos.map((combo, i) => {
                            const isBetter = combo.delta > 0.01;
                            return (
                              <div key={i} className={`rounded-lg p-3 border space-y-1.5 ${isBetter ? "border-green-500/20 bg-green-500/5" : "border-zinc-700 bg-zinc-800/30"}`}>
                                <div className="flex items-center justify-between">
                                  <div className="text-[10px] font-bold text-zinc-200">{combo.reason}</div>
                                  <span className={`font-mono text-[10px] font-bold ${isBetter ? "text-green-400" : combo.delta < -0.01 ? "text-red-400" : "text-zinc-400"}`}>
                                    sil={combo.silhouette} ({combo.delta > 0 ? "+" : ""}{combo.delta.toFixed(3)})
                                  </span>
                                </div>
                                <div className="text-[9px] text-zinc-500">
                                  {combo.features.length} features: {combo.features.map((f) => f.replace(/_/g, " ")).join(", ")}
                                </div>
                                <button
                                  onClick={() => applyFeatureSuggestion(combo.features, combo.logTransforms)}
                                  className={`text-[9px] px-2.5 py-1 rounded font-semibold ${isBetter ? "bg-green-600 text-white hover:bg-green-500" : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"}`}
                                >
                                  Apply This Combo → Re-run Required
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* ── Cluster Profile Auto-Interpretation ── */}
                    <div className="space-y-2">
                      <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Auto-Interpreted Cluster Profiles</div>
                      <div className="grid grid-cols-1 gap-2">
                        {diagnosis.clusterProfiles.map((profile) => {
                          const persona = clusteringResult?.personas.find((p) => p.id === profile.clusterId);
                          return (
                            <div key={profile.clusterId} className="rounded-lg p-3 border border-zinc-700 bg-zinc-800/30 flex items-start gap-3">
                              <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ backgroundColor: (persona?.color || "#666") + "30", color: persona?.color || "#666" }}>
                                C{profile.clusterId}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-xs font-bold" style={{ color: persona?.color }}>{profile.suggestedName}</span>
                                  <span className="text-[9px] text-zinc-500">{profile.userCount} users ({profile.percentOfTotal}%)</span>
                                </div>
                                <div className="text-[10px] text-zinc-400 mb-1.5">{profile.description}</div>
                                <div className="flex flex-wrap gap-1">
                                  {profile.dominantFeatures.map((df) => (
                                    <span key={df.feature} className={`text-[8px] px-1.5 py-0.5 rounded-full border font-mono ${
                                      df.level === "high" ? "bg-green-500/10 text-green-400 border-green-500/20" :
                                      df.level === "low" ? "bg-red-500/10 text-red-400 border-red-500/20" :
                                      "bg-zinc-800 text-zinc-500 border-zinc-700"
                                    }`}>
                                      {df.feature.replace(/_/g, " ")}: {df.value} {df.level !== "medium" ? `(${df.level.toUpperCase()})` : ""}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* ── Experiment History ── */}
                    {experimentHistory.length > 1 && (
                      <div className="space-y-2">
                        <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Experiment History ({experimentHistory.length} runs)</div>
                        <div className="border border-zinc-700 rounded-lg overflow-hidden">
                          <table className="w-full text-[10px]">
                            <thead className="bg-zinc-800">
                              <tr className="border-b border-zinc-700">
                                <th className="px-2.5 py-1.5 text-left text-zinc-400 font-semibold">#</th>
                                <th className="px-2.5 py-1.5 text-left text-zinc-400 font-semibold">K</th>
                                <th className="px-2.5 py-1.5 text-left text-zinc-400 font-semibold">Features</th>
                                <th className="px-2.5 py-1.5 text-left text-zinc-400 font-semibold">Silhouette</th>
                                <th className="px-2.5 py-1.5 text-left text-zinc-400 font-semibold">Inertia</th>
                                <th className="px-2.5 py-1.5 text-left text-zinc-400 font-semibold">Cluster Sizes</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-800/50">
                              {experimentHistory.map((exp, i) => {
                                const isLatest = i === experimentHistory.length - 1;
                                const isBest = exp.silhouette === Math.max(...experimentHistory.map((e) => e.silhouette));
                                return (
                                  <tr key={exp.id} className={`hover:bg-zinc-800/30 ${isLatest ? "bg-purple-500/5" : ""}`}>
                                    <td className="px-2.5 py-1.5 font-mono text-zinc-400">
                                      {exp.id}{isLatest && <span className="text-purple-400 ml-1">*</span>}
                                    </td>
                                    <td className="px-2.5 py-1.5 font-mono font-bold text-zinc-300">K={exp.k}</td>
                                    <td className="px-2.5 py-1.5 text-zinc-500">{exp.features.length}F{exp.logTransforms.length > 0 ? ` +${exp.logTransforms.length}log` : ""}</td>
                                    <td className="px-2.5 py-1.5">
                                      <span className={`font-mono font-bold ${exp.silhouette >= 0.5 ? "text-green-400" : exp.silhouette >= 0.25 ? "text-amber-400" : "text-red-400"}`}>
                                        {exp.silhouette}
                                      </span>
                                      {isBest && <span className="text-[8px] text-green-500 ml-1">best</span>}
                                    </td>
                                    <td className="px-2.5 py-1.5 text-zinc-400 font-mono">{exp.inertia}</td>
                                    <td className="px-2.5 py-1.5 text-zinc-500">[{exp.clusterSizes.join(", ")}]</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Confirmation bias warning */}
                    <div className="bg-red-500/5 rounded-lg p-2.5 border border-red-500/10 text-[10px] text-red-200/70 flex items-start gap-2">
                      <AlertTriangle size={12} className="text-red-400 mt-0.5 shrink-0" />
                      <span>
                        <strong className="text-red-300">Warning:</strong> Do not force clustering to match predefined personas — that is <strong className="text-red-200">confirmation bias</strong>.
                        Treat personas as: <strong className="text-zinc-300">Hypothesis → Data → Revised Persona → Product Strategy</strong>. Not static truth.
                        If no feature combination produces strong clusters, consider GMM (soft clustering) or semi-supervised approaches.
                      </span>
                    </div>
                  </div>
                )}
              </div>

          <div className="flex justify-between">
            <button onClick={() => setActiveScreen(2)} className="flex items-center gap-2 px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200">
              <ArrowLeft size={14} /> Train Model
            </button>
            <button onClick={() => setActiveScreen(4)} className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm font-semibold rounded-lg hover:bg-purple-500">
              Next: Interpret Clusters <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ═══ Step 4: Interpret Clusters ═══ */}
      {activeScreen === 4 && clusteringResult && (
        <div className="space-y-4">
          <div className="bg-zinc-900 border border-orange-500/20 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-orange-500/20 flex items-center justify-center text-[10px] font-bold text-orange-400"><Eye size={12} /></div>
              <h4 className="text-sm font-bold text-orange-300">Cluster Interpretation — Map Clusters to Personas</h4>
                  <InfoTooltip
                    title="DS Deliverable #4 — Cluster → Persona Mapping"
                    variant="tip"
                    wide
                    content={
                      <>
                        <p><strong>K-Means output is unlabeled.</strong> The model returns &quot;Cluster 0, 1, 2&quot; — just numbers. It has no concept of &quot;LiveOps Monitor&quot; or &quot;Casual User.&quot;</p>
                        <p className="mt-1"><strong>This is the data scientist&apos;s job:</strong> Examine each cluster&apos;s centroid (average feature values), look at the feature profile, and decide what business persona it represents.</p>
                        <p className="mt-1"><strong>How to interpret:</strong> A cluster with high realtime_ratio + high repeat_view_ratio + low active_hour_std likely represents game operators monitoring live dashboards on a consistent schedule. A cluster with high unique_dashboards_viewed + high navigation_entropy + high games_touched likely represents exploratory analysts.</p>
                        <p className="mt-1"><strong>In this demo:</strong> The system uses a heuristic to auto-suggest labels based on centroid feature patterns. In production, a DS would validate or override these suggestions.</p>
                        <p className="mt-1 text-amber-300"><strong>If clusters don&apos;t match expected personas:</strong> This is normal. K-Means finds whatever patterns exist. Sometimes it finds &quot;power users vs inactive&quot; instead of the personas you hypothesized. Go back and change features or K.</p>
                      </>
                    }
                  />
                </div>
                <div className="bg-orange-500/5 border border-orange-500/10 rounded-lg p-3 text-xs text-orange-200/70 flex items-start gap-2">
                  <HelpCircle size={14} className="text-orange-400 mt-0.5 shrink-0" />
                  <div>
                    <strong className="text-orange-300">This is the manual labeling step.</strong> The model produced {clusteringResult.personas.length} unlabeled clusters.
                    Below, examine each cluster&apos;s centroid values and decide: <strong className="text-orange-200">does this cluster behave like a known user type?</strong>
                    The system has auto-suggested persona labels based on a heuristic scoring function, but in production a data scientist would validate these mappings.
                  </div>
                </div>

                {/* Centroid interpretation table */}
                <div className="border border-zinc-700 rounded-lg overflow-hidden">
                  <table className="w-full text-[10px]">
                    <thead className="bg-zinc-800">
                      <tr className="border-b border-zinc-700">
                        <th className="px-3 py-2 text-left text-zinc-400 font-semibold">Cluster</th>
                        {clusteringResult.featureNames.map((feat) => (
                          <th key={feat} className="px-2 py-2 text-center text-zinc-400 font-semibold">{feat.replace(/_/g, " ")}</th>
                        ))}
                        <th className="px-3 py-2 text-left text-zinc-400 font-semibold">Users</th>
                        <th className="px-3 py-2 text-left text-zinc-400 font-semibold">DS Interpretation</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/50">
                      {clusteringResult.personas.map((persona) => {
                        const centroid = clusteringResult.centroids[persona.id];
                        const usersCount = clusteringResult.assignments.filter(a => a.persona_id === persona.id).length;
                        return (
                          <tr key={persona.id} className="hover:bg-zinc-800/30">
                            <td className="px-3 py-2.5">
                              <span className="font-mono font-bold text-zinc-300">Cluster {persona.id}</span>
                            </td>
                            {centroid && clusteringResult.featureNames.map((feat, fi) => {
                              const val = centroid[fi];
                              const isHigh = val > 0.6;
                              const isLow = val < 0.2;
                              return (
                                <td key={feat} className="px-2 py-2.5 text-center">
                                  <span className={`font-mono font-bold ${isHigh ? "text-green-400" : isLow ? "text-red-400" : "text-zinc-300"}`}>{val}</span>
                                  {isHigh && <span className="text-green-500 ml-0.5 text-[8px]">HIGH</span>}
                                  {isLow && <span className="text-red-500 ml-0.5 text-[8px]">LOW</span>}
                                </td>
                              );
                            })}
                            <td className="px-3 py-2.5 text-zinc-400 font-mono">{usersCount}</td>
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-1.5">
                                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: persona.color }} />
                                <span className="font-semibold" style={{ color: persona.color }}>{persona.name}</span>
                                <span className="text-zinc-600 text-[8px] ml-1">(auto-suggested)</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Interpretation guide */}
                <div className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700 text-[10px] space-y-2">
                  <div className="text-[9px] font-semibold text-orange-400 uppercase tracking-wider">How to Read This Table</div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-zinc-400">
                    <div><span className="text-green-400 font-bold">HIGH</span> realtime_ratio + <span className="text-green-400 font-bold">HIGH</span> repeat_view_ratio + <span className="text-red-400 font-bold">LOW</span> active_hour_std → <span className="text-zinc-200">LiveOps Monitor — game operator on consistent schedule</span></div>
                    <div><span className="text-green-400 font-bold">HIGH</span> unique_dashboards_viewed + <span className="text-green-400 font-bold">HIGH</span> navigation_entropy + <span className="text-green-400 font-bold">HIGH</span> games_touched → <span className="text-zinc-200">Exploratory Analyst — broad cross-game exploration</span></div>
                    <div><span className="text-red-400 font-bold">LOW</span> total_events + <span className="text-green-400 font-bold">HIGH</span> mobile_ratio + <span className="text-red-400 font-bold">LOW</span> navigation_entropy → <span className="text-zinc-200">New / Casual User — mobile-first, limited exploration</span></div>
                    <div><span className="text-zinc-500">Two clusters with similar centroid profiles</span> → <span className="text-zinc-200">Consider reducing K — they may be the same persona</span></div>
                  </div>
                </div>

                <div className="text-[10px] text-zinc-500 bg-amber-500/5 rounded-lg p-2.5 border border-amber-500/10 flex items-start gap-2">
                  <AlertTriangle size={12} className="text-amber-400 mt-0.5 shrink-0" />
                  <span>
                    <strong className="text-amber-300">Reality check:</strong> If a cluster&apos;s centroid doesn&apos;t clearly match any known user type, it may represent
                    a pattern you didn&apos;t expect (e.g., &quot;power users who are also mobile-heavy&quot;). This is valuable discovery — don&apos;t force it into a predefined label.
                    K-Means finds what exists in the data, not what you hoped to find.
                  </span>
                </div>
              </div>

              {/* ─── Step 7: Visual Inspection ─── */}
              <div className="bg-zinc-900 border border-cyan-500/20 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-cyan-500/20 flex items-center justify-center text-[10px] font-bold text-cyan-400">7</div>
                  <h4 className="text-sm font-bold text-cyan-300">Visual Inspection &amp; Validation</h4>
                  <InfoTooltip
                    title="DS Deliverable #5 — Validation Methodology"
                    variant="info"
                    wide
                    content={
                      <>
                        <p><strong>Quantitative validation:</strong> Silhouette score (Step 5), cluster stability across re-runs, Davies-Bouldin index.</p>
                        <p className="mt-1"><strong>Visual validation:</strong> Scatter plot for separation, radar chart for distinct profiles. If two clusters look identical visually, they probably should be merged.</p>
                        <p className="mt-1"><strong>Business validation (most important):</strong> Does each cluster actually behave like the persona you labeled it as? E.g., do &quot;LiveOps Monitor&quot; users actually open realtime dashboards every hour?</p>
                        <p className="mt-1"><strong>Stability test:</strong> Run clustering multiple times. If user assignments change significantly between runs, the clusters are unstable — consider different features or a different K.</p>
                        <p className="mt-1"><strong>Edge cases:</strong> Users near cluster boundaries (high distance to centroid) have unstable assignments. Flag these for review.</p>
                      </>
                    }
                  />
                </div>
                <div className="bg-cyan-500/5 border border-cyan-500/10 rounded-lg p-3 text-xs text-cyan-200/70 flex items-start gap-2">
                  <HelpCircle size={14} className="text-cyan-400 mt-0.5 shrink-0" />
                  <div>
                    <strong className="text-cyan-300">Validate your clusters visually and by business logic.</strong> The scatter plot shows 2D separation (note: clusters may be well-separated in full feature space even if they overlap in 2D).
                    The radar chart shows each cluster&apos;s centroid profile — <strong className="text-cyan-200">if two profiles overlap, those clusters aren&apos;t distinct enough</strong>.
                    Edge case users (near cluster boundaries) are flagged below.
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Scatter plot */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold text-zinc-300">Cluster Scatter (2D Projection)</h4>
                    <InfoTooltip
                      title="Reading the Scatter Plot"
                      variant="info"
                      wide
                      content={
                        <>
                          <p>Each dot is a user. Colors = cluster assignment. Axes show two features (total_events vs realtime_ratio) — this is a <strong>2D projection</strong> of the full {selectedFeatures.length}D feature space.</p>
                          <p className="mt-1"><strong>Good clustering:</strong> Colors form distinct, non-overlapping regions.</p>
                          <p className="mt-1"><strong>Bad clustering:</strong> Colors are mixed/interleaved. This means either the features don&apos;t separate users well, or K is wrong.</p>
                          <p className="mt-1"><strong>Caveat:</strong> Clusters may look overlapping in 2D but be well-separated in full feature space. Always check the radar chart too.</p>
                        </>
                      }
                    />
                  </div>
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
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold text-zinc-300">Cluster Centroid Profiles</h4>
                    <InfoTooltip
                      title="Reading the Radar Chart"
                      variant="info"
                      wide
                      content={
                        <>
                          <p>Each colored shape is a cluster&apos;s centroid (mean feature values). The further a vertex extends, the higher that feature value for that cluster.</p>
                          <p className="mt-1"><strong>Good clusters:</strong> Each shape has a distinct profile — e.g., one cluster is high on realtime_ratio but low on games_touched.</p>
                          <p className="mt-1"><strong>Bad sign:</strong> If two shapes overlap almost perfectly, those clusters aren&apos;t meaningfully different. Reduce K.</p>
                          <p className="mt-1"><strong>Key insight:</strong> The centroid profile IS the cluster definition. A persona label is just a human-readable name for this numerical fingerprint.</p>
                        </>
                      }
                    />
                  </div>
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

              {/* ─── Step 8: Production Output ─── */}
              <div className="bg-zinc-900 border border-green-500/20 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center text-[10px] font-bold text-green-400">8</div>
                  <h4 className="text-sm font-bold text-green-300">Production Output &amp; Assignments</h4>
                  <InfoTooltip
                    title="DS Deliverable #6 — Production Output"
                    variant="tip"
                    wide
                    content={
                      <>
                        <p><strong>The model outputs:</strong> user_id → cluster_id (+ distance to centroid as a confidence proxy).</p>
                        <p className="mt-1"><strong>Persona label</strong> is added by the DS-defined mapping: cluster_id → persona_name → onboarding_type.</p>
                        <p className="mt-1"><strong>Edge cases:</strong> Users with high distance to their centroid are near cluster boundaries — their assignment is unstable and may flip between runs.</p>
                        <p className="mt-1"><strong>Monitoring plan:</strong> Clusters drift over time as user behavior changes. Schedule weekly retraining and track cluster size/centroid stability. If a cluster shrinks to near-zero users, the persona may no longer exist.</p>
                        <p className="mt-1 text-green-300"><strong>Mature teams:</strong> Use the initial unsupervised clustering to label training data, then train a supervised classifier for stable real-time persona prediction. This separates discovery (clustering) from serving (classification).</p>
                      </>
                    }
                  />
                </div>
                <div className="bg-green-500/5 border border-green-500/10 rounded-lg p-3 text-xs text-green-200/70 flex items-start gap-2">
                  <HelpCircle size={14} className="text-green-400 mt-0.5 shrink-0" />
                  <div>
                    <strong className="text-green-300">Final output table.</strong> Each user gets: cluster assignment, persona label (from DS mapping), distance to centroid (confidence),
                    and an edge-case flag. <strong className="text-green-200">In production:</strong> Raw logs → Feature store → Clustering (weekly retrain) → Persona labeling → Onboarding engine.
                  </div>
                </div>
              </div>

              {/* Assignments table */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
                <h4 className="text-xs font-semibold text-zinc-300">User → Cluster → Persona Assignments</h4>
                <div className="border border-zinc-800 rounded-lg overflow-hidden">
                  <div className="overflow-x-auto max-h-[220px]">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-zinc-900 z-10">
                        <tr className="border-b border-zinc-800">
                          <th className="px-3 py-2.5 text-left text-zinc-400 font-semibold">user_id</th>
                          <th className="px-3 py-2.5 text-left text-zinc-400 font-semibold">cluster_id</th>
                          <th className="px-3 py-2.5 text-left text-zinc-400 font-semibold">persona_label (DS mapping)</th>
                          <th className="px-3 py-2.5 text-left text-zinc-400 font-semibold">distance_to_centroid</th>
                          <th className="px-3 py-2.5 text-left text-zinc-400 font-semibold">confidence</th>
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
                              <td className="px-3 py-2 text-zinc-500 font-mono">{a.distance_to_centroid}</td>
                              <td className="px-3 py-2">
                                {a.is_edge_case ? (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">unstable — near boundary</span>
                                ) : a.distance_to_centroid < 1 ? (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-400 border border-green-500/30">high confidence</span>
                                ) : (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-zinc-700 text-zinc-400 border border-zinc-600">moderate</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
          <div className="flex justify-between">
            <button onClick={() => setActiveScreen(3)} className="flex items-center gap-2 px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200">
              <ArrowLeft size={14} /> Evaluate
            </button>
            <button onClick={() => setActiveScreen(5)} className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm font-semibold rounded-lg hover:bg-purple-500">
              Next: Personas &amp; Inference <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ═══ Step 5: Personas & Inference ═══ */}
      {activeScreen === 5 && clusteringResult && (
        <div className="space-y-4">
          {/* Model version selector */}
          {modelVersions.length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 flex items-center gap-3">
              <GitBranch size={14} className="text-green-400 shrink-0" />
              <span className="text-xs text-zinc-400">Using model:</span>
              <select
                value={activeModelId ?? ""}
                onChange={(e) => {
                  const v = modelVersions.find((m) => m.id === Number(e.target.value));
                  if (v) loadModelVersion(v);
                }}
                className="px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-200 focus:outline-none focus:border-green-500"
              >
                <option value="">Latest (unsaved)</option>
                {modelVersions.map((v) => (
                  <option key={v.id} value={v.id}>{v.name} — sil={v.silhouette}</option>
                ))}
              </select>
            </div>
          )}

          <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-3 text-xs text-purple-300">
            <strong>Clusters → Personas → Onboarding.</strong> Each persona maps to a specific product experience. Try the inference simulator to see the full pipeline in action.
          </div>

          {/* Persona Cards */}
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

                  <div className="text-[10px] text-zinc-600">
                    Users: {usersInPersona.map((u) => u.user_id).join(", ")}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Inference Simulator */}
          <div className="bg-zinc-900 border border-green-500/20 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Rocket size={16} className="text-green-400" />
              <span className="text-sm font-bold text-zinc-200">Inference Simulator</span>
              <span className="text-[10px] bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full ml-2">
                Real-time — user logs in → persona → onboarding
              </span>
            </div>

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

                {inferenceResult && (
                  <div className="bg-zinc-800 rounded-lg p-4 space-y-2">
                    <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Pipeline Execution</div>
                    {[
                      { label: "1. Fetch last 30d logs", detail: `${inferenceResult.features.total_events_30d} events` },
                      { label: "2. Compute features", detail: `${selectedFeatures.length} features` },
                      { label: "3. Find nearest centroid", detail: `dist = ${inferenceResult.distance_to_centroid}` },
                      { label: "4. Map to persona", detail: inferenceResult.persona_name },
                      { label: "5. Select onboarding", detail: inferenceResult.recommended_onboarding_type },
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

              <div className="col-span-8">
                {inferenceResult ? (
                  <div className="space-y-4">
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
          </div>

          {/* Production table */}
          <div>
            <h4 className="text-sm font-semibold text-zinc-300 mb-2 flex items-center gap-2">
              <Shield size={14} className="text-green-400" />
              Production Table: user_onboarding_profile
            </h4>
            <div className="border border-zinc-800 rounded-lg overflow-hidden">
              <div className="overflow-x-auto max-h-[200px]">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-zinc-900 z-10">
                    <tr className="border-b border-zinc-800">
                      {["user_id", "persona_id", "persona_name", "onboarding_type", "model_version", "last_updated"].map((col) => (
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
                        <td className="px-3 py-2 text-green-400 font-mono">{activeModel?.name ?? "unsaved"}</td>
                        <td className="px-3 py-2 text-zinc-500 font-mono">{new Date().toISOString().split("T")[0]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="flex justify-start">
            <button onClick={() => setActiveScreen(4)} className="flex items-center gap-2 px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200">
              <ArrowLeft size={14} /> Interpret Clusters
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
